export const states = [
 ['AC','Acre','12'],['AL','Alagoas','27'],['AP','Amapá','16'],['AM','Amazonas','13'],
 ['BA','Bahia','29'],['CE','Ceará','23'],['DF','Distrito Federal','53'],['ES','Espírito Santo','32'],
 ['GO','Goiás','52'],['MA','Maranhão','21'],['MT','Mato Grosso','51'],['MS','Mato Grosso do Sul','50'],
 ['MG','Minas Gerais','31'],['PA','Pará','15'],['PB','Paraíba','25'],['PR','Paraná','41'],
 ['PE','Pernambuco','26'],['PI','Piauí','22'],['RJ','Rio de Janeiro','33'],['RN','Rio Grande do Norte','24'],
 ['RS','Rio Grande do Sul','43'],['RO','Rondônia','11'],['RR','Roraima','14'],['SC','Santa Catarina','42'],
 ['SP','São Paulo','35'],['SE','Sergipe','28'],['TO','Tocantins','17']
].map(([uf,name,ibgeCode])=>({uf,name,ibgeCode}));
export type Municipality = {uf:string;code:string;name:string;ibgeCode?:string};
export type Fact = {uf:string;municipality_code:string;votes:number;source_kind:string;source_updated_at?:string|null};
export type Territory = {code:string;name:string;uf:string;ibgeCode?:string;votes:number|null;share:number|null;valid_vote_percentage?:number|null;coverage:number;expected:number;updated_at:string|null};
export function consolidateTerritories(catalog:Municipality[],facts:Fact[],national:boolean,total:number|null):Territory[]{
 const seen=new Map<string,Fact>();
 for(const row of facts){
  if(row.source_kind!=='tse_municipality')continue;
  if(!Number.isSafeInteger(Number(row.votes))||Number(row.votes)<0)throw new Error('Registro de votos inválido.');
  const key=row.uf+':'+row.municipality_code;
  if(seen.has(key))throw new Error('Registros municipais duplicados: '+key+'. Consolidação bloqueada.');
  seen.set(key,row);
 }
 const known=new Set(catalog.map(m=>m.uf+':'+m.code));
 for(const key of seen.keys())if(!known.has(key))throw new Error('Código municipal não conciliado com o catálogo oficial: '+key);
 const rows=catalog.map(m=>{
  const f=seen.get(m.uf+':'+m.code),votes=f?Number(f.votes):null;
  return {code:m.code,name:m.name,uf:m.uf,ibgeCode:m.ibgeCode,votes,
   share:votes!==null&&total!==null&&total>0?100*votes/total:null,
   coverage:f?1:0,expected:1,updated_at:f?.source_updated_at??null};
 });
 if(!national)return rows;
 return states.map(s=>{
  const items=rows.filter(m=>m.uf===s.uf),present=items.filter(m=>m.votes!==null);
  // A partial UF is never displayed as an official state total.
  const votes=items.length>0&&present.length===items.length?present.reduce((n,m)=>n+m.votes!,0):null;
  const times=present.map(m=>m.updated_at).filter((t):t is string=>Boolean(t)).sort();
  return {code:s.uf,name:s.name,uf:s.uf,ibgeCode:s.ibgeCode,votes,
   share:votes!==null&&total!==null&&total>0?100*votes/total:null,
   coverage:present.length,expected:items.length,updated_at:times[0]??null};
 });
}
export function csvCell(value:unknown){
 let text=String(value??'');
 if(/^\s*[=+@]/.test(text)||/^\s*-(?=[^0-9])/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function territoryCSV(data:{candidate:any;rows:Territory[];total:number|null}){
 const c=data.candidate;
 return '\uFEFF'+[
  ['Eleição','Turno','Cargo','Candidato','Número','UF','Código','Território','Votos','Percentual dos votos válidos (%)','Participação no total do candidato (%)','Registros presentes','Registros esperados','Atualização'],
  ...data.rows.map(r=>[c.election_id,c.round,c.office_name,c.ballot_name,c.number,r.uf,r.code,r.name,r.votes,r.valid_vote_percentage,r.share,r.coverage,r.expected,r.updated_at])
 ].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
