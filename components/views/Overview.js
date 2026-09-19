"use client";
import React from "react";
import { Users, Eye, PhoneCall, FileText, Percent, Timer } from "lucide-react";
import { Kpi, Skeleton, PageHead, TypeBadge } from "@/components/bits";
import { LineChart, ListBars } from "@/components/charts";
import { num, pct, secs, fmtDay, ago, typeMeta, trunc } from "@/lib/format";

export default function Overview({ site, range, data, loading, go }) {
  if (loading || !data) return <Skeleton />;
  const s = data.summary, p = data.prevSummary;
  const convRate = s.sessions ? s.converting_sessions / s.sessions : 0;
  const prevRate = p.sessions ? p.converting_sessions / p.sessions : 0;
  const noData = !s.pageviews;

  return (
    <div className="fade-in">
      <PageHead title="Overview" sub={`${site.domain} · ${fmtDay(range.from, true)} to ${fmtDay(range.to, true)}, compared with the ${Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1} days before`} />

      <div className="kpi-grid">
        <Kpi label="Visitors" icon={<Users size={13} />} value={s.visitors} prev={p.visitors} sub={`${num(s.sessions)} sessions`} />
        <Kpi label="Page views" icon={<Eye size={13} />} value={s.pageviews} prev={p.pageviews} sub={s.sessions ? `${(s.pageviews / s.sessions).toFixed(1)} per session` : ""} />
        <Kpi label="Calls" icon={<PhoneCall size={13} />} value={s.calls} prev={p.calls} tone="green" sub="tel: taps" />
        <Kpi label="Forms" icon={<FileText size={13} />} value={s.forms} prev={p.forms} tone="accent" sub={`${num(s.emails)} emails · ${num(s.bookings)} bookings`} />
        <Kpi label="Conversion rate" icon={<Percent size={13} />} value={s.sessions ? convRate * 100 : null} prev={p.sessions ? prevRate * 100 : undefined} format={(v) => v.toFixed(1) + "%"} sub={`${num(s.converting_sessions)} of ${num(s.sessions)} sessions did something`} />
        <Kpi label="Time on page" icon={<Timer size={13} />} value={s.avg_seconds} prev={p.avg_seconds} format={secs} sub={s.avg_scroll != null ? `${s.avg_scroll}% avg scroll` : ""} />
      </div>

      {noData && (
        <div className="card" style={{ marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <b>No visits recorded yet for this range.</b>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>If the snippet is installed, the first numbers appear within a minute of someone landing on the site. Otherwise grab the install code in Sites & setup.</div>
          </div>
          <button className="btn" onClick={() => go("settings")}>Install snippet</button>
        </div>
      )}

      <div className="grid-32">
        <div className="card">
          <h4>Visitors and conversions <span className="hint">by day</span></h4>
          <LineChart data={data.daily} series={[
            { key: "visitors", label: "Visitors", color: "var(--accent)", area: true },
            { key: "conversions", label: "Conversions", color: "var(--green)" },
          ]} />
        </div>
        <div className="card">
          <h4>What people did <span className="pill">{num(s.conversions)} total</span></h4>
          <ListBars
            rows={data.conversions.byType.map((r) => ({ name: typeMeta(r.type).label, value: r.n, color: typeMeta(r.type).color, extra: r.sessions !== r.n ? `${r.sessions} sessions` : undefined }))}
            empty="No calls, forms or emails yet."
          />
          <div className="note">A call is a tap on a phone number. A form is a real submit. A booking is a click out to Calendly, Square, and the like.</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>Popular pages <button className="btn ghost sm" onClick={() => go("pages")}>All pages</button></h4>
          <ListBars rows={data.pages.map((r) => ({ name: r.path, sub: r.title && r.title !== r.path ? trunc(r.title, 36) : undefined, value: r.views, extra: r.conversions ? `${r.conversions} conv` : undefined }))} empty="No page views yet." />
        </div>
        <div className="card">
          <h4>Where converting visitors came from <button className="btn ghost sm" onClick={() => go("sources")}>Traffic</button></h4>
          <ListBars rows={data.conversions.bySource.map((r) => ({ name: r.source, value: r.n }))} color="var(--green)" empty="No conversions yet." />
        </div>
      </div>

      <div className="card tight">
        <h4>Latest leads <button className="btn ghost sm" onClick={() => go("conversions")}>All conversions</button></h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>What</th><th>On page</th><th>Came from</th><th>Device</th><th className="num">When</th></tr></thead>
            <tbody>
              {data.conversions.recent.length ? data.conversions.recent.map((r) => (
                <tr key={r.id}>
                  <td><TypeBadge type={r.type} /> <span className="muted" style={{ marginLeft: 6 }}>{trunc(r.label || r.href, 34)}</span></td>
                  <td className="path mono">{r.path}</td>
                  <td>{r.utm_source || r.ref_host || <span className="em">direct</span>}{r.entry_path && r.entry_path !== r.path && <div className="sub">landed on {r.entry_path}</div>}</td>
                  <td className="muted" style={{ textTransform: "capitalize" }}>{r.device || "—"}</td>
                  <td className="num muted" title={new Date(r.created_at).toLocaleString()}>{ago(r.created_at)}</td>
                </tr>
              )) : <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>Nothing yet. This fills in as calls and forms come through.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
