"use client";
import React, { useMemo, useState } from "react";
import { PhoneCall, FileText, Mail, CalendarCheck, MessageSquare, Sparkles } from "lucide-react";
import { Kpi, Skeleton, PageHead, TypeBadge } from "@/components/bits";
import { ColumnChart, ListBars } from "@/components/charts";
import { num, fmtDate, typeMeta, trunc, secs } from "@/lib/format";

const ICONS = { call: <PhoneCall size={13} />, form: <FileText size={13} />, email: <Mail size={13} />, booking: <CalendarCheck size={13} />, sms: <MessageSquare size={13} />, custom: <Sparkles size={13} /> };
const ORDER = ["call", "form", "email", "booking", "sms", "custom"];

export default function Conversions({ site, data, loading }) {
  const [filter, setFilter] = useState("all");
  const byDay = useMemo(() => {
    if (!data) return [];
    const m = {};
    for (const r of data.byDay) { (m[r.day] ||= { day: r.day })[r.type] = r.n; }
    // fill the gaps so the x axis is continuous
    const out = [];
    const d = new Date(data.from + "T00:00:00Z"), end = new Date(data.to + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const k = d.toISOString().slice(0, 10); out.push(m[k] || { day: k }); }
    return out;
  }, [data]);
  if (loading || !data) return <Skeleton />;
  const s = data.summary, p = data.prevSummary;
  const present = ORDER.filter((t) => data.byType.some((r) => r.type === t));
  const series = (present.length ? present : ["call", "form"]).map((t) => ({ key: t, label: typeMeta(t).label, color: typeMeta(t).color }));
  const recent = filter === "all" ? data.recent : data.recent.filter((r) => r.type === filter);
  const byPage = data.byPage.filter((r) => filter === "all" || r.type === filter);
  const pageTotals = Object.values(byPage.reduce((a, r) => { (a[r.path] ||= { name: r.path, value: 0, parts: {} }); a[r.path].value += r.n; a[r.path].parts[r.type] = (a[r.path].parts[r.type] || 0) + r.n; return a; }, {}))
    .sort((a, b) => b.value - a.value).slice(0, 10)
    .map((r) => ({ ...r, extra: Object.entries(r.parts).map(([t, n]) => `${n} ${typeMeta(t).one.toLowerCase()}`).join(" · ") }));
  const labels = Object.values(byPage.reduce((a, r) => { const k = r.type + "|" + (r.label || r.type); (a[k] ||= { name: r.label || typeMeta(r.type).one, sub: typeMeta(r.type).one, value: 0, color: typeMeta(r.type).color }); a[k].value += r.n; return a; }, {})).sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <div className="fade-in">
      <PageHead title="Conversions" sub={`${site.domain} · every call, form, email and booking, and the page it happened on`} />
      <div className="kpi-grid">
        <Kpi label="Calls" icon={ICONS.call} value={s.calls} prev={p.calls} tone="green" />
        <Kpi label="Forms" icon={ICONS.form} value={s.forms} prev={p.forms} tone="accent" />
        <Kpi label="Emails" icon={ICONS.email} value={s.emails} prev={p.emails} />
        <Kpi label="Bookings" icon={ICONS.booking} value={s.bookings} prev={p.bookings} />
        <Kpi label="Texts" icon={ICONS.sms} value={s.sms} prev={p.sms} />
        <Kpi label="Per 100 visitors" value={s.visitors ? (s.conversions / s.visitors) * 100 : null} prev={p.visitors ? (p.conversions / p.visitors) * 100 : undefined} format={(v) => v.toFixed(1)} sub={`${num(s.conversions)} actions total`} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h4>By day <span className="hint">stacked by type</span></h4>
        <ColumnChart data={byDay} series={series} />
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={"tab" + (filter === "all" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setFilter("all")}>All</button>
        {present.map((t) => <button key={t} className={"tab" + (filter === t ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setFilter(t)}>{typeMeta(t).label}</button>)}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>Which pages convert</h4>
          <ListBars rows={pageTotals} color="var(--green)" empty="No conversions yet." />
        </div>
        <div className="card">
          <h4>Which buttons and links <span className="hint">by label</span></h4>
          <ListBars rows={labels} empty="No conversions yet." />
          <div className="note">Same number tapped from three different buttons shows as three rows. That tells you which placement earns the call.</div>
        </div>
      </div>

      <div className="card tight">
        <h4>Lead feed <span className="pill">{recent.length} shown</span></h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>What</th><th>Target</th><th>Page</th><th>Landed on</th><th>Source</th><th>Device</th><th className="num">Pages</th><th className="num">When</th></tr></thead>
            <tbody>
              {recent.length ? recent.map((r) => (
                <tr key={r.id}>
                  <td><TypeBadge type={r.type} /></td>
                  <td>{r.label ? <b>{trunc(r.label, 28)}</b> : null}{r.href && <div className="sub mono">{trunc(r.href.replace(/^(tel|mailto|sms):/, ""), 40)}</div>}</td>
                  <td className="path mono">{r.path}</td>
                  <td className="mono muted">{r.entry_path || "—"}</td>
                  <td>{r.utm_source || r.ref_host || <span className="em">direct</span>}</td>
                  <td className="muted" style={{ textTransform: "capitalize" }}>{r.device || "—"}{r.country ? ` · ${r.country}` : ""}</td>
                  <td className="num">{r.pages_seen}</td>
                  <td className="num muted">{fmtDate(r.created_at)}</td>
                </tr>
              )) : <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 30 }}>No conversions in this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
