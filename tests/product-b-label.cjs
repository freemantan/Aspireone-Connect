const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await require('esbuild').build({entryPoints:['lib/product-b-label.ts'],outfile:'.sites-runtime/product-b-label.cjs',bundle:true,platform:'node',format:'cjs'});const {productBLabel}=require('../.sites-runtime/product-b-label.cjs');
assert.equal(productBLabel('Physical classroom · 2 hours; Live Tutorial · 90 minutes'),'Physical classroom · 2 hours; Live Tutorial · 90 minutes');
assert.equal(productBLabel('Physical Tutorial / Lecture Class · 90 minutes'),'Dedicated Class · 120 minutes');
assert.equal(productBLabel('Physical tutorial · 1.5-hour lessons'),'Dedicated Class · 2-hour lessons');
assert.equal(productBLabel('Physical Class: $99, 40%, 9am–10:30am'),'Dedicated Class: $99, 40%, 9am–10:30am');
const sql=fs.readFileSync('deployment/supabase-product-b-dedicated-class.sql','utf8');assert(!/SET\s+(start_minute|end_minute)/i.test(sql));
console.log('PASS Product B rename preserves Product A/C, prices, rates and session times');})().catch(e=>{console.error(e);process.exitCode=1});
