import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {states} from '../src/majority/model.js';
import {stateGeography,consolidateState,buildStateReport,complementaryReport,validPin,reportInfo} from '../src/web/cartography/national.js';
import {rasterizeReport} from '../src/web/map-export.js';
const out='/tmp/siga-national-validation';await mkdir(out,{recursive:true});const result:any[]=[];
for(const s of states){
 const g=stateGeography(s.uf),c={id:1,uf:s.uf,number:'00000',ballot_name:'VALIDAÇÃO COM DADOS SINTÉTICOS',party_abbr:'TESTE',office_name:'Governador',office_code:3,election_id:6259,round:1};
 const municipal=g.features.map((m:any,i:number)=>({municipality_code:m.properties.tseCode,votes:i%7===0?0:i*17,source_kind:'tse_municipality'}));const total=municipal.reduce((n:number,r:any)=>n+r.votes,0);const rows=[...municipal,{municipality_code:'',votes:total,source_kind:'tse_scope'}];const report=consolidateState(c,s.uf,rows);
 assert.equal(report.units.length,g.features.length);assert.equal(new Set(report.units.map(m=>m.ibgeCode)).size,g.features.length);assert.equal(report.total,total);assert(report.units.some(m=>m.votes===0));assert.throws(()=>consolidateState(c,s.uf,[...rows,municipal[0]]),/duplicado/);assert.throws(()=>consolidateState(c,s.uf,[...rows,{municipality_code:'99999',votes:1,source_kind:'tse_municipality'}]),/correspondência/);assert.throws(()=>consolidateState(c,s.uf,rows.map(r=>r.source_kind==='tse_scope'?{...r,votes:total+1}:r)),/Divergência/);assert.throws(()=>consolidateState({...c,round:3},s.uf,rows),/incompatíveis/);assert.throws(()=>consolidateState({...c,uf:'BR'},s.uf,rows),/incompatíveis/);
 const missing=consolidateState(c,s.uf,rows.slice(1));assert.equal(missing.units.find(m=>m.tseCode===municipal[0].municipality_code)?.votes,null);assert(!validPin(report,{lat:0,lng:0}));assert(!validPin(report,{lat:Infinity,lng:0}));
 const html=complementaryReport(report);assert.equal((html.match(/data-ibge=/g)||[]).length,g.features.length);
 const allBuilt=buildStateReport(report);assert.equal((allBuilt.svg.match(/id="label-/g)||[]).length,g.features.length);assert(!/NaN|Infinity/.test(allBuilt.svg));
 if(['ES','SP','MG','BA','AM','RS','DF'].includes(s.uf)){
  const start=Date.now(),built=buildStateReport(report);assert(!/NaN|Infinity/.test(built.svg));assert.equal((built.svg.match(/id="municipality-/g)||[]).length,g.features.length);assert(!built.svg.includes('<image'));await writeFile(`${out}/${s.uf}.svg`,built.svg);await writeFile(`${out}/${s.uf}.html`,html);const png=await rasterizeReport(built.svg),meta=await sharp(png).metadata();assert.equal(meta.width,4961);assert.equal(meta.height,7016);assert.equal(meta.density,300);await writeFile(`${out}/${s.uf}.png`,png);await sharp(png).resize({width:1400}).toFile(`${out}/${s.uf}-preview.png`);console.log(JSON.stringify({uf:s.uf,count:g.features.length,generated:true,ms:Date.now()-start,png:meta.width+'x'+meta.height,dpi:meta.density}));
 }
 result.push({...reportInfo(s.uf),validated:true});
}
await writeFile(`${out}/results.json`,JSON.stringify({synthetic:true,ufs:result},null,2));console.log('All 27 structural tests passed.');
