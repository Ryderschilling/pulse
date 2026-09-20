// Every number here is a query over real records. Nothing is projected or
// averaged into a stat tile; a day with no records renders as empty.
//
// Definitions (locked 2026-09-19):
//   visitor   = a distinct visitor_id that viewed a page (an "impression")
//   session   = a distinct session_id with at least one page view
//   engaged   = a session that saw 2+ pages, or stayed 10s+, or scrolled 25%+,
//               or did a lead action. This is the headline visitor number.
//   lead      = one session doing one kind of contact action once. Three taps
//               on the phone number in one visit is one call. Types: call,
//               form, email, booking, sms, custom.
//   day       = midnight to midnight in the site's own timezone, everywhere.
//   GA4 days  = for days with no Pulse page views, the GA4 history row fills in
//               (visitors, sessions, page views, engaged, and any lead events
//               GA4 itself logged). Flows, click maps, referrers and devices
//               have no GA4 equivalent and stay Pulse-only.
import { q } from "@/lib/db";

export const CONV_TYPES = ["call", "form", "email", "booking", "sms", "custom"];
const CONV_SQL = `type in ('call','form','email','booking','sms','custom')`;
// One lead per session per type.
const LEAD = (t) => `count(distinct session_id) filter (where type='${t}')::int`;
const LEADS_ALL = `count(distinct (session_id, type)) filter (where ${CONV_SQL})::int`;
const ENGAGED = `(pv >= 2 or coalesce(secs,0) >= 10 or coalesce(scroll,0) >= 25 or conv)`;

// [from, to] are inclusive calendar days in the site's timezone.
function base(siteId, from, to, tz) {
  // params: $1 from, $2 to, $3 tz, $4 site
  return {
    where: `site_id = $4 and created_at >= ($1::date)::timestamp at time zone $3 and created_at < (($2::date + 1)::timestamp at time zone $3)`,
    day: `to_char(created_at at time zone $3, 'YYYY-MM-DD')`,
    params: [from, to, tz, siteId],
  };
}

// Per-session facts for a range. Used for engaged / bounce / converting.
function sessionsCte(where) {
  return `sess as (
    select session_id, min(visitor_id) as visitor_id,
      count(*) filter (where type='pageview')::int as pv,
      max(value) filter (where type='leave' and value < 1800) as secs,
      max((meta->>'scroll')::numeric) filter (where type='leave' and meta ? 'scroll') as scroll,
      bool_or(${CONV_SQL}) as conv
    from events where ${where} group by session_id
  )`;
}

// GA4 history rows for days in the range that have no Pulse page views.
function gaFillCte() {
  return `gafill as (
    select g.day, g.users, g.sessions, g.pageviews, g.engaged, g.calls, g.forms, g.emails, g.bookings
    from ga_daily g
    where g.site_id = $4 and g.day >= $1::date and g.day <= $2::date
      and not exists (
        select 1 from events e where e.site_id = $4 and e.type='pageview'
          and (e.created_at at time zone $3)::date = g.day
      )
  )`;
}

