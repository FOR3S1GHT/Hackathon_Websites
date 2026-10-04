-- ===========================================================================
-- HackRadar — 0001_schema.sql
--
-- Creates every table the backend needs. Column names match the snake_case
-- mapping in server/db/supabaseStore.js (toRow / fromRow) exactly.
--
-- Run this in the Supabase SQL editor, or with:
--   supabase db push
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- hackathons — the catalogue, one row per event per source
-- ---------------------------------------------------------------------------
create table if not exists public.hackathons (
  id                    uuid primary key default gen_random_uuid(),
  title                 text        not null,
  slug                  text        not null,
  description           text,
  summary               text,
  organizer             text,
  banner_url            text,
  official_url          text,
  registration_url      text,
  source_url            text,
  source_name           text        not null,
  source_event_id       text        not null,
  category              text,
  technologies          text[]      not null default '{}',
  themes                text[]      not null default '{}',
  start_date            timestamptz,
  end_date              timestamptz,
  registration_deadline timestamptz,
  event_format          text,
  location              text,
  country               text,
  prize_pool            numeric,
  currency              text,
  eligibility           text,
  eligibility_level     text,
  beginner_friendly     boolean,
  team_size             text,
  judging_criteria      text,
  resources             jsonb       not null default '[]'::jsonb,
  faq                   jsonb       not null default '[]'::jsonb,
  status                text,
  is_paid               boolean,
  is_free               boolean,
  featured              boolean     not null default false,
  registration_open     boolean,
  participant_count     integer,
  competition_type      text        not null default 'hackathon',
  -- When the SOURCE says it published the listing. Null for sources that do not
  -- expose it (most of them). Never conflate this with the two columns below.
  source_published_at   timestamptz,
  -- When HACKRADAR first saw this event. Powers "recently added".
  first_discovered_at   timestamptz not null default now(),
  -- When HackRadar last re-fetched this record from its source.
  last_verified_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint hackathons_source_key unique (source_name, source_event_id),
  constraint hackathons_slug_unique unique (slug),
  constraint hackathons_category_known check (
    category is null or category in (
      'artificial-intelligence', 'machine-learning', 'web-development',
      'app-development', 'cybersecurity', 'blockchain-web3', 'game-development',
      'robotics', 'cloud-computing', 'open-innovation', 'sustainability',
      'fintech', 'ui-ux-design', 'data-science'
    )
  ),
  constraint hackathons_format_known check (
    event_format is null or event_format in ('online', 'offline', 'hybrid', 'unknown')
  ),
  constraint hackathons_prize_non_negative check (prize_pool is null or prize_pool >= 0)
);

comment on column public.hackathons.source_published_at is
  'Publish date published by the source. Frequently null: most platforms do not expose it.';
comment on column public.hackathons.first_discovered_at is
  'When HackRadar first stored this event. This is NOT the organiser''s publish date.';
comment on column public.hackathons.last_verified_at is
  'When HackRadar last successfully re-fetched this event from its source.';

-- Indexes tuned for the actual query shapes in services/search.js.
create index if not exists hackathons_status_idx          on public.hackathons (status);
create index if not exists hackathons_category_idx        on public.hackathons (category);
create index if not exists hackathons_start_date_idx      on public.hackathons (start_date desc);
create index if not exists hackathons_reg_deadline_idx   on public.hackathons (registration_deadline);
create index if not exists hackathons_discovered_idx     on public.hackathons (first_discovered_at desc);
create index if not exists hackathons_featured_idx        on public.hackathons (featured) where featured = true;
create index if not exists hackathons_technologies_gin    on public.hackathons using gin (technologies);
create index if not exists hackathons_themes_gin          on public.hackathons using gin (themes);
create index if not exists hackathons_country_idx        on public.hackathons (country);
create index if not exists hackathons_source_name_idx     on public.hackathons (source_name);
-- Trigram/full-text support for the search box.
create index if not exists hackathons_search_idx on public.hackathons
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(organizer, '') || ' ' || coalesce(summary, '') || ' ' || array_to_string(technologies, ' ')));

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text,
  email                    text,
  avatar_url               text,
  -- Only populated by the built-in local auth fallback. When Supabase Auth is
  -- configured these stay null and Supabase handles credentials.
  password_hash            text,
  auth_provider            text        not null default 'supabase',
  preferred_categories     text[]      not null default '{}',
  preferred_technologies   text[]      not null default '{}',
  notification_preferences jsonb       not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- bookmarks
-- ---------------------------------------------------------------------------
create table if not exists public.bookmarks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  note         text,
  created_at   timestamptz not null default now(),

  constraint bookmarks_unique unique (user_id, hackathon_id)
);

