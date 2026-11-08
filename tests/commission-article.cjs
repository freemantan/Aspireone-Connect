const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
await require('esbuild').build({stdin:{contents:"export {commissionCosts} from './lib/planning';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:'.sites-runtime/article-calculator.cjs'});
const {commissionCosts}=require('../.sites-runtime/article-calculator.cjs');const html=JSON.parse(fs.readFileSync('lib/commission-article-content.json')).html;const dom=new JSDOM(html,{runScripts:'dangerously'}),d=dom.window.document;
assert.equal(d.getElementById('shareA').value,'50');
const rates={'Physical Centre':{A:[0,0,0,0],B:[0,0,0,0],C:[10,0,5,0],D:[20,0,10,0]},'Cold Call':{A:[15,3,0,5],B:[15,3,0,5],C:[10,3,2,0],D:[20,5,5,0]},'Aspire Online':{A:[0,0,0,5],B:[0,0,0,5]}};
for(const channel of Object.keys(rates))for(const students of [1,6])for(const basis of ['gross','net']){
d.getElementById('channel').value=channel;d.getElementById('basis').value=basis;for(const p of 'ABCD')d.getElementById('students'+p).value=students;d.getElementById('channel').dispatchEvent(new dom.window.Event('input'));
for(const p of Object.keys(rates[channel]))for(const row of d.querySelectorAll('#t'+p.toLowerCase()+' tbody tr')){const cells=[...row.querySelectorAll('td')];if(cells.length<10)continue;const num=text=>Number(text.replace(/S\$|,/g,'').trim());const fee=Math.round(num(cells[1].textContent)*100);const expected=commissionCosts(fee,Number(d.getElementById('share'+p).value),rates[channel][p],basis,{students,lessons:Number(d.getElementById('lessons'+p).value),minimumPerLesson:Number(d.getElementById('min'+p).value)*100,channel:channel==='Aspire Online'?'Online':channel,product:p,includeCommissions:true});const last=cells.at(-1).cloneNode(true);last.querySelector('small')?.remove();assert(Math.abs(num(last.textContent)*100-expected.retained)<.01,channel+' '+p+' '+row.textContent);}
}
dom.window.close();console.log('PASS article retained income matches Business Planning for every displayed price, three channels, two class sizes and both bases');
})().catch(e=>{console.error(e);process.exitCode=1});
