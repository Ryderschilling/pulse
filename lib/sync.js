// Pull Google history into Pulse's own tables, and check that each live site
// is actually sending. Used by the daily cron and by the Settings buttons.
import { q } from "@/lib/db";
import { ga4Daily, gscDaily } from "@/lib/google";

const iso = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5));

export async function syncGa4(site, from, to) {
  if (!site.ga4_property_id) return { site: site.name, skipped: "no GA4 property" };
  const { rows, unmapped } = await ga4Daily(site.ga4_property_id, from, to, site);
  for (const r of rows) {
    await q(
      `insert into ga_daily (site_id, day, users, sessions, pageviews, engaged, calls, forms, emails, bookings, fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict (site_id, day) do update set users=excluded.users, sessions=excluded.sessions, pageviews=excluded.pageviews, engaged=excluded.engaged,
         calls=excluded.calls, forms=excluded.forms, emails=excluded.emails, bookings=excluded.bookings, fetched_at=now()`,
      [site.id, r.day, r.users, r.sessions, r.pageviews, r.engaged, r.calls, r.forms, r.emails, r.bookings]
    );
  }
  return {
    site: site.name, from, to, days: rows.length,
    leads: rows.reduce((a, r) => a + r.calls + r.forms + r.emails + r.bookings, 0),
    unmapped: unmapped.slice(0, 8),
  };
}

export async function syncGsc(site, from, to) {
  if (!site.gsc_property) return { site: site.name, skipped: "no Search Console property" };
  const { days, queries } = await gscDaily(site.gsc_property, from, to);
  for (const d of days) {
    await q(
      `insert into gsc_daily (site_id, day, clicks, impressions, ctr, position, fetched_at) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (site_id, day) do update set clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, position=excluded.position, fetched_at=now()`,
      [site.id, d.day, d.clicks, d.impressions, d.ctr, d.position]
    );
  }
  // Replace the stored queries for each day we got, so a re-pull never leaves
  // stale rows behind.
  const daysSeen = [...new Set(queries.map((r) => r.day))];
  for (const day of daysSeen) await q("delete from gsc_queries where site_id=$1 and day=$2", [site.id, day]);
  for (const r of queries) {
    await q(
      `insert into gsc_queries (site_id, day, query, clicks, impressions, position) values ($1,$2,$3,$4,$5,$6)
       on conflict (site_id, day, query) do update set clicks=excluded.clicks, impressions=excluded.impressions, position=excluded.position`,
      [site.id, r.day, r.query.slice(0, 200), r.clicks, r.impressions, r.position]
    );
  }
  return { site: site.name, from, to, days: days.length, queries: queries.length };
}

// Fetch the live homepage and look for the snippet with this site's key.
export async function checkSite(site) {
  const out = { site_id: site.id, snippet_found: null, http_status: null, note: "" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://${site.domain}/`, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "PulseCheck/1.0 (+https://pulse.ryderschilling.com)" } });
    clearTimeout(t);
    out.http_status = res.status;
    const html = (await res.text()).slice(0, 2_000_000);
    const hasScript = /\/p\.js/.test(html);
    const hasKey = html.includes(`data-site="${site.id}"`) || html.includes(`data-site='${site.id}'`) || html.includes(`data-site=${site.id}`);
    const gtm = /googletagmanager\.com\/gtm\.js/.test(html);
    if (hasScript && hasKey) { out.snippet_found = true; out.note = "snippet found with the right key"; }
    else if (hasScript) { out.snippet_found = false; out.note = "p.js is there but with a different site key"; }
    else if (gtm) { out.snippet_found = null; out.note = "no snippet in the HTML, but GTM is installed (the tag may load through GTM)"; }
    else { out.snippet_found = false; out.note = "no Pulse snippet on the homepage"; }
  } catch (e) {
    out.snippet_found = false;
    out.note = "could not fetch: " + (e.name === "AbortError" ? "timeout" : e.message);
  }
  await q(
    `insert into site_checks (site_id, checked_at, snippet_found, http_status, note) values ($1, now(), $2, $3, $4)
     on conflict (site_id) do update set checked_at=now(), snippet_found=excluded.snippet_found, http_status=excluded.http_status, note=excluded.note`,
    [site.id, out.snippet_found, out.http_status, out.note]
  );
  return out;
}
