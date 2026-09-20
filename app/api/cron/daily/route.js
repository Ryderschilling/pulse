import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import { googleConfigured } from "@/lib/google";
import { syncGa4, syncGsc, checkSite, daysAgo } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs every morning (vercel.json). Vercel sends `Authorization: Bearer
// $CRON_SECRET`. Re-pulls the last few days from GA4 and Search Console
// (Google revises recent days), and checks every site still has the snippet.
// GET so Vercel cron can call it; the secret is the gate.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key") || "";
  if (secret && auth !== `Bearer ${secret}` && key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const sites = await q("select *, launched_at::text as launched_at from sites order by sort_order");
  const out = { ran_at: new Date().toISOString(), google: googleConfigured(), sites: [] };
  for (const s of sites) {
    const r = { site: s.name };
    if (out.google) {
      try { r.ga4 = await syncGa4(s, daysAgo(4), daysAgo(1)); } catch (e) { r.ga4 = { error: e.message }; }
      try { r.gsc = await syncGsc(s, daysAgo(7), daysAgo(2)); } catch (e) { r.gsc = { error: e.message }; }
    }
    try { r.check = await checkSite(s); } catch (e) { r.check = { error: e.message }; }
    out.sites.push(r);
  }
  // Keep the Google cache from growing forever.
  await q("delete from google_cache where fetched_at < now() - interval '7 days'");
  return NextResponse.json(out);
}
