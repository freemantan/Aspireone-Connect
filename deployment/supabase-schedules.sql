begin;

create table if not exists ao_schedule_zones(id text primary key,name text not null unique);
create table if not exists ao_schedule_branches(id text primary key,name text not null,zone_id text references ao_schedule_zones(id),phone text,whatsapp text,email text,address text,contact_url text,qr_url text,contact_evidence text not null,publication_status text not null default 'draft',revision integer not null default 1);
create table if not exists ao_schedule_sources(id text primary key,branch_id text references ao_schedule_branches(id),relative_path text not null,sha256 text not null,kind text not null,extraction_method text not null,content text not null,metadata text not null,unique(relative_path,sha256));
create table if not exists ao_schedule_sheets(id text primary key,source_id text not null references ao_schedule_sources(id),name text not null,role text not null,cells text not null);
create table if not exists ao_schedule_sessions(id text primary key,branch_id text not null references ao_schedule_branches(id),academic_year integer not null,term integer not null,level_label text not null,levels text not null,subject text not null,day integer check(day between 1 and 7),start_minute integer,end_minute integer,raw_time text not null,coach text,format text not null,delivery_mode text not null,effective_from text,effective_to text,status text not null check(status in ('draft','published','discontinued')),review_state text not null,notes text not null,revision integer not null default 1,check((start_minute is null and end_minute is null) or (start_minute>=0 and end_minute<=1440 and end_minute>start_minute)));
create index if not exists ao_schedule_filter on ao_schedule_sessions(branch_id,academic_year,term,status,subject);
create table if not exists ao_schedule_evidence(id text primary key,session_id text not null references ao_schedule_sessions(id),source_id text not null references ao_schedule_sources(id),sheet text,locator text not null,raw_value text not null,raw_context text not null);
create table if not exists ao_schedule_calendar_notes(id text primary key,branch_id text not null references ao_schedule_branches(id),source_id text not null references ao_schedule_sources(id),sheet text not null,locator text not null,source_date text,note text not null,review_state text not null);
create table if not exists ao_schedule_issues(id text primary key,branch_id text references ao_schedule_branches(id),session_id text references ao_schedule_sessions(id),source_id text references ao_schedule_sources(id),code text not null,detail text not null,resolved integer not null default 0);
create table if not exists ao_schedule_audit(id text primary key,session_id text not null references ao_schedule_sessions(id),actor text not null,at text not null,before_data text,after_data text not null);
create table if not exists ao_schedule_imports(id text primary key,imported_at text not null,summary text not null);
create table if not exists ao_schedule_subjects(id text primary key,name text not null unique);
create table if not exists ao_schedule_levels(id text primary key,name text not null unique);
create table if not exists ao_schedule_session_subjects(id text primary key,session_id text not null references ao_schedule_sessions(id),subject_id text not null references ao_schedule_subjects(id),unique(session_id,subject_id));
create table if not exists ao_schedule_session_levels(id text primary key,session_id text not null references ao_schedule_sessions(id),level_id text not null references ao_schedule_levels(id),unique(session_id,level_id));
create table if not exists ao_schedule_import_coverage(id text primary key,source_id text not null references ao_schedule_sources(id),sheet text not null,locator text not null,expected_slots integer not null,imported_slots integer not null,raw_value text not null);

alter table public.ao_schedule_zones enable row level security;
revoke all on public.ao_schedule_zones from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_zones to service_role;

alter table public.ao_schedule_branches enable row level security;
revoke all on public.ao_schedule_branches from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_branches to service_role;

alter table public.ao_schedule_sources enable row level security;
revoke all on public.ao_schedule_sources from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_sources to service_role;

alter table public.ao_schedule_sheets enable row level security;
revoke all on public.ao_schedule_sheets from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_sheets to service_role;

alter table public.ao_schedule_sessions enable row level security;
revoke all on public.ao_schedule_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_sessions to service_role;

alter table public.ao_schedule_evidence enable row level security;
revoke all on public.ao_schedule_evidence from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_evidence to service_role;

alter table public.ao_schedule_calendar_notes enable row level security;
revoke all on public.ao_schedule_calendar_notes from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_calendar_notes to service_role;

alter table public.ao_schedule_issues enable row level security;
revoke all on public.ao_schedule_issues from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_issues to service_role;

alter table public.ao_schedule_audit enable row level security;
revoke all on public.ao_schedule_audit from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_audit to service_role;

alter table public.ao_schedule_imports enable row level security;
revoke all on public.ao_schedule_imports from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_imports to service_role;

alter table public.ao_schedule_subjects enable row level security;
revoke all on public.ao_schedule_subjects from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_subjects to service_role;

alter table public.ao_schedule_levels enable row level security;
revoke all on public.ao_schedule_levels from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_levels to service_role;

alter table public.ao_schedule_session_subjects enable row level security;
revoke all on public.ao_schedule_session_subjects from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_session_subjects to service_role;

alter table public.ao_schedule_session_levels enable row level security;
revoke all on public.ao_schedule_session_levels from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_session_levels to service_role;

alter table public.ao_schedule_import_coverage enable row level security;
revoke all on public.ao_schedule_import_coverage from public,anon,authenticated;
grant select,insert,update,delete on public.ao_schedule_import_coverage to service_role;

commit;
