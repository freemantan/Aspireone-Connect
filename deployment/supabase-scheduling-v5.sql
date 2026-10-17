-- One-time reset requested by the schedule owner. CRE-entered names remain editable.
-- The audit retains the previous values for recovery; rerunning preserves later entries.
begin;
do $$
declare oldrow public.ao_schedule_sessions%rowtype; saved public.ao_schedule_sessions%rowtype; changed integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('schedule-coach-reset-20261017',0));
 if exists(select 1 from public.ao_schedule_imports where id='coach-reset-20261017') then return; end if;
 for oldrow in select * from public.ao_schedule_sessions where coalesce(coach,'')<>'' order by id for update loop
  update public.ao_schedule_sessions set coach=null,revision=revision+1 where id=oldrow.id returning * into saved;
  insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data)
   values(md5(gen_random_uuid()::text),oldrow.id,'owner-request:coach-reset-20261017',now()::text,to_jsonb(oldrow)::text,to_jsonb(saved)::text);
  changed:=changed+1;
 end loop;
 insert into public.ao_schedule_imports(id,imported_at,summary) values('coach-reset-20261017',now()::text,jsonb_build_object('action','Clear coach names for CRE entry','classes_updated',changed)::text);
end $$;
commit;
select count(*) filter(where coalesce(coach,'')<>'') as classes_with_coach_name,
 count(*) filter(where status<>'discontinued') as active_classes
from public.ao_schedule_sessions;
