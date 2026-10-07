import pg from "pg";
const { Pool } = pg;

const regionByUf:Record<string,"N"|"NE"|"CO"|"SE"|"S">={
  AC:"N",AP:"N",AM:"N",PA:"N",RO:"N",RR:"N",TO:"N",
  AL:"NE",BA:"NE",CE:"NE",MA:"NE",PB:"NE",PE:"NE",PI:"NE",RN:"NE",SE:"NE",
  DF:"CO",GO:"CO",MT:"CO",MS:"CO",
  ES:"SE",MG:"SE",RJ:"SE",SP:"SE",
  PR:"S",RS:"S",SC:"S"
};

const urls={
  N:process.env.SECTIONS_DATABASE_URL_N,
  NE:process.env.SECTIONS_DATABASE_URL_NE,
  CO:process.env.SECTIONS_DATABASE_URL_CO,
  SE:process.env.SECTIONS_DATABASE_URL_SE ?? process.env.SECTIONS_DATABASE_URL,
  S:process.env.SECTIONS_DATABASE_URL_S
};

const pools=new Map<string,pg.Pool>();
function poolForUrl(url?:string){
  if(!url) return null;
  let pool=pools.get(url);
  if(!pool){pool=new Pool({connectionString:url});pools.set(url,pool);}
  return pool;
}

export const sectionsPool=poolForUrl(process.env.SECTIONS_DATABASE_URL);

export function sectionsRegionForUf(uf:string){
  return regionByUf[String(uf||"").toUpperCase()]??null;
}

export function sectionsPoolForUf(uf:string){
  const region=sectionsRegionForUf(uf);
  if(!region) return sectionsPool;
  return poolForUrl(urls[region]) ?? sectionsPool;
}

export async function sectionsSql<T extends pg.QueryResultRow = pg.QueryResultRow>(text:string,params:unknown[]=[]){
  if(!sectionsPool) throw new Error("Base granular não configurada.");
  return sectionsPool.query<T>(text,params);
}

export async function sectionsSqlForUf<T extends pg.QueryResultRow = pg.QueryResultRow>(uf:string,text:string,params:unknown[]=[]){
  const pool=sectionsPoolForUf(uf);
  if(!pool) throw new Error("Base granular não configurada para "+uf+".");
  return pool.query<T>(text,params);
}

export async function closeSectionPools(){
  await Promise.all([...new Set(pools.values())].map(p=>p.end()));
}
