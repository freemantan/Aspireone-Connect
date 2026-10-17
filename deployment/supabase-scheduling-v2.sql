begin;
create table if not exists public.ao_schedule_global_members (
 id text primary key default md5(gen_random_uuid()::text), principal_type text not null check(principal_type in ('user','role')),
 principal_id text not null, role text not null check(role in ('None','View','Edit','Manage')), revision integer not null default 1,
 updated_by text not null, updated_at timestamptz not null default now(), unique(principal_type,principal_id)
);
alter table public.ao_schedule_global_members enable row level security;
revoke all on public.ao_schedule_global_members from public,anon,authenticated;
grant select on public.ao_schedule_global_members to service_role;
create or replace function public.ao_schedule_global_access(p_actor text)
returns integer language plpgsql security definer set search_path='' as $$
declare u jsonb; n integer;
begin
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_actor;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 if coalesce((u->>'admin')::boolean,false) then return 4; end if;
 select coalesce(max(case g.role when 'Manage' then 3 when 'Edit' then 2 when 'View' then 1 else 0 end),0) into n from public.ao_schedule_global_members g
 where (g.principal_type='user' and g.principal_id=p_actor) or (g.principal_type='role' and coalesce(u->'roles','[]'::jsonb)?g.principal_id);
 return n;
end; $$;
create or replace function public.ao_schedule_access(p_actor text,p_branch text,p_min integer default 1)
returns integer language plpgsql security definer set search_path='' as $$
declare u jsonb; access integer;
begin
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_actor;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 if not exists(select 1 from public.ao_schedule_branches where id=p_branch) then raise exception 'SCHEDULE_INVALID_BRANCH'; end if;
 if coalesce((u->>'admin')::boolean,false) then return 4; end if;
 select case role when 'Manage' then 3 when 'Edit' then 2 else 1 end into access from public.ao_schedule_members where branch_id=p_branch and user_id=p_actor;
 access:=greatest(coalesce(access,1),public.ao_schedule_global_access(p_actor));
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
  'permissions',rights,'canManage',can_manage,'canManageAll',public.ao_schedule_global_access(p_actor)>=3,
 'globalMembers',case when can_manage then (select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from public.ao_schedule_global_members g) else '[]'::jsonb end,
 'businessRoles','["Business Manager","Subject Head","Customer Relationship","Marketing","HR","Technology","Finance","Online Business","AHCI","Manager","Senior Manager","Franchisee","Director","Shareholder"]'::jsonb,
  'branches',(select coalesce(jsonb_agg(jsonb_build_array(b.id,b.name,z.name,b.phone,b.whatsapp,b.contact_url,0) order by z.name,b.name),'[]'::jsonb) from public.ao_schedule_branches b left join public.ao_schedule_zones z on z.id=b.zone_id),
  'data',(select coalesce(jsonb_agg(jsonb_build_array(s.id,s.branch_id,b.name,s.subject,s.level_label,s.levels,s.day,s.start_minute,s.end_minute,s.coach,s.delivery_mode,'','','','','') order by b.name,s.subject,s.day,s.start_minute),'[]'::jsonb) from visible s join public.ao_schedule_branches b on b.id=s.branch_id),
  'records',(select coalesce(jsonb_agg(to_jsonb(s) order by s.branch_id,s.subject,s.day,s.start_minute),'[]'::jsonb) from public.ao_schedule_sessions s where (rights->>s.branch_id)::integer>=2 and s.academic_year>=2027 and (s.notes::jsonb->>'origin'='connect-editor' or s.id in (select id from visible))),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.branch_id,m.user_id),'[]'::jsonb) from public.ao_schedule_members m where (rights->>m.branch_id)::integer>=3),
  'users',case when can_manage then (select coalesce(jsonb_agg(jsonb_build_object('id',u->>'id','name',u->>'name','email',u->>'email','roles',coalesce(u->'roles','[]'::jsonb)) order by u->>'name'),'[]'::jsonb) from public.ao_workspace w,jsonb_array_elements(w.state->'users') u where w.id=1 and coalesce((u->>'active')::boolean,false) and not coalesce((u->>'onboarding')::boolean,false) and not coalesce((u->>'deleted')::boolean,false)) else '[]'::jsonb end
 ) into result;
 return result;
end; $$;

create or replace function public.ao_schedule_global_member_save(p_actor text,p_type text,p_principal text,p_role text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_global_members%rowtype; saved public.ao_schedule_global_members%rowtype; u jsonb;
begin
 if public.ao_schedule_global_access(p_actor)<3 then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 if p_type is null or p_type not in ('user','role') or p_role is null or p_role not in ('None','View','Edit','Manage') then raise exception 'SCHEDULE_INVALID_ROLE'; end if;
 if p_type='user' then
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_principal;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_INVALID_MEMBER'; end if;
 elsif p_principal is null or p_principal not in ('Business Manager','Subject Head','Customer Relationship','Marketing','HR','Technology','Finance','Online Business','AHCI','Manager','Senior Manager','Franchisee','Director','Shareholder') then raise exception 'SCHEDULE_INVALID_ROLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-global:'||p_type||':'||p_principal,0));
 select * into oldrow from public.ao_schedule_global_members where principal_type=p_type and principal_id=p_principal for update;
 if coalesce(oldrow.revision,0)<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 insert into public.ao_schedule_global_members(principal_type,principal_id,role,revision,updated_by) values(p_type,p_principal,p_role,coalesce(oldrow.revision,0)+1,p_actor)
 on conflict(principal_type,principal_id) do update set role=excluded.role,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 insert into public.ao_schedule_member_audit(branch_id,user_id,actor,before_data,after_data) values('*',p_type||':'||p_principal,p_actor,case when oldrow.id is null then null else to_jsonb(oldrow) end,to_jsonb(saved));
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.ao_schedule_global_access(text),public.ao_schedule_global_member_save(text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ao_schedule_global_access(text),public.ao_schedule_global_member_save(text,text,text,text,integer) to service_role;
commit;
