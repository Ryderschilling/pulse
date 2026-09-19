import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import * as S from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  await ensureSchema();
  const p = new URL(req.url).searchParams;
  const siteId = p.get("site");
  const view = p.get("view") || "overview";
  const from = p.get("from");
  const to = p.get("to");
  if (view === "portfolio") {
    try { return NextResponse.json(p.get("window") === "all" ? await S.portfolioAll() : await S.portfolio(p.get("window") || 60)); }
    catch (e) { console.error(e); return NextResponse.json({ error: e.message }, { status: 500 }); }
  }
  if (!siteId || !DAY.test(from || "") || !DAY.test(to || "")) {
    return NextResponse.json({ error: "site, from, to required" }, { status: 400 });
  }
  const [site] = await q("select * from sites where id=$1", [siteId]);
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });
  const tz = site.timezone || "America/Chicago";

  try {
    const out = { site, from, to };
    if (view === "overview") {
      const prev = S.previousRange(from, to);
      const [summary, prevSummary, daily, pages, conv] = await Promise.all([
        S.summary(siteId, from, to, tz),
        S.summary(siteId, prev.from, prev.to, tz),
        S.daily(siteId, from, to, tz),
        S.pages(siteId, from, to, tz),
        S.conversions(siteId, from, to, tz),
      ]);
      Object.assign(out, { summary, prevSummary, prev, daily, pages: pages.slice(0, 8), conversions: { byType: conv.byType, bySource: conv.bySource, recent: conv.recent.slice(0, 8) } });
    } else if (view === "pages") {
      out.pages = await S.pages(siteId, from, to, tz);
      out.summary = await S.summary(siteId, from, to, tz);
    } else if (view === "conversions") {
      const prev = S.previousRange(from, to);
      const [c, summary, prevSummary] = await Promise.all([
        S.conversions(siteId, from, to, tz),
        S.summary(siteId, from, to, tz),
        S.summary(siteId, prev.from, prev.to, tz),
      ]);
      Object.assign(out, c, { summary, prevSummary });
    } else if (view === "flows") {
      out.flows = await S.flows(siteId, from, to, tz);
    } else if (view === "sources") {
      out.sources = await S.sources(siteId, from, to, tz);
    }
    return NextResponse.json(out);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message || "query failed" }, { status: 500 });
  }
}
