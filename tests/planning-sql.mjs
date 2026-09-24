// Optional isolated PostgreSQL test: install @electric-sql/pglite, then node tests/planning-sql.mjs.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role;');
const sql=fs.readFileSync(new URL('../deployment/supabase-planning.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
const save=async(kind,id,rev,data)=>(await db.query('select public.ao_plan_save($1,$2,$3,$4,$5) as saved',[kind,id,rev,'tester',JSON.stringify(data)])).rows[0].saved;
const rule=await save('rules',null,0,{name:'Rules',effective_date:'2027-01-01',status:'draft',payload:{test:true}});
const pub=await save('rules',rule.id,1,{name:'Rules',effective_date:'2027-01-01',status:'published',payload:{test:true}});
await assert.rejects(save('rules',rule.id,2,{name:'Changed',effective_date:'2027-01-01',status:'draft',payload:{}}),/immutable/);
await assert.rejects(save('rules',rule.id,1,{}),/CONFLICT/);
const e1=await save('entity',null,0,{name:'Branch 1',kind:'branch'});const e2=await save('entity',null,0,{name:'Company',kind:'company',parent_id:e1.id});
await assert.rejects(save('entity',e1.id,1,{name:'Branch 1',kind:'branch',parent_id:e2.id}),/cycle/);
const b=await save('budget',null,0,{name:'Budget',entity_id:e1.id,rule_id:pub.id,year:2027,status:'draft',payload:{lines:[]}});
await assert.rejects(save('budget',b.id,1,{name:'Budget',entity_id:e2.id,rule_id:pub.id,year:2027,status:'draft',payload:{}}),/cannot be changed/);
const budget=await save('budget',b.id,1,{name:'Budget',entity_id:e1.id,rule_id:pub.id,year:2027,status:'published',payload:{lines:[]}});
await assert.rejects(save('budget',budget.id,2,{}),/immutable/);
assert.equal((await db.query('select count(*)::int as n from public.ao_plan_audit')).rows[0].n,6);
await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.ao_plan_budgets'),/permission denied/);await assert.rejects(save('entity',null,0,{name:'Intrusion',kind:'branch'}),/permission denied/);
console.log('PASS: migration rerun; transactional save/audit; conflict detection; immutable published rules and budgets; entity cycles; cross-entity reassignment; browser-role denial.');await db.close();
