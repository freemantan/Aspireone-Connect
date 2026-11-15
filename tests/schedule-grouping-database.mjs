// Optional integration test: install @electric-sql/pglite in a temporary folder, then set PGLITE_MODULE.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;'+fs.readFileSync(root+'deployment/supabase-schedules.sql','utf8').split('alter table public.ao_schedule_zones')[0]+'commit; alter table ao_schedule_sessions alter column term drop not null; alter table ao_schedule_sessions add column product_mode text default \'A\';');
await db.exec(`create function ao_schedule_access(text,text,integer) returns integer language plpgsql as $$ begin if $1<>'admin' then raise exception 'SCHEDULE_FORBIDDEN'; end if;return 4;end;$$;`);
const raw=fs.readFileSync(root+'deployment/supabase-scheduling-classroom-and-access.sql','utf8');await db.exec(raw.slice(raw.indexOf('create or replace function public.ao_schedule_save'),raw.lastIndexOf('commit;')));
await db.exec(`insert into ao_schedule_branches(id,name,contact_evidence) values ('US','Novena','{}'),('TH','Thomson','{}');`);
const payload={branch_id:'US',academic_year:2027,term:1,subject:'Mathematics',levels:['P1'],day:1,start_minute:900,end_minute:1020,coach:'A',product_mode:'A',status:'published',room_id:'X'};
async function save(id,rev,p){return (await db.query('select ao_schedule_save($1,$2,$3,$4::jsonb) r',['admin',id,rev,JSON.stringify(p)])).rows[0].r;}
let a=await save(null,0,payload),b=await save(null,0,{...payload,levels:['P2'],start_minute:930,end_minute:1050});
await db.exec(fs.readFileSync(root+'deployment/supabase-class-grouping.sql','utf8'));
let rows=(await db.query('select * from ao_schedule_sessions order by id')).rows;assert.equal(rows[0].class_group_id,rows[1].class_group_id);assert.equal(rows[0].class_prefix,'271MO15MATX');
let versions=Object.fromEntries(rows.map(r=>[r.id,r.revision]));
await assert.rejects(save(a.id,1,{...payload,start_minute:960,end_minute:1080}),/SCHEDULE_CONFLICT/);
a=await save(a.id,1,{...payload,start_minute:960,end_minute:1080,group_versions:versions,room_id:'B'});assert.equal(a._group_records.length,2);assert(a._group_records.every(r=>r.start_minute===960&&r.room_id==='B'));
rows=a._group_records;versions=Object.fromEntries(rows.map(r=>[r.id,r.revision]));
async function group(action,ids,v,actor='admin'){return db.query('select ao_schedule_group_change($1,$2,$3::jsonb,$4::jsonb,$5)',[''+actor,action,JSON.stringify(ids),JSON.stringify(v),'A']);}
await assert.rejects(group('split',[a.id],versions,'other'),/SCHEDULE_FORBIDDEN/);
await group('split',[a.id],versions);rows=(await db.query('select * from ao_schedule_sessions')).rows;assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.class_group_id)).size,2);
await db.exec(fs.readFileSync(root+'deployment/supabase-class-grouping.sql','utf8'));rows=(await db.query('select * from ao_schedule_sessions')).rows;assert.equal(new Set(rows.map(r=>r.class_group_id)).size,2);
versions=Object.fromEntries(rows.map(r=>[r.id,r.revision]));await group('merge',rows.map(r=>r.id),versions);rows=(await db.query('select * from ao_schedule_sessions')).rows;assert.equal(new Set(rows.map(r=>r.class_group_id)).size,1);
versions=Object.fromEntries(rows.map(r=>[r.id,r.revision]));await group('ungroup',[rows[0].id],versions);rows=(await db.query('select * from ao_schedule_sessions')).rows;assert.equal(new Set(rows.map(r=>r.class_group_id)).size,2);
const other=await save(null,0,{...payload,branch_id:'TH'});versions=Object.fromEntries([...rows,other].map(r=>[r.id,r.revision]));await assert.rejects(group('merge',[other.id,rows[0].id],versions),/SCHEDULE_INVALID_BRANCH/);
assert.equal((await db.query("select ao_class_prefix(2026,1,1,900,'Mathematics','X') code")).rows[0].code,'261MO15MATX');
console.log('Class grouping database integration checks passed');await db.close();
