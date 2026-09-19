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
  type         text not null,        -- pageview | call | email | sms | form | booking | outbound | click | scroll | leave | custom
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
  value        numeric,              -- scroll depth %, engaged seconds, etc.
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
