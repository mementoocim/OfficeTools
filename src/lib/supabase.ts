import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseConfig } from '../types/auth'

const DEFAULT_SUPABASE_URL = 'https://slejllqkskxdbguxphjl.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_hAdtJdLE9RRq-vn3LVxfpg_K9Ah2f7G'

const STORAGE_URL_KEY = 'office_toolkit_supabase_url'
const STORAGE_KEY_KEY = 'office_toolkit_supabase_anon_key'

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  const localUrl = localStorage.getItem(STORAGE_URL_KEY) || ''
  const localKey = localStorage.getItem(STORAGE_KEY_KEY) || ''

  const url = (envUrl || localUrl || DEFAULT_SUPABASE_URL).trim()
  const anonKey = (envKey || localKey || DEFAULT_SUPABASE_ANON_KEY).trim()

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey && url.startsWith('http'))
  }
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_URL_KEY, url.trim())
  localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim())
  // Reset cached client instance
  cachedClient = null
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_URL_KEY)
  localStorage.removeItem(STORAGE_KEY_KEY)
  cachedClient = null
}

let cachedClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient

  const config = getSupabaseConfig()
  if (!config.isConfigured) return null

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    return cachedClient
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err)
    return null
  }
}

/**
 * SQL Script for setting up user profiles, first-admin bootstrap, and approval workflow
 */
export const SUPABASE_INIT_SQL = `-- 1. Create a table for public user profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text default '',
  role text default 'staff' check (role in ('admin', 'staff', 'viewer')),
  status text default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_sign_in_at timestamp with time zone
);

-- Lightweight audit trail: account/admin events only. No documents, files, or chat data are stored.
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users on delete set null,
  actor_email text not null default 'System',
  action text not null check (action in ('account_registered', 'user_approved', 'user_reactivated', 'user_deactivated', 'role_updated')),
  target_id uuid references auth.users on delete set null,
  target_email text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);

-- Apply the approval status to existing installations without changing current users.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'disabled'));
alter table public.profiles alter column status set default 'pending';

-- 2. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. DROP ALL existing policies on profiles dynamically (Clears any old recursive policies completely)
do $$ 
declare 
    r record;
begin
    for r in (select policyname from pg_policies where tablename = 'profiles' and schemaname = 'public') 
    loop
        execute format('drop policy if exists %I on public.profiles', r.policyname);
    end loop;
end $$;

-- 4. Helper function to check admin status without recursive RLS loop
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
end;
$$ language plpgsql security definer set search_path = public;

alter table public.audit_events enable row level security;

do $$
declare
    r record;
begin
    for r in (select policyname from pg_policies where tablename = 'audit_events' and schemaname = 'public')
    loop
        execute format('drop policy if exists %I on public.audit_events', r.policyname);
    end loop;
end $$;

create policy "audit_events_select_admin"
  on public.audit_events for select
  to authenticated
  using (public.is_admin());

-- 5. Create fresh, clean RLS policies
create policy "profiles_select_policy"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- Profile roles and statuses must be changed only by an administrator.
-- Allowing users to update their own row here would let them promote themselves.
create policy "profiles_update_policy"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_delete_policy"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- 6. Trigger to automatically create a profile on signup.
-- The first account is active admin for bootstrap; every later account needs approval.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count int;
  initial_role text;
  initial_status text;
begin
  -- Serialize bootstrap so simultaneous first signups cannot both become admins.
  perform pg_advisory_xact_lock(hashtext('office_toolkit_first_admin'));
  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    initial_role := 'admin';
    initial_status := 'active';
  else
    initial_role := 'staff';
    initial_status := 'pending';
  end if;

  insert into public.profiles (id, email, full_name, role, status, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    initial_role,
    initial_status,
    now()
  )
  on conflict (id) do nothing;

  insert into public.audit_events (actor_id, actor_email, action, target_id, target_email)
  values (new.id, coalesce(new.email, 'New account'), 'account_registered', new.id, coalesce(new.email, ''));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Capture only consequential administrator changes. The trigger bypasses client insert rights,
-- so users cannot forge audit events from the browser.
create or replace function public.audit_profile_change()
returns trigger as $$
declare
  event_action text;
  actor_mail text;
begin
  if old.status is distinct from new.status then
    event_action := case
      when new.status = 'active' and old.status = 'pending' then 'user_approved'
      when new.status = 'active' then 'user_reactivated'
      else 'user_deactivated'
    end;
  elsif old.role is distinct from new.role then
    event_action := 'role_updated';
  else
    return new;
  end if;

  select coalesce(email, 'Administrator') into actor_mail from public.profiles where id = auth.uid();
  insert into public.audit_events (actor_id, actor_email, action, target_id, target_email)
  values (auth.uid(), coalesce(actor_mail, 'Administrator'), event_action, new.id, coalesce(new.email, ''));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_profile_access_changed on public.profiles;
create trigger on_profile_access_changed
  after update of role, status on public.profiles
  for each row execute procedure public.audit_profile_change();

-- 7. Backfill existing auth users. Only the earliest account becomes admin;
-- every other account starts as staff. Existing profile roles are preserved.
insert into public.profiles (id, email, full_name, role, status)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  case when row_number() over (order by created_at asc) = 1 then 'admin' else 'staff' end,
  'active'
from auth.users
on conflict (id) do nothing;
`
