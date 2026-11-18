-- 로컬 PostgreSQL에서 마이그레이션을 검증하기 위한 Supabase 최소 흉내 (실서비스에서는 사용하지 않음)
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
