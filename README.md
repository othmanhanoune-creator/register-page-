# Changlong Fair Fast Pass V2 - Mobile + Catalogue Build

This build is designed primarily for phones and uses Alibaba Mail SMTP directly from the Cloudflare Worker.

## Flow

```text
Visitor submits mobile form
        ↓
Cloudflare Worker
        ↓
JCL Supabase platform
        ↓
Alibaba Mail SMTP
export@changlongflor.com
        ↓
Thank-you email + compressed Changlong catalogue
        ↓
Responsive thank-you page
```

## Included assets

```text
public/assets/background.png
public/assets/logo.png
public/assets/thank-you-card.png
public/assets/thank-you-background.png
public/assets/Changlong-Catalogue.pdf
```

The included catalogue is the branded 97-page Changlong catalogue compressed to about 8 MB so it can be opened from the page and attached to the automatic email without carrying the original ~37 MB file.

The registration layout is mobile-first: the card stays inside the phone width, inputs never overflow, iOS does not zoom on field focus, the privacy text does not overlap the confirm button, and validation/error messages expand the card naturally.

## Install and preview

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:8787
```

Thank-you page:

```text
http://localhost:8787/thank-you.html?email=sent
```

## Local secrets

Secrets are intentionally not stored in the ZIP. Create `.dev.vars`:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
notepad ".dev.vars"
```

Fill in:

```text
SUPABASE_SECRET_KEY="..."
EXPORT_SMTP_USER="export@changlongflor.com"
EXPORT_SMTP_PASSWORD="..."
```

Then restart `npm run dev`.

## Health check

Open:

```text
http://localhost:8787/api/health
```

For a complete local setup you want:

```json
{
  "supabase_configured": true,
  "smtp_configured": true,
  "catalogue_available": true
}
```

`catalogue_available: true` confirms that the PDF is physically inside this build. `smtp_configured: true` confirms that the local SMTP username/password are present; it does not validate the mailbox password until an email is actually sent.

## Why an email can fail while registration succeeds

The lead is saved first. Email delivery is a separate second step. A missing catalogue, absent/wrong SMTP credentials, or an SMTP connection/authentication error can therefore produce a successful registration with an email warning. The browser console now logs the server-provided email failure reason for local debugging.

## Production secrets

```powershell
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put EXPORT_SMTP_USER
npx wrangler secret put EXPORT_SMTP_PASSWORD
```

## Deploy

```powershell
npm run deploy
```

The mailbox password stays in Wrangler secrets and is never sent to the browser.
