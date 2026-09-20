// Twilio helpers: signature check and number normalising. No SDK.
import crypto from "crypto";

export function digits(n) {
  const d = String(n || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
export function e164(n) {
  const d = digits(n);
  return d.length === 10 ? "+1" + d : d ? "+" + String(n).replace(/\D/g, "") : "";
}

// https://www.twilio.com/docs/usage/webhooks/webhooks-security
function expected(url, params, token) {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  return crypto.createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
}
export function validSignature(req, params) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true; // not configured: trust, but Settings warns
  const sig = req.headers.get("x-twilio-signature") || "";
  const u = new URL(req.url);
  const candidates = [u.toString()];
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (base) candidates.push(base + u.pathname + u.search);
  const proto = req.headers.get("x-forwarded-proto"), host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (proto && host) candidates.push(`${proto}://${host}${u.pathname}${u.search}`);
  return candidates.some((c) => {
    const e = expected(c, params, token);
    return e.length === sig.length && crypto.timingSafeEqual(Buffer.from(e), Buffer.from(sig));
  });
}

export async function formParams(req) {
  const text = await req.text();
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

export function twiml(inner) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
}
export function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
