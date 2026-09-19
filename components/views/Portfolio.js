"use client";
// Cross-site benchmarks. Every number is a count over real events inside each
// site's first N days, and a site only counts once it has actually been live
// N days. This is the page that turns "trust me" into "here is the average".
import React, { useEffect, useMemo, useState } from "react";
import { Layers, Target, Timer, TrendingUp, Copy, Check } from "lucide-react";
import { PageHead } from "@/components/bits";
import { LineChart, ListBars } from "@/components/charts";
import { num, fmtDay, secs, ago, typeMeta } from "@/lib/format";

const WINDOWS = [30, 60, 90];

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function fmt1(v) { return v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1); }

export default function Portfolio({ showToast, go }) {
  const [w, setW] = useState(60);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let dead = false;
    setData(null); setErr("");
    fetch(`/api/stats?view=portfolio&window=${w}`).then((r) => r.json()).then((j) => { if (dead) return; if (j.error) setErr(j.error); else setData(j); }).catch((e) => setErr(e.message));
    return () => { dead = true; };
  }, [w]);

  const m = useMemo(() => {
    if (!data || !data.sites) return null;
    const all = data.sites;
    const done = all.filter((s) => s.complete);
    const conv = done.map((s) => s.conversions);
    const withLead = done.filter((s) => s.conversions > 0);
    const firstLead = withLead.map((s) => s.days_to_first_lead).filter((d) => d != null);
    const rates = done.filter((s) => s.visitors > 0).map((s) => (s.conversions / s.visitors) * 100);
    const calls = done.map((s) => s.calls), forms = done.map((s) => s.forms);
    const byNiche = {};
    for (const s of done) {
      const k = s.niche || "Uncategorized";
      (byNiche[k] ||= { niche: k, sites: 0, conv: [], visitors: 0, firstLead: [] });
      byNiche[k].sites++; byNiche[k].conv.push(s.conversions); byNiche[k].visitors += s.visitors;
      if (s.days_to_first_lead != null) byNiche[k].firstLead.push(s.days_to_first_lead);
    }
    return {
      all, done, pending: all.filter((s) => !s.complete),
      avgConv: avg(conv), medConv: median(conv), minConv: conv.length ? Math.min(...conv) : null,
      hitRate: done.length ? withLead.length / done.length : null,
      avgFirstLead: avg(firstLead), maxFirstLead: firstLead.length ? Math.max(...firstLead) : null,
      avgRate: avg(rates), avgCalls: avg(calls), avgForms: avg(forms),
      avgVisitors: avg(done.map((s) => s.visitors)),
      byNiche: Object.values(byNiche).map((n) => ({ ...n, avgConv: avg(n.conv), medConv: median(n.conv), avgFirstLead: avg(n.firstLead), hit: n.conv.filter((c) => c > 0).length })).sort((a, b) => b.sites - a.sites),
    };
  }, [data]);

  const proof = useMemo(() => {
    if (w === "all" || !m || !m.done.length) return [];
    const n = m.done.length;
    const lines = [];
    lines.push(`Across ${n} site${n > 1 ? "s" : ""} live ${w}+ days, the average site produced ${fmt1(m.avgConv)} leads (calls, forms, emails, bookings) in its first ${w} days. Median ${fmt1(m.medConv)}, lowest ${fmt1(m.minConv)}.`);
    if (m.hitRate != null) lines.push(`${Math.round(m.hitRate * 100)}% of sites got at least one lead inside ${w} days.`);
    if (m.avgFirstLead != null) lines.push(`The first lead arrived ${fmt1(m.avgFirstLead)} days after launch on average, and never later than day ${m.maxFirstLead}.`);
    if (m.avgRate != null) lines.push(`${fmt1(m.avgRate)}% of visitors take an action, about ${fmt1(m.avgCalls)} calls and ${fmt1(m.avgForms)} form submits per site in the window.`);
    return lines;
  }, [m, w]);

  async function copyProof() {
    try { await navigator.clipboard.writeText(proof.join("\n")); setCopied(true); showToast && showToast("Copied"); setTimeout(() => setCopied(false), 1500); } catch (e) {}
  }

  return (
    <div className="fade-in">
      <PageHead title="Portfolio" sub="Every site side by side, measured from its launch day. Use this to price and to promise." right={
        <div className="seg" role="tablist" aria-label="Window">
          {WINDOWS.map((d) => <button key={d} role="tab" aria-selected={w === d} className={w === d ? "on" : ""} onClick={() => setW(d)}>First {d} days</button>)}
          <button role="tab" aria-selected={w === "all"} className={w === "all" ? "on" : ""} onClick={() => setW("all")}>All time</button>
        </div>
      } />

      {err && <div className="card" style={{ borderColor: "#3a2626", color: "var(--red)", marginBottom: 14 }}>{err}</div>}
      {!data || (w === "all" ? !data.totals : !data.sites) ? (
        <div className="fade-in"><div className="kpi-grid">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" style={{ height: 96 }} />)}</div><div className="skel" style={{ height: 260 }} /></div>
      ) : w === "all" ? (
        <AllTime d={data} go={go} />
      ) : !m.all.length ? (
        <div className="empty"><h3>No sites yet</h3><p>Add sites and set each one's launch date. This page fills itself in.</p></div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="label"><Layers size={13} /> Sites live {w}+ days</div><div className="val">{m.done.length}<span className="muted" style={{ fontSize: 15, fontWeight: 600 }}> / {m.all.length}</span></div><div className="sub">{m.pending.length ? `${m.pending.filter((s) => s.days_live != null).length} inside the window · ${m.pending.filter((s) => s.days_live == null).length} without a launch date` : "all sites counted"}</div></div>
            <div className="kpi green"><div className="label"><Target size={13} /> Avg leads, first {w} days</div><div className="val">{fmt1(m.avgConv)}</div><div className="sub">median {fmt1(m.medConv)} · lowest {fmt1(m.minConv)}</div></div>
            <div className="kpi"><div className="label"><TrendingUp size={13} /> Got a lead in {w} days</div><div className="val">{m.hitRate == null ? "—" : Math.round(m.hitRate * 100) + "%"}</div><div className="sub">{m.done.filter((s) => s.conversions > 0).length} of {m.done.length} sites</div></div>
            <div className="kpi"><div className="label"><Timer size={13} /> Days to first lead</div><div className="val">{fmt1(m.avgFirstLead)}</div><div className="sub">{m.maxFirstLead != null ? `slowest site: day ${m.maxFirstLead}` : "no leads yet"}</div></div>
            <div className="kpi accent"><div className="label">Avg conversion rate</div><div className="val">{m.avgRate == null ? "—" : fmt1(m.avgRate) + "%"}</div><div className="sub">{fmt1(m.avgVisitors)} visitors per site</div></div>
          </div>

          <div className="grid-32">
            <div className="card">
              <h4>Leads after launch <span className="hint">average running total across sites, by day since launch</span></h4>
              <LineChart data={data.curve.map((c) => ({ day: c.day, avg: c.avg_conversions, sites: c.sites_live }))} series={[{ key: "avg", label: "Avg leads so far", color: "var(--green)", area: true }]} yFormat={(v) => fmt1(v)} xFormat={(d) => "day " + d} />
              <div className="note">Each day only averages the sites that were actually live that day. The curve steepening means later days earn more leads, which is the SEO story.</div>
            </div>
            <div className="card">
              <h4>Proof lines <button className="btn ghost sm" onClick={copyProof} disabled={!proof.length}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</button></h4>
              {proof.length ? proof.map((l, i) => <p key={i} style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 10, paddingLeft: 12, borderLeft: "2px solid var(--green)" }}>{l}</p>) : <p className="muted" style={{ fontSize: 13 }}>No site has been live {w} days yet. Lines write themselves once one has.</p>}
              <div className="note">Written from the numbers above, nothing rounded up. Paste into a proposal or a LinkedIn post. Set a guarantee at or below the <b>lowest</b> site, not the average.</div>
            </div>
          </div>

          {m.byNiche.length > 0 && (
            <div className="card tight" style={{ marginBottom: 14 }}>
              <h4>By niche <span className="hint">set each site's niche in Sites & setup</span></h4>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Niche</th><th className="num">Sites</th><th className="num">Avg leads</th><th className="num">Median</th><th className="num">Got a lead</th><th className="num">Days to first</th><th className="num">Visitors / site</th></tr></thead>
                  <tbody>{m.byNiche.map((n) => (
                    <tr key={n.niche}><td><b>{n.niche}</b></td><td className="num">{n.sites}</td><td className="num" style={{ color: "var(--green)", fontWeight: 700 }}>{fmt1(n.avgConv)}</td><td className="num">{fmt1(n.medConv)}</td><td className="num">{n.hit} / {n.sites}</td><td className="num">{fmt1(n.avgFirstLead)}</td><td className="num">{fmt1(n.visitors / n.sites)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card tight">
            <h4>Every site, first {w} days</h4>
            <div className="table-scroll" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Site</th><th>Niche</th><th>Source</th><th>Launched</th><th className="num">Days live</th><th className="num">Visitors</th><th className="num">Leads</th><th className="num">Calls</th><th className="num">Forms</th><th className="num">Conv. rate</th><th className="num">First lead</th><th className="num">All-time leads</th></tr></thead>
                <tbody>{m.all.map((s) => (
                  <tr key={s.id} style={{ opacity: s.complete ? 1 : s.days_live == null ? 0.45 : 0.6 }}>
                    <td><b>{s.name}</b><div className="sub">{s.domain}</div></td>
                    <td className="muted">{s.niche || <span className="em">—</span>}</td>
                    <td><SourceTag s={s} /></td>
                    <td className="muted">{s.day0 ? fmtDay(String(s.day0).slice(0, 10), true) : "—"}</td>
                    <td className="num">{s.days_live == null ? <span className="badge" style={{ background: "var(--panel2)", color: "var(--amber)" }}>no launch date</span> : <>{s.days_live}{!s.complete && <span className="badge" style={{ marginLeft: 6, background: "var(--panel2)", color: "var(--amber)" }}>in window</span>}</>}</td>
                    <td className="num">{num(s.visitors)}</td>
                    <td className="num" style={{ color: "var(--green)", fontWeight: 700 }}>{num(s.conversions)}</td>
                    <td className="num">{num(s.calls)}</td>
                    <td className="num">{num(s.forms)}</td>
                    <td className="num">{s.visitors ? ((s.conversions / s.visitors) * 100).toFixed(1) + "%" : <span className="em">—</span>}</td>
                    <td className="num">{s.days_to_first_lead == null ? <span className="em">none yet</span> : `day ${s.days_to_first_lead}`}</td>
                    <td className="num muted">{num(s.conversions_all)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="card-foot"><span>Day 0 is the launch date on each site, or its first recorded visit when none is set.</span><button className="btn ghost sm" onClick={() => go("settings")}>Set launch dates</button></div>
          </div>
        </>
      )}
    </div>
  );
}


function AllTime({ d, go }) {
  const t = d.totals;
  const rate = t.visitors ? (t.conversions / t.visitors) * 100 : null;
  const bySite = d.perSite;
  const withData = bySite.filter((s) => s.pageviews > 0);
  const niches = Object.values(withData.reduce((a, s) => {
    const k = s.niche || "Uncategorized";
    (a[k] ||= { niche: k, sites: 0, visitors: 0, sessions: 0, conversions: 0 });
    a[k].sites++; a[k].visitors += s.visitors; a[k].sessions += s.sessions; a[k].conversions += s.conversions;
    return a;
  }, {})).sort((a, b) => b.conversions - a.conversions);
  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><div className="label"><Layers size={13} /> Sites tracked</div><div className="val">{t.sites_with_data}<span className="muted" style={{ fontSize: 15, fontWeight: 600 }}> / {t.sites}</span></div><div className="sub">{t.sites - t.sites_with_data ? `${t.sites - t.sites_with_data} waiting on the snippet` : "all sending data"}</div></div>
        <div className="kpi"><div className="label">Visitors, all time</div><div className="val">{num(t.visitors)}</div><div className="sub">{num(t.sessions)} sessions · {num(t.pageviews)} views</div></div>
        <div className="kpi green"><div className="label"><Target size={13} /> Leads, all time</div><div className="val">{num(t.conversions)}</div><div className="sub">{num(t.calls)} calls · {num(t.forms)} forms · {num(t.emails)} emails · {num(t.bookings)} bookings</div></div>
        <div className="kpi accent"><div className="label">Conversion rate</div><div className="val">{rate == null ? "—" : rate.toFixed(1) + "%"}</div><div className="sub">leads per 100 visitors</div></div>
        <div className="kpi"><div className="label">Per site</div><div className="val">{withData.length ? fmt1(t.conversions / withData.length) : "—"}</div><div className="sub">avg leads per tracked site</div></div>
        <div className="kpi"><div className="label"><Timer size={13} /> Time on page</div><div className="val">{secs(t.avg_seconds)}</div><div className="sub">{t.avg_scroll != null ? `${t.avg_scroll}% avg scroll` : "Pulse days only"}</div></div>
      </div>
      {t.ga4_days > 0 && <div className="note" style={{ marginTop: -8, marginBottom: 14 }}>{num(t.ga4_days)} site-days come from the GA4 backfill (days before the snippet was installed), {num(t.pulse_days)} from Pulse. Referrers, devices and lead pages below are Pulse-only.</div>}

      <div className="grid-32">
        <div className="card">
          <h4>Visitors and leads by month <span className="hint">every site combined</span></h4>
          <LineChart data={d.monthly} series={[{ key: "visitors", label: "Visitors", color: "var(--accent)", area: true }, { key: "conversions", label: "Leads", color: "var(--green)" }]} xFormat={(day, long) => new Date(day + "T00:00:00").toLocaleDateString("en-US", { month: "short", ...(long ? { year: "numeric" } : {}) })} />
        </div>
        <div className="card">
          <h4>What people did <span className="pill">{num(t.conversions)} total</span></h4>
          <ListBars rows={d.byType.map((r) => ({ name: typeMeta(r.type).label, value: r.n, color: typeMeta(r.type).color }))} empty="No leads recorded yet." />
        </div>
      </div>

      <div className="grid-3">
        <div className="card"><h4>Where visitors come from</h4><ListBars rows={d.referrers.map((r) => ({ name: r.source, value: r.sessions, extra: r.converted ? `${r.converted} conv` : undefined }))} empty="No visits yet." /></div>
        <div className="card"><h4>Devices</h4><ListBars rows={d.devices.map((r) => ({ name: r.device, value: r.sessions, extra: r.sessions ? `${((100 * r.converted) / r.sessions).toFixed(0)}% convert` : undefined, color: r.device === "mobile" ? "var(--purple)" : r.device === "tablet" ? "var(--teal)" : "var(--accent)" }))} empty="No visits yet." /></div>
        <div className="card"><h4>Pages that produce leads <span className="hint">any site</span></h4><ListBars rows={d.convPages.map((r) => ({ name: r.path, sub: r.name, value: r.n }))} color="var(--green)" empty="No leads yet." /></div>
      </div>

      {niches.length > 0 && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <h4>By niche, all time</h4>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Niche</th><th className="num">Sites</th><th className="num">Visitors</th><th className="num">Leads</th><th className="num">Leads / site</th><th className="num">Conv. rate</th></tr></thead>
              <tbody>{niches.map((n) => (
                <tr key={n.niche}><td><b>{n.niche}</b></td><td className="num">{n.sites}</td><td className="num">{num(n.visitors)}</td><td className="num" style={{ color: "var(--green)", fontWeight: 700 }}>{num(n.conversions)}</td><td className="num">{fmt1(n.conversions / n.sites)}</td><td className="num">{n.visitors ? ((100 * n.conversions) / n.visitors).toFixed(1) + "%" : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card tight">
        <h4>Every site, all time</h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Site</th><th>Niche</th><th>Source</th><th className="num">Visitors</th><th className="num">Views</th><th className="num">Leads</th><th className="num">Calls</th><th className="num">Forms</th><th className="num">Conv. rate</th><th className="num">Time</th><th className="num">Last data</th></tr></thead>
            <tbody>{bySite.map((s) => (
              <tr key={s.id} style={{ opacity: s.pageviews ? 1 : 0.55 }}>
                <td><b>{s.name}</b><div className="sub">{s.domain}</div></td>
                <td className="muted">{s.niche || <span className="em">—</span>}</td>
                <td><SourceTag s={s} /></td>
                <td className="num">{s.pageviews ? num(s.visitors) : <span className="em">—</span>}</td>
                <td className="num">{s.pageviews ? num(s.pageviews) : <span className="em">—</span>}</td>
                <td className="num" style={{ color: s.conversions ? "var(--green)" : undefined, fontWeight: s.conversions ? 700 : 400 }}>{s.pageviews ? num(s.conversions) : <span className="em">—</span>}</td>
                <td className="num">{s.pageviews ? num(s.calls) : <span className="em">—</span>}</td>
                <td className="num">{s.pageviews ? num(s.forms) : <span className="em">—</span>}</td>
                <td className="num">{s.visitors ? ((100 * s.conversions) / s.visitors).toFixed(1) + "%" : <span className="em">—</span>}</td>
                <td className="num">{s.avg_seconds == null ? <span className="em">—</span> : secs(s.avg_seconds)}</td>
                <td className="num muted">{s.last_hit ? ago(s.last_hit) : s.last_seen ? fmtDay(s.last_seen) : <span className="em">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card-foot"><span>All time means every day ever recorded, Pulse first, GA4 history where Pulse was not installed yet.</span><button className="btn ghost sm" onClick={() => go("settings")}>Install snippets</button></div>
      </div>
    </>
  );
}

function SourceTag({ s }) {
  if (s.has_pulse && s.has_ga4) return <span className="badge" style={{ background: "var(--panel2)", color: "var(--teal)" }}>Pulse + GA4</span>;
  if (s.has_pulse) return <span className="badge" style={{ background: "var(--panel2)", color: "var(--green)" }}>Pulse</span>;
  if (s.has_ga4) return <span className="badge" style={{ background: "var(--panel2)", color: "var(--blue)" }}>GA4 history</span>;
  return <span className="badge" style={{ background: "var(--panel2)", color: "var(--amber)" }}>no data</span>;
}
