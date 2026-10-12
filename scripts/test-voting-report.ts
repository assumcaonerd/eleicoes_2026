import assert from 'node:assert/strict';
import {votingReport} from '../src/web/voting-report.js';
import {appPage} from '../src/web/pages.js';
const rows=Array.from({length:1205},(_,i)=>({rank:i+1,municipality_name:'MUNICÍPIO '+i,section:i+1,zone:1,address:'Rua de teste',votes:1205-i,pct_total:.5}));
const data={candidate:{ballot_name:'TESTE <script>',number:123,uf:'ES',election_id:2026,round:1},total_votes:100000};
const report=votingReport(data,rows,'section','Todos os municípios');
assert(report.includes('Seção 1205'));
assert(!report.includes('TESTE <script>'));
const pages=(report.match(/class="sheet"/g)||[]).length;
assert.equal(pages,67);
assert(report.includes("@page{size:A4 portrait;margin:30mm 20mm 20mm 30mm}"));
assert(report.includes("width:160mm;margin:0;padding:0;break-after:page;min-height:247mm"));
assert.equal((report.match(/<footer>/g)||[]).length,pages);
assert(report.includes('Página 67 de 67'));
assert(votingReport(data,[],'neighborhood','Todos').includes('Nenhum dado encontrado'));
for(const script of appPage({id:1},true).match(/<script>([\s\S]*?)<\/script>/g)||[])new Function(script.replace(/^<script>|<\/script>$/g,''));
console.log('Relatório: 1.205 registros, paginação, marca em todas as páginas, HTML seguro e JavaScript válidos.');

assert.equal((report.match(/href="https:\/\/www.sigaovoto.com.br\/"/g)||[]).length,pages);
