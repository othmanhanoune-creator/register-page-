const MAX_BODY_BYTES = 16_000;

export async function onRequestPost(context) {
  const envError = checkEnv(context.env);
  if (envError) return json({ error: envError }, 500);

  const contentLength = Number(context.request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413);

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // Honeypot: silently accept bots without writing to the database.
  if (text(payload.website, 120)) return json({ ok: true, lead_code: 'THANK-YOU' }, 200);

  const eventSlug = token(payload.event_slug, 80);
  const fullName = text(payload.full_name, 120);
  const company = text(payload.company, 160);
  const email = normalizeEmail(payload.email);
  const phone = text(payload.phone, 60);
  const position = text(payload.position, 120);
  const region = text(payload.region, 140);
  const channel = token(payload.channel, 50) || 'direct';
  const salesRep = token(payload.sales_rep, 50);
  const pageUrl = safeUrl(payload.page_url);

  if (!eventSlug || !fullName || !company) return json({ error: 'Name and company are required.' }, 400);
  if (!email && !phone) return json({ error: 'Please provide an email address or phone number.' }, 400);
  if (payload.email && !email) return json({ error: 'Please check the email address.' }, 400);

  const event = await getEvent(context.env, eventSlug);
  if (!event) return json({ error: 'This fair registration link is not active.' }, 404);

  const leadCode = makeLeadCode(event.event_code);
  const clientIp = context.request.headers.get('CF-Connecting-IP') || null;
  const userAgent = text(context.request.headers.get('user-agent'), 300);

  const insertBody = {
    event_id: event.id,
    lead_code: leadCode,
    full_name: fullName,
    company_name: company,
    email: email || null,
    phone: phone || null,
    position: position || null,
    region: region || null,
    capture_channel: channel,
    sales_rep: salesRep || null,
    source: 'trade_fair',
    lead_status: 'new',
    ai_outreach: true,
    page_url: pageUrl,
    user_agent: userAgent,
    // Hash/omit IP later if you do not need it. Kept null by default for data minimisation.
    client_ip: context.env.STORE_CLIENT_IP === 'true' ? clientIp : null,
    geocode_status: region ? 'pending' : 'not_requested'
  };

  const insert = await fetch(`${context.env.SUPABASE_URL}/rest/v1/fair_leads`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(context.env),
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(insertBody)
  });

  if (!insert.ok) {
    console.error('Supabase insert failed', insert.status, await insert.text());
    return json({ error: 'Unable to save your registration. Please try again.' }, 502);
  }

  const rows = await insert.json();
  const saved = rows?.[0];

  // Best-effort geocoding happens after the visitor receives a response.
  if (saved?.id && region && context.env.ENABLE_NOMINATIM_GEOCODING === 'true') {
    context.waitUntil(geocodeLead(context.env, saved.id, region, event.country));
  }

  return json({ ok: true, lead_code: leadCode }, 201);
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS' } });
}

async function getEvent(env, slug) {
  const params = new URLSearchParams({
    slug: `eq.${slug}`,
    is_active: 'eq.true',
    select: 'id,event_code,country'
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/fair_events?${params}`, { headers: serviceHeaders(env) });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0] || null;
}

async function geocodeLead(env, leadId, region, eventCountry) {
  try {
    const query = [region, eventCountry].filter(Boolean).join(', ');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        'user-agent': env.GEOCODER_USER_AGENT || 'ChanglongFairFastPass/1.0',
        accept: 'application/json'
      }
    });

    const hits = response.ok ? await response.json() : [];
    const hit = Array.isArray(hits) ? hits[0] : null;
    const patch = hit
      ? { latitude: Number(hit.lat), longitude: Number(hit.lon), geocode_status: 'done', geocoded_at: new Date().toISOString() }
      : { geocode_status: 'not_found', geocoded_at: new Date().toISOString() };

    await fetch(`${env.SUPABASE_URL}/rest/v1/fair_leads?id=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
  } catch (error) {
    console.error('Geocoding failed', error);
  }
}

function checkEnv(env) {
  if (!env.SUPABASE_URL || !(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) return 'Server configuration is incomplete.';
  return null;
}

function serviceHeaders(env) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, accept: 'application/json' };
  // Legacy service-role keys are JWTs and may also be sent as Bearer tokens.
  // New sb_secret_* keys are API keys, not JWTs, so they stay in `apikey` only.
  if (String(key).startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  return headers;
}

function normalizeEmail(value) {
  const email = text(value, 180).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function text(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function token(value, max) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString().slice(0, 500) : null;
  } catch { return null; }
}

function makeLeadCode(eventCode) {
  const prefix = String(eventCode || 'FAIR').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'FAIR';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(36)).join('').toUpperCase().slice(0, 6);
  return `${prefix}-${random}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
