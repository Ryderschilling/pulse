import { q, ensureSchema } from "@/lib/db";
import { digits, e164, validSignature, formParams, twiml, esc } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio calls this when someone dials a site's tracking number. We log the
// call, then forward it to the client's real phone. The action URL below
// fires when the forwarded leg ends and fills in duration and outcome.
//
// Twilio console -> Phone Numbers -> the number -> Voice -> "A call comes in":
//   Webhook, POST, https://pulse.ryderschilling.com/api/twilio/voice
export async function POST(req) {
  const p = await formParams(req);
  if (!validSignature(req, p)) return new Response("bad signature", { status: 403 });
  await ensureSchema();
  const to = digits(p.To), from = e164(p.From);
  const sites = await q("select id, name, tracking_number, forward_to, record_calls from sites where tracking_number <> ''");
  const site = sites.find((s) => digits(s.tracking_number) === to);
  if (!site) return twiml(`<Say voice="alice">This number is not set up yet. Goodbye.</Say><Hangup/>`);
  if (!site.forward_to) return twiml(`<Say voice="alice">This number has no forwarding number yet. Goodbye.</Say><Hangup/>`);

  await q(
    `insert into calls (site_id, call_sid, from_number, to_number, forwarded_to, status, caller_city, caller_state, started_at, updated_at)
     values ($1,$2,$3,$4,$5,'ringing',$6,$7,now(),now())
     on conflict (call_sid) do nothing`,
    [site.id, p.CallSid || "", from, e164(p.To), e164(site.forward_to), (p.FromCity || "").slice(0, 80), (p.FromState || "").slice(0, 40)]
  );

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") || new URL(req.url).origin;
  const action = `${base}/api/twilio/status?site=${encodeURIComponent(site.id)}`;
  const record = site.record_calls ? ` record="record-from-answer-dual" recordingStatusCallback="${esc(action)}"` : "";
  // Florida is a two-party consent state: if recording is on, say so.
  const notice = site.record_calls ? `<Say voice="alice">This call may be recorded.</Say>` : "";
  // callerId = the caller's own number, so the client sees who is calling and
  // can call back from their phone log.
  return twiml(
    `${notice}<Dial callerId="${esc(from)}" timeout="25" action="${esc(action)}" method="POST"${record}><Number>${esc(e164(site.forward_to))}</Number></Dial>`
  );
}
