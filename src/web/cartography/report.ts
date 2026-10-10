import {readFileSync} from "node:fs";
import opentype from "opentype.js";
import {brandColors,brandMark} from "../brand.js";
import geography from "./es-ibge.json" with {type:"json"};

export type Candidate={id:number;uf:string;number:string;ballot_name:string;full_name?:string;party_abbr:string;office_name:string;office_code:number;election_id:number;round:number};
export type VoteRow={municipality_code:string;votes:number|string;source_kind:string};
type Point=[number,number];
type Geometry={type:string;coordinates:any};
export type Municipality={ibgeCode:string;tseCode:string;name:string;votes:number;geometry:Geometry};
export type Report={candidate:Candidate;municipalities:Municipality[];total:number;pinCoverage?:string;pins?:{lat:number;lng:number}[]};
export const WIDTH=4961,HEIGHT=7016;
const number=(v:number)=>v.toLocaleString("pt-BR");
const xml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]);
export const municipalIndex=geography.features.map(f=>({...f.properties,geometry:f.geometry}));
export function validateGeography(){
 if(municipalIndex.length!==78||new Set(municipalIndex.map(f=>f.ibgeCode)).size!==78||new Set(municipalIndex.map(f=>f.tseCode)).size!==78)
  throw new Error("Malha cartográfica inválida: são necessários os 78 municípios únicos do ES.");
 for(const f of municipalIndex)if(!/^32\d{5}$/.test(f.ibgeCode)||!/^\d{5}$/.test(f.tseCode)||!f.name||!["Polygon","MultiPolygon"].includes(f.geometry.type))throw new Error("Identificação municipal inválida na malha IBGE.");
}
validateGeography();
const normalizeCode=(code:string)=>{const s=String(code).trim();return /^\d{1,5}$/.test(s)?s.padStart(5,"0"):s};
/** Missing results never default to zero. Only an explicit TSE municipal record proves zero. */
export function consolidate(candidate:Candidate,rows:VoteRow[]):Report{
 if(candidate.uf!=="ES"||![1,2].includes(Number(candidate.round)))throw new Error("Recorte eleitoral inválido.");
 const scopes=rows.filter(r=>r.source_kind==="tse_scope"&&r.municipality_code==="");
 if(scopes.length!==1)throw new Error("Total estadual ausente ou duplicado. Exportação bloqueada para preservar os dados.");
 const total=Number(scopes[0].votes);
 if(!Number.isSafeInteger(total)||total<0)throw new Error("Total estadual inválido.");
 const codes=new Map<string,number>();
 const valid=new Set(municipalIndex.map(f=>f.tseCode));
 for(const row of rows.filter(r=>r.source_kind==="tse_municipality")){
  const code=normalizeCode(row.municipality_code);
  if(!valid.has(code))throw new Error(`Código municipal TSE sem correspondência IBGE: ${code}.`);
  if(codes.has(code))throw new Error(`Resultado municipal duplicado: ${code}. Exportação bloqueada.`);
  const votes=Number(row.votes);
  if(!Number.isSafeInteger(votes)||votes<0)throw new Error(`Votação municipal inválida: ${code}.`);
  codes.set(code,votes);
 }
 const missing=municipalIndex.filter(m=>!codes.has(m.tseCode));
 if(missing.length)throw new Error(`Base incompleta para este candidato, eleição, cargo e turno: ${missing.length} município(s) sem resultado confirmado (${missing.map(m=>m.name).join(", ")}). Dados ausentes não são zero. Exportação bloqueada.`);
 const municipalities=municipalIndex.map(m=>({...m,votes:codes.get(m.tseCode)!})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
 const sum=municipalities.reduce((s,m)=>s+m.votes,0);
 if(!Number.isSafeInteger(sum)||sum!==total)throw new Error(`Divergência de votos: soma municipal ${number(sum)}; total estadual ${number(total)}. Exportação bloqueada.`);
 return {candidate,municipalities,total};
}
let fonts:{regular:opentype.Font;bold:opentype.Font}|undefined;
function getFonts(){
 if(!fonts){
  const load=(name:string)=>{const b=readFileSync(new URL(`./fonts/${name}.ttf`,import.meta.url));return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer)};
  fonts={regular:load("Lato-Regular"),bold:load("Lato-Bold")};
 }
 return fonts;
}
function measure(value:string,size:number,bold=false){return getFonts()[bold?"bold":"regular"].getAdvanceWidth(value,size,{kerning:true})}
/** Outlined fonts guarantee identical type in PNG, vector editors and print shops, without font installation. */
function text(value:unknown,x:number,y:number,size:number,fill="#142d48",bold=false,anchor:"start"|"middle"|"end"="start"){
 const str=String(value??"");const font=getFonts()[bold?"bold":"regular"];
 const width=measure(str,size,bold);const start=x-(anchor==="middle"?width/2:anchor==="end"?width:0);
 return `<g role="img" aria-label="${xml(str)}"><title>${xml(str)}</title><path d="${font.getPath(str,start,y,size,{kerning:true}).toPathData(2)}" fill="${fill}"/></g>`;
}
function fitText(value:unknown,x:number,y:number,size:number,maxWidth:number,fill="#142d48",bold=false){
 const str=String(value??"");const fitted=Math.min(size,size*maxWidth/Math.max(1,measure(str,size,bold)));
 if(fitted<30)throw new Error("Identificação do candidato longa demais para impressão legível.");
 return text(str,x,y,fitted,fill,bold);
}
export function colorScale(values:number[]){
 const sorted=values.filter(v=>v>0).sort((a,b)=>a-b);
 const thresholds=[...new Set([.25,.5,.75].map(q=>sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]).filter(v=>v!==undefined&&v<sorted[sorted.length-1]))];
 const palette=["#e1eff9","#85b5d8","#377cae","#123f70"];
 const bins:{min:number;max:number;color:string}[]=[];
 let min=1; for(const [i,max] of [...thresholds,sorted[sorted.length-1]].entries())if(max!==undefined){bins.push({min,max,color:palette[Math.round(i*3/Math.max(1,thresholds.length))]});min=max+1}
 return {bins,color:(v:number)=>v===0?"#e6e9ed":bins.find(b=>v>=b.min&&v<=b.max)?.color??"#123f70"};
}
function polygons(g:Geometry):number[][][][]{return g.type==="Polygon"?[g.coordinates]:g.coordinates}
const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const rawProject=([lng,lat]:number[]):Point=>[lng*Math.PI/180,-merc(lat)];
function inside(p:Point,rings:Point[][]){
 let answer=false;
 for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])answer=!answer;
 }
 return answer;
}
function distanceToBoundary(p:Point,rings:Point[][]){
 let min=Infinity;
 for(const ring of rings)for(let i=0;i<ring.length-1;i++){
  const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  min=Math.min(min,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
 }
 return inside(p,rings)?min:-min;
}
// Interior label anchor, sampled then refined to the pole of inaccessibility (not a bbox centroid).
function interiorAnchor(rings:Point[][]):Point{
 const outer=rings[0],xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]);
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 let best:Point=outer[0],bestDistance=-Infinity;
 let step=Math.max(right-left,bottom-top)/12;
 for(let x=left;x<=right;x+=step)for(let y=top;y<=bottom;y+=step){const d=distanceToBoundary([x,y],rings);if(d>bestDistance){best=[x,y];bestDistance=d}}
 for(let pass=0;pass<5;pass++){const origin=best;step/=3;for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){const p:Point=[origin[0]+dx*step,origin[1]+dy*step];const d=distanceToBoundary(p,rings);if(d>bestDistance){best=p;bestDistance=d}}}
 if(bestDistance<=0)throw new Error("Não foi possível localizar um ponto interior municipal.");
 return best;
}
export type Label={code:string;name:string;votes:number;x:number;y:number;w:number;h:number;anchor:Point;lines:string[];external:boolean};
export function overlap(a:Label,b:Label,gap=14){return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.y-b.y)<(a.h+b.h)/2+gap}
function wrapName(name:string){
 if(measure(name,42,true)<=580)return [name];
 const words=name.split(" ");let best=[name],width=Infinity;
 for(let i=1;i<words.length;i++){const lines=[words.slice(0,i).join(" "),words.slice(i).join(" ")];const w=Math.max(...lines.map(s=>measure(s,42,true)));if(w<width){width=w;best=lines}}
 return best;
}
const labelFrame={left:1770,right:4790,top:1120,bottom:6210};
function layoutLabels(items:{m:Municipality;rings:Point[][];anchor:Point}[]){
 const labels:Label[]=[];
 const sorted=items.map(item=>({...item,room:distanceToBoundary(item.anchor,item.rings)})).sort((a,b)=>a.room-b.room||a.m.ibgeCode.localeCompare(b.m.ibgeCode));
 for(const item of sorted){
  const lines=wrapName(item.m.name);
  const w=Math.max(...lines.map(s=>measure(s,42,true)),measure(`${number(item.m.votes)} votos`,39))+28;
  const h=lines.length*48+48;
  const base:Label={code:item.m.ibgeCode,name:item.m.name,votes:item.m.votes,x:item.anchor[0],y:item.anchor[1],w,h,lines,anchor:item.anchor,external:false};
  const valid=(l:Label)=>l.x-l.w/2>=labelFrame.left&&l.x+l.w/2<=labelFrame.right&&l.y-l.h/2>=labelFrame.top&&l.y+l.h/2<=labelFrame.bottom&&!((l.x+l.w/2>4100&&l.y-l.h/2<1620))&&!labels.some(other=>overlap(l,other));
  const contained=(l:Label)=>[[l.x-l.w/2,l.y-l.h/2],[l.x+l.w/2,l.y-l.h/2],[l.x+l.w/2,l.y+l.h/2],[l.x-l.w/2,l.y+l.h/2]].every(p=>inside(p as Point,item.rings));
  let choice:Label|undefined;
  if(valid(base)&&contained(base))choice=base;
  else{
   let bestScore=Infinity;
   // Deterministic nearest free rectangle. Enough space for all 78 names without omission.
   for(let radius=0;radius<=1900;radius+=38){
    const n=Math.max(1,Math.ceil(radius*2*Math.PI/42));
    for(let k=0;k<n;k++){
     const angle=2*Math.PI*k/n;
     const l={...base,x:base.x+Math.cos(angle)*radius,y:base.y+Math.sin(angle)*radius};
     if(!valid(l))continue;
     const isInside=contained(l);
     // External callouts must leave the anchor visible and have a real leader line.
     if(!isInside&&Math.abs(l.x-base.anchor[0])<l.w/2+22&&Math.abs(l.y-base.anchor[1])<l.h/2+22)continue;
     const score=radius+(isInside?-150:0);
     if(score<bestScore){choice={...l,external:!isInside};bestScore=score}
    }
    if(choice&&radius>bestScore+190)break;
   }
  }
  if(!choice)throw new Error(`Não foi possível posicionar um rótulo legível para ${item.m.name}. Exportação bloqueada.`);
  labels.push(choice);
 }
 return labels;
}
export function buildReport(report:Report,generatedAt=new Date()){
 if(report.municipalities.length!==78||report.municipalities.reduce((s,m)=>s+m.votes,0)!==report.total)throw new Error("Relatório inconsistente.");
 const mainland=report.municipalities.flatMap(m=>polygons(m.geometry).filter(poly=>poly[0].every(p=>p[0]<-38)));
 const all=mainland.flat(2).map(rawProject);
 const offshore=report.municipalities.flatMap(m=>polygons(m.geometry).filter(poly=>poly[0].some(p=>p[0]>=-38)));
 const islandPoints=offshore.flat(2).map(rawProject);
 const islandX=islandPoints.map(p=>p[0]),islandY=islandPoints.map(p=>p[1]);
 const iw=Math.min(...islandX),ie=Math.max(...islandX),inorth=Math.min(...islandY),isouth=Math.max(...islandY);
 const islandScale=Math.min(540/(ie-iw),200/(isouth-inorth));
 const projectIsland=(p:number[]):Point=>{const q=rawProject(p);return [4200+(q[0]-iw)*islandScale,1320+(q[1]-inorth)*islandScale]};
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 const west=Math.min(...xs),east=Math.max(...xs),north=Math.min(...ys),south=Math.max(...ys);
 const box={x:2040,y:1300,w:2480,h:4630};
 const scale=Math.min(box.w/(east-west),box.h/(south-north));
 const ox=box.x+(box.w-(east-west)*scale)/2,oy=box.y+(box.h-(south-north)*scale)/2;
 const project=(p:number[]):Point=>{const q=rawProject(p);return [ox+(q[0]-west)*scale,oy+(q[1]-north)*scale]};
 const projected=report.municipalities.map(m=>{
  const shapes=polygons(m.geometry).map(poly=>poly.map(r=>r.map(poly[0].some(p=>p[0]>=-38)?projectIsland:project)));
  const areas=shapes.map((r,i)=>polygons(m.geometry)[i][0].some(p=>p[0]>=-38)?0:Math.abs(r[0].reduce((s,p,i,a)=>{const q=a[(i+1)%a.length];return s+p[0]*q[1]-q[0]*p[1]},0)));
  const rings=shapes[areas.indexOf(Math.max(...areas))];
  const path=shapes.map(poly=>poly.map(r=>r.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")+"Z").join(" ")).join(" ");
  return {m,rings,path,anchor:interiorAnchor(rings)};
 });
 const labels=layoutLabels(projected);
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(overlap(labels[i],labels[j]))throw new Error("Sobreposição de rótulos. Exportação bloqueada.");
 const {bins,color}=colorScale(report.municipalities.map(m=>m.votes));
 const pieces=[`<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="594mm" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="report-title">`,
 `<title id="report-title">Siga o Voto 2026: ${xml(report.candidate.ballot_name)}, 78 municípios do Espírito Santo</title>`,
 `<metadata>${xml(JSON.stringify({candidate:report.candidate,total:report.total,pinCoverage:report.pinCoverage,municipalities:report.municipalities.map(({geometry,...m})=>m),generatedAt:generatedAt.toISOString(),projection:"EPSG:3857; escala uniforme",classification:"Quartis dos valores positivos; valores repetidos mantidos juntos; zero separado",sources:["Tribunal Superior Eleitoral","IBGE"]}))}</metadata>`,
 `<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>`,
 `<rect width="4961" height="870" fill="${brandColors.navy}"/><rect y="870" width="4961" height="10" fill="${brandColors.accent}"/>`,
 brandMark.replace('<svg ', '<svg x="4560" y="110" width="180" height="180" '),
 text("SIGA O VOTO 2026",165,190,108,brandColors.accent,true),
 text("MAPA DE VOTAÇÃO POR MUNICÍPIO | ESPÍRITO SANTO",165,305,61,"#d3e6f4"),
 fitText(report.candidate.ballot_name,165,495,98,4500,"#fff",true),
 fitText(`Nº ${report.candidate.number}  ·  ${report.candidate.office_name}  ·  ${report.candidate.party_abbr||"Partido não informado"}`,165,610,62,4500,"#fff"),
 text(`Eleição 2026  ·  ${report.candidate.round}º turno  ·  TSE ${report.candidate.election_id}`,165,725,47,"#a9c6df"),
 '<rect x="130" y="1020" width="1470" height="5470" rx="20" fill="#f3f6f9"/>',
 text("PANORAMA ESTADUAL",185,1120,46,"#234766",true),
 text(number(report.total),185,1255,112,"#102b47",true),text("VOTOS DO CANDIDATO NO ESPÍRITO SANTO",185,1325,32,"#536d83"),
 ];
 const voted=report.municipalities.filter(m=>m.votes>0).length;
 const strongest=[...report.municipalities].sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,"pt-BR"))[0];
 pieces.push(text("Municípios com votos",185,1430,42),text(number(voted),1545,1430,46,"#102b47",true,"end"),
 text("Municípios com zero confirmado",185,1510,42),text(number(78-voted),1545,1510,46,"#102b47",true,"end"),
 text("Média de votos / município",185,1590,42),text((report.total/78).toLocaleString("pt-BR",{maximumFractionDigits:1}),1545,1590,46,"#102b47",true,"end"),
 text("MAIOR VOTAÇÃO MUNICIPAL",185,1690,32,"#536d83",true),
 fitText(`${strongest.name}: ${number(strongest.votes)} votos`,185,1760,48,1350,"#102b47",true),
 text("MUNICÍPIO",185,1890,35,"#536d83",true),text("VOTOS",1545,1890,35,"#536d83",true,"end"),
 '<path d="M185 1920H1545" stroke="#c9d5df" stroke-width="3"/>');
 for(const [i,m] of report.municipalities.entries()){
  const y=1979+i*56;
  if(i%2===0)pieces.push(`<rect x="165" y="${y-41}" width="1400" height="56" fill="#e9eff4"/>`);
  pieces.push(`<g id="table-${m.ibgeCode}" data-votes="${m.votes}">`,text(m.name,185,y,41),text(number(m.votes),1545,y,43,"#142d48",true,"end"),"</g>");
 }
 pieces.push(text("78 MUNICÍPIOS · BASE CONFERIDA",185,6435,31,"#536d83",true),
 text("DISTRIBUIÇÃO TERRITORIAL DOS VOTOS",1770,1060,44,"#234766",true),
 '<path d="M1870 1470V1250M1840 1300L1870 1230L1900 1300" fill="none" stroke="#234766" stroke-width="6" stroke-linejoin="round"/>',text("N",1870,1200,45,"#234766",true,"middle"));
 pieces.push('<rect x="4100" y="1190" width="690" height="400" rx="10" fill="#f3f6f9" stroke="#c9d5df" stroke-width="2"/>',text("ILHAS OCEÂNICAS",4130,1250,31,"#234766",true),text("Vitória · escalas independentes",4130,1565,27,"#536d83"));
 // Draw polygons, then leaders, then fully outlined labels. Never clip municipalities or labels.
 for(const p of projected)pieces.push(`<path id="municipality-${p.m.ibgeCode}" data-tse-code="${p.m.tseCode}" data-votes="${p.m.votes}" d="${p.path}" fill="${color(p.m.votes)}" fill-rule="evenodd" stroke="#52697c" stroke-width="3.2" stroke-linejoin="round"><title>${xml(p.m.name)}: ${number(p.m.votes)} votos</title></path>`);
 for(const l of labels.filter(l=>l.external)){
  const end:Point=[Math.max(l.x-l.w/2,Math.min(l.x+l.w/2,l.anchor[0])),Math.max(l.y-l.h/2,Math.min(l.y+l.h/2,l.anchor[1]))];
  pieces.push(`<path d="M${l.anchor[0]},${l.anchor[1]}L${end[0]},${end[1]}" fill="none" stroke="#fff" stroke-width="8"/><path d="M${l.anchor[0]},${l.anchor[1]}L${end[0]},${end[1]}" fill="none" stroke="#536d83" stroke-width="2.5"/><circle cx="${l.anchor[0]}" cy="${l.anchor[1]}" r="5" fill="#536d83" stroke="#fff" stroke-width="2"/>`);
 }
 const keptPins:Point[]=[];
 for(const pin of report.pins??[]){
  if(!Number.isFinite(pin.lat)||!Number.isFinite(pin.lng))continue;
  const p=project([pin.lng,pin.lat]);
  if(!projected.some(item=>inside(p,item.rings))||labels.some(l=>Math.abs(l.x-p[0])<l.w/2+20&&Math.abs(l.y-p[1]+10)<l.h/2+35)||keptPins.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<44))continue;
  keptPins.push(p);
  pieces.push(`<g transform="translate(${p[0]},${p[1]})"><path d="M0 0C-3-8-10-13-10-20A10 10 0 1 1 10-20C10-13 3-8 0 0Z" fill="#b72e3e" stroke="#fff" stroke-width="2"/><circle cy="-20" r="3.5" fill="#fff"/></g>`);
 }
 for(const l of labels){
  pieces.push(`<g id="label-${l.code}" data-name="${xml(l.name)}" data-votes="${l.votes}"><rect x="${l.x-l.w/2}" y="${l.y-l.h/2}" width="${l.w}" height="${l.h}" rx="8" fill="#fff" fill-opacity=".94"/>`);
  const top=l.y-l.h/2;
  l.lines.forEach((line,i)=>pieces.push(text(line,l.x,top+42+i*48,42,"#102b47",true,"middle")));
  pieces.push(text(`${number(l.votes)} votos`,l.x,top+l.lines.length*48+40,39,"#365674",false,"middle"));

  pieces.push("</g>");
 }
 pieces.push(text("INTENSIDADE DA VOTAÇÃO",1770,6360,38,"#234766",true));
 const legend=[{min:0,max:0,color:"#e6e9ed"},...bins];
 legend.forEach((b,i)=>{const x=1770+i*600;pieces.push(`<rect x="${x}" y="6402" width="72" height="50" rx="5" fill="${b.color}" stroke="#8499aa"/>`,text(b.min===0?"Zero votos":b.min===b.max?`${number(b.min)}`:`${number(b.min)} a ${number(b.max)}`,x+88,6440,33))});
 pieces.push(text("Faixas por quartis dos votos positivos. Zero somente com registro confirmado.",1770,6510,32,"#536d83"),
 text(`Pinos exibidos: ${keptPins.length}/${report.pins?.length??0}. ${report.pinCoverage??"Locais georreferenciados; disposição para leitura."}`,1770,6560,30,"#536d83"),
 '<path d="M130 6620H4830" stroke="#ced8e1" stroke-width="3"/>',
 text("Fonte eleitoral: Tribunal Superior Eleitoral.  Fonte cartográfica: IBGE.",165,6725,39,"#365674"),
 text(`Eleição 2026 · ${report.candidate.round}º turno · Gerado em ${new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"medium"}).format(generatedAt)} (Brasília)`,165,6805,37,"#365674"),
 text("SIGA O VOTO 2026",165,6900,35,"#102b47",true),text("A2 · 300 dpi · Cartografia vetorial · 78/78 municípios",4830,6900,33,"#536d83",false,"end"),"</svg>");
 const svg=pieces.join("");
 if(/NaN|Infinity/.test(svg))throw new Error("Coordenada gráfica inválida. Exportação bloqueada.");
 return {svg,labels,municipalities:78,total:report.total};
}

export const printText=text;
export {layoutLabels,interiorAnchor};
