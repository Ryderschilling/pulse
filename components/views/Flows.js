"use client";
import React, { useMemo, useState } from "react";
import { Skeleton, PageHead, TypeBadge } from "@/components/bits";
import { ListBars } from "@/components/charts";
import { num, pct, typeMeta, trunc } from "@/lib/format";

export default function Flows({ site, data, loading }) {
  const [page, setPage] = useState(null);
  const f = data?.flows;
  const pages = useMemo(() => f ? [...new Set(f.clicks.map((c) => c.path))].sort() : [], [f]);
  const active = page && pages.includes(page) ? page : pages[0] || null;
  if (loading || !data) return <Skeleton />;

  const totalSessions = f.depth.reduce((a, d) => a + d.sessions, 0);
  const clicks = f.clicks.filter((c) => c.path === active);
  const clickMax = Math.max(1, ...clicks.map((c) => c.n));
  const outFrom = f.transitions.filter((t) => t.from_path === active).slice(0, 8);
  const inTo = f.transitions.filter((t) => t.to_path === active).slice(0, 8);
  const multi = f.depth.filter((d) => d.pages >= 2).reduce((a, d) => a + d.sessions, 0);

  return (
    <div className="fade-in">
      <PageHead title="Flows & clicks" sub={`${site.domain} · the paths people take and what they click on each page`} />

      <div className="grid-32">
        <div className="card">
          <h4>Most common journeys <span className="hint">first pages of a visit, 2+ pages</span></h4>
          {f.journeys.length ? f.journeys.slice(0, 12).map((j, i) => (
            <div className="journey" key={i}>
              {j.journey.split(" > ").map((p, k) => (
                <React.Fragment key={k}>{k > 0 && <span className="arrow">→</span>}<span className="step" title={p}>{p}</span></React.Fragment>
              ))}
              <span className="n">{num(j.n)}<span className="sub">{pct(j.n, multi, 0)} of multi-page visits</span></span>
            </div>
          )) : <div className="empty" style={{ padding: 30 }}><p style={{ margin: 0 }}>No multi-page visits yet.</p></div>}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h4>How deep people go <span className="pill">{num(totalSessions)} sessions</span></h4>
            <div className="depth">
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const row = f.depth.find((d) => Number(d.pages) === n);
                const v = row ? row.sessions : 0;
                const max = Math.max(1, ...f.depth.map((d) => d.sessions));
                return (
                  <div className="col" key={n}>
                    <span className="v">{v ? num(v) : ""}</span>
                    <div className="bar" style={{ height: `${Math.max(2, (100 * v) / max)}%` }} title={`${v} sessions saw ${n === 6 ? "6+" : n} page${n > 1 ? "s" : ""}`} />
                    <span className="lbl">{n === 6 ? "6+" : n} {n === 1 ? "page" : "pages"}</span>
                  </div>
                );
              })}
            </div>
            <div className="note">{totalSessions ? `${pct(totalSessions - multi, totalSessions, 0)} leave after one page.` : "Fills in as visits come through."}</div>
          </div>
          <div className="card">
            <h4>Entry vs exit pages</h4>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Page</th><th className="num">Enter</th><th className="num">Exit</th></tr></thead>
                <tbody>
                  {f.entries.slice(0, 8).map((e) => (
                    <tr key={e.path}><td className="path mono" style={{ padding: "8px 14px" }}>{e.path}</td><td className="num" style={{ padding: "8px 14px" }}>{num(e.entries)}</td><td className="num" style={{ padding: "8px 14px" }}>{num(e.exits)}</td></tr>
                  ))}
                  {!f.entries.length && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 20 }}>No visits yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h4>Click map <span className="hint">pick a page to see what gets clicked on it</span></h4>
        {pages.length ? (
          <>
            <div className="tabs" style={{ marginBottom: 16 }}>
              {pages.slice(0, 14).map((p) => <button key={p} className={"tab" + (active === p ? " active" : "")} onClick={() => setPage(p)}>{p}</button>)}
              {pages.length > 14 && (
                <select className="btn" value={active || ""} onChange={(e) => setPage(e.target.value)} aria-label="More pages">
                  {pages.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>
            <div className="grid-32" style={{ marginBottom: 0 }}>
              <div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Element</th><th>Type</th><th>Goes to</th><th className="num">Clicks</th></tr></thead>
                    <tbody>
                      {clicks.slice(0, 25).map((c, i) => (
                        <tr key={i}>
                          <td><b>{c.label || <span className="em">(no label)</span>}</b></td>
                          <td><TypeBadge type={c.type} /></td>
                          <td className="mono muted">{trunc(c.href, 44) || "—"}</td>
                          <td className="num"><span className="inbar"><i style={{ width: `${(100 * c.n) / clickMax}%`, background: typeMeta(c.type).color }} /></span>{num(c.n)}</td>
                        </tr>
                      ))}
                      {!clicks.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>No clicks recorded on this page.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div style={{ marginBottom: 18 }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>After {active}, people go to</div>
                  <ListBars rows={outFrom.map((t) => ({ name: t.to_path, value: t.n }))} empty="Nobody moved to another page from here." />
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>People arrive at {active} from</div>
                  <ListBars rows={inTo.map((t) => ({ name: t.from_path, value: t.n }))} color="var(--purple)" empty="Only as a landing page so far." />
                </div>
              </div>
            </div>
          </>
        ) : <div className="empty" style={{ padding: 30 }}><p style={{ margin: 0 }}>No clicks recorded yet.</p></div>}
      </div>
    </div>
  );
}