export async function summary(siteId, from, to, tz) {
  const { where, params } = base(siteId, from, to, tz);
  const [r] = await q(
    `with ${sessionsCte(where)}, ${gaFillCte()}
     select
       count(distinct visitor_id) filter (where type='pageview')::int as visitors,
       count(distinct session_id) filter (where type='pageview')::int as sessions,
       count(*) filter (where type='pageview')::int as pageviews,
       ${LEAD("call")} as calls,
       ${LEAD("form")} as forms,
       ${LEAD("email")} as emails,
       ${LEAD("booking")} as bookings,
       ${LEAD("sms")} as sms,
       ${LEAD("custom")} as custom,
       ${LEADS_ALL} as conversions,
       count(distinct session_id) filter (where ${CONV_SQL})::int as converting_sessions,
       count(*) filter (where type='call_tap')::int as call_taps,
       count(*) filter (where type='form_attempt')::int as form_attempts,
       round(avg(value) filter (where type='leave' and value is not null and value < 1800))::int as avg_seconds,
       round(avg((meta->>'scroll')::numeric) filter (where type='leave' and meta ? 'scroll'))::int as avg_scroll,
       (select count(*)::int from sess where pv >= 1 and ${ENGAGED}) as engaged_sessions,
       (select count(distinct visitor_id)::int from sess where pv >= 1 and ${ENGAGED}) as engaged_visitors,
       (select count(*)::int from sess where pv = 1 and not ${ENGAGED}) as bounced,
       (select coalesce(sum(users),0)::int from gafill) as ga_visitors,
       (select coalesce(sum(sessions),0)::int from gafill) as ga_sessions,
       (select coalesce(sum(pageviews),0)::int from gafill) as ga_pageviews,
       (select coalesce(sum(engaged),0)::int from gafill) as ga_engaged,
       (select coalesce(sum(calls),0)::int from gafill) as ga_calls,
       (select coalesce(sum(forms),0)::int from gafill) as ga_forms,
       (select coalesce(sum(emails),0)::int from gafill) as ga_emails,
       (select coalesce(sum(bookings),0)::int from gafill) as ga_bookings,
       (select count(*)::int from gafill) as ga_days
     from events where ${where}`,
    params
  );
  // Merged view: Pulse plus the GA4 days Pulse did not see. The raw parts are
  // kept on the object so the UI can say which is which.
  const m = {
    ...r,
    pulse_visitors: r.visitors, pulse_sessions: r.sessions, pulse_pageviews: r.pageviews,
    pulse_calls: r.calls, pulse_forms: r.forms, pulse_emails: r.emails, pulse_bookings: r.bookings,
    visitors: r.visitors + r.ga_visitors,
    sessions: r.sessions + r.ga_sessions,
    pageviews: r.pageviews + r.ga_pageviews,
    engaged_sessions: r.engaged_sessions + r.ga_engaged,
    calls: r.calls + r.ga_calls,
    forms: r.forms + r.ga_forms,
    emails: r.emails + r.ga_emails,
    bookings: r.bookings + r.ga_bookings,
  };
  m.conversions = r.conversions + r.ga_calls + r.ga_forms + r.ga_emails + r.ga_bookings;
  return m;
}

export async function daily(siteId, from, to, tz) {
  const { where, day, params } = base(siteId, from, to, tz);
  return q(
    `with ${sessionsCte(where)}, ${gaFillCte()},
     pulse as (
       select ${day} as day,
         count(distinct visitor_id) filter (where type='pageview')::int as visitors,
         count(*) filter (where type='pageview')::int as pageviews,
         count(distinct session_id) filter (where type='pageview')::int as sessions,
         ${LEAD("call")} as calls, ${LEAD("form")} as forms, ${LEAD("email")} as emails, ${LEAD("booking")} as bookings,
         ${LEADS_ALL} as conversions,
         'pulse'::text as src
       from events where ${where} group by 1
       having count(*) filter (where type='pageview') > 0 or count(*) filter (where ${CONV_SQL}) > 0
     ),
     eng as (
       select ${day} as day, count(distinct e.session_id)::int as engaged
       from events e join sess on sess.session_id = e.session_id
       where ${where} and e.type='pageview' and sess.pv >= 1 and ${ENGAGED} group by 1
     )
     select p.day, p.visitors, p.pageviews, p.sessions, p.calls, p.forms, p.emails, p.bookings, p.conversions, coalesce(eng.engaged,0) as engaged, p.src
     from pulse p left join eng on eng.day = p.day
     union all
     select to_char(g.day,'YYYY-MM-DD'), g.users, g.pageviews, g.sessions, g.calls, g.forms, g.emails, g.bookings, g.calls+g.forms+g.emails+g.bookings, g.engaged, 'ga4'
     from gafill g
     where not exists (select 1 from pulse p where p.day = to_char(g.day,'YYYY-MM-DD'))
     order by 1`,
    params
  );
}

