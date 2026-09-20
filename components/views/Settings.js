"use client";
import React, { useState } from "react";
import { Plus, Copy, Check, Trash2, Pencil, ExternalLink, RefreshCw, ShieldCheck, PhoneCall, Webhook } from "lucide-react";
import { PageHead, Favicon } from "@/components/bits";
import { ago, num, fmtDay } from "@/lib/format";

const REPORTER = "gsc-reporter@ryder-schilling-seo.iam.gserviceaccount.com";

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function CopyBtn({ text, onCopied, label = "Copy" }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn sm copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); onCopied && onCopied(); setTimeout(() => setOk(false), 1500); } catch (e) {} }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copied" : label}
    </button>
  );
}

const BLANK = { name: "", domain: "", ga4_property_id: "", gsc_property: "", timezone: "America/Chicago", launched_at: "", niche: "", extra_hosts: "", ga4_lead_events: "", form_source: "snippet", tracking_number: "", forward_to: "", record_calls: false };

const HEALTH = {
  ok: { color: "var(--green)", text: (s) => `reporting · last hit ${ago(s.last_seen)}` },
  ga4_only: { color: "var(--blue)", text: (s) => `GA4 history only through ${fmtDay(s.ga4_last_day)} · snippet not reporting` },
  silent: { color: "var(--red)", text: (s) => `SILENT for ${s.days_silent} days · last data ${s.last_seen ? ago(s.last_seen) : fmtDay(s.ga4_last_day)}` },
  waiting: { color: "var(--amber)", text: () => "snippet found, waiting for the first visit" },
  no_data: { color: "var(--faint)", text: () => "no data yet" },
};

