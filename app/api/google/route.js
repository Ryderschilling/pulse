import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import { ga4, gsc, cached, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req) {
  await ensureSchema();
  const p = new URL(req.url).searchParams;
  const siteId = p.get("site");
  const from = p.get("from");
  const to = p.get("to");
  const refresh = p.get("refresh") === "1";
  const [site] = await q("select * from sites where id=$1", [siteId]);
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const out = { configured: googleConfigured(), ga4: null, gsc: null, errors: {} };
  if (!out.configured) return NextResponse.json(out);

  // GSC data lags ~2 days; ask for what exists and say so.
  const gscTo = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 2); const s = d.toISOString().slice(0, 10); return s < to ? s : to; })();

  if (refresh) await q("delete from google_cache where key like $1", [`${siteId}:%`]);

  await Promise.all([
    (async () => {
      if (!site.ga4_property_id) return;
      try { out.ga4 = await cached(`${siteId}:ga4:${from}:${to}`, 60, () => ga4(site.ga4_property_id, from, to)); }
      catch (e) { out.errors.ga4 = e.message; }
    })(),
    (async () => {
      if (!site.gsc_property) return;
      try { out.gsc = await cached(`${siteId}:gsc:${from}:${gscTo}`, 60, () => gsc(site.gsc_property, from, gscTo)); out.gscTo = gscTo; }
      catch (e) { out.errors.gsc = e.message; }
    })(),
  ]);
  return NextResponse.json(out);
}
