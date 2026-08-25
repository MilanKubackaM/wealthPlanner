-- Reviews. Run once in the Supabase SQL editor.
--
-- Two deliberate choices, both worth keeping:
--
--   * `status` defaults to 'pending'. Nothing a stranger submits appears on the site until a
--     human approves it. A public write endpoint on a free product will eventually receive spam
--     and abuse, and this site is somebody's portfolio piece.
--
--   * The throttle lives in its own table and holds only a SALTED HASH of an address, never the
--     address. It is a counter, not a log, and it is purged.
--
-- Row-level security is ON for both tables and NO policy grants anonymous access. Every read and
-- write goes through the Next.js route handler using the service key, which bypasses RLS — so the
-- anon key is never needed in the browser and neither table is reachable from the internet.

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  rating      smallint    not null check (rating between 1 and 5),
  text        text        check (char_length(text) <= 500),
  name        text        check (char_length(name) <= 40),
  locale      text        not null check (locale in ('cs', 'sk')),
  status      text        not null default 'pending'
                          check (status in ('pending', 'approved', 'hidden')),
  created_at  timestamptz not null default now()
);

comment on table public.reviews is
  'Visitor ratings. Nothing here comes from anyone''s financial plan — the API accepts a rating, an optional sentence and an optional display name, and nothing else.';
comment on column public.reviews.status is
  'pending until a human approves it. Only approved rows are ever served to the site.';

create index if not exists reviews_public_idx
  on public.reviews (status, created_at desc);

create table if not exists public.review_throttle (
  id          bigserial primary key,
  ip_hash     text        not null,
  created_at  timestamptz not null default now()
);

comment on column public.review_throttle.ip_hash is
  'sha256(secret salt + address). One-way, and useless without the salt, which lives only in the deployment environment.';

create index if not exists review_throttle_lookup_idx
  on public.review_throttle (ip_hash, created_at desc);

alter table public.reviews         enable row level security;
alter table public.review_throttle enable row level security;

-- Retention. The throttle window is 24 hours, so anything older is dead weight that would turn a
-- counter into a log. Schedule this daily (Supabase -> Integrations -> Cron):
--
--   delete from public.review_throttle where created_at < now() - interval '7 days';

-- Moderation, by hand:
--
--   select id, rating, name, text, locale, created_at
--     from public.reviews where status = 'pending' order by created_at;
--
--   update public.reviews set status = 'approved' where id = '...';
--   update public.reviews set status = 'hidden'   where id = '...';
