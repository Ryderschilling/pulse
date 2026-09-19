"use client";
// Date range control. Presets in a segmented control, "Custom" opens the locked
// calendar card (react-day-picker v9, dark card, two months, range band with
// light endpoint chips, dimmed outside days).
import React, { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Chevron } from "./Dropdown";
import { fmtDay, toISO } from "@/lib/format";

export const PRESETS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "28", label: "28 days", days: 28 },
  { key: "90", label: "90 days", days: 90 },
  { key: "180", label: "6 months", days: 180 },
];

export function rangeFor(key) {
  const p = PRESETS.find((x) => x.key === key) || PRESETS[1];
  const to = new Date();
  const from = new Date(to.getTime() - (p.days - 1) * 86400000);
  return { from: toISO(from), to: toISO(to) };
}

export default function RangePicker({ preset, range, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: undefined, to: undefined });
  const [months, setMonths] = useState(2);
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onSize = () => setMonths(window.innerWidth < 760 ? 1 : 2);
    onSize();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onSize);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onSize); };
  }, []);
  useEffect(() => {
    if (open) setDraft({ from: new Date(range.from + "T00:00:00"), to: new Date(range.to + "T00:00:00") });
  }, [open, range.from, range.to]);

  const label = preset === "custom" ? `${fmtDay(range.from)} – ${fmtDay(range.to)}` : (PRESETS.find((p) => p.key === preset) || {}).label;

  function apply() {
    if (!draft.from) return;
    const to = draft.to || draft.from;
    onChange("custom", { from: toISO(draft.from), to: toISO(to) });
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <div className="seg" role="tablist" aria-label="Date range">
          {PRESETS.map((p) => (
            <button key={p.key} role="tab" aria-selected={preset === p.key} className={preset === p.key ? "on" : ""} onClick={() => onChange(p.key, rangeFor(p.key))}>{p.label}</button>
          ))}
        </div>
        <button type="button" className={"btn" + (preset === "custom" ? "" : " ghost")} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}>
          <CalendarDays size={15} />
          <span>{preset === "custom" ? label : "Custom"}</span>
          <Chevron open={open} size={14} />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Pick a date range"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="cal-card"
            style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 60 }}
          >
            <div className="cal-head">
              <div>
                <h5>Date range</h5>
                <p>Pick a start and end day. Numbers come only from days with records.</p>
              </div>
            </div>
            <div className="cal-body">
              <div className="cal-presets">
                {PRESETS.map((p) => (
                  <button key={p.key} className={preset === p.key ? "on" : ""} onClick={() => { onChange(p.key, rangeFor(p.key)); setOpen(false); }}>{p.label}</button>
                ))}
                <button onClick={() => { const d = new Date(); const from = new Date(d.getFullYear(), d.getMonth(), 1); setDraft({ from, to: d }); }}>This month</button>
                <button onClick={() => { const d = new Date(); const from = new Date(d.getFullYear(), d.getMonth() - 1, 1); const to = new Date(d.getFullYear(), d.getMonth(), 0); setDraft({ from, to }); }}>Last month</button>
              </div>
              <div className="cal-cal">
                <DayPicker
                  mode="range"
                  numberOfMonths={months}
                  selected={draft}
                  onSelect={(r) => setDraft(r || { from: undefined, to: undefined })}
                  disabled={{ after: new Date() }}
                  showOutsideDays
                  defaultMonth={(() => { const f = new Date(range.to + "T00:00:00"); return new Date(f.getFullYear(), f.getMonth() - (months - 1), 1); })()}
                />
              </div>
            </div>
            <div className="cal-foot">
              <span>{draft.from ? `${fmtDay(toISO(draft.from))} – ${draft.to ? fmtDay(toISO(draft.to)) : "…"}` : "No dates picked"}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn primary sm" onClick={apply} disabled={!draft.from}>Apply</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
