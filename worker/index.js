import { connect } from "cloudflare:sockets";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const cataloguePath = env.CATALOGUE_PATH || "/assets/Changlong-Catalogue.pdf";
      let catalogueAvailable = false;
      let catalogueSizeBytes = null;

      try {
        const catalogueUrl = new URL(cataloguePath, request.url);
        const catalogueResponse = await env.ASSETS.fetch(
          new Request(catalogueUrl, { method: "HEAD" })
        );
        catalogueAvailable = catalogueResponse.ok;
        const sizeHeader = catalogueResponse.headers.get("content-length");
        catalogueSizeBytes = sizeHeader ? Number(sizeHeader) : null;
      } catch (error) {
        console.error("Catalogue health check failed:", error);
      }

      return json({
        ok: true,
        supabase_configured: Boolean(env.SUPABASE_URL && getSupabaseKey(env)),
        smtp_configured: Boolean(
          env.EXPORT_SMTP_USER &&
          env.EXPORT_SMTP_PASSWORD &&
          (env.SMTP_HOST || "smtp.qiye.aliyun.com")
        ),
        smtp_host: env.SMTP_HOST || "smtp.qiye.aliyun.com",
        smtp_port: Number(env.SMTP_PORT || 465),
        event_slug: env.EVENT_SLUG || null,
        catalogue_path: cataloguePath,
        catalogue_available: catalogueAvailable,
        catalogue_size_bytes: catalogueSizeBytes
      });
    }

    if (url.pathname === "/api/register") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }

      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed." }, 405);
      }

      return registerLead(request, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    if (request.method === "GET" && !url.pathname.includes(".")) {
      return env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url), request)
      );
    }

    return assetResponse;
  }
};