export async function pages(siteId, from, to, tz) {
  const { where, params } = base(siteId, from, to, tz);
  return q(
    `with pv as (
       select path, title, visitor_id, session_id, created_at,
              row_number() over (partition by session_id order by created_at) as rn,
              row_number() over (partition by session_id order by created_at desc) as rn_desc
       from events where ${where} and type='pageview'
     ),
     agg as (
       select path,
         max(title) as title,
         count(*)::int as views,
         count(distinct visitor_id)::int as visitors,
         count(*) filter (where rn=1)::int as entries,
         count(*) filter (where rn_desc=1)::int as exits
       from pv group by path
     ),
     lv as (
       select path,
         round(avg(value) filter (where value is not null and value < 1800))::int as avg_seconds,
         round(avg((meta->>'scroll')::numeric) filter (where meta ? 'scroll'))::int as avg_scroll
       from events where ${where} and type='leave' group by path
     ),
     cv as (
       select path, ${LEADS_ALL} as conversions,
         ${LEAD("call")} as calls,
         ${LEAD("form")} as forms
       from events where ${where} and ${CONV_SQL} group by path
     )
     select a.*, l.avg_seconds, l.avg_scroll,
            coalesce(c.conversions,0) as conversions, coalesce(c.calls,0) as calls, coalesce(c.forms,0) as forms
     from agg a left join lv l using (path) left join cv c using (path)
     order by views desc limit 200`,
    params
  );
}

export async function conversions(siteId, from, to, tz) {
  const { where, day, params } = base(siteId, from, to, tz);
  const byType = await q(
    `select type, count(distinct session_id)::int as n, count(*)::int as taps
     from events where ${where} and ${CONV_SQL} group by type order by n desc`,
    params
  );
  const byDay = await q(
    `select ${day} as day, type, count(distinct session_id)::int as n
     from events where ${where} and ${CONV_SQL} group by 1,2 order by 1`,
    params
  );
  const byPage = await q(
    `select path, type, label, count(distinct session_id)::int as n
     from events where ${where} and ${CONV_SQL} group by 1,2,3 order by n desc limit 100`,
    params
  );
  // One row per lead (session + type), showing the first tap.
  const recent = await q(
    `with c as (
       select distinct on (session_id, type) e.* from events e where ${where} and ${CONV_SQL}
       order by session_id, type, created_at
     )
     select c.id, c.type, c.label, c.href, c.path, c.device, c.country, c.ref_host, c.utm_source, c.created_at, c.value, c.meta, c.session_id,
       (select path from events f where f.site_id=c.site_id and f.session_id=c.session_id and f.type='pageview' order by created_at limit 1) as entry_path,
       (select count(*)::int from events f where f.site_id=c.site_id and f.session_id=c.session_id and f.type='pageview') as pages_seen
     from c order by c.created_at desc limit 60`,
    params
  );
  const bySource = await q(
    `select coalesce(nullif(utm_source,''), nullif(ref_host,''), 'direct') as source, count(distinct (session_id, type))::int as n
     from events where ${where} and ${CONV_SQL} group by 1 order by n desc limit 12`,
    params
  );
  // Real phone calls through the tracking number, if the site has one.
  const calls = await q(
    `select id, call_sid, from_number, status, duration, answered, caller_city, caller_state, recording_url, started_at
     from calls where site_id = $4 and started_at >= ($1::date)::timestamp at time zone $3 and started_at < (($2::date + 1)::timestamp at time zone $3)
     order by started_at desc limit 100`,
    params
  );
  // Real leads posted by the site's own form handler, if wired.
  const leads = await q(
    `select id, kind, name, email, phone, message, path, source, created_at
     from leads where site_id = $4 and created_at >= ($1::date)::timestamp at time zone $3 and created_at < (($2::date + 1)::timestamp at time zone $3)
     order by created_at desc limit 100`,
    params
  );
  const byDevice = await q(
    `select coalesce(nullif(device,''),'unknown') as device, type, count(distinct session_id)::int as n
     from events where ${where} and ${CONV_SQL} group by 1,2 order by n desc`,
    params
  );
  return { byType, byDay, byPage, recent, bySource, calls, leads, byDevice };
}

