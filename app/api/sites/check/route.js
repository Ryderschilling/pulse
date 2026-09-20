import { NextResponse } from "next/server";
import { q, ensureSchema } from "@/lib/db";
import { checkSite } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST ?site=<id>  -> fetch the live homepage and confirm the snippet is on it.
export async function POST(req) {
  await ensureSchema();
  const id = new URL(req.url).searchParams.get("site");
  const [site] = await q("select * from sites where id=$1", [id]);
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });
  const r = await checkSite(site);
  return NextResponse.json(r);
}
