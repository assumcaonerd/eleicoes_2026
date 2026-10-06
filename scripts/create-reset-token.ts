import { pool, sql } from "../src/db/index.js";

const tokenHash=process.env.RESET_TOKEN_HASH;
if(!tokenHash) throw new Error("RESET_TOKEN_HASH ausente.");

try {
  const users=await sql<any>("SELECT id FROM users WHERE disabled_at IS NULL ORDER BY created_at ASC LIMIT 1");
  const user=users.rows[0];
  if(!user) throw new Error("Nenhum usuário ativo encontrado.");
  await sql("UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",[Number(user.id)]);
  await sql("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '2 hours')",[Number(user.id),tokenHash]);
  console.log("RESET_TOKEN_CREATED");
} finally {
  await pool.end();
}
