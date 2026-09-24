-- Business Planning release 1. Run after supabase-setup.sql; rerunnable, non-destructive.
begin;
create table if not exists public.ao_plan_entities (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 kind text not null check(kind in ('branch','online','coaching','company')),
 parent_id uuid references public.ao_plan_entities(id), board_id text,
 revision integer not null default 1, updated_by text not null, updated_at timestamptz not null default now(), check(parent_id is null or parent_id<>id)
);
create table if not exists public.ao_plan_rules (
 id uuid primary key default gen_random_uuid(), name text not null, effective_date date not null,
 status text not null default 'draft' check(status in ('draft','published')), payload jsonb not null,
 revision integer not null default 1, updated_by text not null, updated_at timestamptz not null default now()
);
create table if not exists public.ao_plan_budgets (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.ao_plan_entities(id),
 rule_id uuid not null references public.ao_plan_rules(id), name text not null, year integer not null check(year between 2000 and 2200),
 status text not null default 'draft' check(status in ('draft','published')), payload jsonb not null,
 revision integer not null default 1, updated_by text not null, updated_at timestamptz not null default now()
);
create index if not exists ao_plan_budgets_entity on public.ao_plan_budgets(entity_id,year);
create table if not exists public.ao_plan_audit (
 id bigint generated always as identity primary key, kind text not null, record_id uuid not null,
 actor text not null, at timestamptz not null default now(), before_data jsonb, after_data jsonb not null
);
-- Only the authenticated Connect server can access these records.
alter table public.ao_plan_entities enable row level security;
alter table public.ao_plan_rules enable row level security;
alter table public.ao_plan_budgets enable row level security;
alter table public.ao_plan_audit enable row level security;
revoke all on public.ao_plan_entities,public.ao_plan_rules,public.ao_plan_budgets,public.ao_plan_audit from public,anon,authenticated;
grant select on public.ao_plan_entities,public.ao_plan_rules,public.ao_plan_budgets,public.ao_plan_audit to service_role;
create or replace function public.ao_plan_save(p_kind text,p_id uuid,p_revision integer,p_actor text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tab text; oldrow jsonb; result jsonb; rid uuid; parent uuid;
begin
 tab:=case p_kind when 'entity' then 'ao_plan_entities' when 'rules' then 'ao_plan_rules' when 'budget' then 'ao_plan_budgets' end;
 if tab is null then raise exception 'Invalid planning record'; end if;
 -- Serialize entity hierarchy changes, including concurrent re-parenting.
 if p_kind='entity' then perform pg_advisory_xact_lock(782601); end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into oldrow using p_id;
  if oldrow is null or (oldrow->>'revision')::integer<>p_revision then raise exception 'PLANNING_CONFLICT'; end if;
  if oldrow->>'status'='published' then raise exception 'Published versions are immutable'; end if;
 end if;
 rid:=coalesce(p_id,gen_random_uuid());
 if p_kind='entity' then
  parent:=nullif(p_data->>'parent_id','')::uuid;
  if exists(with recursive ancestors as (select id,parent_id from public.ao_plan_entities where id=parent union all select e.id,e.parent_id from public.ao_plan_entities e join ancestors a on e.id=a.parent_id) select 1 from ancestors where id=rid) then raise exception 'Entity hierarchy cannot contain a cycle'; end if;
  insert into public.ao_plan_entities(id,name,kind,parent_id,board_id,updated_by) values(rid,p_data->>'name',p_data->>'kind',parent,nullif(p_data->>'board_id',''),p_actor)
  on conflict(id) do update set name=excluded.name,kind=excluded.kind,parent_id=excluded.parent_id,board_id=excluded.board_id,revision=public.ao_plan_entities.revision+1,updated_by=p_actor,updated_at=now();
 elsif p_kind='rules' then
  insert into public.ao_plan_rules(id,name,effective_date,status,payload,updated_by) values(rid,p_data->>'name',(p_data->>'effective_date')::date,p_data->>'status',p_data->'payload',p_actor)
  on conflict(id) do update set name=excluded.name,effective_date=excluded.effective_date,status=excluded.status,payload=excluded.payload,revision=public.ao_plan_rules.revision+1,updated_by=p_actor,updated_at=now();
 else
  if not exists(select 1 from public.ao_plan_rules where id=(p_data->>'rule_id')::uuid and status='published') then raise exception 'Budgets require a published price and commission version'; end if;
  if oldrow is not null and oldrow->>'entity_id'<>p_data->>'entity_id' then raise exception 'Budget entity cannot be changed'; end if;
  insert into public.ao_plan_budgets(id,entity_id,rule_id,name,year,status,payload,updated_by) values(rid,(p_data->>'entity_id')::uuid,(p_data->>'rule_id')::uuid,p_data->>'name',(p_data->>'year')::integer,p_data->>'status',p_data->'payload',p_actor)
  on conflict(id) do update set rule_id=excluded.rule_id,name=excluded.name,year=excluded.year,status=excluded.status,payload=excluded.payload,revision=public.ao_plan_budgets.revision+1,updated_by=p_actor,updated_at=now();
 end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into result using rid;
 insert into public.ao_plan_audit(kind,record_id,actor,before_data,after_data) values(p_kind,rid,p_actor,oldrow,result);
 return result;
end; $$;
revoke all on function public.ao_plan_save(text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.ao_plan_save(text,uuid,integer,text,jsonb) to service_role;
insert into public.ao_plan_entities(id,name,kind,updated_by) values
 ('c0000000-0000-4000-8000-000000000001','Aspire Online','online','setup'),
 ('c0000000-0000-4000-8000-000000000002','AHCI','coaching','setup') on conflict(id) do nothing;
commit;
