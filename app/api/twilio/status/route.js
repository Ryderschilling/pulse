import { q, ensureSchema } from "@/lib/db";
import { digits, validSignature, formParams, twiml } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// <Dial action> callback: the forwarded leg ended. DialCallStatus is
// completed | no-answer | busy | failed | canceled. DialCallDuration is the
// seconds the client was actually on the line. Also receives the recording
// callback (RecordingUrl) when recording is on.
export async function POST(req) {
  const p = await formParams(req);
  if (!validSignature(req, p)) return new Response("bad signature", { status: 403 });
  await ensureSchema();
  const sid = p.CallSid || "";
  if (!sid) return twiml(`<Hangup/>`);

  if (p.RecordingUrl && !p.DialCallStatus) {
    await q("update calls set recording_url=$2, updated_at=now() where call_sid=$1", [sid, p.RecordingUrl]);
    return new Response("ok");
  }

  const status = (p.DialCallStatus || p.CallStatus || "").toLowerCase();
  const duration = Number(p.DialCallDuration || 0) || 0;
  const answered = status === "completed" && duration > 0;
  const [call] = await q(
    `update calls set status=$2, duration=$3, answered=$4, recording_url=coalesce(nullif($5,''), recording_url), updated_at=now()
     where call_sid=$1 returning id, site_id, from_number, caller_city, caller_state, started_at`,
    [sid, status || "unknown", duration, answered, p.RecordingUrl || ""]
  );
  if (call) {
    // One events row per call so every page counts it like any other lead.
    // Missed calls still count: the person picked up the phone.
    const visitor = "tw:" + (digits(call.from_number) || sid);
    await q(
      `insert into events (site_id, type, path, title, visitor_id, session_id, label, href, value, device, country, meta, created_at)
       select $1, 'call', '', '', $2, $3, $4, $5, $6, '', 'US', $7::jsonb, $8
       where not exists (select 1 from events where site_id=$1 and session_id=$3 and type='call')`,
      [call.site_id, visitor, "tw:" + sid, answered ? "Tracked call" : "Missed call", "tel:" + call.from_number, duration,
        JSON.stringify({ answered, status, city: call.caller_city, state: call.caller_state, tracked: true }), call.started_at]
    );
  }
  // If nobody picked up, let the caller leave the client a message by text.
  if (!answered && status !== "completed") return twiml(`<Say voice="alice">Sorry, nobody could pick up right now. Please try again in a few minutes.</Say><Hangup/>`);
  return twiml(`<Hangup/>`);
}
