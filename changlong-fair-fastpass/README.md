# Changlong Fair Fast Pass

A reusable QR/NFC trade-fair registration page designed to deploy as its own Cloudflare Pages project while writing into the existing Changlong Supabase project.

## Architecture

```text
QR / NFC
   ↓
fair.changlongflor.com/<event-slug>
   ↓
Cloudflare Pages + Pages Functions
   ↓
Existing Supabase project
   ├── fair_events
   └── fair_leads
```

The browser never receives the Supabase service-role key and has no direct access to internal tables.

## Reuse for every fair

There is one `fair_events` table and one `fair_leads` table. Each new fair gets a row in `fair_events` and the same page works with the event slug.

Examples:

```text
https://fair.changlongflor.com/batimat-paris-2026?channel=qr
https://fair.changlongflor.com/batimat-paris-2026?channel=nfc&rep=adam
https://fair.changlongflor.com/melbourne-build-2026?channel=qr
```

No new table is required for a new fair.

## Form fields

Required:
- Full name
- Company
- At least one of email or phone

Optional:
- Position
- Region / country

Captured automatically:
- Event
- QR / NFC / direct channel
- Sales representative (`?rep=adam`)
- Timestamp
- Source = `trade_fair`
- `ai_outreach = true`
- Lead status = `new`
- Page URL

## 1. Supabase setup

Run:

1. `supabase/migrations/20260917_create_fair_capture.sql`
2. `supabase/seed.sql`

The schema has RLS enabled and intentionally grants no direct public table access. The Cloudflare server function performs the insert.

## 2. Cloudflare Pages setup

Create a new Cloudflare Pages project connected to this GitHub repo.

Build configuration:

```text
Framework preset: None
Build command: (leave empty)
Build output directory: public
```

Set these **Cloudflare environment variables/secrets**:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SB_SECRET_KEY
# Legacy alternative:
# SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_LEGACY_SERVICE_ROLE_JWT
STORE_CLIENT_IP=false
ENABLE_NOMINATIM_GEOCODING=false
GEOCODER_USER_AGENT=ChanglongFairFastPass/1.0 contact@changlongflor.com
```

Never place `SUPABASE_SECRET_KEY` or a legacy `SUPABASE_SERVICE_ROLE_KEY` in `public/`, browser JavaScript, GitHub, or a `NEXT_PUBLIC_*` / `VITE_*` variable.

## 3. Domain

Recommended custom domain:

```text
fair.changlongflor.com
```

Then use event-specific URLs such as:

```text
fair.changlongflor.com/batimat-paris-2026?channel=qr
fair.changlongflor.com/batimat-paris-2026?channel=nfc
fair.changlongflor.com/batimat-paris-2026?channel=nfc&rep=adam
```

## 4. Add another fair

Insert another event row:

```sql
insert into public.fair_events (
  slug, event_code, event_name, country, city, start_date, end_date
) values (
  'melbourne-build-2026',
  'MELBOURNE_BUILD_2026',
  'Melbourne Build 2026',
  'Australia',
  'Melbourne',
  '2026-10-21',
  '2026-10-22'
);
```

Immediately, the same deployed frontend is available at:

```text
https://fair.changlongflor.com/melbourne-build-2026
```

## Geocoding

The database already contains latitude/longitude and geocoding status fields.

By default geocoding is **off** so visitor submission is fast and there is no hidden dependency on a third-party API.

If `ENABLE_NOMINATIM_GEOCODING=true`, the Pages Function returns the registration response first, then runs best-effort OpenStreetMap Nominatim geocoding in `context.waitUntil()` using the submitted `Region / Country` field and the fair's country.

For higher volume, replace this with a dedicated geocoding provider or a queue/scheduled worker rather than relying on the public Nominatim service.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# fill in the values
npm run dev
```

Then open the local URL and use:

```text
/batimat-paris-2026?channel=qr&rep=adam
```

## Design

The layout is recreated from the supplied Changlong mockup:
- pale wood visual on the left
- rounded white registration card
- 2-column desktop form / 1-column mobile form
- Changlong logo
- bottom-right website link
- compact confirmation flow

The page is optimized for mobile QR/NFC traffic and contains no frontend framework dependency.
