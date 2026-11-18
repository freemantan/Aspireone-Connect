-- Retain each original ID for E Math; create A Math with a deterministic ID.
-- Preserve discontinued history, source evidence and all non-identity fields.
begin;
select pg_advisory_xact_lock(hashtext('ao-class-groups'));
lock table public.ao_schedule_sessions in share row exclusive mode;
create temporary table maths_before on commit drop as
select * from public.ao_schedule_sessions where status<>'discontinued' and subject in
('A Math/E Math','Amath / Emath','E and/or A Math','E-Math/A-Math','Elementary & Additional Mathematics','Mathematics (Additional / Elementary)');
do $$
declare r public.ao_schedule_sessions%rowtype; a public.ao_schedule_sessions%rowtype;
begin
 for r in select * from maths_before loop
  a:=r; a.id:=md5('split-amath-20261118:'||r.id); a.subject:='A Math'; a.revision:=1;
  a.class_group_id:=md5('split-amath-20261118:'||coalesce(r.class_group_id,r.id));
  if exists(select 1 from public.ao_schedule_sessions where id=a.id) then raise exception 'Split target already exists: %',a.id; end if;
  update public.ao_schedule_sessions set subject='E Math',revision=revision+1,
   class_group_id=md5('split-emath-20261118:'||coalesce(r.class_group_id,r.id)) where id=r.id;
  insert into public.ao_schedule_sessions select a.*;
  insert into public.ao_schedule_evidence(id,session_id,source_id,sheet,locator,raw_value,raw_context)
   select md5('split-amath-20261118:'||id),a.id,source_id,sheet,locator,raw_value,raw_context
   from public.ao_schedule_evidence where session_id=r.id;
  insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data)
   select md5(gen_random_uuid()::text),id,'combined-maths-split-approved',now()::text,
    case when id=r.id then to_jsonb(r)::text else null end,to_jsonb(s)::text
   from public.ao_schedule_sessions s where id in(r.id,a.id);
 end loop;
 -- Assert that the split changed only subject and generated identity/version fields.
 if exists(select 1 from maths_before old join public.ao_schedule_sessions s
  on s.id=old.id or s.id=md5('split-amath-20261118:'||old.id)
  where (to_jsonb(s)-array['id','subject','revision','class_group_id','class_prefix','class_ids'])
   is distinct from (to_jsonb(old)-array['id','subject','revision','class_group_id','class_prefix','class_ids']))
 then raise exception 'Split unexpectedly changed schedule details'; end if;
 if (select count(*) from public.ao_schedule_sessions s join maths_before b
  on s.id=b.id or s.id=md5('split-amath-20261118:'||b.id))<>(select count(*)*2 from maths_before)
 then raise exception 'Split count mismatch'; end if;
end $$;
-- Reject retired subjects on all write paths, including imports and restoration.
create or replace function public.ao_reject_combined_maths() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status<>'discontinued' and new.subject in
 ('A Math/E Math','Amath / Emath','E and/or A Math','E-Math/A-Math','Elementary & Additional Mathematics','Mathematics (Additional / Elementary)')
 then raise exception 'SCHEDULE_INVALID_SUBJECT: Use separate E Math and A Math classes'; end if;
 return new;
end $$;
drop trigger if exists ao_reject_combined_maths_trigger on public.ao_schedule_sessions;
create trigger ao_reject_combined_maths_trigger before insert or update on public.ao_schedule_sessions
for each row execute function public.ao_reject_combined_maths();
select status,count(*) as converted_originals,count(*)*2 as resulting_records from maths_before group by status order by status;
commit;
