import assert from "node:assert/strict";
import {Script} from "node:vm";
import {readFileSync} from "node:fs";
import {homePage,authPage,appPage,plansPage,resetPasswordPage,adminPage} from "../src/web/pages.js";
import {brandColors,brandCss,brandMark} from "../src/web/brand.js";
import {handleWeb} from "../src/web/handler.js";

const user={id:1,email:"visual-test@example.invalid",role:"admin"};
const pages=[homePage(),homePage(user),authPage("login"),authPage("cadastro"),authPage("login","<script>invalid</script>"),appPage(user,true),appPage(user,false),plansPage(user),resetPasswordPage("token"),resetPasswordPage("", "",true),adminPage(user,{users:1,active:1,imports:1})];
for(const page of pages){
 assert(page.includes('class="sov-shell"'));assert(page.includes('class="brand-symbol"'));assert(page.includes('INTELIGÊNCIA ELEITORAL'));assert(page.includes('<main>'));
 assert(page.includes("font-family:SigaLato"));assert(page.includes("font-display:swap"));assert(!page.includes("politique.app"));
 for(const match of page.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new Script(match[1]);
}
assert(authPage("login","<script>invalid</script>").includes("&lt;script&gt;invalid&lt;/script&gt;"));
const dashboard=appPage(user,true);
const staticMarkup=dashboard.split("<script>")[0];
const ids=[...staticMarkup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
for(const id of ["search","newSearch","voteComparison","map","mapState","mapMunicipality","mapZone","mapNeighborhood","mapPlace","mapSection","compareExportCsv","compareExportPdf","esPrintPng","esPrintSvg","esPrintStatus"])assert(ids.includes(id),id);
for(const level of ["municipality","neighborhood","polling_place","zone","section","map","compare"])assert(dashboard.includes(`data-level="${level}"><svg class="sov-icon"`));
assert(authPage("login").includes('action="/login"'));assert(authPage("cadastro").includes('minlength="12"'));assert(plansPage(user).includes('value="monthly"'));assert(plansPage(user).includes('value="lifetime"'));
assert(brandCss.includes("@media(max-width:760px)"));assert(brandCss.includes("@media print"));assert(brandCss.includes("prefers-reduced-motion"));assert(brandCss.includes(":focus-visible"));
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
function contrast(a:string,b:string){const l=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(l[0]+.05)/(l[1]+.05)}
for(const [fg,bg] of [["#FFFFFF",brandColors.primary],[brandColors.navy,brandColors.background],[brandColors.muted,brandColors.background],["#1B4FBF",brandColors.soft]])assert(contrast(fg,bg)>=4.5,`${fg}/${bg}`);
for(const [path,file] of [["lato-regular-v1.ttf","Lato-Regular.ttf"],["lato-bold-v1.ttf","Lato-Bold.ttf"],["mark.svg",null]] as const){
 let status=0,headers:Record<string,any>={},content:any;
 const res={writeHead:(s:number,h:Record<string,any>)=>{status=s;headers=h},end:(c:any)=>{content=c}};
 assert.equal(await handleWeb({method:"GET",url:"/assets/siga-voto/"+path,headers:{}} as any,res as any),true);assert.equal(status,200);assert.equal(headers["x-content-type-options"],"nosniff");
 if(file){assert(Buffer.isBuffer(content));assert.equal(headers["content-type"],"font/ttf");assert(content.equals(readFileSync(new URL("../src/web/cartography/fonts/"+file,import.meta.url))))}else assert.equal(content,brandMark);
}
console.log(JSON.stringify({passed:true,pages:pages.length,tabs:7,uniqueControls:ids.length,contrast:"WCAG AA >= 4.5:1",publicAssets:3,checks:"branding, local fonts, forms, escaped errors, JavaScript syntax, existing controls, responsive/print/reduced-motion styles"}));
