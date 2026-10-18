begin;
create or replace function public.ao_schedule_public_catalogue()
returns jsonb language sql security definer set search_path='' as $$
with visible as (
 select s.* from public.ao_schedule_sessions s
 where s.status<>'discontinued' and (s.status='published' or exists(select 1 from public.ao_schedule_evidence pe join public.ao_schedule_sources pf on pf.id=pe.source_id where pe.session_id=s.id and pf.relative_path like '%.pdf')) and s.academic_year>=2027 and s.level_label not like '%2026%'
 and (s.notes::jsonb->>'origin'='connect-editor'
 or (s.branch_id='HM' and s.notes::jsonb->>'approved_source'='hillion-2027-master')
 or exists(select 1 from public.ao_schedule_evidence e join public.ao_schedule_sources f on f.id=e.source_id where e.session_id=s.id and f.relative_path like '%.pdf'))
)
select jsonb_build_object(
 'updatedAt',now(),
 'branches',(select coalesce(jsonb_agg(jsonb_build_array(b.id,b.name,z.name,b.phone,b.whatsapp,b.contact_url,0,b.qr_url) order by z.name,b.name),'[]'::jsonb) from public.ao_schedule_branches b left join public.ao_schedule_zones z on z.id=b.zone_id),
 'data',(select coalesce(jsonb_agg(jsonb_build_array(s.id,s.branch_id,b.name,s.subject,s.level_label,s.levels,s.day,s.start_minute,s.end_minute,'',s.delivery_mode,s.academic_year,s.term) order by b.name,s.subject,s.day,s.start_minute),'[]'::jsonb) from visible s join public.ao_schedule_branches b on b.id=s.branch_id)
);
$$;
revoke all on function public.ao_schedule_public_catalogue() from public,anon,authenticated;
grant execute on function public.ao_schedule_public_catalogue() to service_role;
commit;
select jsonb_array_length(public.ao_schedule_public_catalogue()->'data') as public_classes;
