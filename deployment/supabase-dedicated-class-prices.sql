-- Apply to current draft AND published prices, preserving IDs and historical 2026 fees.
-- No class start/end changes. Back up tables before running.
begin;
create or replace function pg_temp.align_dedicated(payload jsonb) returns jsonb language plpgsql as $$
declare rows jsonb:=payload->'prices'; result jsonb:='[]'; b jsonb; a jsonb;
begin
 if jsonb_typeof(rows) is distinct from 'array' then return payload; end if;
 for b in select value from jsonb_array_elements(rows) loop
  if b->>'product'='B' then
   select value into a from jsonb_array_elements(rows) where value->>'product'='A' and value->>'level'=b->>'level' and value->>'tier'=b->>'tier';
   if a is null then raise exception 'No Product A price matches Product B: %', b->>'id'; end if;
   b := (b-'discount') || jsonb_build_object('group','Dedicated Class','amount',a->'amount','units',a->'units','unavailable',coalesce(a->'unavailable','false'::jsonb));
   if a ? 'discount' then b:=b||jsonb_build_object('discount',a->'discount'); end if;
  end if;
  result:=result||jsonb_build_array(b);
 end loop;
 return jsonb_set(payload,'{prices}',result);
end $$;
update public.ao_plan_prices
set payload=pg_temp.align_dedicated(payload),
 published_data=case when published_data->'payload' is not null then jsonb_set(published_data,'{payload}',pg_temp.align_dedicated(published_data->'payload')) else published_data end,
 revision=revision+1,updated_at=now()
where payload is distinct from pg_temp.align_dedicated(payload)
 or published_data->'payload' is distinct from pg_temp.align_dedicated(published_data->'payload');
update public.ao_plan_rules set payload=pg_temp.align_dedicated(payload),revision=revision+1,updated_at=now()
where payload is distinct from pg_temp.align_dedicated(payload);
update public.ao_schedule_product_modes set label='B. Dedicated Class',default_minutes=120 where id='B';
-- Update saved article/title/description labels without changing file IDs or schedules.
create or replace function pg_temp.dedicated_labels(v jsonb) returns jsonb language plpgsql as $$
declare result jsonb;
begin
 case jsonb_typeof(v)
 when 'string' then return to_jsonb(regexp_replace(regexp_replace(v#>>'{}','120-(minute|min) Dedicated Class','Dedicated Class','gi'),'\mPhysical (Tutorial( / Lecture( Class)?)?|Classes?)\M','Dedicated Class','gi'));
 when 'array' then select coalesce(jsonb_agg(pg_temp.dedicated_labels(x) order by n),'[]'::jsonb) into result from jsonb_array_elements(v) with ordinality a(x,n);return result;
 when 'object' then select coalesce(jsonb_object_agg(k,pg_temp.dedicated_labels(x)),'{}'::jsonb) into result from jsonb_each(v) a(k,x);return result;
 else return v;
 end case;
end $$;
update public.ao_workspace set state=pg_temp.dedicated_labels(state),revision=revision+1 where state is distinct from pg_temp.dedicated_labels(state);
commit;
