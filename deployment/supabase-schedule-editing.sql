-- Run after supabase-schedules.sql and the schedule seed. No access is granted automatically.
begin;
create table if not exists public.ao_schedule_members (
 id text primary key default md5(gen_random_uuid()::text),
 branch_id text not null references public.ao_schedule_branches(id),
 user_id text not null, role text not null check(role in ('View','Edit','Manage')),
 revision integer not null default 1, updated_by text not null, updated_at timestamptz not null default now(),
 unique(branch_id,user_id)
);
create table if not exists public.ao_schedule_member_audit (
 id text primary key default md5(gen_random_uuid()::text), branch_id text not null,
 user_id text not null, actor text not null, at timestamptz not null default now(), before_data jsonb, after_data jsonb
);
alter table public.ao_schedule_members enable row level security;
alter table public.ao_schedule_member_audit enable row level security;
revoke all on public.ao_schedule_members,public.ao_schedule_member_audit from public,anon,authenticated;
grant select on public.ao_schedule_members,public.ao_schedule_member_audit to service_role;

create or replace function public.ao_schedule_access(p_actor text,p_branch text,p_min integer default 1)
returns integer language plpgsql security definer set search_path='' as $$
declare u jsonb; access integer;
begin
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_actor;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 if not exists(select 1 from public.ao_schedule_branches where id=p_branch) then raise exception 'SCHEDULE_INVALID_BRANCH'; end if;
 if coalesce((u->>'admin')::boolean,false) then return 4; end if;
 select case role when 'Manage' then 3 when 'Edit' then 2 else 1 end into access from public.ao_schedule_members where branch_id=p_branch and user_id=p_actor;
 access:=coalesce(access,1);
 if access<p_min then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 return access;
end; $$;

create or replace function public.ao_schedule_catalogue(p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; result jsonb; can_manage boolean;
begin
 select jsonb_object_agg(id,public.ao_schedule_access(p_actor,id,1)) into rights from public.ao_schedule_branches;
 select exists(select 1 from jsonb_each_text(rights) where value::integer>=3) into can_manage;
 with visible as (
  select s.* from public.ao_schedule_sessions s where s.status<>'discontinued' and s.academic_year>=2027 and s.level_label not like '%2026%'
  and (coalesce(s.notes::jsonb->>'origin','')='connect-editor' or exists(select 1 from public.ao_schedule_evidence e join public.ao_schedule_sources f on f.id=e.source_id where e.session_id=s.id and f.relative_path like '%.pdf'))
 )
 select jsonb_build_object(
  'permissions',rights,'canManage',can_manage,
  'branches',(select coalesce(jsonb_agg(jsonb_build_array(b.id,b.name,z.name,b.phone,b.whatsapp,b.contact_url,0) order by z.name,b.name),'[]'::jsonb) from public.ao_schedule_branches b left join public.ao_schedule_zones z on z.id=b.zone_id),
  'data',(select coalesce(jsonb_agg(jsonb_build_array(s.id,s.branch_id,b.name,s.subject,s.level_label,s.levels,s.day,s.start_minute,s.end_minute,s.coach,s.delivery_mode,'','','','','') order by b.name,s.subject,s.day,s.start_minute),'[]'::jsonb) from visible s join public.ao_schedule_branches b on b.id=s.branch_id),
  'records',(select coalesce(jsonb_agg(to_jsonb(s) order by s.branch_id,s.subject,s.day,s.start_minute),'[]'::jsonb) from public.ao_schedule_sessions s where (rights->>s.branch_id)::integer>=2 and s.academic_year>=2027 and (s.notes::jsonb->>'origin'='connect-editor' or s.id in (select id from visible))),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.branch_id,m.user_id),'[]'::jsonb) from public.ao_schedule_members m where (rights->>m.branch_id)::integer>=3),
  'users',case when can_manage then (select coalesce(jsonb_agg(jsonb_build_object('id',u->>'id','name',u->>'name','email',u->>'email') order by u->>'name'),'[]'::jsonb) from public.ao_workspace w,jsonb_array_elements(w.state->'users') u where w.id=1 and coalesce((u->>'active')::boolean,false) and not coalesce((u->>'onboarding')::boolean,false) and not coalesce((u->>'deleted')::boolean,false)) else '[]'::jsonb end
 ) into result;
 return result;
end; $$;

