"use client";
import React, { useMemo, useState } from "react";
import { PhoneCall, FileText, Mail, CalendarCheck, MessageSquare, Sparkles, PhoneMissed } from "lucide-react";
import { Kpi, Skeleton, PageHead, TypeBadge } from "@/components/bits";
import { ColumnChart, ListBars } from "@/components/charts";
import { num, fmtDate, typeMeta, trunc, secs } from "@/lib/format";

const ICONS = { call: <PhoneCall size={13} />, form: <FileText size={13} />, email: <Mail size={13} />, booking: <CalendarCheck size={13} />, sms: <MessageSquare size={13} />, custom: <Sparkles size={13} /> };
const ORDER = ["call", "form", "email", "booking", "sms", "custom"];

function phone(n) {
  const d = String(n || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n || "—";
}

export default function Conversions({ site, data, loading }) {
  const [filter, setFilter] = useState("all");
  const byDay = useMemo(() => {
    if (!data) return [];
    const m = {};
    for (const r of data.byDay) { (m[r.day] ||= { day: r.day })[r.type] = r.n; }
    const out = [];
    const d = new Date(data.from + "T00:00:00Z"), end = new Date(data.to + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const k = d.toISOString().slice(0, 10); out.push(m[k] || { day: k }); }
    return out;
  }, [data]);
  if (loading || !data) return <Skeleton />;
  const s = data.summary, p = data.prevSummary;
  const tracked = !!(site.tracking_number && site.tracking_number.trim());
  const webhook = site.form_source === "webhook";
  const present = ORDER.filter((t) => data.byType.some((r) => r.type === t));
  const series = (present.length ? present : ["call", "form"]).map((t) => ({ key: t, label: typeMeta(t).label, color: typeMeta(t).color }));
  const recent = filter === "all" ? data.recent : data.recent.filter((r) => r.type === filter);
  const byPage = data.byPage.filter((r) => (filter === "all" || r.type === filter) && r.path);
  const pageTotals = Object.values(byPage.reduce((a, r) => { (a[r.path] ||= { name: r.path, value: 0, parts: {} }); a[r.path].value += r.n; a[r.path].parts[r.type] = (a[r.path].parts[r.type] || 0) + r.n; return a; }, {}))
    .sort((a, b) => b.value - a.value).slice(0, 10)
    .map((r) => ({ ...r, extra: Object.entries(r.parts).map(([t, n]) => `${n} ${typeMeta(t).one.toLowerCase()}`).join(" · ") }));
  const labels = Object.values(data.byPage.filter((r) => filter === "all" || r.type === filter).reduce((a, r) => { const k = r.type + "|" + (r.label || r.type); (a[k] ||= { name: r.label || typeMeta(r.type).one, sub: typeMeta(r.type).one, value: 0, color: typeMeta(r.type).color }); a[k].value += r.n; return a; }, {})).sort((a, b) => b.value - a.value).slice(0, 10);
  const devices = Object.values((data.byDevice || []).reduce((a, r) => { (a[r.device] ||= { name: r.device === "unknown" ? "phone / server" : r.device, value: 0, parts: [] }); a[r.device].value += r.n; a[r.device].parts.push(`${r.n} ${typeMeta(r.type).label.toLowerCase()}`); return a; }, {})).map((r) => ({ ...r, extra: r.parts.join(" · "), color: r.name === "mobile" ? "var(--purple)" : r.name === "tablet" ? "var(--teal)" : r.name === "desktop" ? "var(--accent)" : "var(--green)" }));
  const calls = data.calls || [];
  const answered = calls.filter((c) => c.answered);
  const leads = data.leads || [];

  return (
    <div className="fade-in">
      <PageHead title="Conversions" sub={`${site.domain} · one lead per visit per type: calls, forms, emails, bookings, and the page it happened on`} />
      <div className="kpi-grid">
        <Kpi label={tracked ? "Calls (tracked)" : "Calls"} icon={ICONS.call} value={s.calls} prev={p.calls} tone="green" sub={tracked ? `${answered.length} answered · ${calls.length - answered.length} missed` : s.call_taps ? `${num(s.call_taps)} taps recorded` : "phone taps"} />
        <Kpi label="Forms" icon={ICONS.form} value={s.forms} prev={p.forms} tone="accent" sub={webhook ? "confirmed by the site" : s.form_attempts ? `${num(s.form_attempts)} attempts` : "submits"} />
        <Kpi label="Emails" icon={ICONS.email} value={s.emails} prev={p.emails} />
        <Kpi label="Bookings" icon={ICONS.booking} value={s.bookings} prev={p.bookings} />
        <Kpi label="Texts" icon={ICONS.sms} value={s.sms} prev={p.sms} />
        <Kpi label="Per 100 visitors" value={s.visitors ? (s.conversions / s.visitors) * 100 : null} prev={p.visitors ? (p.conversions / p.visitors) * 100 : undefined} format={(v) => v.toFixed(1)} sub={`${num(s.conversions)} leads total`} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h4>By day <span className="hint">stacked by type</span></h4>
        <ColumnChart data={byDay} series={series} />
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={"tab" + (filter === "all" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setFilter("all")}>All</button>
        {present.map((t) => <button key={t} className={"tab" + (filter === t ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setFilter(t)}>{typeMeta(t).label}</button>)}
      </div>

      <div className="grid-3">
        <div className="card">
          <h4>Which pages convert</h4>
          <ListBars rows={pageTotals} color="var(--green)" empty="No leads yet." />
        </div>
        <div className="card">
          <h4>Which buttons and links <span className="hint">by label</span></h4>
          <ListBars rows={labels} empty="No leads yet." />
          <div className="note">Same number tapped from three different buttons shows as three rows. That tells you which placement earns the call.</div>
        </div>
        <div className="card">
          <h4>By device</h4>
          <ListBars rows={devices} empty="No leads yet." />
          <div className="note">A desktop phone tap usually cannot dial. If desktop calls are high and the tracking number is quiet, people are reading the number and dialing by hand.</div>
        </div>
      </div>

      {tracked && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <h4>Phone calls <span className="pill">{calls.length} in range</span> <span className="hint">through {phone(site.tracking_number)}, forwarded to {phone(site.forward_to)}</span></h4>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Caller</th><th>From</th><th>Outcome</th><th className="num">Talk time</th><th>Recording</th><th className="num">When</th></tr></thead>
              <tbody>
                {calls.length ? calls.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{phone(c.from_number)}</td>
                    <td className="muted">{[c.caller_city, c.caller_state].filter(Boolean).join(", ") || "—"}</td>
                    <td>{c.answered ? <span className="badge" style={{ background: "var(--panel2)", color: "var(--green)" }}><PhoneCall size={11} /> answered</span> : <span className="badge" style={{ background: "var(--panel2)", color: "var(--amber)" }}><PhoneMissed size={11} /> {c.status === "ringing" ? "in progress" : c.status || "missed"}</span>}</td>
                    <td className="num">{c.duration ? secs(c.duration) : "—"}</td>
                    <td>{c.recording_url ? <a href={c.recording_url} target="_blank" rel="noreferrer">listen</a> : <span className="em">—</span>}</td>
                    <td className="num muted">{fmtDate(c.started_at)}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>No calls yet on the tracking number.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(webhook || leads.length > 0) && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <h4>Form and booking leads <span className="pill">{leads.length} in range</span> <span className="hint">confirmed by the site's own handler</span></h4>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Kind</th><th>Name</th><th>Contact</th><th>Message</th><th>Page</th><th className="num">When</th></tr></thead>
              <tbody>
                {leads.length ? leads.map((l) => (
                  <tr key={l.id}>
                    <td><TypeBadge type={l.kind} /></td>
                    <td><b>{l.name || "—"}</b>{l.source && <div className="sub">{l.source}</div>}</td>
                    <td>{l.email && <div>{l.email}</div>}{l.phone && <div className="mono">{phone(l.phone)}</div>}{!l.email && !l.phone && "—"}</td>
                    <td className="muted" title={l.message}>{trunc(l.message, 70) || "—"}</td>
                    <td className="path mono">{l.path || "—"}</td>
                    <td className="num muted">{fmtDate(l.created_at)}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>No leads through the webhook yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card tight">
        <h4>Lead feed <span className="pill">{recent.length} shown</span></h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>What</th><th>Target</th><th>Page</th><th>Landed on</th><th>Source</th><th>Device</th><th className="num">Pages</th><th className="num">When</th></tr></thead>
            <tbody>
              {recent.length ? recent.map((r) => (
                <tr key={r.id}>
                  <td><TypeBadge type={r.type} /></td>
                  <td>{r.label ? <b>{trunc(r.label, 28)}</b> : null}{r.href && <div className="sub mono">{trunc(r.href.replace(/^(tel|mailto|sms):/, ""), 40)}</div>}{r.meta && r.meta.tracked && r.value ? <div className="sub">{secs(r.value)} on the line</div> : null}</td>
                  <td className="path mono">{r.path || <span className="em">phone</span>}</td>
                  <td className="mono muted">{r.entry_path || "—"}</td>
                  <td>{r.utm_source || r.ref_host || <span className="em">direct</span>}</td>
                  <td className="muted" style={{ textTransform: "capitalize" }}>{r.device || (r.meta && r.meta.tracked ? "phone" : "—")}{r.country ? ` · ${r.country}` : ""}</td>
                  <td className="num">{r.pages_seen}</td>
                  <td className="num muted">{fmtDate(r.created_at)}</td>
                </tr>
              )) : <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 30 }}>No leads in this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
