-- CareVault schema for Supabase Postgres. Run this in the SQL editor of a new project.
-- All application tables have row-level security enabled; records are owner-isolated.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  relationship text not null default 'Other' check (char_length(relationship) <= 40),
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid references public.people(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  document_type text not null default 'other' check (document_type in ('prescription','lab_report','scan','discharge_summary','bill','vaccination','other')),
  record_date date,
  doctor_name text,
  hospital_name text,
  summary text not null default '',
  extracted_text text not null default '',
  tags text[] not null default '{}',
  medicines jsonb not null default '[]'::jsonb,
  lab_values jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_status text not null default 'needs_review' check (review_status in ('confirmed','needs_review')),
  is_favorite boolean not null default false,
  file_path text,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  content_hash char(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_owner_created_idx on public.people (owner_id, created_at);
create index if not exists medical_records_owner_date_idx on public.medical_records (owner_id, record_date desc nulls last, created_at desc);
create index if not exists medical_records_person_date_idx on public.medical_records (person_id, record_date desc nulls last, created_at desc);
create index if not exists medical_records_hash_idx on public.medical_records (owner_id, content_hash) where content_hash is not null;

-- Immutable helper to safely include text arrays in index expressions
create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text language sql immutable parallel safe as $$
  select array_to_string(arr, sep);
$$;

create index if not exists medical_records_search_gin_idx on public.medical_records using gin (
  to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(doctor_name, '') || ' ' || coalesce(hospital_name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(extracted_text, '') || ' ' || public.immutable_array_to_string(tags, ' '))
);
create index if not exists medical_records_tags_idx on public.medical_records using gin (tags);
create index if not exists medical_records_title_trgm_idx on public.medical_records using gin (title extensions.gin_trgm_ops);
create index if not exists medical_records_doctor_trgm_idx on public.medical_records using gin (doctor_name extensions.gin_trgm_ops);

alter table public.people enable row level security;
alter table public.medical_records enable row level security;

-- Policies are intentionally owner-scoped and fail closed.
drop policy if exists "people owner can read" on public.people;
create policy "people owner can read" on public.people for select to authenticated using (owner_id = auth.uid());
drop policy if exists "people owner can insert" on public.people;
create policy "people owner can insert" on public.people for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "people owner can update" on public.people;
create policy "people owner can update" on public.people for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "people owner can delete" on public.people;
create policy "people owner can delete" on public.people for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "records owner can read" on public.medical_records;
create policy "records owner can read" on public.medical_records for select to authenticated using (owner_id = auth.uid());
drop policy if exists "records owner can insert" on public.medical_records;
create policy "records owner can insert" on public.medical_records for insert to authenticated with check (
  owner_id = auth.uid() and
  (person_id is null or exists (select 1 from public.people p where p.id = person_id and p.owner_id = auth.uid()))
);
drop policy if exists "records owner can update" on public.medical_records;
create policy "records owner can update" on public.medical_records for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and
  (person_id is null or exists (select 1 from public.people p where p.id = person_id and p.owner_id = auth.uid()))
);
drop policy if exists "records owner can delete" on public.medical_records;
create policy "records owner can delete" on public.medical_records for delete to authenticated using (owner_id = auth.uid());

grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.medical_records to authenticated;

-- Private bucket: files are stored under <auth-user-id>/<person-id>/<random>-filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-records', 'medical-records', false, 15728640, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private record files owner can read" on storage.objects;
create policy "private record files owner can read" on storage.objects for select to authenticated
using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record files owner can upload" on storage.objects;
create policy "private record files owner can upload" on storage.objects for insert to authenticated
with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record files owner can update" on storage.objects;
create policy "private record files owner can update" on storage.objects for update to authenticated
using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record files owner can delete" on storage.objects;
create policy "private record files owner can delete" on storage.objects for delete to authenticated
using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);

-- Create a default profile for every new authenticated account.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.people (owner_id, full_name, relationship)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'My records'),
    'Me'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.search_medical_records(search_text text, person_filter uuid default null)
