import { NextResponse } from "next/server";
import { q, ensureSchema, newId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}
function cleanHosts(v) {
  return String(v || "").split(/[,\s]+/).map(cleanDomain).filter(Boolean).join(",");
}

export async function GET() {
  await ensureSchema();
  const rows = await q(
    `select s.*, s.launched_at::text as launched_at,
       (select count(*)::int from events e where e.site_id = s.id and e.type='pageview' and e.created_at > now() - interval '7 days') as pv7,
       (select max(created_at) from events e where e.site_id = s.id and e.type='pageview') as last_seen,
       (select max(created_at) from events e where e.site_id = s.id and e.type in ('call','form','email','booking','sms')) as last_lead,
       (select max(day)::text from ga_daily g where g.site_id = s.id) as ga4_last_day,
       (select max(day)::text from gsc_daily g where g.site_id = s.id) as gsc_last_day,
       (select count(*)::int from calls c where c.site_id = s.id) as tracked_calls,
       (select count(*)::int from leads l where l.site_id = s.id) as webhook_leads,
       c.checked_at, c.snippet_found, c.http_status, c.note as check_note
     from sites s left join site_checks c on c.site_id = s.id
     order by sort_order, created_at`
  );
  // Health, computed here once so every view reads the same verdict.
  const now = Date.now();
  for (const s of rows) {
    const lastPulse = s.last_seen ? new Date(s.last_seen).getTime() : 0;
    const lastGa = s.ga4_last_day ? new Date(s.ga4_last_day + "T12:00:00Z").getTime() : 0;
    const last = Math.max(lastPulse, lastGa);
    const daysSilent = last ? Math.floor((now - last) / 864e5) : null;
    s.days_silent = daysSilent;
    if (!last) s.health = s.snippet_found ? "waiting" : "no_data";
    else if (daysSilent >= 3 && lastPulse >= lastGa) s.health = "silent";
    else if (!lastPulse && lastGa) s.health = daysSilent >= 4 ? "silent" : "ga4_only";
    else s.health = "ok";
  }
  return NextResponse.json({ sites: rows });
}

export async function POST(req) {
  await ensureSchema();
  const b = await req.json().catch(() => ({}));
  const domain = cleanDomain(b.domain);
  if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  const id = "ps_" + newId(10);
  const name = String(b.name || domain).trim().slice(0, 80);
  await q(
    `insert into sites (id, name, domain, ga4_property_id, gsc_property, timezone, launched_at, niche, extra_hosts, webhook_secret)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, name, domain, String(b.ga4_property_id || "").trim(), String(b.gsc_property || "").trim(), b.timezone || "America/Chicago", b.launched_at || null, String(b.niche || "").trim().slice(0, 60), cleanHosts(b.extra_hosts), newId(32)]
  );
  const [site] = await q("select * from sites where id=$1", [id]);
  return NextResponse.json({ site });
}

export async function PATCH(req) {
  await ensureSchema();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const fields = [];
  const params = [];
  const set = (col, val) => { params.push(val); fields.push(`${col}=$${params.length}`); };
  if (b.name != null) set("name", String(b.name).trim().slice(0, 80));
  if (b.domain != null) set("domain", cleanDomain(b.domain));
  if (b.ga4_property_id != null) set("ga4_property_id", String(b.ga4_property_id).trim());
  if (b.gsc_property != null) set("gsc_property", String(b.gsc_property).trim());
  if (b.timezone != null) set("timezone", String(b.timezone));
  if (b.sort_order != null) set("sort_order", Number(b.sort_order) || 0);
  if (b.launched_at !== undefined) set("launched_at", b.launched_at || null);
  if (b.niche != null) set("niche", String(b.niche).trim().slice(0, 60));
  if (b.extra_hosts != null) set("extra_hosts", cleanHosts(b.extra_hosts));
  if (b.ga4_lead_events != null) set("ga4_lead_events", String(b.ga4_lead_events).trim().slice(0, 1000));
  if (b.form_source != null) set("form_source", b.form_source === "webhook" ? "webhook" : "snippet");
  if (b.tracking_number != null) set("tracking_number", String(b.tracking_number).trim().slice(0, 30));
  if (b.forward_to != null) set("forward_to", String(b.forward_to).trim().slice(0, 30));
  if (b.record_calls != null) set("record_calls", !!b.record_calls);
  if (b.rotate_secret) set("webhook_secret", newId(32));
  if (!fields.length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  params.push(b.id);
  await q(`update sites set ${fields.join(",")} where id=$${params.length}`, params);
  await q("update sites set webhook_secret=$2 where id=$1 and webhook_secret=''", [b.id, newId(32)]);
  await q("delete from google_cache where key like $1", [`${b.id}:%`]);
  const [site] = await q("select * from sites where id=$1", [b.id]);
  return NextResponse.json({ site });
}

export async function DELETE(req) {
  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await q("delete from sites where id=$1", [id]);
  return NextResponse.json({ ok: true });
}
