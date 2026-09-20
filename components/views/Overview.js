"use client";
import React from "react";
import { Users, Eye, PhoneCall, FileText, Percent, Timer, Zap } from "lucide-react";
import { Kpi, Skeleton, PageHead, TypeBadge } from "@/components/bits";
import { LineChart, ListBars } from "@/components/charts";
import { num, pct, secs, fmtDay, ago, typeMeta, trunc } from "@/lib/format";

export default function Overview({ site, range, data, loading, go }) {
  if (loading || !data) return <Skeleton />;
  const s = data.summary, p = data.prevSummary;
  const convRate = s.visitors ? s.conversions / s.visitors : 0;
  const prevRate = p.visitors ? p.conversions / p.visitors : 0;
  const noData = !s.pageviews;
  const ga4Only = !s.pulse_pageviews && s.ga_days > 0;
  const tracked = !!(site.tracking_number && site.tracking_number.trim());
  const webhook = site.form_source === "webhook";
  const days = Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1;

  return (
    <div className="fade-in">
      <PageHead title="Overview" sub={`${site.domain} · ${fmtDay(range.from, true)} to ${fmtDay(range.to, true)}, compared with the ${days} days before`} />

      <div className="kpi-grid">
        <Kpi label="Engaged visits" icon={<Zap size={13} />} value={s.engaged_sessions} prev={p.engaged_sessions} tone="accent" sub={`of ${num(s.sessions)} visits · ${s.sessions ? pct(s.engaged_sessions, s.sessions, 0) : "—"} · 2+ pages, 10s+, or a lead`} />
        <Kpi label="Visitors" icon={<Users size={13} />} value={s.visitors} prev={p.visitors} sub={`${num(s.sessions)} sessions · ${num(s.pageviews)} views`} />
        <Kpi label="Calls" icon={<PhoneCall size={13} />} value={ga4Only && !tracked ? null : s.calls} prev={ga4Only && !tracked ? undefined : p.calls} tone="green" sub={tracked ? `tracked calls${s.call_taps ? ` · ${num(s.call_taps)} taps` : ""}` : ga4Only ? "unknown: GA4 cannot see phone taps" : "phone taps, one per visit"} />
        <Kpi label="Forms" icon={<FileText size={13} />} value={s.forms} prev={p.forms} sub={`${webhook ? "confirmed sends" : "submits"} · ${num(s.emails)} emails · ${num(s.bookings)} bookings`} />
        <Kpi label="Conversion rate" icon={<Percent size={13} />} value={s.visitors ? convRate * 100 : null} prev={p.visitors ? prevRate * 100 : undefined} format={(v) => v.toFixed(1) + "%"} sub={`${num(s.conversions)} leads from ${num(s.visitors)} visitors`} />
        <Kpi label="Time on page" icon={<Timer size={13} />} value={s.avg_seconds} prev={p.avg_seconds} format={secs} sub={s.avg_scroll != null ? `${s.avg_scroll}% avg scroll` : s.ga_days ? "Pulse days only" : ""} />
      </div>

      {s.ga_days > 0 && (
        <div className="note" style={{ marginTop: -8, marginBottom: 14 }}>
          {ga4Only ? `Every day in this range comes from GA4 history (the snippet has not reported yet).` : `${s.ga_days} of ${days} days come from GA4 history, the rest from the snippet.`} GA4 days count a visitor once per day and only see the lead events GA4 was told about. Engaged on GA4 days means Google's own engaged sessions.
        </div>
      )}

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
          <h4>Visitors, engaged and leads <span className="hint">by day</span></h4>
          <LineChart data={data.daily} series={[
            { key: "visitors", label: "Visitors", color: "var(--accent)", area: true },
            { key: "engaged", label: "Engaged", color: "var(--purple)" },
            { key: "conversions", label: "Leads", color: "var(--green)" },
          ]} />
          {data.daily.some((d) => d.src === "ga4") && <div className="note">Days marked from GA4 history use Google's counts for that day.</div>}
        </div>
        <div className="card">
          <h4>What people did <span className="pill">{num(s.conversions)} leads</span></h4>
          <ListBars
            rows={data.conversions.byType.map((r) => ({ name: typeMeta(r.type).label, value: r.n, color: typeMeta(r.type).color, extra: r.taps !== r.n ? `${r.taps} taps` : undefined }))}
            empty="No calls, forms or emails yet."
          />
          <div className="note">One lead per visit per type. {tracked ? "Calls are real calls through the tracking number." : "A call is a tap on a phone number."} {webhook ? "A form is a send the site's own handler confirmed." : "A form is a submit."} A booking is a click out to Calendly, Square, and the like.</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>Popular pages <button className="btn ghost sm" onClick={() => go("pages")}>All pages</button></h4>
          <ListBars rows={data.pages.map((r) => ({ name: r.path, sub: r.title && r.title !== r.path ? trunc(r.title, 36) : undefined, value: r.views, extra: r.conversions ? `${r.conversions} lead${r.conversions > 1 ? "s" : ""}` : undefined }))} empty={ga4Only ? "Page detail needs the snippet." : "No page views yet."} />
        </div>
        <div className="card">
          <h4>Where leads came from <button className="btn ghost sm" onClick={() => go("sources")}>Traffic</button></h4>
          <ListBars rows={data.conversions.bySource.map((r) => ({ name: r.source, value: r.n }))} color="var(--green)" empty="No leads yet." />
        </div>
      </div>

      <div className="card tight">
        <h4>Latest leads <button className="btn ghost sm" onClick={() => go("conversions")}>All leads</button></h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>What</th><th>On page</th><th>Came from</th><th>Device</th><th className="num">When</th></tr></thead>
            <tbody>
              {data.conversions.recent.length ? data.conversions.recent.map((r) => (
                <tr key={r.id}>
                  <td><TypeBadge type={r.type} /> <span className="muted" style={{ marginLeft: 6 }}>{trunc(r.label || r.href, 34)}</span></td>
                  <td className="path mono">{r.path || <span className="em">phone</span>}</td>
                  <td>{r.utm_source || r.ref_host || <span className="em">direct</span>}{r.entry_path && r.entry_path !== r.path && <div className="sub">landed on {r.entry_path}</div>}</td>
                  <td className="muted" style={{ textTransform: "capitalize" }}>{r.device || (r.meta && r.meta.tracked ? "phone" : "—")}</td>
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
