# Teach me: How Export Mail is connected

## 1. Why we no longer need Resend

The Export mailbox is already an email account.

Alibaba Mail provides an SMTP server. SMTP is the protocol software uses to send mail.

Our Worker therefore acts like a very small mail client:

```text
Cloudflare Worker
    |
    | encrypted TLS connection
    v
smtp.qiye.aliyun.com:465
    |
    v
export@changlongflor.com sends the message
```

## 2. The credentials

The browser never receives the mailbox password.

The secret exists only as:

```text
env.EXPORT_SMTP_PASSWORD
```

inside the Worker.

For local development, Wrangler reads it from `.dev.vars`.

For production, Cloudflare stores it as a Worker secret.

## 3. The SMTP conversation

After the Worker opens an encrypted connection, the server says approximately:

```text
220 ready
```

The Worker identifies itself:

```text
EHLO changlongflor.com
```

Then logs in:

```text
AUTH LOGIN
<base64 username>
<base64 password>
```

Then tells Alibaba who is sending and receiving:

```text
MAIL FROM:<export@changlongflor.com>
RCPT TO:<customer@example.com>
```

Then:

```text
DATA
```

means "the actual email starts now."

## 4. Why MIME exists

A normal SMTP message is text.

To send both HTML and a PDF, the Worker builds a MIME multipart message.

Conceptually:

```text
EMAIL
├── text version
├── HTML version
└── Changlong-Catalogue.pdf
```

The PDF is Base64 encoded so binary PDF bytes can safely travel through SMTP.

## 5. Supabase still happens first

The Worker first saves or updates the lead.

Only after that does it send the thank-you email.

This is deliberate: if the SMTP server has a temporary problem, we still keep the fair registration.

The email result is then written into `public.email_messages` as `sent` or `failed`.

## 6. Redirect

After the Worker finishes the registration request, the browser receives:

```json
{"ok":true,"email_sent":true}
```

Then `public/app.js` redirects to:

```text
/thank-you.html
```

The second page is independent. You can redesign it later without touching SMTP or Supabase.
