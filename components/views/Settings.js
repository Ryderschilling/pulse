"use client";
import React, { useState } from "react";
import { Plus, Copy, Check, Trash2, Pencil, ExternalLink } from "lucide-react";
import { PageHead, Favicon } from "@/components/bits";
import { ago, num } from "@/lib/format";

const REPORTER = "gsc-reporter@ryder-schilling-seo.iam.gserviceaccount.com";

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function CopyBtn({ text, onCopied }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn sm copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); onCopied && onCopied(); setTimeout(() => setOk(false), 1500); } catch (e) {} }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copied" : "Copy"}
    </button>
  );
}

const BLANK = { name: "", domain: "", ga4_property_id: "", gsc_property: "", timezone: "America/Chicago", launched_at: "", niche: "" };

export default function Settings({ sites, reload, select, showToast }) {
  const [editing, setEditing] = useState(null); // null | "new" | site id
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [openSnippet, setOpenSnippet] = useState(null);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState(null);
  async function backfillAll() {
    setBackfilling(true); setBackfillMsg(null);
    const j = await fetch("/api/google/backfill?all=1", { method: "POST" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
    setBackfilling(false);
    if (j.error) return showToast(j.error);
    setBackfillMsg(j.results || []);
    await reload();
  }
  function startNew() { setForm(BLANK); setEditing("new"); }
  function startEdit(s) { setForm({ name: s.name, domain: s.domain, ga4_property_id: s.ga4_property_id || "", gsc_property: s.gsc_property || "", timezone: s.timezone || "America/Chicago", launched_at: s.launched_at ? String(s.launched_at).slice(0, 10) : "", niche: s.niche || "" }); setEditing(s.id); }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const isNew = editing === "new";
    const r = await fetch("/api/sites", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isNew ? form : { id: editing, ...form }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return showToast(j.error || "Could not save");
    await reload();
    if (isNew) { select(j.site.id); setOpenSnippet(j.site.id); showToast("Site added. Install the snippet next."); }
    else showToast("Saved");
    setEditing(null);
  }
  async function remove(s) {
    if (!confirm(`Delete ${s.name} and every event recorded for it? This cannot be undone.`)) return;
    await fetch(`/api/sites?id=${s.id}`, { method: "DELETE" });
    await reload();
    showToast("Site removed");
  }

  const base = appUrl();

  return (
    <div className="fade-in">
      <PageHead title="Sites & setup" sub="One site per client. Each gets its own key and install snippet." right={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={backfillAll} disabled={backfilling}>{backfilling ? "Pulling GA4…" : "Backfill from GA4"}</button>
          <button className="btn primary" onClick={startNew}><Plus size={15} /> Add a site</button>
        </div>
      } />
      {backfillMsg && <div className="card" style={{ marginBottom: 14, fontSize: 13 }}>{backfillMsg.map((r, i) => <div key={i}>{r.error ? <span style={{ color: "var(--red)" }}><b>{r.site}:</b> {r.error}</span> : <span><b>{r.site}:</b> {r.days} days from {r.from}, {r.leads} leads found in GA4 events</span>}</div>)}{!backfillMsg.length && <span className="muted">No site has a GA4 property id yet.</span>}</div>}

      {editing && (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={save}>
          <h4>{editing === "new" ? "New site" : "Edit site"}</h4>
          <div className="form-grid">
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Simply Salt" /></div>
            <div className="field"><label>Domain</label><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="simplysaltdelivery.com" required /><span className="help">Just the host. www is stripped.</span></div>
            <div className="field"><label>GA4 property id</label><input value={form.ga4_property_id} onChange={(e) => setForm({ ...form, ga4_property_id: e.target.value })} placeholder="552897166" /><span className="help">The number after <b>p</b> in the GA4 URL (…a404544857<b>p552897166</b>). Grant {REPORTER} Viewer on the property.</span></div>
            <div className="field"><label>Search Console property</label><input value={form.gsc_property} onChange={(e) => setForm({ ...form, gsc_property: e.target.value })} placeholder="https://www.simplysaltdelivery.com/" /><span className="help">Exactly as it appears in Search Console, trailing slash included. Domain properties look like <span className="mono">sc-domain:example.com</span>. Grant the reporter Full access.</span></div>
            <div className="field"><label>Launch date</label><input type="date" value={form.launched_at} onChange={(e) => setForm({ ...form, launched_at: e.target.value })} /><span className="help">Day 0 for the Portfolio page ("leads in the first 60 days"). Leave blank to use the first recorded visit.</span></div>
            <div className="field"><label>Niche</label><input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Realtor, Plumber, Gym, Nonprofit…" list="niches" /><datalist id="niches">{[...new Set(sites.map((x) => x.niche).filter(Boolean))].map((n) => <option key={n} value={n} />)}</datalist><span className="help">Groups the Portfolio averages, so you can quote realtor numbers to a realtor.</span></div>
            <div className="field"><label>Timezone</label>
              <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="help">Days on the dashboard are cut at midnight in this zone.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : editing === "new" ? "Add site" : "Save"}</button>
          </div>
        </form>
      )}

      <div className="table-wrap" style={{ marginBottom: 14 }}>
        {sites.length ? sites.map((s) => (
          <div key={s.id}>
            <div className="site-card">
              <span className="fav"><Favicon domain={s.domain} size={20} /></span>
              <div className="meta">
                <div className="nm">{s.name} <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="muted" style={{ fontWeight: 500, fontSize: 12, marginLeft: 6 }}>{s.domain} <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a></div>
                <div className="dm">
                  <span className="status"><span className="dot" style={{ background: s.last_seen ? "var(--green)" : "var(--faint)" }} />{s.last_seen ? `last hit ${ago(s.last_seen)}` : "no data yet"}</span>
                  <span>{num(s.pv7 || 0)} views / 7d</span>
                  <span className="mono">{s.id}</span>
                  {s.niche && <span>{s.niche}</span>}
                  <span>{s.launched_at ? `live since ${String(s.launched_at).slice(0, 10)}` : "no launch date"}</span>
                  <span>{s.ga4_property_id ? "GA4 ✓" : "GA4 —"}</span>
                  <span>{s.gsc_property ? "GSC ✓" : "GSC —"}</span>
                </div>
              </div>
              <button className="btn sm" onClick={() => setOpenSnippet(openSnippet === s.id ? null : s.id)}>{openSnippet === s.id ? "Hide snippet" : "Install snippet"}</button>
              <button className="btn ghost sm" onClick={() => startEdit(s)} aria-label="Edit"><Pencil size={14} /></button>
              <button className="btn ghost sm" onClick={() => remove(s)} aria-label="Delete" style={{ color: "var(--red)" }}><Trash2 size={14} /></button>
            </div>
            {openSnippet === s.id && <Snippet site={s} base={base} showToast={showToast} />}
          </div>
        )) : <div className="empty"><h3>No sites yet</h3><p>Add the first one above. You get a key and a one-line snippet.</p></div>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>What gets tracked automatically</h4>
          <ul className="steps">
            <li><span><b>Page views</b>, including route changes on Next.js sites.</span></li>
            <li><span><b>Calls</b>: any tap on a <span className="mono">tel:</span> link. <b>Emails</b>: <span className="mono">mailto:</span>. <b>Texts</b>: <span className="mono">sms:</span>.</span></li>
            <li><span><b>Forms</b>: every real form submit, named by the form's name, id or submit button text.</span></li>
            <li><span><b>Bookings</b>: clicks out to Calendly, Square Appointments, Acuity, Zeffy and similar.</span></li>
            <li><span><b>Clicks</b> on buttons and links (for the click map), <b>scroll depth</b> and <b>time on page</b>.</span></li>
            <li><span>Anything else: add <span className="mono">data-track="Quote button"</span> to an element, or call <span className="mono">window.pulse('booking', {'{'} label: 'Book a call' {'}'})</span>.</span></li>
          </ul>
        </div>
        <div className="card">
          <h4>Google (GA4 + Search Console)</h4>
          <ul className="steps">
            <li><span>Enable the <b>Google Analytics Data API</b> and the <b>Search Console API</b> on the Cloud project once. Already done for <span className="mono">ryder-schilling-seo</span>.</span></li>
            <li><span>Paste the service account JSON into <span className="mono">GOOGLE_SERVICE_ACCOUNT_JSON</span> on Vercel (one line).</span></li>
            <li><span>On each client's GA4 property, add <span className="mono">{REPORTER}</span> as <b>Viewer</b>. On Search Console, add it with <b>Full</b>.</span></li>
            <li><span>Enter the GA4 property id and the Search Console property on the site above. Search & traffic fills in on the next load.</span></li>
            <li><span>Hit <b>Backfill from GA4</b> (top right). Pulse pulls daily users, sessions, and any call/form/email/booking events GA4 already recorded, back to each site's launch date, so Portfolio has history before the snippet went in. Safe to re-run.</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Snippet({ site, base, showToast }) {
  const tag = `<script async src="${base}/p.js" data-site="${site.id}"></script>`;
  const [how, setHow] = useState("gtm");
  return (
    <div style={{ padding: "0 16px 18px", borderBottom: "1px solid var(--border)" }}>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={"tab" + (how === "gtm" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("gtm")}>Google Tag Manager</button>
        <button className={"tab" + (how === "html" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("html")}>Plain HTML</button>
        <button className={"tab" + (how === "next" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("next")}>Next.js</button>
      </div>
      {how === "gtm" && (
        <>
          <div className="code">{tag}<CopyBtn text={tag} onCopied={() => showToast("Snippet copied")} /></div>
          <ol className="steps" style={{ marginTop: 14 }}>
            <li><span>Open the site's GTM container, <b>Tags → New → Custom HTML</b>.</span></li>
            <li><span>Paste the line above. Name the tag <b>Pulse</b>.</span></li>
            <li><span>Trigger: <b>All Pages</b> (Initialization works too). Save, then <b>Submit → Publish</b>.</span></li>
            <li><span>Open the site, tap a phone number, and check the Overview here. It shows within a minute.</span></li>
          </ol>
        </>
      )}
      {how === "html" && (
        <>
          <div className="code">{tag}<CopyBtn text={tag} onCopied={() => showToast("Snippet copied")} /></div>
          <div className="note">Paste it before <span className="mono">&lt;/head&gt;</span> on every page (or in the shared header include). Redeploy.</div>
        </>
      )}
      {how === "next" && (() => {
        const code = `// app/layout.js (or .tsx)\nimport Script from "next/script";\n\n// inside <body>, after {children}:\n<Script src="${base}/p.js" data-site="${site.id}" strategy="afterInteractive" />`;
        return (
          <>
            <div className="code">{code}<CopyBtn text={code} onCopied={() => showToast("Copied")} /></div>
            <div className="note">Route changes are picked up automatically, no router hooks needed.</div>
          </>
        );
      })()}
    </div>
  );
}
