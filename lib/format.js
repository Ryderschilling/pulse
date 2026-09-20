export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function fmtDay(iso, withYear = false) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}
export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function num(n) {
  if (n == null || isNaN(n)) return "—";
  n = Number(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 10000) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString("en-US");
}
export function pct(n, d, digits = 1) {
  if (!d) return "—";
  return ((n / d) * 100).toFixed(digits) + "%";
}
export function pctRaw(x, digits = 1) {
  if (x == null || isNaN(x)) return "—";
  return (x * 100).toFixed(digits) + "%";
}
export function secs(s) {
  if (s == null || isNaN(s)) return "—";
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
// Delta between now and previous period. Returns null when no baseline exists.
export function delta(now, prev) {
  if (prev == null || now == null) return null;
  if (!prev) return now ? { dir: "up", text: "new" } : null;
  const ch = (now - prev) / prev;
  const dir = Math.abs(ch) < 0.005 ? "flat" : ch > 0 ? "up" : "down";
  return { dir, text: (ch > 0 ? "+" : "") + (ch * 100).toFixed(0) + "%" };
}
export const TYPE_META = {
  call: { label: "Calls", color: "var(--green)", one: "Call" },
  form: { label: "Forms", color: "var(--accent)", one: "Form" },
  email: { label: "Emails", color: "var(--blue)", one: "Email" },
  booking: { label: "Bookings", color: "var(--purple)", one: "Booking" },
  sms: { label: "Texts", color: "var(--teal)", one: "Text" },
  custom: { label: "Custom", color: "var(--pink)", one: "Custom" },
  outbound: { label: "Outbound", color: "var(--amber)", one: "Outbound" },
  click: { label: "Clicks", color: "var(--muted)", one: "Click" },
  pageview: { label: "Views", color: "var(--muted)", one: "View" },
  call_tap: { label: "Call taps", color: "var(--muted)", one: "Call tap" },
  form_attempt: { label: "Form attempts", color: "var(--muted)", one: "Form attempt" },
};
export function typeMeta(t) { return TYPE_META[t] || { label: t, color: "var(--muted)", one: t }; }
export function shortHost(h) { return (h || "").replace(/^www\./, ""); }
export function trunc(s, n = 40) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
