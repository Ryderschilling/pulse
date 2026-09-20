"use client";
import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton, PageHead } from "@/components/bits";
import { ListBars, LineChart } from "@/components/charts";
import { num, pct, pctRaw, secs, fmtDay } from "@/lib/format";

export default function Sources({ site, range, data, loading, go }) {
  const [g, setG] = useState(null);
  const [gBusy, setGBusy] = useState(false);
  const [hist, setHist] = useState(null);
  const key = `${site?.id}|${range.from}|${range.to}`;
  useEffect(() => {
    let dead = false;
    setG(null);
    if (!site) return;
    if (!site.ga4_property_id && !site.gsc_property) { setG({ configured: null, ga4: null, gsc: null, errors: {}, skipped: true }); return; }
    setGBusy(true);
    fetch(`/api/google?site=${site.id}&from=${range.from}&to=${range.to}`).then((r) => r.json()).then((j) => { if (!dead) setG(j); }).catch((e) => !dead && setG({ errors: { all: e.message } })).finally(() => !dead && setGBusy(false));
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let dead = false;
    setHist(null);
    if (!site) return;
    fetch(`/api/stats?view=history&site=${site.id}&months=12`).then((r) => r.json()).then((j) => { if (!dead) setHist(j.months || []); }).catch(() => !dead && setHist([]));
    return () => { dead = true; };
  }, [site?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshGoogle() {
    setGBusy(true);
    const j = await fetch(`/api/google?site=${site.id}&from=${range.from}&to=${range.to}&refresh=1`).then((r) => r.json()).catch(() => null);
    if (j) setG(j);
    setGBusy(false);
  }

  if (loading || !data) return <Skeleton />;
  const s = data.sources;
  const stored = s.gscDaily && s.gscDaily.length ? s.gscDaily : null;
  const storedTotals = stored ? stored.reduce((a, d) => ({ clicks: a.clicks + d.clicks, impressions: a.impressions + d.impressions, pw: a.pw + (d.position || 0) * d.impressions }), { clicks: 0, impressions: 0, pw: 0 }) : null;

  return (
    <div className="fade-in">
      <PageHead title="Search & traffic" sub={`${site.domain} · where visitors come from, from your own snippet and from Google`} />

      <div className="grid-3">
        <div className="card">
          <h4>Referrers <span className="hint">from the snippet</span></h4>
          <ListBars rows={s.referrers.map((r) => ({ name: r.source, value: r.sessions, extra: r.converted ? `${r.converted} lead${r.converted > 1 ? "s" : ""}` : undefined }))} empty="No visits through the snippet yet." />
        </div>
        <div className="card">
          <h4>Devices</h4>
          <ListBars rows={s.devices.map((r) => ({ name: r.device, value: r.sessions, extra: r.converted ? `${pct(r.converted, r.sessions, 0)} convert` : undefined, color: r.device === "mobile" ? "var(--purple)" : r.device === "tablet" ? "var(--teal)" : "var(--accent)" }))} empty="No visits through the snippet yet." />
          <div className="note">If mobile converts worse than desktop, the phone number is probably below the fold on the phone layout.</div>
        </div>
        <div className="card">
          <h4>Countries <span className="hint">from Vercel</span></h4>
          <ListBars rows={s.countries.map((r) => ({ name: r.country, value: r.sessions }))} color="var(--blue)" empty="Country arrives once the app runs on Vercel." />
        </div>
      </div>

      {s.campaigns.length > 0 && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <h4>Campaigns <span className="hint">utm tags</span></h4>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th className="num">Sessions</th><th className="num">Converted</th></tr></thead>
              <tbody>{s.campaigns.map((c, i) => <tr key={i}><td><b>{c.utm_source}</b></td><td>{c.utm_medium || "—"}</td><td>{c.utm_campaign || "—"}</td><td className="num">{num(c.sessions)}</td><td className="num">{c.converted ? num(c.converted) : <span className="em">—</span>}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card tight" style={{ marginBottom: 14 }}>
        <h4>Month over month <span className="hint">stored history, visitors and leads from Pulse or GA4, search from Search Console</span></h4>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Month</th><th className="num">Visitors</th><th className="num">Leads</th><th className="num">Conv. rate</th><th className="num">Search clicks</th><th className="num">Impressions</th><th className="num">Avg position</th><th className="num">Days of data</th></tr></thead>
            <tbody>
              {hist == null ? <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
                : hist.length ? hist.map((m) => (
                  <tr key={m.month}>
                    <td><b>{new Date(m.month + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</b></td>
                    <td className="num">{m.visitors != null ? num(m.visitors) : <span className="em">—</span>}</td>
                    <td className="num" style={{ color: "var(--green)", fontWeight: 700 }}>{m.conversions != null ? num(m.conversions) : <span className="em">—</span>}</td>
                    <td className="num">{m.visitors ? ((100 * m.conversions) / m.visitors).toFixed(1) + "%" : <span className="em">—</span>}</td>
                    <td className="num">{m.clicks != null ? num(m.clicks) : <span className="em">—</span>}</td>
                    <td className="num">{m.impressions != null ? num(m.impressions) : <span className="em">—</span>}</td>
                    <td className="num">{m.position != null ? m.position.toFixed(1) : <span className="em">—</span>}</td>
                    <td className="num muted">{m.days != null ? `${m.days}${m.ga4_days ? ` (${m.ga4_days} GA4)` : ""}` : "—"}</td>
                  </tr>
                )) : <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 20 }}>Nothing stored yet. Press "Pull GA4 + Search Console" in Sites & setup.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-foot"><span>Search Console only keeps 16 months. Pulse stores every day the cron pulls, forever, so this table keeps growing.</span></div>
      </div>

      <div className="page-head" style={{ marginTop: 26, marginBottom: 14 }}>
        <div><h1 style={{ fontSize: 17 }}>Google</h1><p>Search Console and GA4 for this range. {stored ? "Search numbers come from the stored daily rows." : "Live, cached for an hour."}</p></div>
        {g && !g.skipped && <button className="btn ghost sm" onClick={refreshGoogle} disabled={gBusy}><RefreshCw size={13} className={gBusy ? "animate-spin" : ""} /> Refresh</button>}
      </div>

      {stored && (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="label">Search clicks</div><div className="val">{num(storedTotals.clicks)}</div><div className="sub">Google Search, stored</div></div>
            <div className="kpi"><div className="label">Impressions</div><div className="val">{num(storedTotals.impressions)}</div><div className="sub">times shown in results</div></div>
            <div className="kpi"><div className="label">CTR</div><div className="val">{storedTotals.impressions ? pct(storedTotals.clicks, storedTotals.impressions) : "—"}</div><div className="sub">clicks per impression</div></div>
            <div className="kpi"><div className="label">Avg position</div><div className="val">{storedTotals.impressions ? (storedTotals.pw / storedTotals.impressions).toFixed(1) : "—"}</div><div className="sub">impression weighted, lower is better</div></div>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h4>Search clicks and impressions <span className="hint">through {fmtDay(stored[stored.length - 1].day)}, Google lags about two days</span></h4>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div><div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Clicks</div><LineChart data={stored} series={[{ key: "clicks", label: "Clicks", color: "var(--accent)", area: true }]} height={170} /></div>
              <div><div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Impressions</div><LineChart data={stored} series={[{ key: "impressions", label: "Impressions", color: "var(--purple)", area: true }]} height={170} /></div>
            </div>
          </div>
          {s.gscQueries && s.gscQueries.length > 0 && (
            <div className="card tight" style={{ marginBottom: 14 }}>
              <h4>Top queries <span className="hint">stored</span></h4>
              <div className="table-scroll" style={{ marginTop: 8 }}>
                <table>
                  <thead><tr><th>Query</th><th className="num">Clicks</th><th className="num">Impr.</th><th className="num">Pos.</th></tr></thead>
                  <tbody>{s.gscQueries.map((r) => <tr key={r.query}><td><b>{r.query}</b></td><td className="num">{num(r.clicks)}</td><td className="num">{num(r.impressions)}</td><td className="num">{r.position != null ? r.position.toFixed(1) : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {g && g.skipped ? (
        <div className="card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}><b>Google is not connected for this site.</b><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Add the GA4 property id and the Search Console property in Sites & setup, and grant the reporter service account access on both.</div></div>
          <button className="btn" onClick={() => go("settings")}>Open setup</button>
        </div>
      ) : !g || gBusy ? (
        <div className="grid-2"><div className="skel" style={{ height: 220 }} /><div className="skel" style={{ height: 220 }} /></div>
      ) : g.configured === false ? (
        <div className="card"><b>Service account missing.</b><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Set <span className="mono">GOOGLE_SERVICE_ACCOUNT_JSON</span> (or <span className="mono">GOOGLE_SERVICE_ACCOUNT_FILE</span> locally) and redeploy.</div></div>
      ) : (
        <>
          {g.errors && (g.errors.gsc || g.errors.ga4 || g.errors.all) && (
            <div className="card" style={{ borderColor: "#3a2f1a", marginBottom: 14, fontSize: 13 }}>
              {g.errors.gsc && <div><b>Search Console:</b> {g.errors.gsc}</div>}
              {g.errors.ga4 && <div><b>GA4:</b> {g.errors.ga4}</div>}
              {g.errors.all && <div>{g.errors.all}</div>}
              <div className="muted" style={{ marginTop: 4 }}>Usually the service account has not been granted on that property yet, or the property id is wrong.</div>
            </div>
          )}
          {g.gsc && !stored && (
            <>
              <div className="kpi-grid">
                <div className="kpi"><div className="label">Search clicks</div><div className="val">{num(g.gsc.totals.clicks)}</div><div className="sub">Google Search, live</div></div>
                <div className="kpi"><div className="label">Impressions</div><div className="val">{num(g.gsc.totals.impressions)}</div><div className="sub">times shown in results</div></div>
                <div className="kpi"><div className="label">CTR</div><div className="val">{pctRaw(g.gsc.totals.ctr)}</div><div className="sub">clicks per impression</div></div>
                <div className="kpi"><div className="label">Avg position</div><div className="val">{g.gsc.totals.position ? g.gsc.totals.position.toFixed(1) : "—"}</div><div className="sub">lower is better</div></div>
              </div>
              <div className="card" style={{ marginBottom: 14 }}>
                <h4>Search clicks and impressions <span className="hint">through {fmtDay(g.gscTo)}, Google lags about two days</span></h4>
                <div className="grid-2" style={{ marginBottom: 0 }}>
                  <div><div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Clicks</div><LineChart data={g.gsc.daily} series={[{ key: "clicks", label: "Clicks", color: "var(--accent)", area: true }]} height={170} /></div>
                  <div><div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Impressions</div><LineChart data={g.gsc.daily} series={[{ key: "impressions", label: "Impressions", color: "var(--purple)", area: true }]} height={170} /></div>
                </div>
              </div>
            </>
          )}
          {g.gsc && (
            <div className="grid-2">
              {!stored && (
                <div className="card tight">
                  <h4>Top queries</h4>
                  <div className="table-scroll" style={{ marginTop: 8 }}>
                    <table>
                      <thead><tr><th>Query</th><th className="num">Clicks</th><th className="num">Impr.</th><th className="num">CTR</th><th className="num">Pos.</th></tr></thead>
                      <tbody>{g.gsc.queries.map((r) => <tr key={r.query}><td><b>{r.query}</b></td><td className="num">{num(r.clicks)}</td><td className="num">{num(r.impressions)}</td><td className="num">{pctRaw(r.ctr)}</td><td className="num">{r.position.toFixed(1)}</td></tr>)}{!g.gsc.queries.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>No queries in this range.</td></tr>}</tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="card tight">
                <h4>Top pages in search</h4>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                  <table>
                    <thead><tr><th>Page</th><th className="num">Clicks</th><th className="num">Impr.</th><th className="num">Pos.</th></tr></thead>
                    <tbody>{g.gsc.pages.map((r) => <tr key={r.page}><td className="path mono">{r.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</td><td className="num">{num(r.clicks)}</td><td className="num">{num(r.impressions)}</td><td className="num">{r.position.toFixed(1)}</td></tr>)}{!g.gsc.pages.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>No pages in this range.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {g.ga4 && (
            <>
              <div className="kpi-grid">
                <div className="kpi"><div className="label">GA4 users</div><div className="val">{num(g.ga4.totals.totalUsers)}</div><div className="sub">{num(g.ga4.totals.sessions)} sessions</div></div>
                <div className="kpi"><div className="label">Engaged sessions</div><div className="val">{num(g.ga4.totals.engagedSessions)}</div><div className="sub">{pct(g.ga4.totals.engagedSessions, g.ga4.totals.sessions, 0)} engagement · under 30% usually means bot traffic</div></div>
                <div className="kpi"><div className="label">GA4 page views</div><div className="val">{num(g.ga4.totals.screenPageViews)}</div><div className="sub">vs {num(data.summary?.pulse_pageviews ?? 0)} through the snippet</div></div>
                <div className="kpi"><div className="label">Avg session</div><div className="val">{secs(g.ga4.totals.averageSessionDuration)}</div><div className="sub">GA4 duration</div></div>
              </div>
              <div className="grid-3">
                <div className="card"><h4>Channels <span className="hint">GA4</span></h4><ListBars rows={g.ga4.channels.map((r) => ({ name: r.channel, value: r.sessions, extra: `${pct(r.engagedSessions, r.sessions, 0)} engaged` }))} empty="No sessions." /></div>
                <div className="card"><h4>Source / medium <span className="hint">GA4</span></h4><ListBars rows={g.ga4.sourceMedium.map((r) => ({ name: r.sourceMedium, value: r.sessions }))} empty="No sessions." /></div>
                <div className="card"><h4>GA4 events</h4><ListBars rows={g.ga4.events.map((r) => ({ name: r.event, value: r.count }))} color="var(--green)" empty="No custom events." /><div className="note">Only exact lead names count in Pulse (call_click, lead_form_submit, form_submit, email_click…). form_start is someone clicking into a field, never a lead. Map extra names on the site in Sites & setup.</div></div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
