-- Adds Class Room storage and removes CRE-only schedule editing.
-- Keeps Technology access unless separately revoked.
begin;
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
create or replace function public.ao_schedule_save(p_actor text,p_id text,p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.ao_schedule_sessions%rowtype; saved public.ao_schedule_sessions%rowtype; rid text; branch text; sub text; lv jsonb; start_at integer; end_at integer; weekday integer; yr integer; tm integer; mode text; fmt text; from_date date; to_date date; meta jsonb; coach_name text; state text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'SCHEDULE_INVALID_DATA'; end if;
 branch:=p_data->>'branch_id';
 if coalesce(p_data->>'product_mode','A') not in ('A','B','C') or (p_data->>'product_mode'='C' and branch<>'LIVE') or (branch='LIVE' and coalesce(p_data->>'product_mode','A')<>'C') then raise exception 'SCHEDULE_INVALID_PRODUCT_MODE'; end if;perform public.ao_schedule_access(p_actor,branch,2);
 if p_id is not null then
  select * into oldrow from public.ao_schedule_sessions where id=p_id for update;
  if not found then raise exception 'SCHEDULE_NOT_FOUND'; end if;
  perform public.ao_schedule_access(p_actor,oldrow.branch_id,2);
  if oldrow.revision<>p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 elsif p_revision<>0 then raise exception 'SCHEDULE_CONFLICT'; end if;
 sub:=p_data->>'subject';lv:=p_data->'levels';start_at:=(p_data->>'start_minute')::integer;end_at:=(p_data->>'end_minute')::integer;weekday:=(p_data->>'day')::integer;
 yr:=(p_data->>'academic_year')::integer;tm:=(p_data->>'term')::integer;mode:=case when p_data->>'product_mode'='C' then 'online' else 'in_person' end;fmt:=case when coalesce(p_data->>'product_mode','A')='A' then 'coaching' else 'lecture' end;coach_name:=trim(coalesce(p_data->>'coach',''));state:=p_data->>'status';
 if sub is null or sub not in ('Mathematics','E Math','A Math','E-Math/A-Math','English','Science','Chemistry','Physics','Biology','Chinese','Pure Chinese','Economics','Principles of Accounts','General Paper','Humanities','Social Studies','Geography') then raise exception 'SCHEDULE_INVALID_SUBJECT'; end if;
 if lv is null or jsonb_typeof(lv)<>'array' then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if jsonb_array_length(lv)=0 or jsonb_array_length(lv)>20 then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if exists(select 1 from jsonb_array_elements(lv) l where jsonb_typeof(l)<>'string' or (l#>>'{}')!~'^(P[1-6]|S[1-5]|JC[12]|IPY[1-6]|IBY[1-6])$') then raise exception 'SCHEDULE_INVALID_LEVEL'; end if;
 if start_at is null or end_at is null or weekday is null or start_at<0 or end_at>1440 or end_at<=start_at or weekday not between 1 and 7 then raise exception 'SCHEDULE_INVALID_TIME'; end if;
 if yr is null or yr not between 2027 and 2100 or (tm is null and coalesce(p_data->>'product_mode','A')<>'C') or (tm is not null and tm not between 1 and 4) then raise exception 'SCHEDULE_INVALID_TERM'; end if;
 if mode is null or mode not in ('in_person','online','hybrid','unspecified') or fmt is null or fmt not in ('class','coaching','lecture','unspecified') then raise exception 'SCHEDULE_INVALID_FORMAT'; end if;
 if length(coalesce(p_data->>'classroom',''))>100 or length(coach_name)>200 or length(coalesce(p_data->>'public_notes',''))>2000 then raise exception 'SCHEDULE_INVALID_TEXT'; end if;
 if state is null or state not in ('published','discontinued') then raise exception 'SCHEDULE_INVALID_STATUS'; end if;
 from_date:=nullif(p_data->>'effective_from','')::date;to_date:=nullif(p_data->>'effective_to','')::date;
 if from_date is not null and to_date is not null and from_date>to_date then raise exception 'SCHEDULE_INVALID_DATES'; end if;
 rid:=coalesce(p_id,md5(gen_random_uuid()::text));
 meta:=coalesce(oldrow.notes::jsonb,'{}'::jsonb)||jsonb_build_object('origin','connect-editor','flags','[]'::jsonb,'classroom',coalesce(p_data->>'classroom',oldrow.notes::jsonb->>'classroom',''),'public_notes',coalesce(p_data->>'public_notes',''),'updated_by',p_actor,'updated_at',now());
 insert into public.ao_schedule_sessions(id,branch_id,academic_year,term,level_label,levels,subject,day,start_minute,end_minute,raw_time,coach,format,delivery_mode,effective_from,effective_to,status,review_state,notes,revision,product_mode)
 values(rid,branch,yr,tm,(select string_agg(l,', ') from jsonb_array_elements_text(lv) l),lv::text,sub,weekday,start_at,end_at,format('%s:%s–%s:%s',start_at/60,lpad((start_at%60)::text,2,'0'),end_at/60,lpad((end_at%60)::text,2,'0')),nullif(coach_name,''),fmt,mode,from_date::text,to_date::text,state,'confirmed',meta::text,coalesce(oldrow.revision,0)+1,coalesce(p_data->>'product_mode','A'))
 on conflict(id) do update set branch_id=excluded.branch_id,academic_year=excluded.academic_year,term=excluded.term,level_label=excluded.level_label,levels=excluded.levels,subject=excluded.subject,day=excluded.day,start_minute=excluded.start_minute,end_minute=excluded.end_minute,raw_time=excluded.raw_time,coach=excluded.coach,format=excluded.format,delivery_mode=excluded.delivery_mode,effective_from=excluded.effective_from,effective_to=excluded.effective_to,status=excluded.status,review_state=excluded.review_state,notes=excluded.notes,revision=excluded.revision,product_mode=excluded.product_mode
 returning * into saved;
 insert into public.ao_schedule_audit(id,session_id,actor,at,before_data,after_data) values(md5(gen_random_uuid()::text),rid,p_actor,now()::text,case when p_id is null then null else to_jsonb(oldrow)::text end,to_jsonb(saved)::text);
 update public.ao_schedule_issues set resolved=1 where session_id=rid;
 return to_jsonb(saved);
end; $$;
commit;
