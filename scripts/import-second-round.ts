import {pool,sql} from '../src/db/index.js';
import {fetchAndPersist} from '../src/tse/client.js';
import {electionConfigUrl,municipalityConfigUrl} from '../src/tse/url.js';
import {discoverMunicipalities} from '../src/tse/normalize.js';
import {storeScope} from '../src/tse/importer.js';
import municipalities from '../src/majority/municipalities-2026.json' with {type:'json'};
import exterior from '../src/majority/exterior-2026.json' with {type:'json'};

try {
 const {data:config}=await fetchAndPersist<any>(electionConfigUrl());
 const elections=config.pl.filter((p:any)=>p.c==='ele2026').flatMap((p:any)=>p.e);
 const president=elections.find((e:any)=>e.cd==='6258'&&e.t==='2');
 const governor=elections.find((e:any)=>e.cd==='6260'&&e.t==='2');
 if(!president||!governor)throw new Error('Segundo turno não confirmado no catálogo oficial.');
 const governorUfs=new Set<string>(governor.abr.filter((a:any)=>a.cp?.some((c:any)=>c.cd==='3')).map((a:any)=>String(a.cd).toUpperCase()));
 const {data:mun}=await fetchAndPersist<any>(municipalityConfigUrl(6258));
 const discovered=discoverMunicipalities(mun);
 const domestic=discovered.filter(m=>m.uf!=='ZZ');
 if(domestic.length<5500)throw new Error('Catálogo municipal incompleto.');
 const missing=municipalities.filter(m=>!domestic.some(d=>d.uf===m.uf&&d.code===m.code));
 if(missing.length)throw new Error('Catálogo não cobre todos os municípios cadastrados.');
 const run=await sql<{id:string}>("INSERT INTO import_runs(source) VALUES('TSE segundo turno 2026: presidente e governador') RETURNING id");
 const id=run.rows[0].id;
 let files=0,rows=0;
 async function load(args:Parameters<typeof storeScope>[0]){
  for(let attempt=0;;attempt++)try{const count=await storeScope({...args,round:2});files++;rows+=count;if(files%100===0){console.log(JSON.stringify({run:id,files,rows}));await sql('UPDATE import_runs SET files_downloaded=$2,rows_imported=$3 WHERE id=$1',[id,files,rows]);}return;}catch(e){if(attempt>=2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
 }
 try {
  console.log(JSON.stringify({run:id,governorUfs:[...governorUfs],municipalities:domestic.length}));
  await load({office:1,uf:'BR'});
  for(const uf of governorUfs)await load({office:3,uf});
  let index=0;
  const tasks=[...domestic,...exterior.map(m=>({...m,zones:[] as number[]}))];
  await Promise.all(Array.from({length:4},async()=>{
   while(index<tasks.length){const m=tasks[index++];
    for(const office of governorUfs.has(m.uf)?[1,3]:[1]){
     await load({office,uf:m.uf,municipalityCode:m.code,municipalityName:m.name});
     for(const zone of m.zones??[])await load({office,uf:m.uf,municipalityCode:m.code,municipalityName:m.name,zone});
    }
   }
  }));
  await sql("UPDATE import_runs SET finished_at=now(),status='ok',files_downloaded=$2,rows_imported=$3,notes=$4 WHERE id=$1",[id,files,rows,JSON.stringify({round:2,governorUfs:[...governorUfs],municipalities:domestic.length,sections:'not imported by EA20'})]);
  console.log('SECOND_ROUND_IMPORT_COMPLETE',JSON.stringify({id,files,rows}));
 }catch(e){await sql("UPDATE import_runs SET finished_at=now(),status='error',files_downloaded=$2,rows_imported=$3,notes=$4 WHERE id=$1",[id,files,rows,String(e)]);throw e;}
}finally{await pool.end();}