create or replace function public.ao_schedule_save(p_actor text,p_id text,p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_sessions%rowtype; saved public.ao_schedule_sessions%rowtype; rid text; branch text; sub text; lv jsonb; start_at integer; end_at integer; weekday integer; yr integer; tm integer; mode text; fmt text; from_date date; to_date date; meta jsonb; coach_name text; state text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'SCHEDULE_INVALID_DATA'; end if;
 branch:=p_data->>'branch_id';perform public.ao_schedule_access(p_actor,branch,2);
 if p_id is not null then
  select * into oldrow from public.ao_schedule_sessions where id=p_id for update;
  if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
  perform public.ao_schedule_access(p_actor,oldrow.branch_id,2);
  if oldrow.revision<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 elsif p_revision<>0 then raise exception 'SCHEDULE_CONFLICT'; end if;
 sub:=p_data->>'subject';lv:=p_data->'levels';start_at:=(p_data->>'start_minute')::integer;end_at:=(p_data->>'end_minute')::integer;weekday:=(p_data->>'day')::integer;
 yr:=(p_data->>'academic_year')::integer;tm:=(p_data->>'term')::integer;mode:=p_data->>'delivery_mode';fmt:=p_data->>'format';coach_name:=trim(coalesce(p_data->>'coach',''));state:=p_data->>'status';
 if sub is null or sub not in ('Mathematics','E Math','A Math','E-Math/A-Math','English','Science','Chemistry','Physics','Biology','Chinese','Pure Chinese','Economics','Principles of Accounts','General Paper','Humanities','Social Studies','Geography') then raise exception 'SCHEDULE_INVALID_SUBJECT'; end if;
 if lv is null or jsonb_typeof(lv)<>'array' then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if jsonb_array_length(lv)=0 or jsonb_array_length(lv)>20 then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if exists(select 1 from jsonb_array_elements(lv) l where jsonb_typeof(l)<>'string' or (l#>>'{}')!~'^(P[1-6]|S[1-5]|JC[12]|IPY[1-6]|IBY[1-6])$') then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if start_at is null or end_at is null or weekday is null or start_at<0 or end_at>1440 or end_at<=start_at or weekday not between 1 and 7 then raise exception 'SCHEDULE_INVALID_TIME'; end if;
 if yr is null or tm is null or yr not between 2027 and 2100 or tm not between 1 and 4 then raise exception 'SCHEDULE_INVALID_TERM'; end if;
 if mode is null or mode not in ('in_person','online','hybrid','unspecified') or fmt is null or fmt not in ('class','coaching','lecture','unspecified') then raise exception 'SCHEDULE_INVALID_FORMAT'; end if;
 if length(coach_name)>200 or length(coalesce(p_data->>'public_notes',''))>2000 then raise exception 'SCHEDULE_INVALID_TEXT'; end if;
 if state is null or state not in ('published','discontinued') then raise exception 'SCHEDULE_INVALID_STATUS'; end if;
 from_date:=nullif(p_data->>'effective_from','')::date;to_date:=nullif(p_data->>'effective_to','')::date;
 if from_date is not null and to_date is not null and from_date>to_date then raise exception 'SCHEDULE_INVALID_DATES'; end if;
 rid:=coalesce(p_id,md5(gen_random_uuid()::text));
 meta:=coalesce(oldrow.notes::jsonb,'{}'::jsonb)||jsonb_build_object('origin','connect-editor','flags','[]'::jsonb,'public_notes',coalesce(p_data->>'public_notes',''),'updated_by',p_actor,'updated_at',now());
 insert into public.ao_schedule_sessions(id,branch_id,academic_year,term,level_label,levels,subject,day,start_minute,end_minute,raw_time,coach,format,delivery_mode,effective_from,effective_to,status,review_state,notes,revision)
 values(rid,branch,yr,tm,(select string_agg(l,', ') from jsonb_array_elements_text(lv) l),lv::text,sub,weekday,start_at,end_at,format('%s:%s–%s:%s',start_at/60,lpad((start_at%60)::text,2,'0'),end_at/60,lpad((end_at%60)::text,2,'0')),nullif(coach_name,''),fmt,mode,from_date::text,to_date::text,state,'confirmed',meta::text,coalesce(oldrow.revision,0)+1)
 on conflict(id) do update set branch_id=excluded.branch_id,academic_year=excluded.academic_year,term=excluded.term,level_label=excluded.level_label,levels=excluded.levels,subject=excluded.subject,day=excluded.day,start_minute=excluded.start_minute,end_minute=excluded.end_minute,raw_time=excluded.raw_time,coach=excluded.coach,format=excluded.format,delivery_mode=excluded.delivery_mode,effective_from=excluded.effective_from,effective_to=excluded.effective_to,status=excluded.status,review_state=excluded.review_state,notes=excluded.notes,revision=excluded.revision
 returning * into saved;
 insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) values(md5(gen_random_uuid()::text),rid,p_actor,now()::text,case when p_id is null then null else to_jsonb(oldrow)::text end,to_jsonb(saved)::text);
 update public.ao_schedule_issues set resolved=1 where session_id=rid;
 return to_jsonb(saved);
end; $$;

create or replace function public.ao_schedule_member_save(p_actor text,p_user text,p_branch text,p_role text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_members%rowtype; saved public.ao_schedule_members%rowtype; u jsonb;
begin
 perform public.ao_schedule_access(p_actor,p_branch,3);
 if p_role is not null and p_role not in ('View','Edit','Manage') then raise exception 'SCHEDULE_INVALID_ROLE'; end if;
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_user;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'deleted')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) then raise exception 'SCHEDULE_INVALID_MEMBER'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_branch||':'||p_user,0));
 select * into oldrow from public.ao_schedule_members where branch_id=p_branch and user_id=p_user for update;
 if coalesce(oldrow.revision,0)<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 if p_role is null then
  delete from public.ao_schedule_members where branch_id=p_branch and user_id=p_user;
 else
  insert into public.ao_schedule_members(branch_id,user_id,role,revision,updated_by) values(p_branch,p_user,p_role,coalesce(oldrow.revision,0)+1,p_actor)
  on conflict(branch_id,user_id) do update set role=excluded.role,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 end if;
 insert into public.ao_schedule_member_audit(branch_id,user_id,actor,before_data,after_data) values(p_branch,p_user,p_actor,case when oldrow.id is null then null else to_jsonb(oldrow) end,case when p_role is null then null else to_jsonb(saved) end);
 return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.ao_schedule_access(text,text,integer),public.ao_schedule_catalogue(text),public.ao_schedule_save(text,text,integer,jsonb),public.ao_schedule_member_save(text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ao_schedule_access(text,text,integer),public.ao_schedule_catalogue(text),public.ao_schedule_save(text,text,integer,jsonb),public.ao_schedule_member_save(text,text,text,text,integer) to service_role;
commit;
