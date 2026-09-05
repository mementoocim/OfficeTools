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
 * SQL Script for setting up user profiles & auto-admin for the 1st user
 */
export const SUPABASE_INIT_SQL = `-- 1. Create a table for public user profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text default '',
  role text default 'staff' check (role in ('admin', 'staff', 'viewer')),
  status text default 'active' check (status in ('active', 'disabled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_sign_in_at timestamp with time zone
);

-- 2. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. Security Definer helper function to check admin status without recursive RLS loop
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Clean and Non-recursive RLS Policies
drop policy if exists "Public profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Allow authenticated select" on public.profiles;
drop policy if exists "Allow update self or admin" on public.profiles;
drop policy if exists "Allow insert self or admin" on public.profiles;

-- Authenticated users can view all profiles
create policy "Allow authenticated select"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can insert their own profile, or admins can insert
create policy "Allow insert self or admin"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id or public.is_admin());

-- Users can update their own profile, or admins can update any profile
create policy "Allow update self or admin"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- 5. Trigger to automatically create profile on signup (1st user becomes admin)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count int;
  initial_role text;
begin
  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    initial_role := 'admin';
  else
    initial_role := 'staff';
  end if;

  insert into public.profiles (id, email, full_name, role, status, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    initial_role,
    'active',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`
