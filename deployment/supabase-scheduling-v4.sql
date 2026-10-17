begin;
create or replace function public.ao_schedule_role_access_save(p_actor text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare change jsonb; oldrow public.ao_schedule_global_members%rowtype; saved public.ao_schedule_global_members%rowtype; principal text; access_role text; expected integer; grants jsonb:='[]'::jsonb;
begin
 if public.ao_schedule_global_access(p_actor)<3 then raise exception 'SCHEDULE_FORBIDDEN'; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'array' then raise exception 'SCHEDULE_INVALID_ROLES'; end if;
 if jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>14 then raise exception 'SCHEDULE_INVALID_ROLES'; end if;
 if (select count(distinct value->>'principal') from jsonb_array_elements(p_changes))<>jsonb_array_length(p_changes) then raise exception 'SCHEDULE_INVALID_ROLES'; end if;
 for change in select value from jsonb_array_elements(p_changes) order by value->>'principal' loop
  principal:=change->>'principal';access_role:=change->>'role';
  if principal is null or principal not in ('Business Manager','Subject Head','Customer Relationship','Marketing','HR','Technology','Finance','Online Business','AHCI','Manager','Senior Manager','Franchisee','Director','Shareholder') then raise exception 'SCHEDULE_INVALID_ROLE'; end if;
  if access_role is null or access_role not in ('None','View','Edit','Manage') or coalesce(change->>'revision','')!~'^(0|[1-9][0-9]*)$' then raise exception 'SCHEDULE_INVALID_ROLE'; end if;
  expected:=(change->>'revision')::integer;
  perform pg_advisory_xact_lock(hashtextextended('schedule-global:role:'||principal,0));
  select * into oldrow from public.ao_schedule_global_members where principal_type='role' and principal_id=principal for update;
  if coalesce(oldrow.revision,0)<>expected then raise exception 'SCHEDULE_CONFLICT'; end if;
  insert into public.ao_schedule_global_members(principal_type,principal_id,role,revision,updated_by) values('role',principal,access_role,coalesce(oldrow.revision,0)+1,p_actor)
  on conflict(principal_type,principal_id) do update set role=excluded.role,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
  insert into public.ao_schedule_member_audit(branch_id,user_id,actor,before_data,after_data) values('*','role:'||principal,p_actor,case when oldrow.id is null then null else to_jsonb(oldrow) end,to_jsonb(saved));
  grants:=grants||jsonb_build_array(to_jsonb(saved));
 end loop;
 return jsonb_build_object('ok',true,'grants',grants);
end; $$;
revoke all on function public.ao_schedule_role_access_save(text,jsonb) from public,anon,authenticated;
grant execute on function public.ao_schedule_role_access_save(text,jsonb) to service_role;
commit;
