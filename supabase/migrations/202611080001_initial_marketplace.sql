-- EnziLink initial marketplace schema
-- Apply only to the dedicated EnziLink Supabase project (never to EnziVolt).
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'worker', 'admin');
create type public.request_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.response_status as enum ('pending', 'accepted', 'declined', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.app_role not null default 'customer',
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  headline text,
  bio text,
  years_experience integer check (years_experience is null or years_experience between 0 and 80),
  is_published boolean not null default false,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  profession text not null,
  skill text,
  created_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null,
  profession text not null,
  area text not null,
  status public.request_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status public.response_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, worker_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_id, customer_id, worker_id),
  check (customer_id <> worker_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (request_id, reviewer_id),
  check (reviewer_id <> worker_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  request_id uuid references public.service_requests(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index worker_skills_profession_idx on public.worker_skills (lower(profession));
create index service_requests_search_idx on public.service_requests (status, lower(profession), lower(area), created_at desc);
create index request_responses_worker_idx on public.request_responses (worker_id, created_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Create a basic customer profile after signup. Role is never accepted from client metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'customer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Users may opt into the worker role, but cannot assign themselves admin.
create or replace function public.become_worker()
returns void language plpgsql security definer set search_path = '' as $
begin
  update public.profiles set role = 'worker', updated_at = now()
  where id = auth.uid() and role = 'customer';
  if not found then
    raise exception 'Only a customer account can switch to worker';
  end if;
end;
$;
revoke all on function public.become_worker() from public;
grant execute on function public.become_worker() to authenticated;

alter table public.profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.worker_skills enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_responses enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

-- Profile contact details (phone, email, street address) are deliberately not stored here.
create policy "profiles_read_self" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (display_name, area, updated_at) on public.profiles to authenticated;

create policy "published_workers_read" on public.worker_profiles for select to anon, authenticated using (is_published = true or user_id = (select auth.uid()));
create policy "worker_profile_insert_self" on public.worker_profiles for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = user_id and p.role = 'worker')
);
create policy "worker_profile_update_self" on public.worker_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = user_id and p.role = 'worker'));
revoke update on public.worker_profiles from authenticated;
grant update (headline, bio, years_experience, is_published, updated_at) on public.worker_profiles to authenticated;

create policy "skills_read_published_workers" on public.worker_skills for select to anon, authenticated using (
  exists (select 1 from public.worker_profiles wp where wp.user_id = worker_id and (wp.is_published = true or wp.user_id = (select auth.uid())))
);
create policy "skills_manage_self" on public.worker_skills for all to authenticated using (worker_id = (select auth.uid())) with check (worker_id = (select auth.uid()));

create policy "requests_read_open_or_owner" on public.service_requests for select to authenticated using (status = 'open' or customer_id = (select auth.uid()));
create policy "requests_create_self" on public.service_requests for insert to authenticated with check (customer_id = (select auth.uid()));
create policy "requests_update_owner" on public.service_requests for update to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

create policy "responses_read_parties" on public.request_responses for select to authenticated using (
  worker_id = (select auth.uid()) or exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
);
create policy "responses_create_worker" on public.request_responses for insert to authenticated with check (
  worker_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = worker_id and p.role = 'worker')
);
create policy "responses_update_parties" on public.request_responses for update to authenticated using (
  worker_id = (select auth.uid()) or exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
) with check (
  worker_id = (select auth.uid()) or exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
);

create policy "conversation_participants_read" on public.conversations for select to authenticated using (customer_id = (select auth.uid()) or worker_id = (select auth.uid()));
create policy "conversation_participants_create" on public.conversations for insert to authenticated with check (
  customer_id = (select auth.uid()) or worker_id = (select auth.uid())
);
create policy "messages_participants_read" on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.customer_id = (select auth.uid()) or c.worker_id = (select auth.uid())))
);
create policy "messages_participants_send" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and exists (
    select 1 from public.conversations c where c.id = conversation_id and (c.customer_id = (select auth.uid()) or c.worker_id = (select auth.uid()))
  )
);

create policy "reviews_read_all" on public.reviews for select to anon, authenticated using (true);
create policy "reviews_create_reviewer" on public.reviews for insert to authenticated with check (reviewer_id = (select auth.uid()));

create policy "blocks_read_own" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks_manage_own" on public.user_blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

create policy "reports_create_self" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "reports_read_own" on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

-- No anonymous access to customer requests, messages, reports, or private account records.
