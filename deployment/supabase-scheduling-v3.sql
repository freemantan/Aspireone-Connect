begin;
create or replace function public.ao_schedule_set_deleted(p_actor text,p_id text,p_revision integer,p_deleted boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_sessions%rowtype; saved public.ao_schedule_sessions%rowtype; meta jsonb; next_status text;
begin
 if p_deleted is null then raise exception 'SCHEDULE_INVALID_STATUS'; end if;
 select * into oldrow from public.ao_schedule_sessions where id=p_id for update;
 if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
 perform public.ao_schedule_access(p_actor,oldrow.branch_id,2);
 if p_revision is null or oldrow.revision<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 meta:=coalesce(oldrow.notes::jsonb,'{}'::jsonb);
 if p_deleted then
  if oldrow.status='discontinued' then raise exception 'SCHEDULE_CONFLICT'; end if;
  meta:=meta||jsonb_build_object('deleted_previous_status',oldrow.status);next_status:='discontinued';
 else
  if oldrow.status<>'discontinued' then raise exception 'SCHEDULE_CONFLICT'; end if;
  next_status:=coalesce(meta->>'deleted_previous_status','published');
  if next_status not in ('draft','published') then next_status:='published'; end if;
 end if;
 meta:=meta||jsonb_build_object('origin','connect-editor','updated_by',p_actor,'updated_at',now());
 update public.ao_schedule_sessions set status=next_status,notes=meta::text,revision=revision+1 where id=p_id returning * into saved;
 insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) values(md5(gen_random_uuid()::text),p_id,p_actor,now()::text,to_jsonb(oldrow)::text,to_jsonb(saved)::text);
 return to_jsonb(saved);
end; $$;
revoke all on function public.ao_schedule_set_deleted(text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.ao_schedule_set_deleted(text,text,integer,boolean) to service_role;
commit;
