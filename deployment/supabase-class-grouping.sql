-- Class IDs and explicit mixed-class groups. Re-running preserves splits.
begin;
alter table public.ao_schedule_sessions add column if not exists room_id text not null default 'X';
alter table public.ao_schedule_sessions add column if not exists class_group_id text;
alter table public.ao_schedule_sessions add column if not exists class_prefix text;
alter table public.ao_schedule_sessions add column if not exists class_ids jsonb not null default '[]';
create or replace function public.ao_subject_code(p_subject text) returns text language sql immutable set search_path='' as $$
 select case trim(p_subject)
 when 'Math' then 'MAT'
 when 'Mathematics' then 'MAT'
 when 'A Math' then 'AMA'
 when 'Additional Mathematics' then 'AMA'
 when 'E Math' then 'EMA'
 when 'Elementary Mathematics' then 'EMA'
 when 'A Math/E Math' then 'EAM'
 when 'Amath / Emath' then 'EAM'
 when 'E and/or A Math' then 'EAM'
 when 'E-Math/A-Math' then 'EAM'
 when 'Elementary & Additional Mathematics' then 'EAM'
 when 'Mathematics (Additional / Elementary)' then 'EAM'
 when 'English' then 'ENG'
 when 'English *enquire for more' then 'ENG'
 when 'Gear up for English' then 'ENG'
 when 'Science' then 'SCI'
 when 'Chemistry' then 'CHE'
 when 'Chemistry (Pure / Combined)' then 'CHE'
 when 'Chemistry (Pure/Combined)' then 'CHE'
 when 'Physics' then 'PHY'
 when 'Physics (Pure / Combined)' then 'PHY'
 when 'Physics (Pure/Combined)' then 'PHY'
 when 'Pure Physics' then 'PHY'
 when 'Biology' then 'BIO'
 when 'Chinese' then 'CHI'
 when 'Higher Chinese' then 'CHI'
 when 'Chinese / Higher Chinese' then 'CHI'
 when 'Economics' then 'ECO'
 when 'Econs' then 'ECO'
 when 'POA' then 'PRI'
 when 'Principle of Account (ONLINE)' then 'PRI'
 when 'General Paper' then 'GEN'
 when 'GP' then 'GEN'
 when 'Humanities (Hist/SS)' then 'HUM'
 when 'Humanities / Social Studies' then 'HUM'
 when 'Humanities' then 'HUM'
 when 'Social Studies' then 'SOC'
 when 'Geography' then 'GEO'
 when 'Pure Chinese' then 'PUR'
 when 'Principles of Accounts' then 'PRI'
 else upper(substr(regexp_replace(coalesce(p_subject,'UNK'),'[^A-Za-z]','','g'),1,3)) end;
$$;
create or replace function public.ao_class_prefix(yr integer,tm integer,dy integer,st integer,sub text,room text) returns text language sql immutable set search_path='' as $$
 select right(coalesce(yr,2000)::text,2)||coalesce(tm,0)::text||coalesce((array['MO','TU','WE','TH','FR','SA','SU'])[dy],'XX')||case when st is null then 'XX' else lpad((st/60)::text,2,'0') end||public.ao_subject_code(sub)||coalesce(nullif(upper(trim(room)),''),'X');
$$;
create or replace function public.ao_class_identity() returns trigger language plpgsql set search_path='' as $$
begin
 new.room_id:=upper(trim(coalesce(nullif(new.room_id,''),'X')));
 if new.room_id !~ '^[A-Z]$' then raise exception 'SCHEDULE_INVALID_ROOM'; end if;
 new.class_group_id:=coalesce(new.class_group_id,new.id);
 new.class_prefix:=public.ao_class_prefix(new.academic_year,new.term,new.day,new.start_minute,new.subject,new.room_id);
 select coalesce(jsonb_agg(new.class_prefix||'-'||replace(replace(l,'IPY','IP'),'IBY','IB') order by l),'[]') into new.class_ids from (select distinct jsonb_array_elements_text(new.levels::jsonb) l) q;
 return new;
