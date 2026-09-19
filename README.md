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

## Manual events on a client site

```html
<a href="/quote" data-track="Quote button">Get a quote</a>
<script>window.pulse('booking', { label: 'Book a call' })</script>
```

## Testing locally without touching Neon

Set `PULSE_DB_DRIVER=pg` and point `DATABASE_URL` at a local Postgres. Same SQL,
same app.