returns setof public.medical_records
language sql
stable
set search_path = public, extensions
as $$
  select r.*
  from public.medical_records r
  where r.owner_id = auth.uid()
    and (person_filter is null or r.person_id = person_filter)
    and (
      coalesce(trim(search_text), '') = ''
      or to_tsvector('simple'::regconfig, coalesce(r.title, '') || ' ' || coalesce(r.doctor_name, '') || ' ' || coalesce(r.hospital_name, '') || ' ' || coalesce(r.summary, '') || ' ' || coalesce(r.extracted_text, '') || ' ' || public.immutable_array_to_string(r.tags, ' '))
         @@ websearch_to_tsquery('simple'::regconfig, search_text)
      or r.title ilike '%' || search_text || '%'
      or coalesce(r.doctor_name, '') ilike '%' || search_text || '%'
      or coalesce(r.hospital_name, '') ilike '%' || search_text || '%'
      or similarity(coalesce(r.title, ''), search_text) > 0.22
      or similarity(coalesce(r.doctor_name, ''), search_text) > 0.28
      -- Small, transparent query-expansion rules for common names used for blood-sugar tests.
      or (lower(search_text) ~ '(sugar|glucose|hba1c|a1c|fbs|fasting blood)'
          and lower(coalesce(r.title, '') || ' ' || coalesce(r.extracted_text, '') || ' ' || coalesce(r.summary, ''))
              ~ '(glucose|hba1c|a1c|fasting blood sugar|fasting glucose|glycated haemoglobin|glycated hemoglobin|fbs)')
      or (lower(search_text) ~ '(thyroid|tsh|t3|t4)'
          and lower(coalesce(r.title, '') || ' ' || coalesce(r.extracted_text, '') || ' ' || coalesce(r.summary, ''))
              ~ '(thyroid|tsh|free t3|free t4|triiodothyronine|thyroxine)')
    )
  order by
    case when coalesce(trim(search_text), '') = '' then 0 else ts_rank(
      to_tsvector('simple'::regconfig, coalesce(r.title, '') || ' ' || coalesce(r.doctor_name, '') || ' ' || coalesce(r.hospital_name, '') || ' ' || coalesce(r.summary, '') || ' ' || coalesce(r.extracted_text, '') || ' ' || public.immutable_array_to_string(r.tags, ' ')),
      websearch_to_tsquery('simple'::regconfig, search_text)
    ) end desc,
    r.record_date desc nulls last,
    r.created_at desc
  limit 200;
$$;

grant execute on function public.search_medical_records(text, uuid) to authenticated;

-- Mobile app + expanded product-plan additions. Safe to run after the original schema.
create extension if not exists pgcrypto with schema extensions;
alter table public.medical_records add column if not exists is_sensitive boolean not null default false;

create table if not exists public.record_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  record_id uuid not null references public.medical_records(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  page_order integer not null default 0,
  content_hash text,
  created_at timestamptz not null default now(),
  unique(record_id, page_order)
);
create index if not exists record_attachments_owner_record_idx on public.record_attachments(owner_id, record_id, page_order);
alter table public.record_attachments enable row level security;
drop policy if exists "attachments owner can read" on public.record_attachments;
create policy "attachments owner can read" on public.record_attachments for select to authenticated using (owner_id = auth.uid());
drop policy if exists "attachments owner can insert" on public.record_attachments;
create policy "attachments owner can insert" on public.record_attachments for insert to authenticated with check (owner_id = auth.uid() and exists (select 1 from public.medical_records r where r.id = record_id and r.owner_id = auth.uid()));
drop policy if exists "attachments owner can update" on public.record_attachments;
create policy "attachments owner can update" on public.record_attachments for update to authenticated using (owner_id = auth.uid() and exists (select 1 from public.medical_records r where r.id = record_id and r.owner_id = auth.uid())) with check (owner_id = auth.uid() and exists (select 1 from public.medical_records r where r.id = record_id and r.owner_id = auth.uid()));
drop policy if exists "attachments owner can delete" on public.record_attachments;
create policy "attachments owner can delete" on public.record_attachments for delete to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.record_attachments to authenticated;

