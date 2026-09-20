-- Pulse schema. lib/db.js applies this idempotently on cold start, this file is
-- the readable copy. Multi-tenant from day one: every row hangs off a site, and
-- every site hangs off an account, so selling this later is a login screen,
-- not a rewrite.

create table if not exists accounts (
  id          text primary key,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists sites (
  id               text primary key,             -- public site key used by the snippet
  account_id       text not null default 'ryder' references accounts(id),
  name             text not null,
  domain           text not null,                -- bare host, e.g. simplysaltdelivery.com
  ga4_property_id  text default '',              -- numeric GA4 property (the number after p)
  gsc_property     text default '',              -- e.g. https://www.simplysaltdelivery.com/ or sc-domain:example.com
  timezone         text not null default 'America/Chicago',
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- One row per thing a visitor did. Everything on the dashboard is a query over
-- this table, so numbers always come from real records, never from a plan field.
create table if not exists events (
  id           bigserial primary key,
  site_id      text not null references sites(id) on delete cascade,
  type         text not null,        -- pageview | call | email | sms | form | booking | outbound | click | leave | custom | call_tap | form_attempt
  path         text not null default '/',
  title        text default '',
  visitor_id   text not null,
  session_id   text not null,
  referrer     text default '',
  ref_host     text default '',
  utm_source   text default '',
  utm_medium   text default '',
  utm_campaign text default '',
  label        text default '',      -- button text / form name / custom event name
  href         text default '',      -- tel:/mailto:/outbound target
  value        numeric,              -- scroll depth %, engaged seconds, call duration
  device       text default '',      -- mobile | tablet | desktop
  country      text default '',
  ua           text default '',
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists events_site_time    on events (site_id, created_at desc);
create index if not exists events_site_session on events (site_id, session_id, created_at);
create index if not exists events_site_type    on events (site_id, type, created_at desc);

-- Cached Google pulls so the dashboard does not hit GA4/GSC on every click.
create table if not exists google_cache (
  key         text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

insert into accounts (id, name) values ('ryder', 'Ryder Schilling LLC')
  on conflict (id) do nothing;

-- Added for the cross-site Portfolio page: when the site went live under
-- Ryder (day 0 for the "first 60 days" math) and its niche for averages.
alter table sites add column if not exists launched_at date;

alter table sites add column if not exists niche text not null default '';

-- GA4 history pulled through the reporter service account, one row per site
-- per day. Portfolio uses it for days before the snippet was installed.
create table if not exists ga_daily (
  site_id     text not null references sites(id) on delete cascade,
  day         date not null,
  users       int not null default 0,
  sessions    int not null default 0,
  pageviews   int not null default 0,
  engaged     int not null default 0,
  calls       int not null default 0,
  forms       int not null default 0,
  emails      int not null default 0,
  bookings    int not null default 0,
  fetched_at  timestamptz not null default now(),
  primary key (site_id, day)
);

-- ---- Round 2 (2026-09-19 audit) ----

-- Hosts other than `domain` that may send events (a vercel.app preview while
-- the real domain is not attached yet). Comma separated. Everything else is
-- dropped by /api/collect so localhost and previews never count.
alter table sites add column if not exists extra_hosts text not null default '';

-- Per-site override of which GA4 event names count as which lead type, as
-- "event=bucket" pairs: "call_click=call,lead_form_submit=form". Empty means
-- the exact default allowlist in lib/google.js.
alter table sites add column if not exists ga4_lead_events text not null default '';

-- Where real forms are counted from: 'snippet' (the submit event on the page)
-- or 'webhook' (the site's form handler posts to /api/lead after a successful
-- send). With 'webhook', snippet submits are stored as form_attempt and do not
-- count as leads.
alter table sites add column if not exists form_source text not null default 'snippet';

-- Call tracking. When tracking_number is set, tel: taps on the site are stored
-- as call_tap and the real calls come from Twilio through /api/twilio/*.
alter table sites add column if not exists tracking_number text not null default '';
alter table sites add column if not exists forward_to text not null default '';
alter table sites add column if not exists record_calls boolean not null default false;

-- Secret for the lead webhook and any other server-to-server post.
alter table sites add column if not exists webhook_secret text not null default '';

-- Search Console history, one row per site per day, plus the top queries per
-- day, so ranking growth can be shown month over month instead of a 16-month
-- window that Google throws away.
create table if not exists gsc_daily (
  site_id     text not null references sites(id) on delete cascade,
  day         date not null,
  clicks      int not null default 0,
  impressions int not null default 0,
  ctr         numeric,
  position    numeric,
  fetched_at  timestamptz not null default now(),
  primary key (site_id, day)
);

create table if not exists gsc_queries (
  site_id     text not null references sites(id) on delete cascade,
  day         date not null,
  query       text not null,
  clicks      int not null default 0,
  impressions int not null default 0,
  position    numeric,
  primary key (site_id, day, query)
);

-- Real phone calls through a tracking number (Twilio). One row per call.
create table if not exists calls (
  id            bigserial primary key,
  site_id       text not null references sites(id) on delete cascade,
  call_sid      text not null unique,
  from_number   text not null default '',
  to_number     text not null default '',
  forwarded_to  text not null default '',
  status        text not null default '',   -- completed | no-answer | busy | failed | canceled | ringing
  duration      int not null default 0,     -- seconds the client was on the line
  answered      boolean not null default false,
  caller_city   text not null default '',
  caller_state  text not null default '',
  recording_url text not null default '',
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists calls_site_time on calls (site_id, started_at desc);

-- Real leads posted by a site's own form or booking handler. The message body
-- lives here; the count lives in events (type form/booking, session 'wh:<id>').
create table if not exists leads (
  id          bigserial primary key,
  site_id     text not null references sites(id) on delete cascade,
  kind        text not null default 'form',   -- form | booking | call | custom
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  message     text not null default '',
  path        text not null default '',
  source      text not null default '',       -- resend | formsubmit | square | manual ...
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists leads_site_time on leads (site_id, created_at desc);

-- Daily health snapshot written by the cron: is the snippet reachable on the
-- live site, and when did each source last deliver a row.
create table if not exists site_checks (
  site_id       text not null references sites(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  snippet_found boolean,
  http_status   int,
  note          text not null default '',
  primary key (site_id)
);
