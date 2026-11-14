-- Keep US classes and staff with Novena. Create Thomson independently.
begin;
update public.ao_schedule_branches set name='Novena',revision=revision+1 where id='US' and name<>'Novena';
insert into public.ao_schedule_branches(id,name,zone_id,contact_evidence,publication_status)
values('TH','Thomson','central','[]','draft') on conflict(id) do nothing;
do $$
declare st jsonb; bs jsonb; item jsonb; output jsonb:='[]';
begin
 select state into st from public.ao_workspace where id=1 for update;
 if st is null then raise exception 'Workspace not found'; end if;
 if exists(select 1 from public.ao_schedule_branches where id='TH' and name<>'Thomson') then raise exception 'TH already used by another branch'; end if;
 bs:=coalesce(st->'branches','[]');
 for item in select value from jsonb_array_elements(bs) loop
  if item->>'scheduleId'='US' or item->>'id'='schedule-US' or item->>'name'='Novena Thomson' then
   item:=item||jsonb_build_object('name','Novena','abbreviation','N','scheduleId','US','version',coalesce((item->>'version')::integer,0)+1);
  elsif lower(item->>'name')='thomson' then
   item:=item||jsonb_build_object('scheduleId','TH','version',coalesce((item->>'version')::integer,0)+1);
  end if;
  output:=output||jsonb_build_array(item);
 end loop;
 if not exists(select 1 from jsonb_array_elements(output) b where b->>'scheduleId'='US') then
  output:=output||jsonb_build_array(jsonb_build_object('id','schedule-US','scheduleId','US','name','Novena','abbreviation','N','manager','','manager2','','crm','','cres','[]'::jsonb,'version',1));
 end if;
 if not exists(select 1 from jsonb_array_elements(output) b where b->>'scheduleId'='TH') then
  output:=output||jsonb_build_array(jsonb_build_object('id','schedule-TH','scheduleId','TH','name','Thomson','abbreviation','T','manager','','manager2','','crm','','cres','[]'::jsonb,'version',1));
 end if;
 update public.ao_workspace set state=jsonb_set(st,'{branches}',output),revision=revision+1 where id=1;
end $$;
commit;
select b.id,b.name,count(s.id) as classes from public.ao_schedule_branches b left join public.ao_schedule_sessions s on s.branch_id=b.id where b.id in ('US','TH') group by b.id,b.name order by b.name;
