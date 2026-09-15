-- Run once in the Supabase SQL Editor. Re-running preserves existing data.
-- The Worker is the authorization boundary. Browser roles have no table/RPC
-- access. The server secret must only be stored in Cloudflare encrypted secrets.
begin;
create table if not exists public.ao_workspace (
 id integer primary key check(id=1), revision bigint not null default 0,
 state jsonb not null check(jsonb_typeof(state)='object')
);
insert into public.ao_workspace(id,state) values(1,
 '{"users":[],"boards":[],"members":[],"invites":[],"groups":[],"tasks":[],"topics":[],"messages":[],"files":[],"notifications":[],"reads":[],"activity":[],"recurrences":[]}')
on conflict(id) do nothing;
create table if not exists public.ao_sessions(token text primary key,user_id text not null,expires timestamptz not null);
create table if not exists public.ao_oauth(token text primary key,payload jsonb not null,expires timestamptz not null);
alter table public.ao_workspace enable row level security;
alter table public.ao_sessions enable row level security;
alter table public.ao_oauth enable row level security;
revoke all on public.ao_workspace,public.ao_sessions,public.ao_oauth from public,anon,authenticated;
grant select,insert,update,delete on public.ao_workspace,public.ao_sessions,public.ao_oauth to service_role;

create or replace function public.ao_load() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('revision',revision,'state',state) from public.ao_workspace where id=1;
$$;
create or replace function public.ao_commit(expected_revision bigint,new_state jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.ao_workspace set state=new_state,revision=revision+1 where id=1 and revision=expected_revision;
 return found;
end; $$;
create or replace function public.ao_session_put(token_hash text,user_id text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 delete from public.ao_sessions where expires<=now();
 insert into public.ao_sessions(token,user_id,expires) values($1,$2,now()+interval '12 hours');
 return true;
end; $$;
create or replace function public.ao_session_get(token_hash text) returns text
language sql security invoker set search_path='' as $$
 select user_id from public.ao_sessions where token=token_hash and expires>now();
$$;
create or replace function public.ao_session_delete(token_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin delete from public.ao_sessions where token=token_hash; return true; end; $$;
create or replace function public.ao_oauth_put(token_hash text,data jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 delete from public.ao_oauth where expires<=now();
 insert into public.ao_oauth(token,payload,expires) values(token_hash,data,now()+interval '10 minutes');
 return true;
end; $$;
create or replace function public.ao_oauth_take(token_hash text) returns jsonb
language sql security invoker set search_path='' as $$
 delete from public.ao_oauth where token=token_hash and expires>now() returning payload;
$$;

revoke all on function public.ao_load(),public.ao_commit(bigint,jsonb),public.ao_session_put(text,text),public.ao_session_get(text),public.ao_session_delete(text),public.ao_oauth_put(text,jsonb),public.ao_oauth_take(text) from public,anon,authenticated;
grant execute on function public.ao_load(),public.ao_commit(bigint,jsonb),public.ao_session_put(text,text),public.ao_session_get(text),public.ao_session_delete(text),public.ao_oauth_put(text,jsonb),public.ao_oauth_take(text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('aspireone-files','aspireone-files',false,26214400)
on conflict(id) do update set public=false,file_size_limit=26214400;
commit;
