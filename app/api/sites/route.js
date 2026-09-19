import { NextResponse } from "next/server";
import { q, ensureSchema, newId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

export async function GET() {
  await ensureSchema();
  const rows = await q(
    `select s.*, s.launched_at::text as launched_at,
       (select count(*)::int from events e where e.site_id = s.id and e.type='pageview' and e.created_at > now() - interval '7 days') as pv7,
       (select max(created_at) from events e where e.site_id = s.id) as last_seen
     from sites s order by sort_order, created_at`
  );
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
    `insert into sites (id, name, domain, ga4_property_id, gsc_property, timezone, launched_at, niche) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, name, domain, String(b.ga4_property_id || "").trim(), String(b.gsc_property || "").trim(), b.timezone || "America/Chicago", b.launched_at || null, String(b.niche || "").trim().slice(0, 60)]
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
  if (!fields.length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  params.push(b.id);
  await q(`update sites set ${fields.join(",")} where id=$${params.length}`, params);
  // Clear cached Google pulls for this site so new property ids take effect.
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
