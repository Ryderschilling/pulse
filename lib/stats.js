// Every number here is a query over the events table. Nothing is projected or
// averaged into a stat tile; a day with no records renders as empty.
import { q } from "@/lib/db";

export const CONV_TYPES = ["call", "form", "email", "booking", "sms", "custom"];
const CONV_SQL = `type in ('call','form','email','booking','sms','custom')`;

// [from, to] are inclusive calendar days in the site's timezone.
function bounds(tz, from, to) {
  return {
    start: `($1::date)::timestamp at time zone $3`,
    end: `(($2::date + 1)::timestamp at time zone $3)`,
    tz,
  };
}
function base(siteId, from, to, tz) {
  // params: $1 from, $2 to, $3 tz, $4 site
  const b = bounds(tz, from, to);
  return {
    where: `site_id = $4 and created_at >= ${b.start} and created_at < ${b.end}`,
    day: `to_char(created_at at time zone $3, 'YYYY-MM-DD')`,
    params: [from, to, tz, siteId],
  };
}

export async function summary(siteId, from, to, tz) {
  const { where, params } = base(siteId, from, to, tz);
  const [r] = await q(
    `select
       count(distinct visitor_id) filter (where type='pageview')::int as visitors,
       count(distinct session_id) filter (where type='pageview')::int as sessions,
       count(*) filter (where type='pageview')::int as pageviews,
       count(*) filter (where type='call')::int as calls,
       count(*) filter (where type='form')::int as forms,
       count(*) filter (where type='email')::int as emails,
       count(*) filter (where type='booking')::int as bookings,
       count(*) filter (where type='sms')::int as sms,
       count(*) filter (where type='custom')::int as custom,
       count(*) filter (where ${CONV_SQL})::int as conversions,
       count(distinct session_id) filter (where ${CONV_SQL})::int as converting_sessions,
       round(avg(value) filter (where type='leave' and value is not null and value < 1800))::int as avg_seconds,
       round(avg((meta->>'scroll')::numeric) filter (where type='leave' and meta ? 'scroll'))::int as avg_scroll
     from events where ${where}`,
    params
  );
  const [b] = await q(
    `select count(*)::int as bounced from (
       select session_id from events where ${where} and type='pageview' group by session_id having count(*)=1
     ) t`,
    params
  );
  return { ...r, bounced: b.bounced };
}

