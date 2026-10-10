import {gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {states} from '../../majority/model.js';
import catalog from '../../majority/municipalities-2026.json' with {type:'json'};
import {buildReport,consolidate,type Candidate,type VoteRow,printText,colorScale,layoutLabels,interiorAnchor} from './report.js';
import {brandColors} from '../brand.js';
export type Geo={type:string;coordinates:any};
export type Unit={ibgeCode:string;tseCode:string;name:string;geometry:Geo;votes:number|null};
export type StateReport={candidate:Candidate;uf:string;units:Unit[];total:number|null;totalKind:'official'|'municipal-sum'|'missing';pins:{lat:number;lng:number}[];pinCoverage:string;source:any};
const cache=new Map<string,any>();
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fmt=(v:number|null)=>v===null?'Sem registro':v.toLocaleString('pt-BR');
export function stateGeography(uf:string){
 const state=states.find(s=>s.uf===uf);if(!state)throw new Error('UF inválida. Selecione um estado ou o Distrito Federal.');
 if(!cache.has(uf)){
  let g:any;try{const data=uf==='MT'?Buffer.concat((JSON.parse(readFileSync(new URL('./ufs/MT.parts.json',import.meta.url),'utf8')) as string[]).map(name=>readFileSync(new URL('./ufs/'+name,import.meta.url)))):readFileSync(new URL(uf==='ES'?'./es-ibge.json':`./ufs/${uf}.json.gz`,import.meta.url));g=JSON.parse((uf==='ES'?data:gunzipSync(data)).toString('utf8'))}catch{throw new Error(`Malha oficial de ${uf} ainda indisponível. Nenhuma localização será inventada.`)}
  const expected=catalog.filter(m=>m.uf===uf),keys=new Map(expected.map(m=>[m.ibgeCode,m.code]));
  if(g.type!=='FeatureCollection'||g.features.length!==expected.length)throw new Error(`Quantidade territorial divergente em ${uf}.`);
  const ibge=new Set(),tse=new Set();
  for(const f of g.features){const p=f.properties;
   if(!p.name||keys.get(p.ibgeCode)!==p.tseCode||ibge.has(p.ibgeCode)||tse.has(p.tseCode)||!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw new Error(`Correspondência territorial inválida em ${uf}.`);
   ibge.add(p.ibgeCode);tse.add(p.tseCode);
  }
  cache.set(uf,g);
 }
 return cache.get(uf);
}
export function consolidateState(candidate:Candidate,uf:string,rows:VoteRow[]):StateReport{
 if(![1,2].includes(Number(candidate.round))||Number(candidate.office_code)!==1&&candidate.uf!==uf)throw new Error('Candidato, cargo, turno e UF incompatíveis.');
 const g=stateGeography(uf),valid=new Set(g.features.map((f:any)=>f.properties.tseCode)),seen=new Map<string,number>();
 for(const row of rows.filter(r=>r.source_kind==='tse_municipality')){
  const key=String(row.municipality_code).trim().padStart(5,'0'),v=Number(row.votes);
  if(!valid.has(key))throw new Error(`Código TSE sem correspondência IBGE em ${uf}: ${key}.`);
  if(seen.has(key))throw new Error(`Resultado municipal duplicado: ${key}.`);
  if(row.votes===null||row.votes===''||!Number.isSafeInteger(v)||v<0)throw new Error(`Votação inválida: ${key}.`);
  seen.set(key,v);
 }
 const scopes=rows.filter(r=>r.source_kind==='tse_scope'&&r.municipality_code==='');
 if(scopes.length>1)throw new Error('Total estadual duplicado.');
 const total=scopes.length?Number(scopes[0].votes):null;
 if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw new Error('Total estadual inválido.');
 const units:Unit[]=g.features.map((f:any)=>({...f.properties,geometry:f.geometry,votes:seen.get(f.properties.tseCode)??null})).sort((a:Unit,b:Unit)=>a.name.localeCompare(b.name,'pt-BR'));
 const sum=units.reduce((n,m)=>n+(m.votes??0),0),complete=seen.size===units.length;
 if(total!==null&&(complete?sum!==total:sum>total))throw new Error(`Divergência de votos: soma confirmada ${fmt(sum)}, total estadual ${fmt(total)}.`);
 return {candidate,uf,units,total:total??(complete?sum:null),totalKind:total!==null?'official':complete?'municipal-sum':'missing',pins:[],pinCoverage:'Coordenadas ainda não consultadas.',source:g.source??{source:'IBGE; correspondência numérica TSE/IBGE armazenada'}};
}
const polygons=(g:Geo):number[][][][]=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
function inside(p:number[],rings:number[][][]){let yes=false;for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
export function validPin(report:StateReport,p:{lat:number;lng:number}){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<90&&Math.abs(p.lng)<=180&&report.units.some(m=>polygons(m.geometry).some(poly=>inside([p.lng,p.lat],poly)))}
export function reportInfo(uf:string){const state=states.find(s=>s.uf===uf);const count=stateGeography(uf).features.length;return {uf,name:state!.name,count,unit:uf==='DF'?'unidade territorial oficial (Brasília), sem divisão municipal':'municípios',complementary:count>78,pages:Math.ceil(count/35)}}
export function buildStateReport(r:StateReport,now=new Date()){
 const info=reportInfo(r.uf),confirmed=r.units.filter(m=>m.votes!==null),sum=confirmed.reduce((n,m)=>n+m.votes!,0);
 // Preserve the established ES composition for complete, reconciled snapshots.
 if(r.uf==='ES'&&confirmed.length===78&&r.total!==null&&r.totalKind==='official'){const old=consolidate({...r.candidate,uf:'ES'},[...r.units.map(m=>({municipality_code:m.tseCode,votes:m.votes!,source_kind:'tse_municipality'})),{municipality_code:'',votes:r.total,source_kind:'tse_scope'}]);old.pins=r.pins;return {...buildReport(old,now),complementary:false}}
 const t=printText,scale=colorScale(confirmed.map(m=>m.votes!));
 const projectRaw=([x,y]:number[])=>[x*Math.PI/180,-Math.log(Math.tan(Math.PI/4+y*Math.PI/360))];
 const points=r.units.flatMap(m=>polygons(m.geometry).flat(2)).map(projectRaw);
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 const box={x:1780,y:1160,w:3000,h:4810},factor=Math.min(box.w/(right-left),box.h/(bottom-top));
 const ox=box.x+(box.w-(right-left)*factor)/2,oy=box.y+(box.h-(bottom-top)*factor)/2;
 const project=(p:number[])=>{const q=projectRaw(p);return [ox+(q[0]-left)*factor,oy+(q[1]-top)*factor]};
 const pieces=[`<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="594mm" viewBox="0 0 4961 7016"><title>MAPA PROFISSIONAL DE ${esc(info.name.toUpperCase())}</title><metadata>${esc(JSON.stringify({candidate:r.candidate,uf:r.uf,total:r.total,totalKind:r.totalKind,confirmedSum:sum,units:r.units.map(({geometry,...m})=>m),source:r.source,pinCoverage:r.pinCoverage,generatedAt:now.toISOString(),complementary:info.complementary}))}</metadata><rect width="4961" height="7016" fill="white"/><rect width="4961" height="880" fill="${brandColors.navy}"/>`,
 t('SIGA O VOTO',160,190,100,brandColors.accent,true),t(`MAPA PROFISSIONAL DE ${info.name.toUpperCase()}`,160,310,53,'#d3e6f4'),t(r.candidate.ballot_name,160,490,70,'white',true),t(`Nº ${r.candidate.number} · ${r.candidate.party_abbr||'Partido não informado'} · ${r.candidate.office_name}`,160,605,47,'white'),t(`Eleição ${r.candidate.election_id} · ${r.candidate.round}º turno${Number(r.candidate.office_code)===1?' · Votação presidencial nesta UF':''}`,160,720,43,'#d3e6f4'),
 '<rect x="130" y="1030" width="1460" height="5440" rx="20" fill="#f3f6f9"/>',t('PANORAMA ESTADUAL',185,1140,43,'#234766',true),t(fmt(r.total),185,1260,83,'#142d48',true),t(r.totalKind==='municipal-sum'?'Total: soma municipal completa':'Total oficial no recorte estadual',185,1340,37),t(`Soma confirmada: ${fmt(sum)} votos`,185,1430,37),t(`Registros: ${confirmed.length} / ${r.units.length}`,185,1510,37),t(`Zero confirmado: ${r.units.filter(m=>m.votes===0).length}`,185,1590,37),t(`Sem registro: ${r.units.length-confirmed.length}`,185,1670,37),t(r.uf==='DF'?'Brasília: unidade territorial oficial':`${r.units.length} municípios oficiais`,185,1770,35),t('TERRITÓRIO COMPLETO DA UF',1780,1070,43,'#234766',true)];
 if(info.complementary){pieces.push(t('RELAÇÃO INTEGRAL PAGINADA',185,1910,37,'#234766',true),t(`${info.pages} páginas complementares`,185,1990,36),t('A lista integral acompanha o mapa.',185,2070,36),t('Não há redução nem omissão de linhas.',185,2150,34),t('Chaves numéricas no mapa: 1 a '+r.units.length,185,2270,35),t('Nomes e votos estão no complemento',185,2350,35),t('e nos títulos vetoriais de cada limite.',185,2430,35));}
 else{pieces.push(t(r.uf==='DF'?'UNIDADE OFICIAL':'MUNICÍPIO',185,1910,35,'#536d83',true),t('VOTOS',1540,1910,35,'#536d83',true,'end'));for(const [i,m] of r.units.entries()){const y=2000+i*55;pieces.push(`<g id="table-${m.ibgeCode}">`,t(m.name,185,y,34),t(fmt(m.votes),1540,y,35,'#142d48',true,'end'),'</g>')}}
 const projectedItems=r.units.map(m=>{const shapes=polygons(m.geometry).map(poly=>poly.map(ring=>ring.map(project) as [number,number][]));const areas=shapes.map(r=>Math.abs(r[0].reduce((sum,p,i,a)=>{const q=a[(i+1)%a.length];return sum+p[0]*q[1]-q[0]*p[1]},0)));const rings=shapes[areas.indexOf(Math.max(...areas))];return {m:{...m,votes:m.votes??0},rings,anchor:interiorAnchor(rings)}});
 let labeled=0;
 for(const m of r.units){const shapes=polygons(m.geometry);const path=shapes.map(poly=>poly.map(ring=>ring.map((q,i)=>`${i?'L':'M'}${project(q).map(v=>v.toFixed(2)).join(',')}`).join(' ')+'Z').join(' ')).join(' ');
  pieces.push(`<path id="municipality-${m.ibgeCode}" data-tse-code="${m.tseCode}" data-votes="${m.votes??'missing'}" d="${path}" fill="${m.votes===null?'#c2c4ca':scale.color(m.votes)}" fill-rule="evenodd" stroke="#52697c" stroke-width="2"><title>${esc(m.name)} · IBGE ${m.ibgeCode} · TSE ${m.tseCode}: ${fmt(m.votes)}${m.votes===null?'':' votos'}</title></path>`);
 }
 const valid=r.pins.filter(p=>validPin(r,p));for(const p of valid){const [x,y]=project([p.lng,p.lat]);pieces.push(`<g class="polling-pin" transform="translate(${x},${y})"><path d="M0 0C-4-10-12-16-12-24A12 12 0 1 1 12-24C12-16 4-10 0 0Z" fill="#b72e3e" stroke="white" stroke-width="2"/></g>`)}
 // Every small-UF label is placed with the tested ES callout algorithm.
 if(!info.complementary){const labels=layoutLabels(projectedItems);for(const l of labels){const m=r.units.find(m=>m.ibgeCode===l.code)!;if(l.external)pieces.push(`<path d="M${l.anchor[0]},${l.anchor[1]}L${l.x},${l.y}" stroke="#536d83" stroke-width="2"/>`);pieces.push(`<g id="label-${m.ibgeCode}"><rect x="${l.x-l.w/2}" y="${l.y-l.h/2}" width="${l.w}" height="${l.h}" fill="white" fill-opacity=".94"/>`);l.lines.forEach((line,i)=>pieces.push(t(line,l.x,l.y-l.h/2+42+i*48,42,'#142d48',true,'middle')));pieces.push(t(fmt(m.votes)+(m.votes===null?'':' votos'),l.x,l.y-l.h/2+l.lines.length*48+40,39,'#365674',false,'middle'),'</g>');labeled++;}}
 else{
  // Stable numerical keys connect every polygon to the complete paginated table.
  const used:{x:number;y:number}[]=[];
  for(const [i,item] of projectedItems.entries()){let [x,y]=item.anchor;const free=(x:number,y:number)=>x>=1815&&x<=4745&&y>=1200&&y<=5990&&!used.some(p=>Math.abs(x-p.x)<85&&Math.abs(y-p.y)<52);if(!free(x,y)){let found=false;for(let radius=52;radius<5500&&!found;radius+=52){const n=Math.ceil(radius*2*Math.PI/50);for(let k=0;k<n;k++){const a=k*2*Math.PI/n,tx=item.anchor[0]+Math.cos(a)*radius,ty=item.anchor[1]+Math.sin(a)*radius;if(free(tx,ty)){x=tx;y=ty;found=true;break}}}if(!found)throw new Error('Espaço insuficiente para chaves cartográficas legíveis.');pieces.push(`<path d="M${item.anchor[0]},${item.anchor[1]}L${x},${y}" stroke="#536d83" stroke-width="1.2"/>`)}used.push({x,y});pieces.push(`<g id="label-${item.m.ibgeCode}"><rect x="${x-38}" y="${y-28}" width="76" height="45" rx="8" fill="white" fill-opacity=".94"/>`,t(i+1,x,y+5,33,'#142d48',true,'middle'),'</g>');labeled++;}
 }
 pieces.push(t('LEGENDA',1780,6200,40,'#234766',true));const legend=[{color:'#c2c4ca',label:'Sem registro'},{color:'#e6e9ed',label:'Zero confirmado'},...scale.bins.map(b=>({color:b.color,label:`${fmt(b.min)} a ${fmt(b.max)}`}))];legend.forEach((b,i)=>{const x=1780+i%3*980,y=6250+Math.floor(i/3)*90;pieces.push(`<rect x="${x}" y="${y}" width="55" height="45" fill="${b.color}" stroke="#52697c"/>`,t(b.label,x+75,y+35,32))});
 pieces.push(t(`Pinos: ${valid.length} coordenadas dentro do território.`,160,6640,35),t(r.pinCoverage,160,6705,32),t('Fontes: TSE (votos e códigos); IBGE (malha e nomes oficiais).',160,6770,35),t(`Gerado: ${now.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília). A2 · 300 dpi.`,160,6850,35),t('Ausência de registro não é zero. Títulos vetoriais preservam nomes, códigos e votos.',160,6920,32),'</svg>');
 return {svg:pieces.join(''),labels:[],municipalities:r.units.length,total:r.total,complementary:info.complementary||labeled<r.units.length};
}
export function complementaryReport(r:StateReport,now=new Date()){
 const info=reportInfo(r.uf),pages=[];
 for(let i=0;i<r.units.length;i+=35){pages.push(`<section><h1>SIGA O VOTO · ${esc(info.name)}</h1><h2>${esc(r.candidate.ballot_name)} · ${esc(r.candidate.number)} · ${esc(r.candidate.party_abbr)}</h2><p>${esc(r.candidate.office_name)} · Eleição ${r.candidate.election_id} · ${r.candidate.round}º turno · Total ${r.totalKind==='municipal-sum'?'(soma municipal)':'oficial'}: ${fmt(r.total)}</p><table><thead><tr><th>Chave</th><th>${r.uf==='DF'?'Unidade oficial':'Município'}</th><th>IBGE</th><th>TSE</th><th>Votos</th></tr></thead><tbody>${r.units.slice(i,i+35).map((m,j)=>`<tr data-ibge="${m.ibgeCode}"><td>${i+j+1}</td><td>${esc(m.name)}</td><td>${m.ibgeCode}</td><td>${m.tseCode}</td><td>${fmt(m.votes)}</td></tr>`).join('')}</tbody></table><footer>Página ${Math.floor(i/35)+1}/${Math.ceil(r.units.length/35)} · Fonte: TSE / IBGE · Gerado ${esc(now.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}. Sem registro não é zero. ${esc(r.pinCoverage)}</footer></section>`)}
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relação integral de ${esc(info.name)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:11pt Arial;color:#142d48;margin:0;background:#e9edf3}section{width:180mm;min-height:260mm;background:white;padding:6mm;margin:10mm auto;break-after:page}section:last-child{break-after:auto}h1{font-size:18pt}h2{font-size:14pt}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border-bottom:1px solid #bbc8d5;padding:1.7mm;text-align:left}th{background:#e9edf3}footer{font-size:9pt;margin-top:5mm}@media print{body{background:white}section{margin:0;padding:0}}</style>${pages.join('')}</html>`;
}
