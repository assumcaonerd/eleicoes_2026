import pg from "pg";
const { Pool } = pg;
const connectionString=process.env.SECTIONS_DATABASE_URL;
export const sectionsPool = connectionString ? new Pool({connectionString}) : null;
export async function sectionsSql<T extends pg.QueryResultRow = pg.QueryResultRow>(text:string,params:unknown[]=[]){
  if(!sectionsPool) throw new Error("Base granular não configurada.");
  return sectionsPool.query<T>(text,params);
}
