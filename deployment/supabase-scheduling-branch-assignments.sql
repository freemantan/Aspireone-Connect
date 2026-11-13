-- Run once in Supabase SQL Editor. Existing schedules and branch assignments are unchanged.
begin;
create or replace function public.ao_schedule_global_access(p_actor text)
returns integer language plpgsql security definer set search_path='' as $$
declare u jsonb;
begin
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_actor;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 return 1;
end; $$;
create or replace function public.ao_schedule_access(p_actor text,p_branch text,p_min integer default 1)
returns integer language plpgsql security definer set search_path='' as $$
declare u jsonb; access integer:=1; branch_name text;
begin
 select value into u from public.ao_workspace w,jsonb_array_elements(w.state->'users') where w.id=1 and value->>'id'=p_actor;
 if u is null or not coalesce((u->>'active')::boolean,false) or coalesce((u->>'onboarding')::boolean,false) or coalesce((u->>'deleted')::boolean,false) then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 select name into branch_name from public.ao_schedule_branches where id=p_branch;
 if branch_name is null then raise exception 'SCHEDULE_INVALID_BRANCH'; end if;
 if coalesce((u->>'admin')::boolean,false) then return 4; end if;
 if coalesce(u->'roles','[]'::jsonb) ? 'Technology' then access:=2; end if;
 if exists(select 1 from public.ao_workspace w,jsonb_array_elements(coalesce(w.state->'branches','[]'::jsonb)) b where w.id=1
  and (b->>'scheduleId'=p_branch or b->>'id'='schedule-'||p_branch or lower(trim(b->>'name'))=lower(trim(branch_name)))
  and (b->>'manager'=p_actor or b->>'manager2'=p_actor or b->>'crm'=p_actor)) then access:=2; end if;
 if access<p_min then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 return access;
end; $$;
-- Retire old grants. Access follows branch assignments, System Administrators and Technology users.
update public.ao_schedule_members set role='View',revision=revision+1,updated_at=now() where role<>'View';
update public.ao_schedule_global_members set role='View',revision=revision+1,updated_at=now() where role<>'View';
commit;
select 'Scheduling access now follows Administration branch assignments.' as result;