export async function flows(siteId, from, to, tz, focus) {
  const { where, params } = base(siteId, from, to, tz);
  const journeys = await q(
    `with pv as (
       select session_id, path, created_at,
              row_number() over (partition by session_id order by created_at) as rn,
              lag(path) over (partition by session_id order by created_at) as prev
       from events where ${where} and type='pageview'
     ),
     dedup as (select * from pv where prev is distinct from path),
     seq as (
       select session_id,
         string_agg(path, ' > ' order by created_at) filter (where rn <= 4) as journey,
         count(*)::int as len
       from dedup group by session_id
     )
     select journey, count(*)::int as n, round(avg(len),1) as avg_len
     from seq where len >= 2 group by journey order by n desc limit 25`,
    params
  );
  const transitions = await q(
    `with pv as (
       select session_id, path, created_at,
              lead(path) over (partition by session_id order by created_at) as next
       from events where ${where} and type='pageview'
     )
     select path as from_path, next as to_path, count(*)::int as n
     from pv where next is not null and next <> path
     group by 1,2 order by n desc limit 40`,
    params
  );
  const depth = await q(
    `select least(n, 6) as pages, count(*)::int as sessions from (
       select session_id, count(*)::int as n from events where ${where} and type='pageview' group by session_id
     ) t group by 1 order by 1`,
    params
  );
  const clicks = await q(
    `select path, type, label, href, count(*)::int as n
     from events where ${where} and type in ('click','outbound','call','email','sms','booking','form','custom','call_tap','form_attempt')
     group by 1,2,3,4 order by n desc limit 300`,
    params
  );
  const entries = await q(
    `with pv as (
       select session_id, path, row_number() over (partition by session_id order by created_at) rn,
              row_number() over (partition by session_id order by created_at desc) rd
       from events where ${where} and type='pageview'
     )
     select path,
       count(*) filter (where rn=1)::int as entries,
       count(*) filter (where rd=1)::int as exits
     from pv group by path order by entries desc limit 20`,
    params
  );
  return { journeys, transitions, depth, clicks, entries };
}

export async function sources(siteId, from, to, tz) {
  const { where, params } = base(siteId, from, to, tz);
  const referrers = await q(
    `with s as (
       select session_id,
         min(coalesce(nullif(utm_source,''), nullif(ref_host,''), 'direct')) as source,
         bool_or(${CONV_SQL}) as converted
       from events where ${where} and session_id not like 'wh:%' and session_id not like 'tw:%' group by session_id
     )
     select source, count(*)::int as sessions, count(*) filter (where converted)::int as converted
     from s group by source order by sessions desc limit 15`,
    params
  );
  const devices = await q(
    `select coalesce(nullif(device,''),'unknown') as device, count(distinct session_id) filter (where type='pageview')::int as sessions,
            count(distinct session_id) filter (where ${CONV_SQL})::int as converted
     from events where ${where} group by 1 order by sessions desc`,
    params
  );
  const countries = await q(
    `select coalesce(nullif(country,''),'—') as country, count(distinct session_id)::int as sessions
     from events where ${where} and type='pageview' group by 1 order by sessions desc limit 10`,
    params
  );
  const campaigns = await q(
    `select utm_source, utm_medium, utm_campaign, count(distinct session_id)::int as sessions,
            count(distinct session_id) filter (where ${CONV_SQL})::int as converted
     from events where ${where} and utm_source <> '' group by 1,2,3 order by sessions desc limit 20`,
    params
  );
  // Search Console history stored by the cron (not the live 1h cache).
  const gscDaily = await q(
    `select day::text as day, clicks, impressions, ctr::float as ctr, position::float as position
     from gsc_daily where site_id = $3 and day >= $1::date and day <= $2::date order by day`,
    [from, to, siteId]
  );
  const gscQueries = await q(
    `select query, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
            round((sum(position * impressions) / nullif(sum(impressions),0))::numeric, 1)::float as position
     from gsc_queries where site_id = $3 and day >= $1::date and day <= $2::date
     group by query order by clicks desc, impressions desc limit 25`,
    [from, to, siteId]
  );
  return { referrers, devices, countries, campaigns, gscDaily, gscQueries };
}

