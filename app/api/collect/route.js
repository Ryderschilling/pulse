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
function bareHost(h) {
  return String(h || "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
}

// Best-effort rate limit per function instance: a runaway tab or a script
// hammering one key gets cut off. Not a security boundary, a sanity one.
const buckets = new Map();
function allow(key, perMinute) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; }
  b.n++;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n <= perMinute;
}

const siteCache = new Map();
async function loadSite(id) {
  const hit = siteCache.get(id);
  if (hit && Date.now() - hit.t < 60000) return hit.site;
  const [site] = await q("select id, domain, extra_hosts, tracking_number, form_source from sites where id = $1", [id]);
  siteCache.set(id, { site: site || null, t: Date.now() });
  return site || null;
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
  const found = await loadSite(site);
  if (!found) return NextResponse.json({ error: "unknown site" }, { status: 404, headers: CORS });

  // Only the real site may report. Previews, localhost and copies of the page
  // on other hosts are dropped, so the numbers are the client's real traffic.
  // Hosts listed in extra_hosts (a vercel.app URL before the domain is
  // attached) are allowed too. An empty host (very old browsers) is allowed.
  const pageHost = bareHost(body.host);
  const allowed = new Set([bareHost(found.domain), ...String(found.extra_hosts || "").split(/[,\s]+/).map(bareHost).filter(Boolean)]);
  if (pageHost && !allowed.has(pageHost)) {
    return NextResponse.json({ ok: true, n: 0, dropped: "host" }, { headers: CORS });
  }

  const ua = s(req.headers.get("user-agent"), 300);
  // Skip the obvious bots so the numbers stay honest.
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|gtmetrix|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discord|python-requests|curl\/|wget\//i.test(ua) && !/PulseTest/.test(ua)) {
    return NextResponse.json({ ok: true, n: 0, bot: true }, { headers: CORS });
  }
  const ip = s(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "", 60).split(",")[0].trim();
  if (!allow(`ip:${ip}`, 300) || !allow(`site:${site}`, 3000)) {
    return NextResponse.json({ ok: true, n: 0, limited: true }, { headers: CORS });
  }

  const country = s(req.headers.get("x-vercel-ip-country") || "", 4);
  const vid = s(body.v, 40) || "anon";
  const sid = s(body.s, 40) || vid;
  const ref = s(body.ref, 500);
  const utm = body.utm || {};
  const device = ["mobile", "tablet", "desktop"].includes(body.device) ? body.device : "";
  const hasTracking = !!(found.tracking_number && found.tracking_number.trim());
  const formsViaWebhook = found.form_source === "webhook";

  const rows = [];
  for (const e of events) {
    let type = TYPES.has(e.t) ? e.t : "custom";
    // With a tracking number, the real calls come from Twilio. A tel: tap is
    // still recorded (click map, attribution) but it is not the lead.
    if (type === "call" && hasTracking) type = "call_tap";
    // With the lead webhook, the real form is the one the handler confirms.
    if (type === "form" && formsViaWebhook) type = "form_attempt";
    // Email taps count as forms (Ryder, 09-21). Done after the webhook check so
    // a mailto: tap is always a real form lead, never a form_attempt.
    const viaEmail = type === "email";
    if (viaEmail) type = "form";
    let path = s(e.p, 300) || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const meta = e.sc != null || viaEmail ? { ...(e.sc != null ? { scroll: Number(e.sc) || 0 } : {}), ...(viaEmail ? { via: "email" } : {}) } : null;
    rows.push([
      site, type, path, s(e.ti, 160), vid, sid, ref, host(ref),
      s(utm.utm_source, 80), s(utm.utm_medium, 80), s(utm.utm_campaign, 120),
      s(e.l, 120), s(e.h, 300), e.v == null || isNaN(Number(e.v)) ? null : Number(e.v),
      device, country, ua, meta ? JSON.stringify(meta) : null,
    ]);
  }
  const cols = 18;
  const values = rows.map((_, i) => `(${Array.from({ length: cols }, (__, j) => `$${i * cols + j + 1}`).join(",")})`).join(",");
  await q(
    `insert into events (site_id,type,path,title,visitor_id,session_id,referrer,ref_host,utm_source,utm_medium,utm_campaign,label,href,value,device,country,ua,meta) values ${values}`,
    rows.flat()
  );
  return NextResponse.json({ ok: true, n: rows.length }, { headers: CORS });
}