create index if not exists bookmarks_user_idx      on public.bookmarks (user_id);
create index if not exists bookmarks_hackathon_idx on public.bookmarks (hackathon_id);

-- ---------------------------------------------------------------------------
-- project_ideas — generated (or user-written) project suggestions
-- ---------------------------------------------------------------------------
create table if not exists public.project_ideas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  hackathon_id          uuid references public.hackathons (id) on delete set null,
  hackathon_title       text,
  title                 text        not null,
  description           text,
  problem               text,
  target_users          text,
  difficulty            text        not null default 'intermediate',
  technologies          text[]      not null default '{}',
  key_features          text[]      not null default '{}',
  implementation_steps  text[]      not null default '{}',
  estimated_time        text,
  demo_tips             text[]      not null default '{}',
  source                text        not null default 'rule-based',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint project_ideas_difficulty_known check (
    difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  -- Distinguishes rule-based from AI-generated so the UI can label them honestly.
  constraint project_ideas_source_known check (source in ('rule-based', 'ai', 'user'))
);

create index if not exists project_ideas_user_idx      on public.project_ideas (user_id);
create index if not exists project_ideas_hackathon_idx on public.project_ideas (hackathon_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  hackathon_id uuid references public.hackathons (id) on delete cascade,
  title        text        not null,
  message      text        not null,
  type         text        not null default 'discovery',
  -- Deterministic key. The unique index below is what makes retries and
  -- overlapping sync runs unable to double-alert a user.
  dedupe_key   text        not null,
  metadata     jsonb       not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint notifications_dedupe_unique unique (user_id, dedupe_key),
  constraint notifications_type_known check (
    type in ('discovery', 'deadline', 'digest', 'system', 'category')
  )
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx     on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- notification_subscriptions — opt-in, never implicit
-- ---------------------------------------------------------------------------
create table if not exists public.notification_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  subscription_type text        not null,
  subscription_data jsonb       not null default '{}'::jsonb,
  active            boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint notification_subscriptions_unique unique (user_id, subscription_type)
);

create index if not exists notification_subscriptions_active_idx
  on public.notification_subscriptions (subscription_type) where active = true;

-- ---------------------------------------------------------------------------
-- push_subscriptions — browser push endpoints
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null,
  p256dh     text,
  auth       text,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint push_subscriptions_unique unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- sync_logs — one row per source per run
-- ---------------------------------------------------------------------------
create table if not exists public.sync_logs (
  id                uuid primary key default gen_random_uuid(),
  source_name       text        not null,
  sync_started_at   timestamptz not null default now(),
  sync_completed_at timestamptz,
  status            text        not null,
  events_discovered integer     not null default 0,
  events_updated    integer     not null default 0,
  error_message     text,
  duration_ms       integer,

  constraint sync_logs_status_known check (status in ('success', 'failed', 'skipped', 'partial'))
);

create index if not exists sync_logs_started_idx   on public.sync_logs (sync_started_at desc);
create index if not exists sync_logs_source_idx    on public.sync_logs (source_name, sync_started_at desc);
create index if not exists sync_logs_success_idx   on public.sync_logs (sync_completed_at desc) where status = 'success';

-- ---------------------------------------------------------------------------
-- app_meta — small key/value store (lastSyncAt and similar)
-- ---------------------------------------------------------------------------
create table if not exists public.app_meta (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_meta (key, value)
values ('lastSyncAt', 'null'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hackathons_touch_updated_at on public.hackathons;
create trigger hackathons_touch_updated_at
  before update on public.hackathons
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists project_ideas_touch_updated_at on public.project_ideas;
create trigger project_ideas_touch_updated_at
  before update on public.project_ideas
  for each row execute function public.touch_updated_at();

drop trigger if exists notification_subscriptions_touch_updated_at on public.notification_subscriptions;
create trigger notification_subscriptions_touch_updated_at
  before update on public.notification_subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a Supabase Auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url, auth_provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    'supabase'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Full-text search helper used by the Supabase datastore's `q` parameter.
-- ---------------------------------------------------------------------------
create or replace function public.search_hackathons(search_text text)
returns setof public.hackathons
language sql
stable
as $$
  select *
  from public.hackathons
  where
    search_text is null
    or search_text = ''
    or to_tsvector('english',
         coalesce(title, '') || ' ' ||
         coalesce(organizer, '') || ' ' ||
         coalesce(summary, '') || ' ' ||
         coalesce(description, '') || ' ' ||
         array_to_string(technologies, ' ') || ' ' ||
         array_to_string(themes, ' '))
       @@ plainto_tsquery('english', search_text)
  order by first_discovered_at desc;
$$;