// Previous period of equal length, for deltas.
export function previousRange(from, to) {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const days = Math.round((t - f) / 86400000) + 1;
  const pf = new Date(f.getTime() - days * 86400000);
  const pt = new Date(f.getTime() - 86400000);
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
}

// Month-over-month history for one site: visitors, leads, search clicks,
// impressions, average position. Everything from stored rows.
export async function history(siteId, tz, months = 12) {
  const rows = await q(
    `with days as (
       select site_id, (created_at at time zone $2)::date as day,
         count(distinct visitor_id) filter (where type='pageview')::int as visitors,
         count(*) filter (where type='pageview')::int as pageviews,
         ${LEADS_ALL} as conversions, 'pulse'::text as src
       from events where site_id = $1 group by 1,2
       having count(*) filter (where type='pageview') > 0
       union all
       select g.site_id, g.day, g.users, g.pageviews, g.calls+g.forms+g.emails+g.bookings, 'ga4'
       from ga_daily g where g.site_id = $1
         and not exists (select 1 from events e where e.site_id = $1 and e.type='pageview' and (e.created_at at time zone $2)::date = g.day)
     ),
     m as (
       select to_char(date_trunc('month', day), 'YYYY-MM-01') as month,
         sum(visitors)::int as visitors, sum(pageviews)::int as pageviews, sum(conversions)::int as conversions,
         count(*)::int as days, count(*) filter (where src='ga4')::int as ga4_days
       from days group by 1
     ),
     g as (
       select to_char(date_trunc('month', day), 'YYYY-MM-01') as month,
         sum(clicks)::int as clicks, sum(impressions)::int as impressions,
         round((sum(position * impressions) / nullif(sum(impressions),0))::numeric, 1)::float as position
       from gsc_daily where site_id = $1 group by 1
     )
     select coalesce(m.month, g.month) as month, m.visitors, m.pageviews, m.conversions, m.days, m.ga4_days, g.clicks, g.impressions, g.position
     from m full outer join g on g.month = m.month
     order by 1 desc limit $3`,
    [siteId, tz, months]
  );
  return rows.reverse();
}

// ---------- cross-site portfolio ----------
// One row per site per day, in the site's timezone. Pulse's own events win;
// a day with no Pulse page views for that site falls back to the GA4 history
// in ga_daily. Flows and click maps have no GA4 equivalent, so they stay
// Pulse-only.
const DAYSTATS = `
  daystats as (
    select e.site_id, (e.created_at at time zone s.timezone)::date as day,
      count(distinct e.visitor_id) filter (where e.type='pageview')::int as visitors,
      count(distinct e.session_id) filter (where e.type='pageview')::int as sessions,
      count(*) filter (where e.type='pageview')::int as pageviews,
      count(distinct (e.session_id, e.type)) filter (where e.${CONV_SQL})::int as conversions,
      count(distinct e.session_id) filter (where e.type='call')::int as calls,
      count(distinct e.session_id) filter (where e.type='form')::int as forms,
      count(distinct e.session_id) filter (where e.type='email')::int as emails,
      count(distinct e.session_id) filter (where e.type='booking')::int as bookings,
      'pulse'::text as src
    from events e join sites s on s.id = e.site_id
    group by 1,2
    having count(*) filter (where e.type='pageview') > 0 or count(*) filter (where e.${CONV_SQL}) > 0
    union all
    select g.site_id, g.day, g.users, g.sessions, g.pageviews, g.calls+g.forms+g.emails+g.bookings, g.calls, g.forms, g.emails, g.bookings, 'ga4'
    from ga_daily g join sites s on s.id = g.site_id
    where not exists (
      select 1 from events e where e.site_id = g.site_id and e.type='pageview' and (e.created_at at time zone s.timezone)::date = g.day
    )
  )`;