end; $$;
drop trigger if exists ao_class_identity_trigger on public.ao_schedule_sessions;
create trigger ao_class_identity_trigger before insert or update on public.ao_schedule_sessions for each row execute function public.ao_class_identity();
-- Only initialise records once. Original Class Room descriptions remain in notes.
update public.ao_schedule_sessions s set room_id=case when upper(trim(coalesce(s.notes::jsonb->>'classroom',''))) ~ '^[A-Z]$' then upper(trim(s.notes::jsonb->>'classroom')) else 'X' end,
 class_group_id=case when s.day between 1 and 7 and s.start_minute is not null and s.status<>'discontinued' and s.academic_year>=2027 and
 (s.notes::jsonb->>'origin'='connect-editor' or (s.branch_id='HM' and s.notes::jsonb->>'approved_source'='hillion-2027-master') or exists(select 1 from public.ao_schedule_evidence e join public.ao_schedule_sources f on f.id=e.source_id where e.session_id=s.id and f.relative_path like '%.pdf'))
 then md5(s.branch_id||':'||public.ao_class_prefix(s.academic_year,s.term,s.day,s.start_minute,s.subject,case when upper(trim(coalesce(s.notes::jsonb->>'classroom',''))) ~ '^[A-Z]$' then upper(trim(s.notes::jsonb->>'classroom')) else 'X' end)) else s.id end
 where s.class_group_id is null;
create index if not exists ao_schedule_group_idx on public.ao_schedule_sessions(class_group_id);
-- Preserve the existing validation, audit and publication behaviour of individual saves.
do $$ begin
 if to_regprocedure('public.ao_schedule_save_before_groups(text,text,integer,jsonb)') is null then
  alter function public.ao_schedule_save(text,text,integer,jsonb) rename to ao_schedule_save_before_groups;
 end if;
end $$;
revoke all on function public.ao_schedule_save_before_groups(text,text,integer,jsonb) from public,anon,authenticated,service_role;
create or replace function public.ao_schedule_group_versions(g text) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_object_agg(id,revision),'{}') from public.ao_schedule_sessions where class_group_id=g and status<>'discontinued';
$$;
create or replace function public.ao_schedule_save(p_actor text,p_id text,p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_sessions%rowtype; sibling public.ao_schedule_sessions%rowtype; saved jsonb; payload jsonb; gid text; expected jsonb; rid text; room text; candidates integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('ao-class-groups',0));
 room:=upper(trim(coalesce(p_data->>'room_id',(select room_id from public.ao_schedule_sessions where id=p_id),'X')));if room !~ '^[A-Z]$' then raise exception 'SCHEDULE_INVALID_ROOM'; end if;
 if p_id is not null then
  select * into oldrow from public.ao_schedule_sessions where id=p_id for update;
  if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
  perform public.ao_schedule_access(p_actor,oldrow.branch_id,2);
  if oldrow.revision<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
  gid:=oldrow.class_group_id;expected:=public.ao_schedule_group_versions(gid);
  if (select count(*) from jsonb_object_keys(expected))>1 and p_data->'group_versions' is distinct from expected then raise exception 'SCHEDULE_CONFLICT'; end if;
 end if;
 saved:=public.ao_schedule_save_before_groups(p_actor,p_id,p_revision,p_data);rid:=saved->>'id';
 if p_id is null then
  select count(distinct class_group_id),min(class_group_id) into candidates,gid from public.ao_schedule_sessions where id<>rid and branch_id=saved->>'branch_id' and status<>'discontinued' and class_prefix=public.ao_class_prefix((saved->>'academic_year')::integer,(saved->>'term')::integer,(saved->>'day')::integer,(saved->>'start_minute')::integer,saved->>'subject',room);
  if candidates<>1 then gid:=rid;
  elsif exists(select 1 from public.ao_schedule_sessions where class_group_id=gid and status<>'discontinued' and coalesce(coach,'')<>coalesce(saved->>'coach','')) then raise exception 'SCHEDULE_INVALID_GROUP_COACH';
  end if;
 end if;
 update public.ao_schedule_sessions set room_id=room,class_group_id=gid where id=rid returning to_jsonb(ao_schedule_sessions) into saved;
 if p_id is not null then
  for sibling in select * from public.ao_schedule_sessions where class_group_id=gid and id<>rid and status<>'discontinued' order by id for update loop
   perform public.ao_schedule_access(p_actor,sibling.branch_id,2);
   payload:=p_data||jsonb_build_object('levels',sibling.levels::jsonb,'product_mode',sibling.product_mode,'public_notes',coalesce(sibling.notes::jsonb->>'public_notes',''),'classroom',coalesce(sibling.notes::jsonb->>'classroom',''));
   perform public.ao_schedule_save_before_groups(p_actor,sibling.id,sibling.revision,payload);
   update public.ao_schedule_sessions set room_id=room where id=sibling.id;
  end loop;
 end if;
 insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) select md5(gen_random_uuid()::text),id,p_actor,now()::text,null,to_jsonb(s)::text from public.ao_schedule_sessions s where s.class_group_id=gid and s.status<>'discontinued';
 return saved||jsonb_build_object('_group_records',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.ao_schedule_sessions s where s.class_group_id=gid and s.status<>'discontinued'));
