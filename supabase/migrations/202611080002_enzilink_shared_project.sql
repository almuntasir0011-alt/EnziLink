-- EnziLink initial marketplace schema
-- Apply only to the dedicated EnziLink Supabase project (never to EnziVolt).
-- pgcrypto is already enabled on the shared Supabase project.

create type public.el_app_role as enum ('customer', 'worker', 'admin');
create type public.el_request_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.el_response_status as enum ('pending', 'accepted', 'declined', 'withdrawn');

create table public.el_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.el_app_role not null default 'customer',
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_worker_profiles (
  user_id uuid primary key references public.el_profiles(id) on delete cascade,
  headline text,
  bio text,
  years_experience integer check (years_experience is null or years_experience between 0 and 80),
  is_published boolean not null default false,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.el_worker_profiles(user_id) on delete cascade,
  profession text not null,
  skill text,
  created_at timestamptz not null default now()
);

create table public.el_service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.el_profiles(id) on delete restrict,
  title text not null,
  description text not null,
  profession text not null,
  area text not null,
  status public.el_request_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.el_service_requests(id) on delete cascade,
  worker_id uuid not null references public.el_profiles(id) on delete cascade,
  message text,
  status public.el_response_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, worker_id)
);

create table public.el_conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.el_service_requests(id) on delete set null,
  customer_id uuid not null references public.el_profiles(id) on delete restrict,
  worker_id uuid not null references public.el_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_id, customer_id, worker_id),
  check (customer_id <> worker_id)
);

create table public.el_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.el_conversations(id) on delete cascade,
  sender_id uuid not null references public.el_profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.el_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.el_service_requests(id) on delete cascade,
  reviewer_id uuid not null references public.el_profiles(id) on delete cascade,
  worker_id uuid not null references public.el_profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (request_id, reviewer_id),
  check (reviewer_id <> worker_id)
);

create table public.el_user_blocks (
  blocker_id uuid not null references public.el_profiles(id) on delete cascade,
  blocked_id uuid not null references public.el_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.el_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.el_profiles(id) on delete cascade,
  reported_user_id uuid references public.el_profiles(id) on delete set null,
  request_id uuid references public.el_service_requests(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index el_worker_skills_profession_idx on public.el_worker_skills (lower(profession));
create index el_service_requests_search_idx on public.el_service_requests (status, lower(profession), lower(area), created_at desc);
create index el_request_responses_worker_idx on public.el_request_responses (worker_id, created_at desc);
create index el_messages_conversation_idx on public.el_messages (conversation_id, created_at);

-- Create a basic customer profile after signup. Role is never accepted from client metadata.
create or replace function public.el_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.el_profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'customer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_enzilink on auth.users;
create trigger on_auth_user_created_enzilink
  after insert on auth.users
  for each row execute procedure public.el_handle_new_user();

-- Users may opt into the worker role, but cannot assign themselves admin.
create or replace function public.el_become_worker()
returns void language plpgsql security definer set search_path = '' as 'begin
  update public.el_profiles set role = ''worker'', updated_at = now()
  where id = auth.uid() and role = ''customer'';
  if not found then
    raise exception ''Only a customer account can switch to worker'';
  end if;
end;';
revoke all on function public.el_become_worker() from public;
grant execute on function public.el_become_worker() to authenticated;

alter table public.el_profiles enable row level security;
alter table public.el_worker_profiles enable row level security;
alter table public.el_worker_skills enable row level security;
alter table public.el_service_requests enable row level security;
alter table public.el_request_responses enable row level security;
alter table public.el_conversations enable row level security;
alter table public.el_messages enable row level security;
alter table public.el_reviews enable row level security;
alter table public.el_user_blocks enable row level security;
alter table public.el_reports enable row level security;

-- Profile contact details (phone, email, street address) are deliberately not stored here.
create policy "el_profiles_read_self" on public.el_profiles for select to authenticated using (id = (select auth.uid()));
create policy "el_profiles_update_self" on public.el_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.el_profiles from authenticated;
grant update (display_name, area, updated_at) on public.el_profiles to authenticated;

create policy "published_workers_read" on public.el_worker_profiles for select to anon, authenticated using (is_published = true or user_id = (select auth.uid()));
create policy "worker_profile_insert_self" on public.el_worker_profiles for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.el_profiles p where p.id = user_id and p.role = 'worker')
);
create policy "worker_profile_update_self" on public.el_worker_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (select 1 from public.el_profiles p where p.id = user_id and p.role = 'worker'));
revoke update on public.el_worker_profiles from authenticated;
grant update (headline, bio, years_experience, is_published, updated_at) on public.el_worker_profiles to authenticated;

