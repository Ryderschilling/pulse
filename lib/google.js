// GA4 Data API + Search Console, read with a service account. No googleapis
// package: a signed JWT swapped for an access token, then plain fetch.
import crypto from "crypto";
import fs from "fs";
import { q } from "@/lib/db";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return null;
}
export function googleConfigured() {
  return !!credentials();
}

let tokenCache = { token: null, exp: 0 };
async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const c = credentials();
  if (!c) throw new Error("Google service account not configured");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: c.client_email, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(c.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("Google token error: " + JSON.stringify(j));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

async function gfetch(url, body) {
  const token = await accessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || `Google ${res.status}`);
  return j;
}

// ---------- GA4 ----------
async function ga4Report(propertyId, body) {
  return gfetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body);
}
function rowsToObjects(report, dims, mets) {
  return (report.rows || []).map((r) => {
    const o = {};
    dims.forEach((d, i) => (o[d] = r.dimensionValues[i].value));
    mets.forEach((m, i) => (o[m] = Number(r.metricValues[i].value)));
    return o;
  });
}
export async function ga4(propertyId, from, to) {
  const range = { dateRanges: [{ startDate: from, endDate: to }] };
  const mets = ["sessions", "totalUsers", "engagedSessions", "screenPageViews", "averageSessionDuration"];
  const [totals, channels, sourceMedium, landing, devices, events] = await Promise.all([
    ga4Report(propertyId, { ...range, metrics: mets.map((name) => ({ name })) }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 12 }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 15 }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "landingPagePlusQueryString" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 15 }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }] }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 25 }),
  ]);
  const t = rowsToObjects(totals, [], mets)[0] || {};
  return {
    totals: t,
    channels: rowsToObjects(channels, ["channel"], ["sessions", "engagedSessions"]),
    sourceMedium: rowsToObjects(sourceMedium, ["sourceMedium"], ["sessions", "engagedSessions"]),
    landing: rowsToObjects(landing, ["page"], ["sessions", "engagedSessions"]),
    devices: rowsToObjects(devices, ["device"], ["sessions"]),
    events: rowsToObjects(events, ["event"], ["count"]).filter((e) => !/^(page_view|session_start|first_visit|user_engagement|scroll)$/.test(e.event)),
  };
}

// ---------- Search Console ----------
async function gscQuery(property, body) {
  return gfetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, body);
}
function gscRows(r, key) {
  return (r.rows || []).map((x) => ({ [key]: x.keys[0], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
}
export async function gsc(property, from, to) {
  const base = { startDate: from, endDate: to };
  const [totals, daily, queries, pages] = await Promise.all([
    gscQuery(property, { ...base }),
    gscQuery(property, { ...base, dimensions: ["date"] }),
    gscQuery(property, { ...base, dimensions: ["query"], rowLimit: 25 }),
    gscQuery(property, { ...base, dimensions: ["page"], rowLimit: 15 }),
  ]);
  const t = (totals.rows || [])[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    totals: { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
    daily: gscRows(daily, "day"),
    queries: gscRows(queries, "query"),
    pages: gscRows(pages, "page"),
  };
}

// Cache for an hour per site + range, so switching tabs is instant.
export async function cached(key, ttlMin, fn) {
  const hit = await q("select payload, fetched_at from google_cache where key=$1", [key]);
  if (hit.length && Date.now() - new Date(hit[0].fetched_at).getTime() < ttlMin * 60000) return hit[0].payload;
  const payload = await fn();
  await q(
    "insert into google_cache (key, payload, fetched_at) values ($1,$2,now()) on conflict (key) do update set payload=excluded.payload, fetched_at=now()",
    [key, JSON.stringify(payload)]
  );
  return payload;
}

// ---------- GA4 daily history (for backfill) ----------
// Event names are matched loosely so every client's naming scheme lands in a
// bucket: call_click / phone_click / click_to_call, lead_form_submit /
// form_submit / generate_lead / contact_form, email_click / mailto, booking_*.
const EVENT_BUCKETS = [
  ["calls", /call|phone|tel_/i],
  ["forms", /form|generate_lead|lead_submit|contact_submit|submit_/i],
  ["emails", /email|mailto/i],
  ["bookings", /book|schedule|appointment|calendly/i],
];
export async function ga4Daily(propertyId, from, to) {
  const range = { dateRanges: [{ startDate: from, endDate: to }] };
  const [traffic, events] = await Promise.all([
    ga4Report(propertyId, { ...range, dimensions: [{ name: "date" }], metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "engagedSessions" }], limit: 100000 }),
    ga4Report(propertyId, { ...range, dimensions: [{ name: "date" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 100000 }),
  ]);
  const days = {};
  for (const r of rowsToObjects(traffic, ["date"], ["totalUsers", "sessions", "screenPageViews", "engagedSessions"])) {
    const day = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
    days[day] = { day, users: r.totalUsers, sessions: r.sessions, pageviews: r.screenPageViews, engaged: r.engagedSessions, calls: 0, forms: 0, emails: 0, bookings: 0 };
  }
  for (const r of rowsToObjects(events, ["date", "eventName"], ["eventCount"])) {
    if (/^(page_view|session_start|first_visit|user_engagement|scroll|click|file_download|video_|view_)/.test(r.eventName)) continue;
    const day = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
    const b = EVENT_BUCKETS.find(([, re]) => re.test(r.eventName));
    if (!b) continue;
    (days[day] ||= { day, users: 0, sessions: 0, pageviews: 0, engaged: 0, calls: 0, forms: 0, emails: 0, bookings: 0 })[b[0]] += r.eventCount;
  }
  return Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
}
