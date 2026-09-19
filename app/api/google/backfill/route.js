import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import { ga4Daily, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST ?site=<id> | ?all=1  -> pull GA4 daily history from launch (or 400
// days back) to yesterday, upsert into ga_daily.
export async function POST(req) {
  await ensureSchema();
  if (!googleConfigured()) return NextResponse.json({ error: "Google service account not configured" }, { status: 400 });
  const p = new URL(req.url).searchParams;
  const sites = p.get("all") === "1"
    ? await q("select *, launched_at::text as launched_at from sites where ga4_property_id <> ''")
    : await q("select *, launched_at::text as launched_at from sites where id = $1 and ga4_property_id <> ''", [p.get("site")]);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const results = [];
  for (const s of sites) {
    const from = s.launched_at || new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    try {
      const rows = await ga4Daily(s.ga4_property_id, from, yesterday);
      for (const r of rows) {
        await q(
          `insert into ga_daily (site_id, day, users, sessions, pageviews, engaged, calls, forms, emails, bookings, fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
           on conflict (site_id, day) do update set users=excluded.users, sessions=excluded.sessions, pageviews=excluded.pageviews, engaged=excluded.engaged,
             calls=excluded.calls, forms=excluded.forms, emails=excluded.emails, bookings=excluded.bookings, fetched_at=now()`,
          [s.id, r.day, r.users, r.sessions, r.pageviews, r.engaged, r.calls, r.forms, r.emails, r.bookings]
        );
      }
      results.push({ site: s.name, days: rows.length, from, leads: rows.reduce((a, r) => a + r.calls + r.forms + r.emails + r.bookings, 0) });
    } catch (e) {
      results.push({ site: s.name, error: e.message });
    }
  }
  return NextResponse.json({ results });
}
