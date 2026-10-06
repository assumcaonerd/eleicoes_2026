#!/usr/bin/env python3
import os
import psycopg

TOKEN_HASH="080cf60b495d8732806c23eeac6b783ebf5b3c00a51c33febbc83d0d9b877a30"

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM users
            WHERE disabled_at IS NULL
            ORDER BY created_at ASC
            LIMIT 1
        """)
        row=cur.fetchone()
        if not row:
            raise RuntimeError("Nenhum usuário ativo encontrado")
        user_id=row[0]
        cur.execute("UPDATE password_reset_tokens SET used_at=now() WHERE user_id=%s AND used_at IS NULL",(user_id,))
        cur.execute("""
            INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
            VALUES(%s,%s,now()+interval '2 hours')
        """,(user_id,TOKEN_HASH))
    conn.commit()
print("RESET_TOKEN_CREATED")