export async function daily(siteId, from, to, tz) {
  const { where, day, params } = base(siteId, from, to, tz);
  return q(
    `select ${day} as day,
       count(distinct visitor_id) filter (where type='pageview')::int as visitors,
       count(*) filter (where type='pageview')::int as pageviews,
       count(distinct session_id) filter (where type='pageview')::int as sessions,
       count(*) filter (where type='call')::int as calls,
       count(*) filter (where type='form')::int as forms,
       count(*) filter (where type='email')::int as emails,
       count(*) filter (where type='booking')::int as bookings,
       count(*) filter (where ${CONV_SQL})::int as conversions
     from events where ${where} group by 1 order by 1`,
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
       select path, count(*)::int as conversions,
         count(*) filter (where type='call')::int as calls,
         count(*) filter (where type='form')::int as forms
       from events where ${where} and ${CONV_SQL} group by path
     )
     select a.*, coalesce(l.avg_seconds,null) as avg_seconds, l.avg_scroll,
            coalesce(c.conversions,0) as conversions, coalesce(c.calls,0) as calls, coalesce(c.forms,0) as forms
     from agg a left join lv l using (path) left join cv c using (path)
     order by views desc limit 200`,
    params
  );
}

export async function conversions(siteId, from, to, tz) {
  const { where, day, params } = base(siteId, from, to, tz);
  const byType = await q(
    `select type, count(*)::int as n, count(distinct session_id)::int as sessions
     from events where ${where} and ${CONV_SQL} group by type order by n desc`,
    params
  );
  const byDay = await q(
    `select ${day} as day, type, count(*)::int as n
     from events where ${where} and ${CONV_SQL} group by 1,2 order by 1`,
    params
  );
  const byPage = await q(
    `select path, type, label, count(*)::int as n
     from events where ${where} and ${CONV_SQL} group by 1,2,3 order by n desc limit 100`,
    params
  );
  const recent = await q(
    `with c as (
       select e.* from events e where ${where} and ${CONV_SQL} order by created_at desc limit 60
     )
     select c.id, c.type, c.label, c.href, c.path, c.device, c.country, c.ref_host, c.utm_source, c.created_at,
       (select path from events f where f.site_id=c.site_id and f.session_id=c.session_id and f.type='pageview' order by created_at limit 1) as entry_path,
       (select count(*)::int from events f where f.site_id=c.site_id and f.session_id=c.session_id and f.type='pageview') as pages_seen
     from c order by c.created_at desc`,
    params
  );
  const bySource = await q(
    `select coalesce(nullif(utm_source,''), nullif(ref_host,''), 'direct') as source, count(*)::int as n
     from events where ${where} and ${CONV_SQL} group by 1 order by n desc limit 12`,
    params
  );
  return { byType, byDay, byPage, recent, bySource };
}

export async function flows(siteId, from, to, tz, focus) {
  const { where, params } = base(siteId, from, to, tz);
  // Top journeys: the first 4 pages of each session, sessions with 2+ pages.
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
  // Page to page transitions.
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
  // Session depth: how many pages people see before leaving.
  const depth = await q(
    `select least(n, 6) as pages, count(*)::int as sessions from (
       select session_id, count(*)::int as n from events where ${where} and type='pageview' group by session_id
     ) t group by 1 order by 1`,
    params
  );
  // Click map: what gets clicked on each page.
  const clicks = await q(
    `select path, type, label, href, count(*)::int as n
     from events where ${where} and type in ('click','outbound','call','email','sms','booking','form','custom')
     group by 1,2,3,4 order by n desc limit 300`,
    params
  );
  // Entry and exit ranking.
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
       from events where ${where} group by session_id
     )
     select source, count(*)::int as sessions, count(*) filter (where converted)::int as converted
     from s group by source order by sessions desc limit 15`,
    params
  );
  const devices = await q(
    `select coalesce(nullif(device,''),'unknown') as device, count(distinct session_id)::int as sessions,
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
  return { referrers, devices, countries, campaigns };
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


// ---------- cross-site portfolio ----------
// One row per site per day. Pulse's own events win; a day with no Pulse
// pageviews for that site falls back to the GA4 history in ga_daily (see
// /api/google/backfill). Flows and click maps have no GA4 equivalent, so they
// stay Pulse-only.
const DAYSTATS = `
  daystats as (
    select site_id, created_at::date as day,
      count(distinct visitor_id) filter (where type='pageview')::int as visitors,
      count(distinct session_id) filter (where type='pageview')::int as sessions,
      count(*) filter (where type='pageview')::int as pageviews,
      count(*) filter (where ${CONV_SQL})::int as conversions,
      count(*) filter (where type='call')::int as calls,
      count(*) filter (where type='form')::int as forms,
      count(*) filter (where type='email')::int as emails,
      count(*) filter (where type='booking')::int as bookings,
      'pulse'::text as src
    from events group by 1,2
    having count(*) filter (where type='pageview') > 0
    union all
    select g.site_id, g.day, g.users, g.sessions, g.pageviews, g.calls+g.forms+g.emails+g.bookings, g.calls, g.forms, g.emails, g.bookings, 'ga4'
    from ga_daily g
    where not exists (select 1 from events e where e.site_id = g.site_id and e.type='pageview' and e.created_at::date = g.day)
  )`;

export async function portfolio(windowDays = 60) {
  const w = Math.max(7, Math.min(365, Number(windowDays) || 60));
  const sites = await q(
    `with s as (
       select s.id, s.name, s.domain, s.niche,
         coalesce(s.launched_at, (select min(day) from (select created_at::date as day from events e where e.site_id = s.id union all select day from ga_daily g where g.site_id = s.id) d)) as day0
       from sites s
     ),
     ${DAYSTATS},
     win as (
       select s.*, (current_date - s.day0)::int as days_live, (s.day0 + ($1::int) * interval '1 day')::date as day_end from s
     ),
     ev as (
       select w.id,
         sum(d.visitors)::int as visitors, sum(d.sessions)::int as sessions, sum(d.pageviews)::int as pageviews,
         sum(d.conversions)::int as conversions, sum(d.calls)::int as calls, sum(d.forms)::int as forms,
         sum(d.emails + d.bookings)::int as other,
         min(d.day) filter (where d.conversions > 0) as first_conv_day,
         bool_or(d.src='ga4') as has_ga4, bool_or(d.src='pulse') as has_pulse
       from win w join daystats d on d.site_id = w.id and d.day >= w.day0 and d.day < w.day_end
       group by w.id
     ),
     total as (
       select site_id as id, sum(conversions)::int as conversions_all, sum(visitors)::int as visitors_all from daystats group by site_id
     )
     select w.id, w.name, w.domain, w.niche, w.day0::text as day0, w.days_live,
       coalesce(w.days_live >= $1::int, false) as complete,
       coalesce(ev.visitors,0) as visitors, coalesce(ev.sessions,0) as sessions, coalesce(ev.pageviews,0) as pageviews,
       coalesce(ev.conversions,0) as conversions, coalesce(ev.calls,0) as calls, coalesce(ev.forms,0) as forms, coalesce(ev.other,0) as other,
       case when ev.first_conv_day is null then null else (ev.first_conv_day - w.day0)::int end as days_to_first_lead,
       coalesce(ev.has_ga4,false) as has_ga4, coalesce(ev.has_pulse,false) as has_pulse,
       coalesce(t.conversions_all,0) as conversions_all, coalesce(t.visitors_all,0) as visitors_all
     from win w left join ev on ev.id = w.id left join total t on t.id = w.id
     order by w.day0 nulls last, w.name`,
    [w]
  );
  const curve = await q(
    `with s as (
       select s.id, coalesce(s.launched_at, (select min(day) from (select created_at::date as day from events e where e.site_id = s.id union all select day from ga_daily g where g.site_id = s.id) d)) as day0 from sites s
     ),
     ${DAYSTATS},
     days as (select generate_series(0, $1::int - 1) as d),
     live as (
       select s.id, s.day0, days.d from s cross join days where s.day0 is not null and s.day0 + days.d * interval '1 day' <= current_date
     ),
     cum as (
       select l.id, l.d,
         coalesce((select sum(ds.conversions) from daystats ds where ds.site_id = l.id and ds.day >= l.day0 and ds.day <= l.day0 + l.d * interval '1 day'), 0)::int as cum
       from live l
     )
     select d as day, round(avg(cum), 2)::float as avg_conversions, count(*)::int as sites_live
     from cum group by d order by d`,
    [w]
  );
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
       select 'sms', count(*)::int from events where type='sms' union all
       select 'custom', count(*)::int from events where type='custom'
     ) t where t.n > 0 order by t.n desc`
  );
  const convPages = await q(
    `select e.site_id, s.name, e.path, count(*)::int as n
     from events e join sites s on s.id = e.site_id where e.type in ('call','form','email','booking','sms','custom') group by 1,2,3 order by n desc limit 12`
  );
  const referrers = await q(
    `with s as (
       select session_id, min(coalesce(nullif(utm_source,''), nullif(ref_host,''), 'direct')) as source, bool_or(${CONV_SQL}) as converted
       from events group by session_id
     )
     select source, count(*)::int as sessions, count(*) filter (where converted)::int as converted from s group by source order by sessions desc limit 12`
  );
  const devices = await q(
    `select coalesce(nullif(device,''),'unknown') as device, count(distinct session_id)::int as sessions,
            count(distinct session_id) filter (where ${CONV_SQL})::int as converted
     from events group by 1 order by sessions desc`
  );
  return { totals, perSite, monthly, byType, convPages, referrers, devices };
}
