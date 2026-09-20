"use client";
// Small SVG chart kit. One axis per chart, thin marks, recessive grid, a hover
// layer by default. Series colors carry identity; text stays in text tokens.
import React, { useMemo, useRef, useState } from "react";
import { fmtDay, num } from "@/lib/format";

function niceMax(v) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
  return m * p;
}

// data: [{ day, ... }], series: [{ key, label, color, area? }]
export function LineChart({ data = [], series = [], height = 220, yFormat = num, xFormat }) {
  const xf = xFormat || ((d, long) => fmtDay(d, long));
  const W = 800, H = height, padL = 36, padR = 10, padT = 12, padB = 26;
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const maxV = useMemo(() => niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))), [data, series]);
  const n = data.length;
  const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxV);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxV);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  }
  if (!n) return <div className="empty" style={{ padding: "40px 10px" }}><p style={{ margin: 0 }}>No records in this range.</p></div>;

  const paths = series.map((s) => {
    const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`;
    return { s, line, area, pts };
  });
  const hx = hover != null ? x(hover) : null;
  const tipLeft = hover != null ? (hx / W) * 100 : 0;

  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ") + " by day"}>
        <g className="grid">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
              <text className="axis" x={padL - 8} y={y(t) + 3.5} textAnchor="end">{yFormat(t)}</text>
            </g>
          ))}
        </g>
        {data.map((d, i) => (i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery > labelEvery / 2)) && (
          <text key={d.day} className="axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{xf(d.day)}</text>
        ))}
        {paths.map(({ s, area }) => s.area && (
          <path key={s.key + "a"} d={area} fill={s.color} opacity="0.08" />
        ))}
        {paths.filter(({ s }) => s.thin).map(({ s, line }) => (
          <path key={s.key} d={line} fill="none" stroke={s.color} strokeWidth="1.2" opacity="0.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {paths.filter(({ s }) => !s.thin).map(({ s, line }) => (
          <path key={s.key} d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && (
          <g>
            <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="var(--faint)" strokeWidth="1" strokeDasharray="3 3" />
            {paths.filter(({ s }) => !s.thin).map(({ s, pts }) => (
              <circle key={s.key} cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${tipLeft}%`, top: 0, transform: `translate(${tipLeft > 80 ? "-100%" : tipLeft < 20 ? "0" : "-50%"}, 0)` }}>
          <b>{xf(data[hover].day, true)}</b>
          {series.map((s) => (
            <div className="r" key={s.key}><span className="sw" style={{ background: s.color }} /> {s.label}: <b>{yFormat(Number(data[hover][s.key]) || 0)}</b></div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">{series.map((s) => <span key={s.key} style={s.thin ? { opacity: 0.7 } : undefined}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      )}
    </div>
  );
}

// Stacked columns. data: [{ day, [key]: n }], series like above.
export function ColumnChart({ data = [], series = [], height = 200, yFormat = num }) {
  const W = 800, H = height, padL = 36, padR = 10, padT = 12, padB = 26;
  const [hover, setHover] = useState(null);
  const totals = data.map((d) => series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0));
  const maxV = niceMax(Math.max(1, ...totals));
  const n = data.length;
  if (!n) return <div className="empty" style={{ padding: "40px 10px" }}><p style={{ margin: 0 }}>No records in this range.</p></div>;
  const slot = (W - padL - padR) / n;
  const bw = Math.min(28, Math.max(3, slot * 0.6));
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxV);
  const ticks = [0, 0.5, 1].map((t) => t * maxV);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)} role="img" aria-label="Conversions by day">
        <g className="grid">
          {ticks.map((t, i) => (<g key={i}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} /><text className="axis" x={padL - 8} y={y(t) + 3.5} textAnchor="end">{yFormat(t)}</text></g>))}
        </g>
        {data.map((d, i) => {
          let acc = 0;
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {series.map((s, si) => {
                const v = Number(d[s.key]) || 0;
                if (!v) return null;
                const y1 = y(acc + v), y0 = y(acc);
                acc += v;
                const isTop = acc === totals[i];
                return <rect key={s.key} x={cx - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1 - (si ? 2 : 0))} fill={s.color} rx={isTop ? 3 : 0} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              {(i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery > labelEvery / 2)) && <text className="axis" x={cx} y={H - 6} textAnchor="middle">{fmtDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%`, top: 0, transform: `translate(${hover > n * 0.8 ? "-100%" : hover < n * 0.2 ? "0" : "-50%"},0)` }}>
          <b>{fmtDay(data[hover].day, true)}</b>
          {series.filter((s) => Number(data[hover][s.key])).map((s) => (
            <div className="r" key={s.key}><span className="sw" style={{ background: s.color }} /> {s.label}: <b>{data[hover][s.key]}</b></div>
          ))}
          {!totals[hover] && <div className="r muted">nothing</div>}
        </div>
      )}
      <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

// Horizontal list of bars. rows: [{ name, sub?, value, extra? }]
export function ListBars({ rows = [], color = "var(--accent)", format = num, empty = "No records yet.", max: maxProp, onClick }) {
  if (!rows.length) return <div className="empty" style={{ padding: "26px 10px" }}><p style={{ margin: 0 }}>{empty}</p></div>;
  const max = maxProp || Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="lbar">
      {rows.map((r, i) => (
        <div className="lbar-row" key={i} style={onClick ? { cursor: "pointer" } : undefined} onClick={onClick ? () => onClick(r) : undefined}>
          <div className="nm" title={r.name}>{r.name}{r.sub && <span className="sub">{r.sub}</span>}</div>
          <div className="ct">{format(r.value)}{r.extra && <span className="sub">{r.extra}</span>}</div>
          <div className="lbar-track"><div className="lbar-fill" style={{ width: `${(100 * (Number(r.value) || 0)) / max}%`, background: r.color || color }} /></div>
        </div>
      ))}
    </div>
  );
}
