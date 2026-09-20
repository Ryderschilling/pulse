import { NextResponse } from "next/server";
import { expectedToken, COOKIE_NAME, SESSION_MAX_AGE } from "./lib/token";

// Everything is gated except: login, auth API, the public snippet, the collect
// endpoint the snippet posts to, the lead webhook and Twilio callbacks (each
// has its own secret), the cron (CRON_SECRET), and Next internals.
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/collect") ||
    pathname.startsWith("/api/lead") ||
    pathname.startsWith("/api/twilio/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/p.js" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";
  if (isPublic) return NextResponse.next();

  const token = await expectedToken();
  if (!token) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === token) {
    const res = NextResponse.next();
    if (pathname === "/" || pathname.startsWith("/api")) {
      res.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
    }
    return res;
  }
  if (pathname.startsWith("/api")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  const back = pathname + (req.nextUrl.search || "");
  url.pathname = "/login";
  url.search = back === "/" ? "" : "?next=" + encodeURIComponent(back);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
