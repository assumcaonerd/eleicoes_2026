import sharp from "sharp";
import {sql} from "../db/index.js";
import {sectionsSqlAllForUf} from "../db/sections.js";
import {esOutlineGeometry} from "./es-outline.js";

type Place={lat:number;lng:number;votes:number;municipality:string;name:string};
const W=4961,H=7016,TOP=440,BOTTOM=285;
const frame={x:145,y:470,w:W-290,h:H-470-BOTTOM-50};
const region={west:-42.32,east:-39.22,south:-21.53,north:-17.65};
const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const X=(lng:number)=>frame.x+(lng-region.west)/(region.east-region.west)*frame.w;
const Y=(lat:number)=>frame.y+(merc(region.north)-merc(lat))/(merc(region.north)-merc(region.south))*frame.h;
const escapeXml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]);
function statePath(){
 let paths:string[]=[];
 const polygons=esOutlineGeometry.coordinates as unknown as number[][][][];
 for(const polygon of polygons)for(const ring of polygon){
  paths.push(ring.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(2)+","+Y(p[1]).toFixed(2)).join(" ")+" Z");
 }
 return paths.join(" ");
}
async function loadPlaces(candidateId:number){
 const info=(await sql<any>(
  "SELECT id,election_id,round,office_code,office_name,uf,number,ballot_name,party_abbr FROM candidates WHERE id=$1",[candidateId]
 )).rows[0];
 if(!info||info.uf!=="ES")throw new Error("Este mapa está disponível somente para candidatos do Espírito Santo.");
 const query=[
 "SELECT sv.municipality_code,MAX(sv.municipality_name) municipality_name,sv.polling_place_code,",
 " MAX(p.polling_place_name) polling_place_name,MAX(p.latitude)::float8 latitude,",
 " MAX(p.longitude)::float8 longitude,SUM(sv.votes)::bigint votes",
 "FROM section_votes sv",
 "JOIN LATERAL (SELECT p0.polling_place_name,p0.latitude,p0.longitude FROM places p0",
 " WHERE p0.uf=sv.uf AND p0.municipality_code=sv.municipality_code AND p0.zone=sv.zone AND p0.section=sv.section",
 " ORDER BY CASE WHEN p0.polling_place_code=sv.polling_place_code THEN 0 ELSE 1 END LIMIT 1) p ON true",
 "WHERE sv.uf='ES' AND sv.election_id=$1 AND sv.round=$2 AND sv.office_code=$3 AND sv.candidate_number=$4",
 " AND sv.votes>0 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL",
 "GROUP BY sv.municipality_code,sv.polling_place_code"
 ].join("\n");
 const groups=await sectionsSqlAllForUf<any>("ES",query,[info.election_id,info.round,info.office_code,info.number]);
 const places=new Map<string,Place>();
 for(const group of groups)for(const row of group.rows){
  const lat=Number(row.latitude),lng=Number(row.longitude),votes=Number(row.votes);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(votes))continue;
  if(lat<region.south||lat>region.north||lng<region.west||lng>region.east)continue;
  const key=String(row.municipality_code)+"|"+String(row.polling_place_code);
  let item=places.get(key);
  if(item)item.votes+=votes;
  else places.set(key,{lat,lng,votes,municipality:row.municipality_name||"",name:row.polling_place_name||""});
 }
 return {info,places:[...places.values()]};
}
let cachedPrintMap:{image:string|null;expires:number}|null=null;
async function tryPrintBasemap(){
 if(cachedPrintMap&&Date.now()<cachedPrintMap.expires)return cachedPrintMap.image;
 const url=new URL("https://sampleserver6.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/export");
 url.search=new URLSearchParams({
  bbox:[region.west*111319.49079327358,merc(region.south)*6378137,region.east*111319.49079327358,merc(region.north)*6378137].join(","),
  bboxSR:"3857",imageSR:"3857",size:"2400,3200",
  format:"jpg",transparent:"false",dpi:"160",f:"image"
 }).toString();
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{"user-agent":"SigaOVotoPrint/1.0 (+https://sigaovoto.com.br)"}});
  if(!response.ok)return null;
  const type=(response.headers.get("content-type")||"").toLowerCase();
  if(!type.startsWith("image/jpeg")&&!type.startsWith("image/png"))return null;
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000||bytes.length>15_000_000)return null;
  const image="data:"+(type.includes("png")?"image/png":"image/jpeg")+";base64,"+bytes.toString("base64");
  cachedPrintMap={image,expires:Date.now()+20*60*1000};
  return image;
 }catch{return null}finally{clearTimeout(timeout)}
}
function pin(x:number,y:number,votes:number){
 const factor=Math.min(1.3,Math.max(.6,.65+Math.log10(Math.max(1,votes))*.12));
 return '<g transform="translate('+x.toFixed(2)+','+y.toFixed(2)+') scale('+factor.toFixed(2)+')">'+
  '<path d="M0 0 C-4 -10 -13 -16 -13 -26 A13 13 0 1 1 13 -26 C13 -16 4 -10 0 0Z"'+
  ' fill="#c42134" stroke="#6b1320" stroke-width="1.5"/>'+
  '<ellipse cx="-3" cy="-30" rx="5" ry="6" fill="#ffacb4" opacity=".8"/></g>';
}
function localityLabels(points:Place[]){
 const cities=new Map<string,{lat:number;lng:number;n:number}>();
 for(const p of points){
  if(!p.municipality)continue;
  const v=cities.get(p.municipality)||{lat:0,lng:0,n:0};
  v.lat+=p.lat;v.lng+=p.lng;v.n++;cities.set(p.municipality,v);
 }
 return [...cities].filter(x=>x[1].n>2).map(([name,v])=>
  '<text x="'+X(v.lng/v.n).toFixed(1)+'" y="'+(Y(v.lat/v.n)+39).toFixed(1)+
  '" font-family="Arial" font-size="25" text-anchor="middle" fill="#364d62"'+
  ' stroke="white" stroke-width="5" paint-order="stroke">'+escapeXml(name)+'</text>'
 ).join("");
}
export async function renderESMap(candidateId:number,format:"svg"|"png"){
 const {info,places}=await loadPlaces(candidateId);
 if(!places.length)throw new Error("Nenhum local com votos e coordenadas válidas foi encontrado no ES.");
 const basemap=await tryPrintBasemap();
 const path=statePath();
 const total=places.reduce((sum,p)=>sum+p.votes,0);
 const date=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date());
 const basemapElement=basemap?
  '<image href="'+basemap+'" x="'+frame.x+'" y="'+frame.y+'" width="'+frame.w+'" height="'+frame.h+'" preserveAspectRatio="none"/>':
  '<rect x="'+frame.x+'" y="'+frame.y+'" width="'+frame.w+'" height="'+frame.h+'" fill="#deeff9"/>';
 const svg=[
  '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">',
  '<rect width="'+W+'" height="'+H+'" fill="white"/>',
  '<rect width="'+W+'" height="'+TOP+'" fill="#172a3d"/>',
  '<text x="145" y="143" fill="white" font-family="Arial" font-size="105" font-weight="700">SIGA O VOTO 2026</text>',
  '<text x="145" y="243" fill="#d8e6f4" font-family="Arial" font-size="61">MAPA ELEITORAL · ESPÍRITO SANTO</text>',
  '<text x="145" y="338" fill="white" font-family="Arial" font-size="47">'+escapeXml(info.ballot_name)+' · Nº '+escapeXml(info.number)+'</text>',
  '<defs><clipPath id="cut"><rect x="'+frame.x+'" y="'+frame.y+'" width="'+frame.w+'" height="'+frame.h+'" rx="18"/></clipPath></defs>',
  '<g clip-path="url(#cut)">',basemapElement,
  '<path d="'+path+'" fill="'+(basemap?"#ffffff":"#e7f2e4")+'" fill-opacity="'+(basemap?".05":"1")+'" stroke="#346a4b" stroke-width="9" fill-rule="evenodd" stroke-linejoin="round"/>',
  basemap?"":localityLabels(places),
  places.map(p=>pin(X(p.lng),Y(p.lat),p.votes)).join(""),
  '</g><rect x="'+frame.x+'" y="'+frame.y+'" width="'+frame.w+'" height="'+frame.h+'" rx="18" fill="none" stroke="#aebfcf" stroke-width="4"/>',
  '<rect y="'+(H-BOTTOM)+'" width="'+W+'" height="'+BOTTOM+'" fill="#eef3f7"/>',
  '<text x="145" y="'+(H-BOTTOM+75)+'" font-size="43" font-family="Arial" font-weight="700" fill="#213448">'+
   places.length.toLocaleString("pt-BR")+' locais georreferenciados · '+total.toLocaleString("pt-BR")+' votos nesses locais</text>',
  '<text x="145" y="'+(H-BOTTOM+125)+'" font-size="29" font-family="Arial" fill="#40556b">Pinos vermelhos: locais com votos · Gerado em '+escapeXml(date)+'</text>',
  '<text x="145" y="'+(H-BOTTOM+178)+'" font-size="24" font-family="Arial" fill="#40556b">Fonte eleitoral: TSE · Contorno estadual: LAGEAMB/UFPR / geodata-br-states (MIT)</text>',
  '<text x="145" y="'+(H-BOTTOM+217)+'" font-size="24" font-family="Arial" fill="#40556b">'+(basemap?
   'Mapa base: Esri World Street Map · Esri, DeLorme, HERE, USGS, Intermap, NRCAN, TomTom':
   'Base vetorial estadual; mapa de ruas indisponível na origem neste momento')+'</text>',
  '<text x="145" y="'+(H-BOTTOM+253)+'" font-size="23" font-family="Arial" fill="#40556b">ES inteiro no enquadramento · escala estadual · formato de impressão A2 (300 dpi)</text>',
  '</svg>'
 ].join("");
 const filename="mapa-es-"+String(info.number).replace(/[^0-9A-Za-z-]/g,"")+"-2026."+format;
 if(format==="svg")return {file:Buffer.from(svg),mime:"image/svg+xml; charset=utf-8",filename};
 const file=await sharp(Buffer.from(svg),{limitInputPixels:55_000_000}).png({compressionLevel:7}).withMetadata({density:300}).toBuffer();
 return {file,mime:"image/png",filename};
}
