export async function onRequestGet(context) {
  const { slug } = context.params;
  if (!slug || !/^[a-z0-9-]{2,80}$/i.test(String(slug))) {
    return json({ error: 'Invalid event.' }, 400);
  }

  const envError = checkEnv(context.env);
  if (envError) return json({ error: envError }, 500);

  const params = new URLSearchParams({
    slug: `eq.${String(slug).toLowerCase()}`,
    is_active: 'eq.true',
    select: 'slug,event_name,event_code,page_title,page_subtitle,website_url,privacy_url'
  });

  const response = await fetch(`${context.env.SUPABASE_URL}/rest/v1/fair_events?${params}`, {
    headers: serviceHeaders(context.env)
  });

  if (!response.ok) return json({ error: 'Unable to load event.' }, 502);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'Event not found.' }, 404);

  return json(rows[0], 200, { 'cache-control': 'public, max-age=300' });
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

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra }
  });
}
