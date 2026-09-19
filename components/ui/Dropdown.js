"use client";
// Locked dropdown standard (21st.dev / @emerald-ui Animated Dropdown), ported
// to plain JS. Timings are the pattern: chevron 0.2s easeInOut, panel 0.2s
// easeOut from y -10 / scale .95, items stagger 0.03s from x -20.
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

function useClickOutside(ref, handler) {
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) handler(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, handler]);
}

// trigger: (open) => ReactNode (defaults to an outline button with `text`)
// items: [{ key, node | name, onSelect }]  align: "left" | "center" | "right"
export default function Dropdown({ items = [], text = "Select", trigger, align = "center", className, panelClass, renderItem, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div ref={ref} data-state={open ? "open" : "closed"} className={cn("group relative inline-block", className)}>
      {trigger ? (
        <div onClick={() => setOpen(!open)} role="button" aria-haspopup="listbox" aria-expanded={open} tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}>
          {trigger(open)}
        </div>
      ) : (
        <button type="button" className="btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{text}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} style={{ display: "inline-flex" }}>
            <ChevronDown size={16} />
          </motion.span>
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn("absolute top-[calc(100%+0.5rem)] z-50 w-fit min-w-full dd-panel", pos, items.length > 10 && "max-h-72 overflow-y-auto", panelClass)}
          >
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.03 } } }}>
              {items.map((item, i) => (
                <motion.button
                  key={item.key ?? i}
                  type="button"
                  role="option"
                  aria-selected={value != null && item.key === value}
                  variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
                  className={cn("dd-item", value != null && item.key === value && "on")}
                  onClick={() => { setOpen(false); item.onSelect ? item.onSelect(item) : onChange && onChange(item.key); }}
                >
                  {renderItem ? renderItem(item, value != null && item.key === value) : item.node || item.name}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Chevron({ open, size = 16, className }) {
  return (
    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} style={{ display: "inline-flex" }} className={className}>
      <ChevronDown size={size} />
    </motion.span>
  );
}
