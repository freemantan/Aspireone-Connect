-- Product B rename. Rerunnable; no fee, commission or class start/end changes.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.product_b_labels(value jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE output jsonb; text_value text;
BEGIN
 CASE jsonb_typeof(value)
 WHEN 'string' THEN
  text_value := regexp_replace(value#>>'{}', '\mPhysical (Tutorial( / Lecture( Class)?)?|Classes?)\M', '120-minute Dedicated Class', 'gi');
  text_value := regexp_replace(text_value, '(120-minute Dedicated Class.{0,100})(1\.5-hour lessons|90 minutes|90-minute)', '\1 · 120 minutes', 'g');
  RETURN to_jsonb(text_value);
 WHEN 'array' THEN
  SELECT coalesce(jsonb_agg(pg_temp.product_b_labels(v) ORDER BY ord),'[]'::jsonb) INTO output FROM jsonb_array_elements(value) WITH ORDINALITY a(v,ord); RETURN output;
 WHEN 'object' THEN
  SELECT coalesce(jsonb_object_agg(k,pg_temp.product_b_labels(v)),'{}'::jsonb) INTO output FROM jsonb_each(value) a(k,v); RETURN output;
 ELSE RETURN value;
 END CASE;
END $$;
UPDATE public.ao_workspace SET state=pg_temp.product_b_labels(state),revision=revision+1
 WHERE state IS DISTINCT FROM pg_temp.product_b_labels(state);
UPDATE public.ao_plan_rules SET payload=pg_temp.product_b_labels(payload),revision=revision+1,updated_at=now()
 WHERE payload IS DISTINCT FROM pg_temp.product_b_labels(payload);
UPDATE public.ao_plan_budgets SET payload=pg_temp.product_b_labels(payload),revision=revision+1,updated_at=now()
 WHERE payload IS DISTINCT FROM pg_temp.product_b_labels(payload);
UPDATE public.ao_schedule_product_modes SET label='B. 120-minute Dedicated Class',default_minutes=120 WHERE id='B';
COMMIT;
SELECT id,label,default_minutes FROM public.ao_schedule_product_modes WHERE id='B';