create policy "skills_read_published_workers" on public.el_worker_skills for select to anon, authenticated using (
  exists (select 1 from public.el_worker_profiles wp where wp.user_id = worker_id and (wp.is_published = true or wp.user_id = (select auth.uid())))
);
create policy "skills_manage_self" on public.el_worker_skills for all to authenticated using (worker_id = (select auth.uid())) with check (worker_id = (select auth.uid()));

create policy "requests_read_open_or_owner" on public.el_service_requests for select to authenticated using (status = 'open' or customer_id = (select auth.uid()));
create policy "requests_create_self" on public.el_service_requests for insert to authenticated with check (customer_id = (select auth.uid()));
create policy "requests_update_owner" on public.el_service_requests for update to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

create policy "responses_read_parties" on public.el_request_responses for select to authenticated using (
  worker_id = (select auth.uid()) or exists (select 1 from public.el_service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
);
create policy "responses_create_worker" on public.el_request_responses for insert to authenticated with check (
  worker_id = (select auth.uid()) and exists (select 1 from public.el_profiles p where p.id = worker_id and p.role = 'worker')
);
create policy "responses_update_parties" on public.el_request_responses for update to authenticated using (
  worker_id = (select auth.uid()) or exists (select 1 from public.el_service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
) with check (
  worker_id = (select auth.uid()) or exists (select 1 from public.el_service_requests r where r.id = request_id and r.customer_id = (select auth.uid()))
);

create policy "conversation_participants_read" on public.el_conversations for select to authenticated using (customer_id = (select auth.uid()) or worker_id = (select auth.uid()));
create policy "conversation_participants_create" on public.el_conversations for insert to authenticated with check (
  customer_id = (select auth.uid()) or worker_id = (select auth.uid())
);
create policy "el_messages_participants_read" on public.el_messages for select to authenticated using (
  exists (select 1 from public.el_conversations c where c.id = conversation_id and (c.customer_id = (select auth.uid()) or c.worker_id = (select auth.uid())))
);
create policy "el_messages_participants_send" on public.el_messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and exists (
    select 1 from public.el_conversations c where c.id = conversation_id and (c.customer_id = (select auth.uid()) or c.worker_id = (select auth.uid()))
  )
);

create policy "el_reviews_read_all" on public.el_reviews for select to anon, authenticated using (true);
create policy "el_reviews_create_reviewer" on public.el_reviews for insert to authenticated with check (reviewer_id = (select auth.uid()));

create policy "blocks_read_own" on public.el_user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks_manage_own" on public.el_user_blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

create policy "el_reports_create_self" on public.el_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "el_reports_read_own" on public.el_reports for select to authenticated using (reporter_id = (select auth.uid()));

-- No anonymous access to customer requests, messages, reports, or private account records.


-- Explicit Data API privileges with restrictive profile-column access.
grant select on public.el_worker_profiles, public.el_worker_skills, public.el_reviews to anon, authenticated;
grant select, insert, update on public.el_profiles to authenticated;
grant select, insert, update on public.el_worker_profiles to authenticated;
grant select, insert, update, delete on public.el_worker_skills to authenticated;
grant select, insert, update on public.el_service_requests to authenticated;
grant select, insert, update on public.el_request_responses to authenticated;
grant select, insert on public.el_conversations to authenticated;
grant select, insert on public.el_messages to authenticated;
grant select, insert on public.el_reviews to authenticated;
grant select, insert, delete on public.el_user_blocks to authenticated;
grant select, insert on public.el_reports to authenticated;
revoke all on table public.el_profiles from anon, authenticated;
grant select on table public.el_profiles to authenticated;
grant update (display_name, area, updated_at) on public.el_profiles to authenticated;
revoke all on function public.el_become_worker() from public, anon;
grant execute on function public.el_become_worker() to authenticated;
revoke all on function public.el_handle_new_user() from public, anon, authenticated;
