import { pool, sql } from "../src/db/index.js";

try {
  const users = await sql<{id:string;email:string;role:string}>(
    "SELECT id,email,role FROM users ORDER BY created_at ASC"
  );
  if (users.rows.length !== 1) {
    throw new Error(`Esperado exatamente 1 usuário cadastrado, encontrados: ${users.rows.length}`);
  }
  const user = users.rows[0];
  await sql("UPDATE users SET role='superadmin', updated_at=now() WHERE id=$1",[user.id]);
  console.log(JSON.stringify({ok:true,userId:user.id,role:"superadmin"}));
} finally {
  await pool.end();
}
