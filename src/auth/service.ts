import type { IncomingMessage } from "node:http";
import { sql } from "../db/index.js";
import { audit, createSession, hashIp, hashPassword, verifyPassword, clientIp } from "./security.js";

export async function registerUser(req:IncomingMessage,args:{email:string;password:string;name?:string}) {
  const email=args.email.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  const passwordHash=await hashPassword(args.password);
  const {rows}=await sql<any>(`INSERT INTO users(email,name,password_hash,email_verified_at)
    VALUES($1,$2,$3,now()) RETURNING id,email,name,role`,[email,args.name?.trim()||null,passwordHash]);
  const user=rows[0];
  const token=await createSession(Number(user.id),req);
  await audit(req,"REGISTER",Number(user.id));
  return {user,token};
}

export async function loginUser(req:IncomingMessage,args:{email:string;password:string}) {
  const email=args.email.trim().toLowerCase();
  const ipHash=hashIp(clientIp(req));
  const attempts=await sql<any>(`SELECT count(*)::int n FROM login_attempts WHERE ip_hash=$1 AND success=false AND created_at>now()-interval '15 minutes'`,[ipHash]);
  if(Number(attempts.rows[0]?.n??0)>=10) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
  const {rows}=await sql<any>("SELECT * FROM users WHERE email=$1 LIMIT 1",[email]);
  const user=rows[0];
  const ok=user && !user.disabled_at && await verifyPassword(user.password_hash,args.password);
  await sql("INSERT INTO login_attempts(email,ip_hash,success) VALUES($1,$2,$3)",[email,ipHash,Boolean(ok)]);
  if(!ok) { await audit(req,"LOGIN_FAILED",user?.id??null,{email}); throw new Error("E-mail ou senha inválidos."); }
  const token=await createSession(Number(user.id),req);
  await audit(req,"LOGIN_SUCCESS",Number(user.id));
  return {user:{id:user.id,email:user.email,name:user.name,role:user.role},token};
}
