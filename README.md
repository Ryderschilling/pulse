# Pulse

Site analytics for every site Ryder Schilling LLC manages. Own tracking snippet
(calls, forms, emails, bookings, page flows, click map) plus GA4 and Search
Console pulled through the reporter service account. Next.js 14, plain JS,
Neon Postgres.

## Run it

```
cd "website builds/pulse"
npm install
npm run db:init      # creates the tables on the Neon branch (safe to re-run)
npm run dev          # http://localhost:3200
```

`.env.local` holds the Neon branch URL, the dashboard password, and the path to
the Google service account JSON. Never commit it.

## Deploy (Vercel, team ryder-schillings-projects)

1. Push the repo, import it on Vercel.
2. Environment variables:
   - `DATABASE_URL` = the Neon pooled URL for the `website analytics dashboard` branch
   - `DASHBOARD_PASSWORD`
   - `NEXT_PUBLIC_APP_URL` = `https://pulse.ryderschilling.com`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole `_ops/gsc-service-account.json` on one line
   - `CRON_SECRET` = any long random string. Turns on the daily job in `vercel.json`
     (re-pulls GA4 + Search Console for the last few days, checks every site still
     has the snippet). Vercel sends it automatically.
   - `TWILIO_AUTH_TOKEN` = Twilio console → Account info. Only needed once a site
     has a tracking number; it validates the call webhooks.
3. Add the domain `pulse.ryderschilling.com` (CNAME to Vercel).
4. Open the site, add each client site in Sites & setup, copy its snippet into that
   client's GTM container as a Custom HTML tag on All Pages, publish.

## What lives where

- `public/p.js` — the snippet clients load. ~3 KB, no cookies, no deps.
- `app/api/collect` — receives snippet batches. CORS open, bot-filtered, one insert.
- `lib/stats.js` — every dashboard number as SQL over `events`.
- `lib/google.js` — GA4 Data API + Search Console with a signed JWT, cached 1h.
- `components/views/*` — Overview, Pages, Conversions, Flows, Search & traffic,
  Portfolio (cross-site benchmarks), Settings.
- `db/schema.sql` — readable schema. `lib/db.js` applies it idempotently.

## What the numbers mean (locked 2026-09-19)

- **Visitor**: a distinct browser that viewed a page. GA4 history days count a
  visitor once per day.
- **Engaged visit**: 2+ pages, or 10+ seconds, or 25%+ scroll, or a lead. This
  is the headline number; raw visitors include bots and bounces.
- **Lead**: one visit doing one kind of contact action once. Three taps on the
  phone number in one visit is one call. Types: call, form, email, booking,
  text, custom.
- **Call**: a `tel:` tap, or, once a site has a Twilio tracking number, a real
  call with duration (taps then show as "call taps" and stop counting).
- **Form**: the submit on the page, or, once the site posts to `/api/lead`,
  the send the site's own handler confirmed (page submits then show as
  "attempts" and stop counting).
- **GA4 history**: only exact lead event names count (`call_click`,
  `lead_form_submit`, `form_submit`, `generate_lead`, `email_click`,
  `booking_click`, plus per-site extras in Settings). `form_start` never counts.
  GA4 cannot see phone taps, so calls on GA4-only days are "unknown", not 0.
- **Portfolio**: day 0 is the launch date, never guessed. A site is benchmarked
  once it has a launch date, has been live the full window, and has data for
  most of it. Proof lines need 3 qualifying sites.
- **Days** are cut at midnight in the site's timezone on every page.
- Only the site's own domain (plus "other allowed hosts") can send events.
  Previews, localhost and copies are dropped. `?pulse_ignore=1` excludes a browser.

## Lead webhook and call tracking

Both are per site, under Sites & setup → Leads & calls. The webhook is a POST to
`/api/lead?site=<key>` with `Authorization: Bearer <secret>` after the site's
form handler actually sent. Call tracking is a Twilio number whose voice webhook
is `/api/twilio/voice`; Pulse logs the call and forwards it to the client's phone.

## Manual events on a client site

```html
<a href="/quote" data-track="Quote button">Get a quote</a>
<script>window.pulse('booking', { label: 'Book a call' })</script>
```

## Testing locally without touching Neon

Set `PULSE_DB_DRIVER=pg` and point `DATABASE_URL` at a local Postgres. Same SQL,
same app.
