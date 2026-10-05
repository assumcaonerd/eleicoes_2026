import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { IncomingMessage } from "node:http";
import { sql } from "../db/index.js";

const SESSION_DAYS = 30;

export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const hashIp = (value?: string) => value ? createHash("sha256").update(value).digest("hex") : null;
export const newToken = () => randomBytes(32).toString("base64url");

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("A senha deve ter pelo menos 12 caracteres.");
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string) {
  try { return await argon2.verify(hash, password); } catch { return false; }
}

export function clientIp(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "";
}

export function parseCookies(req: IncomingMessage) {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(header.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i=v.indexOf("="); return [decodeURIComponent(v.slice(0,i)), decodeURIComponent(v.slice(i+1))];
  }));
}

export function sessionCookie(token: string, secure = true) {
  const parts=[`vps_session=${encodeURIComponent(token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${SESSION_DAYS*86400}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const clearSessionCookie = () => "vps_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure";

export async function createSession(userId: number, req: IncomingMessage) {
  const token=newToken();
  await sql(`INSERT INTO user_sessions(user_id,token_hash,ip_hash,user_agent,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '30 days')`,
    [userId,hashToken(token),hashIp(clientIp(req)),String(req.headers["user-agent"]??"").slice(0,500)]);
  return token;
}

export async function currentUser(req: IncomingMessage) {
  const token=parseCookies(req).vps_session;
  if(!token) return null;
  const {rows}=await sql<any>(`SELECT u.id,u.email,u.name,u.role,u.email_verified_at,u.disabled_at
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.disabled_at IS NULL LIMIT 1`,[hashToken(token)]);
  return rows[0]??null;
}

export async function hasActiveAccess(userId:number) {
  const {rows}=await sql<any>(`SELECT 1 FROM subscriptions
    WHERE user_id=$1 AND status IN ('active','trialing')
      AND (plan_type='lifetime' OR current_period_end IS NULL OR current_period_end>now())
    LIMIT 1`,[userId]);
  return Boolean(rows[0]);
}

export async function revokeCurrentSession(req: IncomingMessage) {
  const token=parseCookies(req).vps_session;
  if(token) await sql("UPDATE user_sessions SET revoked_at=now() WHERE token_hash=$1",[hashToken(token)]);
}

export async function audit(req: IncomingMessage, eventType:string, userId?:number|null, metadata:unknown={}) {
  await sql("INSERT INTO audit_logs(user_id,event_type,metadata,ip_hash) VALUES($1,$2,$3,$4)",
    [userId??null,eventType,JSON.stringify(metadata??{}),hashIp(clientIp(req))]);
}