async function registerLead(request, env) {
  const supabaseKey = getSupabaseKey(env);

  if (!env.SUPABASE_URL || !supabaseKey) {
    return json({
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      error: "Server database configuration is incomplete."
    }, 500);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 20_000) {
    return json({ ok: false, error: "Request is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const lead = {
    full_name: clean(body.full_name, 160),
    email: clean(body.email, 254).toLowerCase(),
    phone: clean(body.phone, 80),
    company: clean(body.company, 220),
    position: clean(body.position, 180),
    region: clean(body.region, 180)
  };

  if (!lead.full_name) {
    return json({ ok: false, error: "Full name is required." }, 400);
  }

  if (!isEmail(lead.email)) {
    return json({ ok: false, error: "A valid email is required." }, 400);
  }

  if (!lead.company) {
    return json({ ok: false, error: "Company is required." }, 400);
  }

  const eventSlug = clean(env.EVENT_SLUG || "batimat-paris-2026", 120);
  const submittedAt = new Date().toISOString();

  try {
    const existing = await findExistingLeadByEmail(env, supabaseKey, lead.email);

    let leadId;
    let created = false;

    if (existing) {
      leadId = existing.lead_id;
      await gentlyEnrichExistingLead(env, supabaseKey, existing, lead);
    } else {
      leadId = makeFairLeadId();

      await insertNewFairLead(env, supabaseKey, {
        leadId,
        eventSlug,
        submittedAt,
        lead,
        referer: clean(request.headers.get("referer"), 500)
      });

      created = true;
    }

    // The lead itself is the critical write. Notes are useful metadata, but a
    // note-table problem must not make a successfully saved registration look failed.
    try {
      await addFairRegistrationNote(env, supabaseKey, {
        leadId,
        eventSlug,
        submittedAt,
        lead
      });
    } catch (error) {
      console.error("Fair note insert failed:", error);
    }

    // Registration is already safely stored at this point.
    // The email is the second action.
    const emailResult = await sendCatalogueEmailViaAlibabaSMTP(
      request,
      env,
      { leadId, eventSlug, lead }
    );

    // Email logging is useful for BI/history, but it is not allowed to turn a
    // successfully stored fair registration into a 500 response.
    try {
      await logEmailMessage(env, supabaseKey, {
        leadId,
        lead,
        emailResult
      });
    } catch (error) {
      console.error("Fair email log insert failed:", error);
    }

    return json({
      ok: true,
      lead_id: leadId,
      created,
      email_sent: emailResult.ok,
      email_error: emailResult.ok ? null : clean(emailResult.error || "Email was not sent.", 300)
    });
  } catch (error) {
    console.error("Registration error:", error);

    return json({
      ok: false,
      error: "We could not complete the registration. Please try again."
    }, 500);
  }
}

function getSupabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function supabaseHeaders(key, prefer = "") {
  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`
  };

  if (prefer) headers["Prefer"] = prefer;
  return headers;
}

async function findExistingLeadByEmail(env, key, email) {
  const url = new URL("/rest/v1/leads", env.SUPABASE_URL);

  url.searchParams.set(
    "select",
    "lead_id,name,email,phone,contact_full_name,contact_job_title"
  );
  url.searchParams.set("email", `eq.${email}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders(key)
  });

  if (!response.ok) {
    throw new Error(`Lead lookup failed: ${await response.text()}`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function gentlyEnrichExistingLead(env, key, existing, lead) {
  const patch = {};

  if (!existing.contact_full_name && lead.full_name) {
    patch.contact_full_name = lead.full_name;
  }

  if (!existing.contact_job_title && lead.position) {
    patch.contact_job_title = lead.position;
  }

  if (!existing.phone && lead.phone) {
    patch.phone = lead.phone;
  }

  if (!Object.keys(patch).length) return;

  const url = new URL("/rest/v1/leads", env.SUPABASE_URL);
  url.searchParams.set("lead_id", `eq.${existing.lead_id}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(key, "return=minimal"),
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error(`Existing lead update failed: ${await response.text()}`);
  }
}

async function insertNewFairLead(env, key, data) {
  const { leadId, eventSlug, submittedAt, lead, referer } = data;

  const record = {
    lead_id: leadId,
    name: lead.company,
    email: lead.email,
    phone: lead.phone || null,
    contact_full_name: lead.full_name,
    contact_job_title: lead.position || null,
    admin_level_1: lead.region || null,

    email_source: "fair_fastpass",
    source_url: referer || null,
    market: "Fair",
    source_batch: `fair:${eventSlug}`,
    contact_scope: "fair_registration",
    enrichment_source: "fair_fastpass",
    enriched_at: submittedAt,

    // The fair thank-you email is transactional. Do not automatically
    // enroll the person in the existing cold-outreach automation.
    ai_outreach_enabled: false,

    enrichment_raw: {
      fair_registration: {
        event_slug: eventSlug,
        submitted_at: submittedAt,
        region_entered: lead.region || null,
        source: "fair_fastpass",
        privacy_copy_version: "v1"
      }
    }
  };

  const url = new URL("/rest/v1/leads", env.SUPABASE_URL);

  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(key, "return=minimal"),
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    throw new Error(`Lead insert failed: ${await response.text()}`);
  }
}

async function addFairRegistrationNote(env, key, data) {
  const { leadId, eventSlug, submittedAt, lead } = data;

  const body = [
    "Fair registration",
    `event=${eventSlug}`,
    `submitted_at=${submittedAt}`,
    `contact=${lead.full_name}`,
    `company=${lead.company}`,
    `email=${lead.email}`,
    lead.phone ? `phone=${lead.phone}` : null,
    lead.position ? `position=${lead.position}` : null,
    lead.region ? `region=${lead.region}` : null
  ].filter(Boolean).join(" | ");

  const url = new URL("/rest/v1/lead_notes", env.SUPABASE_URL);

  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(key, "return=minimal"),
    body: JSON.stringify({
      lead_id: leadId,
      body
    })
  });

  if (!response.ok) {
    throw new Error(`Fair note insert failed: ${await response.text()}`);
  }
}

/* ==========================================================
   ALIBABA MAIL SMTP
   ========================================================== */

async function sendCatalogueEmailViaAlibabaSMTP(request, env, data) {
  const { lead } = data;

  if (!env.EXPORT_SMTP_USER || !env.EXPORT_SMTP_PASSWORD) {
    return {
      ok: false,
      provider: "alibaba_smtp",
      error: "Export SMTP credentials are not configured."
    };
  }

  const catalogue = await loadCatalogue(request, env);

  if (!catalogue.ok) {
    return {
      ok: false,
      provider: "alibaba_smtp",
      error: catalogue.error
    };
  }

  const host = env.SMTP_HOST || "smtp.qiye.aliyun.com";
  const port = Number(env.SMTP_PORT || 465);
  const fromEmail = clean(env.EXPORT_SMTP_USER, 254);
  const fromName = clean(env.MAIL_FROM_NAME || "Changlong", 100);
  const subject = env.EMAIL_SUBJECT || "Thank you for visiting Changlong";

  const textBody = buildThankYouText(lead.full_name, env);
  const htmlBody = buildThankYouEmail(lead.full_name, env);

  const rawMessage = buildMimeMessage({
    fromName,
    fromEmail,
    toEmail: lead.email,
    subject,
    textBody,
    htmlBody,
    attachmentFilename: catalogue.filename,
    attachmentBase64: catalogue.base64
  });

  let socket;
  let reader;
  let writer;

  try {
    // Alibaba Mail port 465 uses implicit TLS.
    socket = connect(
      { hostname: host, port },
      { secureTransport: "on" }
    );

    await socket.opened;

    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();

    const smtp = createSmtpSession(reader, writer);

    await smtp.expect([220]);

    await smtp.command(
      `EHLO ${env.SMTP_EHLO_NAME || "changlongflor.com"}`,
      [250]
    );

    await smtp.command("AUTH LOGIN", [334]);
    await smtp.command(toBase64Utf8(env.EXPORT_SMTP_USER), [334]);
    await smtp.command(toBase64Utf8(env.EXPORT_SMTP_PASSWORD), [235]);

    await smtp.command(`MAIL FROM:<${fromEmail}>`, [250]);
    await smtp.command(`RCPT TO:<${lead.email}>`, [250, 251]);

    await smtp.command("DATA", [354]);

    // DATA ends with CRLF . CRLF. Dot-stuff any line beginning with "."
    const smtpData = dotStuff(rawMessage) + "\r\n.\r\n";
    await smtp.writeRaw(smtpData);
    const dataReply = await smtp.readReply();

    if (dataReply.code !== 250) {
      throw new Error(`SMTP DATA rejected: ${dataReply.text}`);
    }

    // Best effort QUIT.
    try {
      await smtp.command("QUIT", [221]);
    } catch {
      // Delivery was already accepted with 250; ignore QUIT failure.
    }

    return {
      ok: true,
      provider: "alibaba_smtp",
      subject,
      text: textBody,
      provider_message_id: extractQueuedId(dataReply.text)
    };
  } catch (error) {
    console.error("Alibaba SMTP send failed:", error);

    return {
      ok: false,
      provider: "alibaba_smtp",
      subject,
      text: textBody,
      error: String(error?.message || error)
    };
  } finally {
    try { reader?.releaseLock(); } catch {}
    try { writer?.releaseLock(); } catch {}
    try { socket?.close(); } catch {}
  }
}

function createSmtpSession(reader, writer) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  async function writeRaw(value) {
    await writer.write(encoder.encode(value));
  }

  async function readReply() {
    while (true) {
      const lines = buffer.split("\r\n");

      // Keep the last partial line in the buffer.
      buffer = lines.pop() ?? "";

      if (lines.length) {
        // A multiline SMTP response uses "250-" for continuation and
        // ends when the same response code is followed by a space: "250 ".
        let code = null;
        const captured = [];

        for (const line of lines) {
          const match = line.match(/^(\d{3})([ -])(.*)$/);

          if (!match) continue;

          if (code === null) code = Number(match[1]);
          captured.push(line);

          if (match[2] === " ") {
            return {
              code: Number(match[1]),
              text: captured.join("\n")
            };
          }
        }

        // If we consumed only continuation lines, preserve them while waiting
        // for the final line. SMTP replies are small, so this is safe.
        if (captured.length) {
          buffer = captured.join("\r\n") + "\r\n" + buffer;
        }
      }

      const { value, done } = await reader.read();

      if (done) {
        throw new Error("SMTP connection closed before a complete reply.");
      }

      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function expect(expectedCodes) {
    const reply = await readReply();

    if (!expectedCodes.includes(reply.code)) {
      throw new Error(
        `SMTP expected ${expectedCodes.join("/")} but received ${reply.code}: ${reply.text}`
      );
    }

    return reply;
  }

  async function command(line, expectedCodes) {
    await writeRaw(line + "\r\n");
    return expect(expectedCodes);
  }

  return {
    writeRaw,
    readReply,
    expect,
    command
  };
}

function buildMimeMessage({
  fromName,
  fromEmail,
  toEmail,
  subject,
  textBody,
  htmlBody,
  attachmentFilename,
  attachmentBase64
}) {
  const mixedBoundary = `mixed_${crypto.randomUUID()}`;
  const alternativeBoundary = `alt_${crypto.randomUUID()}`;

  const encodedSubject = encodeMimeHeader(subject);
  const encodedFromName = encodeMimeHeader(fromName);

  const lines = [
    `From: ${encodedFromName} <${fromEmail}>`,
    `To: <${toEmail}>`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@changlongflor.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64Utf8(textBody)),
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64Utf8(htmlBody)),
    "",
    `--${alternativeBoundary}--`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${safeHeaderFilename(attachmentFilename)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeHeaderFilename(attachmentFilename)}"`,
    "",
    wrapBase64(attachmentBase64),
    "",
    `--${mixedBoundary}--`,
    ""
  ];

  return lines.join("\r\n");
}

function dotStuff(message) {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map(line => line.startsWith(".") ? `.${line}` : line)
    .join("\r\n");
}

async function loadCatalogue(request, env) {
  const path = env.CATALOGUE_PATH || "/assets/Changlong-Catalogue.pdf";
  const filename = env.CATALOGUE_FILENAME || "Changlong-Catalogue.pdf";

  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url));

  if (!response.ok) {
    return {
      ok: false,
      error: `Catalogue PDF is missing at ${path}.`
    };
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    return {
      ok: false,
      error: "Catalogue PDF is empty."
    };
  }

  return {
    ok: true,
    filename,
    base64: arrayBufferToBase64(buffer)
  };
}

async function logEmailMessage(env, key, data) {
  const { leadId, lead, emailResult } = data;

  const row = {
    lead_id: leadId,
    direction: "outbound",
    sequence_number: 0,
    message_type: "initial",
    sender_email: clean(env.EXPORT_SMTP_USER || "", 254),
    recipient_email: lead.email,
    subject: emailResult.subject || env.EMAIL_SUBJECT || "Thank you for visiting Changlong",
    body_text: emailResult.text || buildThankYouText(lead.full_name, env),
    status: emailResult.ok ? "sent" : "failed",
    provider: emailResult.provider || "alibaba_smtp",
    provider_message_id: emailResult.provider_message_id || null,
    sent_at: emailResult.ok ? new Date().toISOString() : null,
    error_message: emailResult.ok ? null : clean(emailResult.error, 2000)
  };

  const url = new URL("/rest/v1/email_messages", env.SUPABASE_URL);

  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(key, "return=minimal"),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    console.error("Email log insert failed:", await response.text());
  }
}