export default function Settings({ sites, reload, select, showToast }) {
  const [editing, setEditing] = useState(null); // null | "new" | site id
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [openPanel, setOpenPanel] = useState(null); // { id, tab }
  const [checking, setChecking] = useState(null);
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
  async function check(s) {
    setChecking(s.id);
    const j = await fetch(`/api/sites/check?site=${s.id}`, { method: "POST" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
    setChecking(null);
    showToast(j.error || (j.snippet_found ? "Snippet found" : j.note || "Checked"));
    await reload();
  }
  function startNew() { setForm(BLANK); setEditing("new"); }
  function startEdit(s) {
    setForm({ name: s.name, domain: s.domain, ga4_property_id: s.ga4_property_id || "", gsc_property: s.gsc_property || "", timezone: s.timezone || "America/Chicago", launched_at: s.launched_at ? String(s.launched_at).slice(0, 10) : "", niche: s.niche || "", extra_hosts: s.extra_hosts || "", ga4_lead_events: s.ga4_lead_events || "", form_source: s.form_source || "snippet", tracking_number: s.tracking_number || "", forward_to: s.forward_to || "", record_calls: !!s.record_calls });
    setEditing(s.id);
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const isNew = editing === "new";
    const r = await fetch("/api/sites", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isNew ? form : { id: editing, ...form }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return showToast(j.error || "Could not save");
    await reload();
    if (isNew) { select(j.site.id); setOpenPanel({ id: j.site.id, tab: "snippet" }); showToast("Site added. Install the snippet next."); }
    else showToast("Saved");
    setEditing(null);
  }
  async function rotate(s) {
    if (!confirm("Make a new webhook secret? The old one stops working right away.")) return;
    await fetch("/api/sites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, rotate_secret: true }) });
    await reload(); showToast("New secret");
  }
  async function remove(s) {
    if (!confirm(`Delete ${s.name} and every event recorded for it? This cannot be undone.`)) return;
    await fetch(`/api/sites?id=${s.id}`, { method: "DELETE" });
    await reload();
    showToast("Site removed");
  }

  const base = appUrl();
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div className="fade-in">
      <PageHead title="Sites & setup" sub="One site per client. Each gets its own key, snippet, webhook secret and, if you want, a tracking number." right={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={backfillAll} disabled={backfilling}><RefreshCw size={14} className={backfilling ? "animate-spin" : ""} /> {backfilling ? "Pulling Google…" : "Pull GA4 + Search Console"}</button>
          <button className="btn primary" onClick={startNew}><Plus size={15} /> Add a site</button>
        </div>
      } />
      {backfillMsg && (
        <div className="card" style={{ marginBottom: 14, fontSize: 13 }}>
          {backfillMsg.map((r, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <b>{r.site}:</b>{" "}
              {r.ga4 && (r.ga4.error ? <span style={{ color: "var(--red)" }}>GA4 {r.ga4.error}</span> : r.ga4.skipped ? <span className="muted">GA4 {r.ga4.skipped}</span> : <span>GA4 {r.ga4.days} days from {r.ga4.from}, {r.ga4.leads} lead events</span>)}
              {" · "}
              {r.gsc && (r.gsc.error ? <span style={{ color: "var(--red)" }}>Search Console {r.gsc.error}</span> : r.gsc.skipped ? <span className="muted">Search Console {r.gsc.skipped}</span> : <span>Search Console {r.gsc.days} days, {r.gsc.queries} query rows</span>)}
              {r.ga4 && r.ga4.unmapped && r.ga4.unmapped.length > 0 && <div className="muted" style={{ marginLeft: 12 }}>GA4 events not counted: {r.ga4.unmapped.map((u) => `${u.event} (${u.count})`).join(", ")}. If one is a real lead event, map it on the site: <span className="mono">event_name=call</span>.</div>}
            </div>
          ))}
          {!backfillMsg.length && <span className="muted">No site has a GA4 property id or Search Console property yet.</span>}
        </div>
      )}

      {editing && (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={save}>
          <h4>{editing === "new" ? "New site" : "Edit site"}</h4>
          <div className="form-grid">
            <div className="field"><label>Name</label><input {...f("name")} placeholder="Simply Salt" /></div>
            <div className="field"><label>Domain</label><input {...f("domain")} placeholder="simplysaltdelivery.com" required /><span className="help">Just the host. www is stripped. Only this host can send events.</span></div>
            <div className="field"><label>Other allowed hosts</label><input {...f("extra_hosts")} placeholder="momentum-fitness.vercel.app" /><span className="help">Comma separated. A vercel.app URL while the real domain is not attached yet. Localhost and previews never count.</span></div>
            <div className="field"><label>Launch date</label><input type="date" {...f("launched_at")} /><span className="help">Day 0 for Portfolio. No launch date means the site is listed but not benchmarked.</span></div>
            <div className="field"><label>Niche</label><input {...f("niche")} placeholder="Realtor, Plumber, Gym, Nonprofit…" list="niches" /><datalist id="niches">{[...new Set(sites.map((x) => x.niche).filter(Boolean))].map((n) => <option key={n} value={n} />)}</datalist></div>
            <div className="field"><label>Timezone</label>
              <select {...f("timezone")}>
                {["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="help">Days are cut at midnight in this zone, on every page.</span>
            </div>
            <div className="field"><label>GA4 property id</label><input {...f("ga4_property_id")} placeholder="552897166" /><span className="help">The number after <b>p</b> in the GA4 URL. Grant {REPORTER} Viewer.</span></div>
            <div className="field"><label>Search Console property</label><input {...f("gsc_property")} placeholder="https://www.simplysaltdelivery.com/" /><span className="help">Exactly as in Search Console, trailing slash included, or <span className="mono">sc-domain:example.com</span>. Grant the reporter Full.</span></div>
            <div className="field"><label>Extra GA4 lead events</label><input {...f("ga4_lead_events")} placeholder="start_plan_click=form, phone_tap=call" /><span className="help">Only exact names count. Defaults cover call_click, lead_form_submit, form_submit, generate_lead, email_click, booking_click. <span className="mono">name=ignore</span> removes one. form_start never counts.</span></div>
            <div className="field"><label>Forms are counted from</label>
              <select {...f("form_source")}><option value="snippet">the submit on the page (snippet)</option><option value="webhook">the site's own handler (webhook)</option></select>
              <span className="help">Webhook is the accurate one: the site posts to /api/lead after the email actually sent. Snippet submits then show as attempts, not leads.</span>
            </div>
            <div className="field"><label>Tracking number (Twilio)</label><input {...f("tracking_number")} placeholder="+1 850 555 0123" /><span className="help">The number shown on the site. When set, real calls come from Twilio and phone taps stop counting as calls.</span></div>
            <div className="field"><label>Forward calls to</label><input {...f("forward_to")} placeholder="+1 850 555 0199" /><span className="help">The client's real phone.</span></div>
            <div className="field"><label>Record calls</label>
              <select value={form.record_calls ? "1" : "0"} onChange={(e) => setForm({ ...form, record_calls: e.target.value === "1" })}><option value="0">No</option><option value="1">Yes, with a "this call may be recorded" notice</option></select>
              <span className="help">Florida needs both sides to consent. The notice plays before the call connects.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : editing === "new" ? "Add site" : "Save"}</button>
          </div>
        </form>
      )}

      <div className="table-wrap" style={{ marginBottom: 14 }}>
        {sites.length ? sites.map((s) => {
          const h = HEALTH[s.health] || HEALTH.no_data;
          const tab = openPanel && openPanel.id === s.id ? openPanel.tab : null;
          return (
            <div key={s.id}>
              <div className="site-card">
                <span className="fav"><Favicon domain={s.domain} size={20} /></span>
                <div className="meta">
                  <div className="nm">{s.name} <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="muted" style={{ fontWeight: 500, fontSize: 12, marginLeft: 6 }}>{s.domain} <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a></div>
                  <div className="dm">
                    <span className="status" style={{ color: h.color }}><span className="dot" style={{ background: h.color }} />{h.text(s)}</span>
                    <span>{num(s.pv7 || 0)} views / 7d</span>
                    <span className="mono">{s.id}</span>
                    {s.niche && <span>{s.niche}</span>}
                    <span style={{ color: s.launched_at ? undefined : "var(--amber)" }}>{s.launched_at ? `live since ${String(s.launched_at).slice(0, 10)}` : "no launch date"}</span>
                    <span>{s.ga4_property_id ? `GA4 ✓${s.ga4_last_day ? " to " + fmtDay(s.ga4_last_day) : ""}` : "GA4 —"}</span>
                    <span>{s.gsc_property ? `GSC ✓${s.gsc_last_day ? " to " + fmtDay(s.gsc_last_day) : ""}` : "GSC —"}</span>
                    {s.checked_at && <span title={s.check_note} style={{ color: s.snippet_found ? "var(--green)" : s.snippet_found === false ? "var(--amber)" : undefined }}>{s.snippet_found ? "snippet on site" : s.snippet_found === false ? "snippet missing" : "snippet unverified"} · {ago(s.checked_at)}</span>}
                    {s.tracking_number && <span style={{ color: "var(--green)" }}><PhoneCall size={11} style={{ verticalAlign: -1 }} /> {s.tracked_calls} tracked calls</span>}
                    {s.form_source === "webhook" && <span><Webhook size={11} style={{ verticalAlign: -1 }} /> {s.webhook_leads} webhook leads</span>}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => check(s)} disabled={checking === s.id} title="Fetch the live homepage and look for the snippet"><ShieldCheck size={14} className={checking === s.id ? "animate-spin" : ""} /> Check</button>
                <button className="btn sm" onClick={() => setOpenPanel(tab === "snippet" ? null : { id: s.id, tab: "snippet" })}>Snippet</button>
                <button className="btn sm" onClick={() => setOpenPanel(tab === "leads" ? null : { id: s.id, tab: "leads" })}>Leads & calls</button>
                <button className="btn ghost sm" onClick={() => startEdit(s)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="btn ghost sm" onClick={() => remove(s)} aria-label="Delete" style={{ color: "var(--red)" }}><Trash2 size={14} /></button>
              </div>
              {tab === "snippet" && <Snippet site={s} base={base} showToast={showToast} />}
              {tab === "leads" && <LeadsPanel site={s} base={base} showToast={showToast} rotate={() => rotate(s)} />}
            </div>
          );
        }) : <div className="empty"><h3>No sites yet</h3><p>Add the first one above. You get a key and a one-line snippet.</p></div>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4>What gets tracked automatically</h4>
          <ul className="steps">
            <li><span><b>Page views</b>, including route changes on Next.js sites. Only from the site's own domain; previews and localhost are dropped.</span></li>
            <li><span><b>Calls</b>: a tap on a <span className="mono">tel:</span> link, or a real call when a tracking number is set. <b>Emails</b>: <span className="mono">mailto:</span>. <b>Texts</b>: <span className="mono">sms:</span>.</span></li>
            <li><span><b>Forms</b>: the submit on the page, or the confirmed send when the webhook is wired.</span></li>
            <li><span><b>Bookings</b>: clicks out to Calendly, Square Appointments, Acuity, Zeffy and similar.</span></li>
            <li><span><b>Engaged visits</b>: 2+ pages, 10+ seconds, 25%+ scroll, or any lead. One lead per visit per type, so three taps on the number is one call.</span></li>
            <li><span><b>Exclude yourself</b>: open any page of the site with <span className="mono">?pulse_ignore=1</span> once. That browser is never counted. <span className="mono">?pulse_ignore=0</span> undoes it.</span></li>
            <li><span>Anything else: <span className="mono">data-track="Quote button"</span> on an element, or <span className="mono">window.pulse('booking', {'{'} label: 'Book a call' {'}'})</span>.</span></li>
          </ul>
        </div>
        <div className="card">
          <h4>Google (GA4 + Search Console)</h4>
          <ul className="steps">
            <li><span>On each client's GA4 property, add <span className="mono">{REPORTER}</span> as <b>Viewer</b>. On Search Console, add it with <b>Full</b>.</span></li>
            <li><span>Enter the GA4 property id and the Search Console property on the site. Search & traffic fills in on the next load.</span></li>
            <li><span><b>Pull GA4 + Search Console</b> (top right) loads history back to each launch date. The daily job re-pulls the last few days every morning, so this only needs pressing after adding a property.</span></li>
            <li><span>GA4 cannot see phone taps unless the site sends its own event, and it counts a visitor once per day. Pulse says "unknown" for calls on GA4-only days rather than 0.</span></li>
            <li><span>Vercel env: <span className="mono">CRON_SECRET</span> (any long random string) turns on the daily job in <span className="mono">vercel.json</span>. <span className="mono">TWILIO_AUTH_TOKEN</span> validates call webhooks.</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Snippet({ site, base, showToast }) {
  const tag = `<script async src="${base}/p.js" data-site="${site.id}"></script>`;
  const [how, setHow] = useState("html");
  return (
    <div style={{ padding: "0 16px 18px", borderBottom: "1px solid var(--border)" }}>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={"tab" + (how === "html" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("html")}>Plain HTML</button>
        <button className={"tab" + (how === "next" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("next")}>Next.js</button>
        <button className={"tab" + (how === "gtm" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("gtm")}>Google Tag Manager</button>
        <button className={"tab" + (how === "wix" ? " active" : "")} style={{ fontFamily: "inherit" }} onClick={() => setHow("wix")}>Wix</button>
      </div>
      {how === "html" && (<><div className="code">{tag}<CopyBtn text={tag} onCopied={() => showToast("Snippet copied")} /></div><div className="note">Paste it before <span className="mono">&lt;/head&gt;</span> on every page (or in the shared header include). Redeploy.</div></>)}
      {how === "next" && (() => {
        const code = `// app/layout.js (or .tsx)\nimport Script from "next/script";\n\n// inside <body>, after {children}:\n<Script src="${base}/p.js" data-site="${site.id}" strategy="afterInteractive" />`;
        return (<><div className="code">{code}<CopyBtn text={code} onCopied={() => showToast("Copied")} /></div><div className="note">Route changes are picked up automatically. For a form that posts with fetch, call <span className="mono">window.pulse('form', {'{'} label: 'Contact' {'}'})</span> after the request succeeds, or wire the webhook under Leads & calls.</div></>);
      })()}
      {how === "gtm" && (<><div className="code">{tag}<CopyBtn text={tag} onCopied={() => showToast("Snippet copied")} /></div><ol className="steps" style={{ marginTop: 14 }}><li><span>GTM container, <b>Tags → New → Custom HTML</b>, paste, name it <b>Pulse</b>.</span></li><li><span>Trigger <b>All Pages</b>. Save, <b>Submit → Publish</b>.</span></li></ol></>)}
      {how === "wix" && (<><div className="code">{tag}<CopyBtn text={tag} onCopied={() => showToast("Snippet copied")} /></div><ol className="steps" style={{ marginTop: 14 }}><li><span>Wix dashboard → <b>Settings → Custom Code → Add Custom Code</b>.</span></li><li><span>Paste, name it <b>Pulse</b>, <b>All pages</b>, place in <b>Head</b>. Apply.</span></li></ol></>)}
      <div className="note" style={{ marginTop: 12 }}>Then press <b>Check</b> on the site row. It fetches the live homepage and confirms the snippet with this key is there.</div>
    </div>
  );
}

function LeadsPanel({ site, base, showToast, rotate }) {
  const hook = `${base}/api/lead?site=${site.id}`;
  const secret = site.webhook_secret || "(save the site once to generate a secret)";
  const code = `// after the email / booking actually sent (server side, e.g. in the Resend route):\nawait fetch("${hook}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json", Authorization: "Bearer ${secret}" },\n  body: JSON.stringify({\n    type: "form",            // form | booking | call | email\n    name, email, phone, message,\n    path: "/contact",        // page the form was on\n    source: "resend",\n    visitor: body.pulseVisitor, session: body.pulseSession  // optional: window.pulse.visitor / .session sent with the form\n  })\n});`;
  const voice = `${base}/api/twilio/voice`;
  return (
    <div style={{ padding: "0 16px 18px", borderBottom: "1px solid var(--border)" }}>
      <div className="grid-2">
        <div>
          <h4 style={{ marginBottom: 8 }}><Webhook size={14} style={{ verticalAlign: -2 }} /> Lead webhook <span className="hint">real forms, with the message</span></h4>
          <div className="code">{code}<CopyBtn text={code} onCopied={() => showToast("Copied")} /></div>
          <div className="note">Set <b>Forms are counted from</b> to <b>webhook</b> on this site once it is wired. Then a form lead is a send that actually happened, and the lead feed shows the name and message. <button type="button" className="btn ghost sm" onClick={rotate} style={{ marginLeft: 6 }}>New secret</button></div>
        </div>
        <div>
          <h4 style={{ marginBottom: 8 }}><PhoneCall size={14} style={{ verticalAlign: -2 }} /> Call tracking <span className="hint">real calls, with duration</span></h4>
          <ol className="steps">
            <li><span>Twilio console → Phone Numbers → Buy a number (local to the client, voice capable, about $1.15/month).</span></li>
            <li><span>On the number, <b>Voice → A call comes in</b>: Webhook, <b>POST</b>, <span className="mono">{voice}</span> <CopyBtn text={voice} onCopied={() => showToast("Copied")} label="" /></span></li>
            <li><span>Edit this site: paste the number into <b>Tracking number</b>, the client's phone into <b>Forward calls to</b>. Save.</span></li>
            <li><span>Put the tracking number on the site instead of the client's real number (every <span className="mono">tel:</span> link and the visible text).</span></li>
            <li><span>Vercel env <span className="mono">TWILIO_AUTH_TOKEN</span> (Twilio console → Account info) so only Twilio can post here. Redeploy.</span></li>
          </ol>
          <div className="note">{site.tracking_number ? <span>Active: {site.tracking_number} → {site.forward_to || <b style={{ color: "var(--red)" }}>no forwarding number set</b>}. {site.tracked_calls} calls so far.</span> : "Not set up on this site yet."}</div>
        </div>
      </div>
    </div>
  );
}