export async function portfolio(windowDays = 60) {
  const w = Math.max(7, Math.min(365, Number(windowDays) || 60));
  // Day 0 is the launch date, full stop. A site with no launch date is listed
  // but never benchmarked, because a guessed day 0 makes "days to first lead"
  // a fiction.
  const sites = await q(
    `with ${DAYSTATS},
     win as (
       select s.id, s.name, s.domain, s.niche, s.launched_at as day0,
         case when s.launched_at is null then null else (current_date - s.launched_at)::int end as days_live,
         case when s.launched_at is null then null else (s.launched_at + ($1::int) * interval '1 day')::date end as day_end,
         s.tracking_number <> '' as has_tracking, s.form_source
       from sites s
     ),
     ev as (
       select w.id,
         sum(d.visitors)::int as visitors, sum(d.sessions)::int as sessions, sum(d.pageviews)::int as pageviews,
         sum(d.conversions)::int as conversions, sum(d.calls)::int as calls, sum(d.forms)::int as forms,
         sum(d.emails + d.bookings)::int as other,
         min(d.day) filter (where d.conversions > 0) as first_conv_day,
         count(*)::int as days_with_data,
         min(d.day) as first_data_day, max(d.day) as last_data_day,
         bool_or(d.src='ga4') as has_ga4, bool_or(d.src='pulse') as has_pulse
       from win w join daystats d on d.site_id = w.id and d.day >= w.day0 and d.day < w.day_end
       group by w.id
     ),
     total as (
       select site_id as id, sum(conversions)::int as conversions_all, sum(visitors)::int as visitors_all,
              min(day) as first_seen, max(day) as last_seen
       from daystats group by site_id
     )
     select w.id, w.name, w.domain, w.niche, w.day0::text as day0, w.days_live, w.has_tracking, w.form_source,
       coalesce(w.days_live >= $1::int, false) as complete,
       coalesce(ev.visitors,0) as visitors, coalesce(ev.sessions,0) as sessions, coalesce(ev.pageviews,0) as pageviews,
       coalesce(ev.conversions,0) as conversions, coalesce(ev.calls,0) as calls, coalesce(ev.forms,0) as forms, coalesce(ev.other,0) as other,
       case when ev.first_conv_day is null then null else (ev.first_conv_day - w.day0)::int end as days_to_first_lead,
       coalesce(ev.days_with_data,0) as days_with_data,
       ev.first_data_day::text as first_data_day, ev.last_data_day::text as last_data_day,
       coalesce(ev.has_ga4,false) as has_ga4, coalesce(ev.has_pulse,false) as has_pulse,
       coalesce(t.conversions_all,0) as conversions_all, coalesce(t.visitors_all,0) as visitors_all,
       t.first_seen::text as first_seen, t.last_seen::text as last_seen
     from win w left join ev on ev.id = w.id left join total t on t.id = w.id
     order by w.day0 nulls last, w.name`,
    [w]
  );
  // Running total of leads per site by day since launch, only for sites that
  // have completed the window. Same population as the tiles.
  const curveRows = await q(
    `with ${DAYSTATS},
     s as (
       select id, launched_at as day0 from sites
       where launched_at is not null and (current_date - launched_at) >= $1::int
     ),
     days as (select generate_series(0, $1::int - 1) as d),
     cum as (
       select s.id, days.d,
         coalesce((select sum(ds.conversions) from daystats ds where ds.site_id = s.id and ds.day >= s.day0 and ds.day <= s.day0 + days.d * interval '1 day'), 0)::int as cum
       from s cross join days
     )
     select id, d as day, cum from cum order by d, id`,
    [w]
  );
  const byDay = new Map();
  for (const r of curveRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, sites: {} });
    byDay.get(r.day).sites[r.id] = r.cum;
  }
  const curve = [...byDay.values()].map((d) => {
    const vals = Object.values(d.sites);
    return { day: d.day, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null, sites_live: vals.length, ...d.sites };
  });
  return { window: w, sites, curve };
}