function buildThankYouEmail(name, env) {
  const safeName = escapeHtml(name);
  const contactName = escapeHtml(env.CONTACT_NAME || "Adam");
  const contactRole = escapeHtml(env.CONTACT_ROLE || "Business Development");
  const contactEmail = escapeHtml(env.CONTACT_EMAIL || env.EXPORT_SMTP_USER || "export@changlongflor.com");
  const contactPhone = escapeHtml(env.CONTACT_PHONE || "15205149312");

  return `
  <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.65">
    <h2 style="margin-bottom:8px">Thank you, ${safeName}.</h2>
    <p>Thank you for connecting with Changlong.</p>
    <p>Our latest flooring catalogue is attached to this email for your reference.</p>
    <p>Our team will be happy to discuss products, specifications, samples and cooperation opportunities with you.</p>
    <p>If you have any questions, need additional information, or have any problem opening the catalogue, please contact me directly at <a href="mailto:${contactEmail}" style="color:#244f3e">${contactEmail}</a>.</p>
    <p style="margin-top:28px">
      Best regards,<br>
      <strong>${contactName}</strong><br>
      ${contactRole}<br>
      Changlong Flooring<br>
      Email: <a href="mailto:${contactEmail}" style="color:#244f3e">${contactEmail}</a><br>
      Phone: ${contactPhone}
    </p>
  </div>`;
}

