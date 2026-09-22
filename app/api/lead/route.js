import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const KINDS = new Set(["form", "booking", "call", "email", "custom"]);
const s = (v, m = 300) => (v == null ? "" : String(v).slice(0, m));

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

// A real lead, posted by the site's own server after a successful send.
//
//   POST https://pulse.ryderschilling.com/api/lead?site=ps_x
//   Authorization: Bearer <webhook secret from Settings>
//   { "type": "form", "name": "Jane", "email": "j@x.com", "phone": "850...",
//     "message": "...", "path": "/contact", "source": "resend",
//     "visitor": "<window.pulse.visitor>", "session": "<window.pulse.session>" }
//
// Stores the lead with its message, and one events row so every page counts
// it. Pass visitor/session from the page when you can, so the lead joins the
// visit that produced it (source, pages seen, device).
export async function POST(req) {
  await ensureSchema();
  const url = new URL(req.url);
  const siteId = s(url.searchParams.get("site"), 40);
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const [site] = await q("select id, webhook_secret from sites where id=$1", [siteId]);
  if (!site) return NextResponse.json({ error: "unknown site" }, { status: 404, headers: CORS });
  if (!site.webhook_secret || auth !== site.webhook_secret) return NextResponse.json({ error: "bad secret" }, { status: 401, headers: CORS });

  let b = {};
  try { b = await req.json(); } catch (e) { return NextResponse.json({ error: "bad json" }, { status: 400, headers: CORS }); }
  const kind = KINDS.has(b.type) ? b.type : "form";
  const [lead] = await q(
    `insert into leads (site_id, kind, name, email, phone, message, path, source, meta) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, created_at`,
    [site.id, kind, s(b.name, 120), s(b.email, 200), s(b.phone, 40), s(b.message, 4000), s(b.path, 300), s(b.source, 60), b.meta ? JSON.stringify(b.meta).slice(0, 4000) : null]
  );
  const session = s(b.session, 40) || "wh:" + lead.id;
  const visitor = s(b.visitor, 40) || (b.email ? "wh:" + s(b.email, 36).toLowerCase() : "wh:" + lead.id);
  await q(
    `insert into events (site_id, type, path, title, visitor_id, session_id, label, href, device, meta)
     values ($1,$2,$3,'',$4,$5,$6,'', '', $7::jsonb)`,
    [site.id, kind === "email" ? "form" : kind, s(b.path, 300) || "", visitor, session, s(b.name, 120) || s(b.source, 60) || "Lead", JSON.stringify({ lead_id: lead.id, confirmed: true })]
  );
  return NextResponse.json({ ok: true, id: lead.id }, { headers: CORS });
}
