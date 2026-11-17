-- Reproduce lo que un proyecto Supabase ya trae, para aplicar la migración real en PostgreSQL local.
-- (Solo pruebas. En Supabase NO se ejecuta este archivo.)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  created_at timestamptz default now()
);

-- Igual que Supabase: el usuario se toma de los claims del JWT.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Privilegios por defecto de Supabase en el esquema public (RLS es la barrera real).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Supabase Vault (versión mínima para pruebas; en Supabase real cifra el secreto).
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid
language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void
language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name), description = coalesce(new_description, description) where id = secret_id $$;
create or replace view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;

-- Storage (mínimo): buckets y objetos con RLS, como en Supabase.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, contenido bytea, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update on storage.objects to authenticated;

-- pg_net (mínimo): http_post encola; el emulador ejecuta la cola y escribe net._http_response, como el worker real.
create schema if not exists net;
create table if not exists net.http_request_queue (id bigserial primary key, url text, body jsonb, headers jsonb, timeout_milliseconds int, procesado boolean not null default false);
create table if not exists net._http_response (id bigint primary key, status_code int, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$ insert into net.http_request_queue (url, body, headers, timeout_milliseconds) values (url, body, headers, timeout_milliseconds) returning id $$;
