"use client";
import React, { useMemo, useState } from "react";
import { Skeleton, PageHead } from "@/components/bits";
import { num, pct, secs, trunc } from "@/lib/format";

const COLS = [
  { key: "path", label: "Page", num: false },
  { key: "views", label: "Views", num: true },
  { key: "visitors", label: "Visitors", num: true },
  { key: "entries", label: "Entered here", num: true, hint: "First page of the visit" },
  { key: "exits", label: "Left here", num: true, hint: "Last page of the visit" },
  { key: "avg_seconds", label: "Time", num: true, hint: "Average time on page" },
  { key: "avg_scroll", label: "Scroll", num: true, hint: "Average scroll depth" },
  { key: "conversions", label: "Conv.", num: true, hint: "Calls + forms + emails + bookings on this page" },
  { key: "rate", label: "Conv. rate", num: true, hint: "Conversions per visitor on this page" },
];

export default function Pages({ site, data, loading }) {
  const [sort, setSort] = useState({ key: "views", dir: -1 });
  const [qtext, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.pages.map((r) => ({ ...r, rate: r.visitors ? r.conversions / r.visitors : 0 }));
    const f = qtext ? list.filter((r) => (r.path + " " + (r.title || "")).toLowerCase().includes(qtext.toLowerCase())) : list;
    return [...f].sort((a, b) => {
      const av = a[sort.key] ?? -1, bv = b[sort.key] ?? -1;
      if (typeof av === "string") return sort.dir * av.localeCompare(bv);
      return sort.dir * (av - bv);
    });
  }, [data, sort, qtext]);
  if (loading || !data) return <Skeleton />;
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  const s = data.summary;
  const bounce = s.sessions ? s.bounced / s.sessions : 0;

  return (
    <div className="fade-in">
      <PageHead title="Pages" sub={`${site.domain} · which pages people land on, read, and leave from`} right={
        <input className="btn" style={{ minWidth: 220, fontWeight: 500 }} placeholder="Filter pages…" value={qtext} onChange={(e) => setQ(e.target.value)} aria-label="Filter pages" />
      } />
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Pages seen</div><div className="val">{num(data.pages.length)}</div><div className="sub">distinct paths</div></div>
        <div className="kpi"><div className="label">Views per session</div><div className="val">{s.sessions ? (s.pageviews / s.sessions).toFixed(1) : "—"}</div><div className="sub">{num(s.pageviews)} views</div></div>
        <div className="kpi"><div className="label">One-page visits</div><div className="val">{s.sessions ? (bounce * 100).toFixed(0) + "%" : "—"}</div><div className="sub">{num(s.bounced)} of {num(s.sessions)} sessions</div></div>
        <div className="kpi"><div className="label">Avg time on page</div><div className="val">{secs(s.avg_seconds)}</div><div className="sub">{s.avg_scroll != null ? `${s.avg_scroll}% scroll depth` : "from leave events"}</div></div>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className={"sortable" + (c.num ? " num" : "")} title={c.hint} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : c.num ? -1 : 1 }))}>
                    {c.label}{sort.key === c.key && <span className="arrow">{sort.dir < 0 ? "▼" : "▲"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => (
                <tr key={r.path}>
                  <td className="path"><a href={`https://${site.domain}${r.path}`} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>{r.path}</a>{r.title && r.title !== r.path && <div className="sub">{trunc(r.title, 60)}</div>}</td>
                  <td className="num"><span className="inbar"><i style={{ width: `${(100 * r.views) / maxViews}%` }} /></span>{num(r.views)}</td>
                  <td className="num">{num(r.visitors)}</td>
                  <td className="num">{num(r.entries)}</td>
                  <td className="num">{num(r.exits)}<span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>{r.views ? pct(r.exits, r.views, 0) : ""}</span></td>
                  <td className="num">{r.avg_seconds == null ? <span className="em">—</span> : secs(r.avg_seconds)}</td>
                  <td className="num">{r.avg_scroll == null ? <span className="em">—</span> : r.avg_scroll + "%"}</td>
                  <td className="num" style={{ color: r.conversions ? "var(--green)" : undefined, fontWeight: r.conversions ? 700 : 400 }}>{r.conversions ? num(r.conversions) : <span className="em">—</span>}</td>
                  <td className="num">{r.conversions ? (r.rate * 100).toFixed(1) + "%" : <span className="em">—</span>}</td>
                </tr>
              )) : <tr><td colSpan={COLS.length} className="muted" style={{ textAlign: "center", padding: 34 }}>No page views in this range.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-foot"><span>{rows.length} pages</span><span>Sorted by {COLS.find((c) => c.key === sort.key)?.label.toLowerCase()}</span></div>
      </div>
      <div className="note">"Left here" high on a contact or thank-you page is normal. High on a service page means the page is not moving people to call.</div>
    </div>
  );
}
