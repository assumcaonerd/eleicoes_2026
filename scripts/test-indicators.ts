import assert from 'node:assert/strict';
import {parseIndicators} from '../src/majority/indicators.js';
const scope={electionId:6259,round:1,office:3,uf:'ES'};
// SYNTHETIC fixture of the documented EA20 2026-07-10 structure, never production.
const payload={ele:'6259',t:'1',f:'o',tpabr:'uf',cdabr:'es',carg:[{cd:'3'}],dv:'s',dt:'04/10/2026',ht:'23:12:00',tf:'s',and:'f',idg:'10',v:{vv:'100',vb:'2',tvn:'4',vn:'3',vnt:'1'},e:{c:'106',a:'10'},s:{pstn:'100'}};
const totals=parseIndicators(payload,scope);
assert.equal(totals.valid_votes,100);assert.equal(totals.null_votes,4);assert.equal(totals.turnout,106);assert.equal(totals.abstention,10);assert.equal(totals.totalization_final,true);
assert.equal(parseIndicators({...payload,v:{...payload.v,vb:'0'}},scope).blank_votes,0);
for(const bad of [{ele:'6257'},{t:'2'},{f:'s'},{cdabr:'sp'},{tpabr:'br'},{dv:'n'},{carg:[{cd:'1'}]},{v:{...payload.v,vv:undefined}},{v:{...payload.v,tvn:'-1'}},{s:{pstn:'101'}},{and:'x'}])assert.throws(()=>parseIndicators({...payload,...bad},scope));
console.log(JSON.stringify({passed:true,synthetic:true,productionTested:false,checks:['documented fields','total null votes including technical','zero versus absent','scope validation','simulation rejected','disclosure restriction','invalid numbers rejected']}));
