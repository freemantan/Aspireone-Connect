begin;
update public.ao_schedule_branches set contact_url='https://wa.me/message/ESTHHUJPCZLJB1',revision=revision+1 where id='HM' and contact_url is distinct from 'https://wa.me/message/ESTHHUJPCZLJB1';
commit;
select id,contact_url,qr_url from public.ao_schedule_branches where id='HM';
select id,levels,day,start_minute,end_minute from public.ao_schedule_sessions where id='4432cbff817320fa470bc010f917aa88';
