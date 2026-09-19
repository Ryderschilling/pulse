import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const TYPES = new Set(["pageview", "call", "email", "sms", "form", "booking", "outbound", "click", "leave", "custom"]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function s(v, max = 300) {
  return v == null ? "" : String(v).slice(0, max);
}
function host(u) {
  try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return ""; }
}

export async function POST(req) {
  let body;
  try {
    body = JSON.parse(await req.text());
  } catch (e) {
    return NextResponse.json({ error: "bad json" }, { status: 400, headers: CORS });
  }
  const site = s(body.site, 40);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!site || !events.length) return NextResponse.json({ ok: true, n: 0 }, { headers: CORS });

  await ensureSchema();
  const found = await q("select id, domain from sites where id = $1", [site]);
  if (!found.length) return NextResponse.json({ error: "unknown site" }, { status: 404, headers: CORS });

  const ua = s(req.headers.get("user-agent"), 300);
  // Skip the obvious bots so the numbers stay honest.
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|gtmetrix|uptime/i.test(ua) && !/PulseTest/.test(ua)) {
    return NextResponse.json({ ok: true, n: 0, bot: true }, { headers: CORS });
  }
  const country = s(req.headers.get("x-vercel-ip-country") || "", 4);
  const vid = s(body.v, 40) || "anon";
  const sid = s(body.s, 40) || vid;
  const ref = s(body.ref, 500);
  const utm = body.utm || {};
  const device = ["mobile", "tablet", "desktop"].includes(body.device) ? body.device : "";

  const rows = [];
  for (const e of events) {
    const type = TYPES.has(e.t) ? e.t : "custom";
    let path = s(e.p, 300) || "/";
    // strip trailing slash except root, keep numbers honest across /about and /about/
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const meta = e.sc != null ? { scroll: Number(e.sc) || 0 } : null;
    rows.push([
      site, type, path, s(e.ti, 160), vid, sid, ref, host(ref),
      s(utm.utm_source, 80), s(utm.utm_medium, 80), s(utm.utm_campaign, 120),
      s(e.l, 120), s(e.h, 300), e.v == null || isNaN(Number(e.v)) ? null : Number(e.v),
      device, country, ua, meta ? JSON.stringify(meta) : null,
    ]);
  }
  // One multi-row insert.
  const cols = 18;
  const values = rows.map((_, i) => `(${Array.from({ length: cols }, (__, j) => `$${i * cols + j + 1}`).join(",")})`).join(",");
  await q(
    `insert into events (site_id,type,path,title,visitor_id,session_id,referrer,ref_host,utm_source,utm_medium,utm_campaign,label,href,value,device,country,ua,meta) values ${values}`,
    rows.flat()
  );
  return NextResponse.json({ ok: true, n: rows.length }, { headers: CORS });
}
