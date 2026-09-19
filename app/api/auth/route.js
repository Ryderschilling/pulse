import { NextResponse } from "next/server";
import { expectedToken, hashPassword, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const token = await expectedToken();
  if (!token) return NextResponse.json({ ok: true, open: true });
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const submitted = await hashPassword((body.password || "").toString());
  if (submitted !== token) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
  return res;
}
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