function buildThankYouText(name, env) {
  const contactName = env.CONTACT_NAME || "Adam";
  const contactRole = env.CONTACT_ROLE || "Business Development";
  const contactEmail = env.CONTACT_EMAIL || env.EXPORT_SMTP_USER || "export@changlongflor.com";
  const contactPhone = env.CONTACT_PHONE || "15205149312";

  return [
    `Thank you, ${name}.`,
    "",
    "Thank you for connecting with Changlong.",
    "Our latest flooring catalogue is attached to this email for your reference.",
    "Our team will be happy to discuss products, specifications, samples and cooperation opportunities with you.",
    `If you have any questions, need additional information, or have any problem opening the catalogue, please contact me directly at ${contactEmail}.`,
    "",
    "Best regards,",
    contactName,
    contactRole,
    "Changlong Flooring",
    `Email: ${contactEmail}`,
    `Phone: ${contactPhone}`
  ].join("\n");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function wrapBase64(value) {
  return String(value).match(/.{1,76}/g)?.join("\r\n") || "";
}

function encodeMimeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${toBase64Utf8(value)}?=`;
}

function safeHeaderFilename(value) {
  return String(value || "Changlong-Catalogue.pdf")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 180);
}

function extractQueuedId(replyText) {
  // Different SMTP servers format queue IDs differently.
  // Preserve a useful token when one is clearly present; otherwise null.
  const match = String(replyText || "").match(/\b(?:id|queue(?:d)?(?: as)?)\s*[:=]?\s*([A-Za-z0-9._-]{6,})/i);
  return match ? match[1] : null;
}

function makeFairLeadId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FAIR-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      "Access-Control-Allow-Origin": "*"
    }
  });
}
