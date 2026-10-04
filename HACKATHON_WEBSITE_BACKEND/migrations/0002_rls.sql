-- ===========================================================================
-- HackRadar — 0002_rls.sql
--
-- Row Level Security. Two access paths exist and both are safe:
--
--   1. The browser talks to Supabase directly with the ANON key (Realtime
--      subscriptions, optional direct reads). These policies govern it.
--   2. The Node backend talks with the SERVICE_ROLE key, which bypasses RLS.
--      The backend is responsible for scoping every query to the authenticated
--      user id it resolved from a verified JWT — see server/services/auth.js.
--
-- Nothing here grants anonymous users write access to anything.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.hackathons                enable row level security;
alter table public.profiles                  enable row level security;
alter table public.bookmarks                 enable row level security;
alter table public.project_ideas             enable row level security;
alter table public.notifications             enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.push_subscriptions        enable row level security;
alter table public.sync_logs                 enable row level security;
alter table public.app_meta                  enable row level security;

-- ---------------------------------------------------------------------------
-- hackathons — public catalogue, read-only for everyone.
-- Writes happen exclusively through the backend's service-role client.
-- ---------------------------------------------------------------------------
drop policy if exists "hackathons are publicly readable" on public.hackathons;
create policy "hackathons are publicly readable"
  on public.hackathons for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles — a user sees and edits only their own row.
-- ---------------------------------------------------------------------------
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Password hashes are never exposed through the anon client's table access.
-- (RLS cannot hide a column, so revoke column-level access to it entirely.)
revoke select (password_hash) on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- bookmarks — strictly owner-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists "users manage own bookmarks" on public.bookmarks;
create policy "users manage own bookmarks"
  on public.bookmarks for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- project_ideas — strictly owner-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists "users manage own project ideas" on public.project_ideas;
create policy "users manage own project ideas"
  on public.project_ideas for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications — strictly owner-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT policy: notifications are created by the backend only, so a
-- compromised client token cannot forge one.

-- ---------------------------------------------------------------------------
-- notification_subscriptions — strictly owner-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists "users manage own subscriptions" on public.notification_subscriptions;
create policy "users manage own subscriptions"
  on public.notification_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions — strictly owner-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sync_logs — publicly readable so the Data Sources page can show real run
-- history to anonymous visitors. Read-only; writes are backend-only.
-- ---------------------------------------------------------------------------
drop policy if exists "sync logs are publicly readable" on public.sync_logs;
create policy "sync logs are publicly readable"
  on public.sync_logs for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- app_meta — publicly readable (it holds only sync timestamps).
-- ---------------------------------------------------------------------------
drop policy if exists "app meta is publicly readable" on public.app_meta;
create policy "app meta is publicly readable"
  on public.app_meta for select
  to anon, authenticated
  using (true);

-- ===========================================================================
-- Realtime
--
-- Opt the catalogue and the notification feed into the Realtime publication so
-- the browser client receives postgres_changes without extra configuration.
-- `hackathons` powers live discovery; `notifications` powers the unread badge.
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping realtime opt-in';
  else
    begin
      alter publication supabase_realtime add table public.hackathons;
    exception when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

-- ===========================================================================
-- Service-role note
--
-- The backend's service-role key bypasses the policies above. That is intended:
-- every backend query for user data is scoped by `userId`, which comes from a
-- verified session (Supabase `auth.getUser(token)` or a locally signed HS256
-- JWT). Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
-- ===========================================================================