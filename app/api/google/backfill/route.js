import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import { googleConfigured } from "@/lib/google";
import { syncGa4, syncGsc, daysAgo } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST ?site=<id> | ?all=1  -> pull GA4 daily history and Search Console
// history from launch (or 400 days back) to yesterday, upsert into ga_daily /
// gsc_daily / gsc_queries. Safe to re-run; rows are replaced, never doubled.
export async function POST(req) {
  await ensureSchema();
  if (!googleConfigured()) return NextResponse.json({ error: "Google service account not configured" }, { status: 400 });
  const p = new URL(req.url).searchParams;
  const sites = p.get("all") === "1"
    ? await q("select *, launched_at::text as launched_at from sites where ga4_property_id <> '' or gsc_property <> ''")
    : await q("select *, launched_at::text as launched_at from sites where id = $1", [p.get("site")]);
  const yesterday = daysAgo(1);
  const results = [];
  for (const s of sites) {
    const from = s.launched_at || daysAgo(400);
    const r = { site: s.name };
    try { r.ga4 = await syncGa4(s, from, yesterday); } catch (e) { r.ga4 = { error: e.message }; }
    // Search Console lags about 2 days and only keeps 16 months.
    try { r.gsc = await syncGsc(s, from < daysAgo(480) ? daysAgo(480) : from, daysAgo(2)); } catch (e) { r.gsc = { error: e.message }; }
    results.push(r);
  }
  return NextResponse.json({ results });
}