create table if not exists public.follow_up_reminders (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id uuid references public.people(id) on delete set null, record_id uuid references public.medical_records(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160), note text not null default '', remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')), notification_id text,
  created_at timestamptz not null default now()
);
alter table public.follow_up_reminders enable row level security;
drop policy if exists "reminders owner all" on public.follow_up_reminders;
create policy "reminders owner all" on public.follow_up_reminders for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.follow_up_reminders to authenticated;

create table if not exists public.emergency_profiles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blood_group text not null default '', allergies text not null default '', conditions text not null default '', emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '', notes text not null default '', updated_at timestamptz not null default now(), unique(owner_id)
);
alter table public.emergency_profiles enable row level security;
drop policy if exists "emergency profile owner all" on public.emergency_profiles;
create policy "emergency profile owner all" on public.emergency_profiles for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.emergency_profiles to authenticated;

create table if not exists public.record_shares (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  record_id uuid not null references public.medical_records(id) on delete cascade, token_hash text not null unique,
  expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists record_shares_owner_idx on public.record_shares(owner_id, created_at desc);
alter table public.record_shares enable row level security;
drop policy if exists "shares owner can read" on public.record_shares;
create policy "shares owner can read" on public.record_shares for select to authenticated using (owner_id = auth.uid());
drop policy if exists "shares owner can insert" on public.record_shares;
create policy "shares owner can insert" on public.record_shares for insert to authenticated with check (owner_id = auth.uid() and exists (select 1 from public.medical_records r where r.id = record_id and r.owner_id = auth.uid()));
drop policy if exists "shares owner can update" on public.record_shares;
create policy "shares owner can update" on public.record_shares for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "shares owner can delete" on public.record_shares;
create policy "shares owner can delete" on public.record_shares for delete to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.record_shares to authenticated;

create or replace function public.get_shared_record(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', r.id, 'title', r.title, 'document_type', r.document_type, 'record_date', r.record_date,
    'doctor_name', r.doctor_name, 'hospital_name', r.hospital_name, 'summary', r.summary,
    'tags', r.tags, 'medicines', r.medicines, 'lab_values', r.lab_values,
    'expires_at', s.expires_at
  )
  from public.record_shares s
  join public.medical_records r on r.id = s.record_id and r.owner_id = s.owner_id
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now() and s.revoked_at is null
  limit 1;
$$;
revoke all on function public.get_shared_record(text) from public;
grant execute on function public.get_shared_record(text) to anon, authenticated;

-- The file bucket stays private. Policies below support multi-page record attachments.
drop policy if exists "private record attachments owner can read" on storage.objects;
create policy "private record attachments owner can read" on storage.objects for select to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record attachments owner can upload" on storage.objects;
create policy "private record attachments owner can upload" on storage.objects for insert to authenticated with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record attachments owner can update" on storage.objects;
create policy "private record attachments owner can update" on storage.objects for update to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private record attachments owner can delete" on storage.objects;
create policy "private record attachments owner can delete" on storage.objects for delete to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);

-- Subscription foundation for CareVault Premium.
-- IMPORTANT: subscription rows are written only by a trusted server/webhook using service_role.
-- Never let a mobile client grant itself paid access.
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  plan_key text not null default 'free' check (plan_key in ('free','premium')),
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','cancelled','expired','refunded')),
  billing_provider text check (billing_provider in ('google_play','app_store','web','manual')),
  provider_customer_id text,
  provider_subscription_id text,
  provider_product_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start)
);
create index if not exists user_subscriptions_status_end_idx on public.user_subscriptions(status, current_period_end);
alter table public.user_subscriptions enable row level security;
drop policy if exists "subscription owner can read" on public.user_subscriptions;
create policy "subscription owner can read" on public.user_subscriptions for select to authenticated using (owner_id = auth.uid());
revoke insert, update, delete on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

-- Server-side usage accounting; no direct client read/write. API should increment after
-- successful operations and enforce quotas server-side, not from UI state.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('ai_read','ocr_page','storage_upload','share_created','smart_search')),
  quantity integer not null default 1 check (quantity > 0 and quantity <= 10000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_owner_type_created_idx on public.usage_events(owner_id, event_type, created_at desc);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
