"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutDashboard, FileText, PhoneCall, GitBranch, Search, Layers, Settings2, LogOut, RefreshCw, Plus, ChevronDown } from "lucide-react";
import { Sidebar, SidebarBody, SidebarLink, SideLabel } from "@/components/ui/sidebar";
import Dropdown from "@/components/ui/Dropdown";
import RangePicker, { rangeFor } from "@/components/ui/RangePicker";
import Overview from "@/components/views/Overview";
import Pages from "@/components/views/Pages";
import Conversions from "@/components/views/Conversions";
import Flows from "@/components/views/Flows";
import Sources from "@/components/views/Sources";
import Settings from "@/components/views/Settings";
import Portfolio from "@/components/views/Portfolio";
import { motion } from "framer-motion";
import { Favicon } from "@/components/bits";

const NAV = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard size={18} /> },
  { key: "pages", label: "Pages", icon: <FileText size={18} /> },
  { key: "conversions", label: "Conversions", icon: <PhoneCall size={18} /> },
  { key: "flows", label: "Flows & clicks", icon: <GitBranch size={18} /> },
  { key: "sources", label: "Search & traffic", icon: <Search size={18} /> },
  { key: "portfolio", label: "Portfolio", icon: <Layers size={18} /> },
];

function readLS(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

export default function App() {
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [view, setView] = useState("overview");
  const [preset, setPreset] = useState("28");
  const [range, setRange] = useState(() => rangeFor("28"));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const site = useMemo(() => (sites || []).find((s) => s.id === siteId) || null, [sites, siteId]);

  const loadSites = useCallback(async () => {
    const r = await fetch("/api/sites").then((r) => r.json()).catch(() => ({ sites: [] }));
    const list = r.sites || [];
    setSites(list);
    setSiteId((cur) => {
      if (cur && list.some((s) => s.id === cur)) return cur;
      const saved = readLS("pulse.site", null);
      if (saved && list.some((s) => s.id === saved)) return saved;
      return list[0]?.id || null;
    });
    return list;
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const h = (location.hash || "").replace("#", "");
      if (h && [...NAV.map((n) => n.key), "settings"].includes(h)) setView(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    const p = readLS("pulse.preset", "28");
    const r = readLS("pulse.range", null);
    if (p === "custom" && r) { setPreset("custom"); setRange(r); } else if (p !== "custom") { setPreset(p); setRange(rangeFor(p)); }
    loadSites();
    return () => window.removeEventListener("hashchange", fromHash);
  }, [loadSites]);

  useEffect(() => { if (siteId) writeLS("pulse.site", siteId); }, [siteId]);
  useEffect(() => { writeLS("pulse.preset", preset); writeLS("pulse.range", range); }, [preset, range]);
  useEffect(() => { try { history.replaceState(null, "", "#" + view); } catch (e) {} }, [view]);

  const cacheKey = `${siteId}|${view}|${range.from}|${range.to}`;
  const load = useCallback(async (force) => {
    if (!siteId || view === "settings" || view === "portfolio") return;
    if (!force && data[cacheKey]) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/stats?site=${siteId}&view=${view}&from=${range.from}&to=${range.to}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setData((d) => ({ ...d, [cacheKey]: j }));
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [siteId, view, range.from, range.to, cacheKey, data]);
  useEffect(() => { load(false); }, [load]);

  function showToast(m) { setToast(m); setTimeout(() => setToast(""), 2200); }
  function refresh() { setData({}); load(true); }
  async function logout() { await fetch("/api/auth", { method: "DELETE" }); location.href = "/login"; }

  const current = data[cacheKey] || null;
  const common = { site, range, data: current, loading: loading && !current, go: setView, showToast, refresh };

  const siteItems = (sites || []).map((s) => ({ key: s.id, site: s }));

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-8">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <div className="side-brand"><span className="logo">P</span><SideLabel className="wordmark">Pulse<span className="dim">by Ryder Schilling</span></SideLabel></div>
            <div className="side-links">
              {NAV.map((link) => (
                <SidebarLink key={link.key} link={link} active={view === link.key} onSelect={(k) => { setView(k); setSidebarOpen(false); }} />
              ))}
            </div>
          </div>
          <div className="side-foot">
            <SidebarLink link={{ key: "settings", label: "Sites & setup", icon: <Settings2 size={18} />, badge: sites ? sites.length : null }} active={view === "settings"} onSelect={(k) => { setView(k); setSidebarOpen(false); }} />
            <SidebarLink link={{ key: "logout", label: "Log out", icon: <LogOut size={18} /> }} onSelect={logout} />
          </div>
        </SidebarBody>
      </Sidebar>

      <div className="app-main">
        <header className="top">
          <div className="wrap top-inner">
            <Dropdown
              align="left"
              value={siteId}
              onChange={(k) => setSiteId(k)}
              items={[...siteItems, { key: "__add", onSelect: () => setView("settings") }]}
              panelClass="min-w-[280px]"
              renderItem={(item, on) => item.key === "__add" ? (
                <span className="site-row" style={{ padding: 0, color: "var(--muted)" }}><span className="fav"><Plus size={14} /></span><span className="nm" style={{ fontWeight: 600 }}>Add a site</span></span>
              ) : (
                <span className={"site-row" + (on ? " on" : "")} style={{ padding: 0, background: "transparent" }}>
                  <span className="fav"><Favicon domain={item.site.domain} size={16} /></span>
                  <span><span className="nm" style={{ display: "block" }}>{item.site.name}</span><span className="dm">{item.site.domain}</span></span>
                  <span className="k">{item.site.pv7 ? `${item.site.pv7} views / 7d` : "no data"}</span>
                </span>
              )}
              trigger={(open) => (
                <button type="button" className="site-trigger" aria-label="Switch site">
                  <span className="fav"><Favicon domain={site?.domain} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="nm" style={{ display: "block" }}>{site ? site.name : sites && !sites.length ? "No sites yet" : "Loading…"}</span>
                    <span className="dm" style={{ display: "block" }}>{site ? site.domain : "add one in Settings"}</span>
                  </span>
                  <motion.span className="chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} style={{ display: "inline-flex" }}><ChevronDown size={16} /></motion.span>
                </button>
              )}
            />
            <div className="top-actions">
              {view !== "settings" && view !== "portfolio" && <RangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />}
              <button className="btn ghost" onClick={refresh} title="Refresh" aria-label="Refresh"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
            </div>
          </div>
        </header>

        <main>
          <div className="wrap">
            {error && <div className="card" style={{ borderColor: "#3a2626", color: "var(--red)", marginBottom: 14 }}>{error}</div>}
            {view === "settings" ? (
              <Settings sites={sites || []} reload={loadSites} select={setSiteId} showToast={showToast} />
            ) : view === "portfolio" ? (
              <Portfolio showToast={showToast} go={setView} />
            ) : sites && !sites.length ? (
              <div className="empty fade-in">
                <h3>Add your first site</h3>
                <p>Pulse tracks calls, form submits, popular pages and click paths on every site you manage. Add a site, drop the snippet in, and the numbers start the moment someone visits.</p>
                <div className="row"><button className="btn primary" onClick={() => setView("settings")}><Plus size={15} /> Add a site</button></div>
              </div>
            ) : view === "overview" ? <Overview {...common} />
              : view === "pages" ? <Pages {...common} />
              : view === "conversions" ? <Conversions {...common} />
              : view === "flows" ? <Flows {...common} />
              : view === "sources" ? <Sources {...common} />
              : null}
          </div>
        </main>
      </div>
      <div className={"toast" + (toast ? " show" : "")} role="status">{toast}</div>
    </div>
  );
}
