"use client";
import React, { useState } from "react";
import { Globe } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export function Favicon({ domain, size = 18 }) {
  const [err, setErr] = useState(false);
  if (!domain || err) return <Globe size={size - 2} style={{ color: "var(--muted)" }} />;
  return <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} width={size} height={size} alt="" onError={() => setErr(true)} />;
}

import { delta as calcDelta, num } from "@/lib/format";

export function Kpi({ label, value, sub, prev, format = num, tone, icon }) {
  const d = prev !== undefined ? calcDelta(value, prev) : null;
  return (
    <div className={"kpi" + (tone ? " " + tone : "")}>
      <div className="label">{icon}{label}</div>
      <div className="val">{value == null ? <span className="faint">—</span> : format(value)}</div>
      <div className="sub">
        {d && (
          <span className={"delta " + d.dir}>
            {d.dir === "up" ? <ArrowUpRight size={12} /> : d.dir === "down" ? <ArrowDownRight size={12} /> : <Minus size={12} />}{d.text}
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export function Skeleton({ rows = 3, h = 120 }) {
  return (
    <div className="fade-in">
      <div className="kpi-grid">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel" style={{ height: 96 }} />)}</div>
      <div className="grid-32"><div className="skel" style={{ height: h * 2 }} /><div className="skel" style={{ height: h * 2 }} /></div>
    </div>
  );
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="page-head fade-in">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {right}
    </div>
  );
}

export function TypeBadge({ type, label }) {
  const { typeMeta } = require("@/lib/format");
  const m = typeMeta(type);
  return <span className="badge" style={{ background: "var(--panel2)", color: m.color }}><span className="dot" style={{ background: m.color }} />{label || m.one}</span>;
}

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3><p>{children}</p></div>;
}