end; $$;

create or replace function public.ao_schedule_group_change(p_actor text,p_action text,p_ids jsonb,p_versions jsonb,p_coach text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.ao_schedule_sessions%rowtype; firstrow public.ao_schedule_sessions%rowtype; duplicate public.ao_schedule_sessions%rowtype; before_row jsonb; gid text; ids text[]; levels jsonb; code text; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('ao-class-groups',0));
 if p_action not in ('merge','split','ungroup') or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids)=0 then raise exception 'SCHEDULE_INVALID_GROUP'; end if;
 select array_agg(distinct value) into ids from jsonb_array_elements_text(p_ids);
 select * into firstrow from public.ao_schedule_sessions where id=ids[1] and status<>'discontinued';
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 if (select count(*) from public.ao_schedule_sessions where id=any(ids) and status<>'discontinued')<>cardinality(ids) then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 for r in select * from public.ao_schedule_sessions where class_group_id in (select class_group_id from public.ao_schedule_sessions where id=any(ids)) and status<>'discontinued' order by id for update loop
  perform public.ao_schedule_access(p_actor,r.branch_id,2);
  if p_versions->>r.id is distinct from r.revision::text then raise exception 'SCHEDULE_CONFLICT'; end if;
  if r.branch_id<>firstrow.branch_id then raise exception 'SCHEDULE_INVALID_BRANCH'; end if;
  if p_action='merge' and r.class_prefix<>firstrow.class_prefix then raise exception 'SCHEDULE_INVALID_GROUP_CODE'; end if;
 end loop;
 if p_action='merge' then
  if cardinality(ids)<2 or p_coach is null or length(p_coach)>200 then raise exception 'SCHEDULE_INVALID_GROUP'; end if;
  gid:=firstrow.class_group_id;
  for r in select * from public.ao_schedule_sessions where class_group_id in(select class_group_id from public.ao_schedule_sessions where id=any(ids)) and status<>'discontinued' order by id loop
   before_row:=to_jsonb(r);
   update public.ao_schedule_sessions set class_group_id=gid,coach=p_coach,revision=revision+1 where id=r.id;
   insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) select md5(gen_random_uuid()::text),id,p_actor,now()::text,before_row::text,to_jsonb(s)::text from public.ao_schedule_sessions s where id=r.id;
  end loop;
 else
  if p_action='split' and cardinality(ids)<>1 then raise exception 'SCHEDULE_INVALID_GROUP'; end if;
  for r in select * from public.ao_schedule_sessions where id=any(ids) order by id loop
   before_row:=to_jsonb(r);levels:=r.levels::jsonb;n:=jsonb_array_length(levels);
   if p_action='split' then
    duplicate:=r;duplicate.id:=gen_random_uuid()::text;duplicate.class_group_id:=duplicate.id;duplicate.revision:=1;
    if n>1 then
     duplicate.levels:=jsonb_build_array(levels->(n-1))::text;duplicate.level_label:=levels->>(n-1);
     update public.ao_schedule_sessions set levels=(levels-(n-1))::text,level_label=(select string_agg(value,', ') from jsonb_array_elements_text(levels-(n-1))),revision=revision+1 where id=r.id;
    else
     update public.ao_schedule_sessions set revision=revision+1 where id=r.id;
    end if;
    duplicate.notes:=(coalesce(duplicate.notes::jsonb,'{}')||jsonb_build_object('origin','connect-editor'))::text;
    insert into public.ao_schedule_sessions select duplicate.*;
    insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) select md5(gen_random_uuid()::text),id,p_actor,now()::text,null,to_jsonb(s)::text from public.ao_schedule_sessions s where id=duplicate.id;
   else
    update public.ao_schedule_sessions set class_group_id=gen_random_uuid()::text,revision=revision+1 where id=r.id;
   end if;
   insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) select md5(gen_random_uuid()::text),id,p_actor,now()::text,before_row::text,to_jsonb(s)::text from public.ao_schedule_sessions s where id=r.id;
  end loop;
 end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.ao_schedule_group_versions(text),public.ao_schedule_save(text,text,integer,jsonb),public.ao_schedule_group_change(text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ao_schedule_save(text,text,integer,jsonb),public.ao_schedule_group_change(text,text,jsonb,jsonb,text) to service_role;
commit;
