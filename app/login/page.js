"use client";
import { useState } from "react";

function safeNext() {
  try {
    const n = new URLSearchParams(window.location.search).get("next") || "/";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
  } catch (e) { return "/"; }
}

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (res.ok) window.location.href = safeNext();
      else { const d = await res.json().catch(() => ({})); setErr(d.error || "Wrong password"); setBusy(false); }
    } catch (e) { setErr("Something went wrong. Try again."); setBusy(false); }
  }
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">P</div>
        <h2>Pulse</h2>
        <p>Site analytics for every site you manage. Enter your password.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus aria-label="Password" />
        <div className="login-err">{err}</div>
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>{busy ? "Checking…" : "Log in"}</button>
      </form>
    </div>
  );
}