// All sites, all time. No date bounds; "all" means every day ever recorded,
// from Pulse or from the GA4 backfill.
export async function portfolioAll() {
  const [totals] = await q(
    `with ${DAYSTATS}
     select
       (select count(*)::int from sites) as sites,
       count(distinct site_id)::int as sites_with_data,
       coalesce(sum(visitors),0)::int as visitors, coalesce(sum(sessions),0)::int as sessions, coalesce(sum(pageviews),0)::int as pageviews,
       coalesce(sum(conversions),0)::int as conversions,
       coalesce(sum(calls),0)::int as calls, coalesce(sum(forms),0)::int as forms, coalesce(sum(emails),0)::int as emails, coalesce(sum(bookings),0)::int as bookings,
       count(*) filter (where src='ga4')::int as ga4_days, count(*) filter (where src='pulse')::int as pulse_days,
       (select round(avg(value) filter (where type='leave' and value is not null and value < 1800))::int from events) as avg_seconds,
       (select round(avg((meta->>'scroll')::numeric) filter (where type='leave' and meta ? 'scroll'))::int from events) as avg_scroll,
       min(day)::text as first_day, max(day)::text as last_day
     from daystats`
  );
  const perSite = await q(
    `with ${DAYSTATS}
     select s.id, s.name, s.domain, s.niche, s.launched_at::text as launched_at,
       coalesce(sum(d.visitors),0)::int as visitors, coalesce(sum(d.sessions),0)::int as sessions, coalesce(sum(d.pageviews),0)::int as pageviews,
       coalesce(sum(d.conversions),0)::int as conversions, coalesce(sum(d.calls),0)::int as calls, coalesce(sum(d.forms),0)::int as forms,
       (select round(avg(e.value) filter (where e.type='leave' and e.value is not null and e.value < 1800))::int from events e where e.site_id = s.id) as avg_seconds,
       min(d.day)::text as first_seen, max(d.day)::text as last_seen,
       (select max(created_at) from events e where e.site_id = s.id) as last_hit,
       coalesce(bool_or(d.src='ga4'),false) as has_ga4, coalesce(bool_or(d.src='pulse'),false) as has_pulse
     from sites s left join daystats d on d.site_id = s.id
     group by s.id order by conversions desc, visitors desc, s.sort_order`
  );
  const monthly = await q(
    `with ${DAYSTATS}
     select to_char(date_trunc('month', day), 'YYYY-MM-01') as day,
       sum(visitors)::int as visitors, sum(conversions)::int as conversions, count(distinct site_id)::int as sites
     from daystats group by 1 order by 1`
  );
  const byType = await q(
    `with ${DAYSTATS}
     select t.type, t.n from (
       select 'call' as type, sum(calls)::int as n from daystats union all
       select 'form', sum(forms)::int from daystats union all
       select 'email', sum(emails)::int from daystats union all
       select 'booking', sum(bookings)::int from daystats union all
       select 'sms', count(distinct session_id)::int from events where type='sms' union all
       select 'custom', count(distinct session_id)::int from events where type='custom'
     ) t where t.n > 0 order by t.n desc`
  );
  const convPages = await q(
    `select e.site_id, s.name, e.path, count(distinct (e.session_id, e.type))::int as n
     from events e join sites s on s.id = e.site_id where e.${CONV_SQL} and e.path <> '' group by 1,2,3 order by n desc limit 12`
  );
  const referrers = await q(
    `with s as (
       select session_id, min(coalesce(nullif(utm_source,''), nullif(ref_host,''), 'direct')) as source, bool_or(${CONV_SQL}) as converted
       from events where session_id not like 'wh:%' and session_id not like 'tw:%' group by session_id
     )
     select source, count(*)::int as sessions, count(*) filter (where converted)::int as converted from s group by source order by sessions desc limit 12`
  );
  const devices = await q(
    `select coalesce(nullif(device,''),'unknown') as device, count(distinct session_id) filter (where type='pageview')::int as sessions,
            count(distinct session_id) filter (where ${CONV_SQL})::int as converted
     from events where device <> '' group by 1 order by sessions desc`
  );
  return { totals, perSite, monthly, byType, convPages, referrers, devices };
}
