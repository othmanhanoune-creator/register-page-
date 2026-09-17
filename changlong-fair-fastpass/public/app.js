(() => {
  const FALLBACK_SLUG = 'batimat-paris-2026';
  const pathBits = location.pathname.split('/').filter(Boolean);
  const eventSlug = pathBits[0] || FALLBACK_SLUG;
  const qs = new URLSearchParams(location.search);
  const channel = cleanToken(qs.get('channel')) || 'direct';
  const salesRep = cleanToken(qs.get('rep')) || null;

  const form = document.getElementById('lead-form');
  const submitButton = document.getElementById('submit-button');
  const message = document.getElementById('form-message');
  const success = document.getElementById('success-state');
  const registerAnother = document.getElementById('register-another');
  const eventName = document.getElementById('event-name');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const websiteLink = document.getElementById('website-link');
  const privacyLink = document.getElementById('privacy-link');

  loadEvent();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const data = Object.fromEntries(new FormData(form).entries());
    const email = String(data.email || '').trim();
    const phone = String(data.phone || '').trim();

    if (!String(data.full_name || '').trim()) return invalidate('full_name', 'Please enter your full name.');
    if (!String(data.company || '').trim()) return invalidate('company', 'Please enter your company.');
    if (!email && !phone) return invalidate('email', 'Please provide at least an email address or phone number.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return invalidate('email', 'Please check the email address.');

    setLoading(true);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_slug: eventSlug,
          channel,
          sales_rep: salesRep,
          full_name: data.full_name,
          company: data.company,
          email,
          phone,
          position: data.position,
          region: data.region,
          website: data.website,
          page_url: location.href
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to register. Please try again.');

      document.getElementById('lead-code').textContent = result.lead_code || '';
      form.hidden = true;
      success.hidden = false;
      success.focus?.();
    } catch (error) {
      message.textContent = error.message || 'Unable to register. Please try again.';
    } finally {
      setLoading(false);
    }
  });

  registerAnother.addEventListener('click', () => {
    form.reset();
    clearErrors();
    success.hidden = true;
    form.hidden = false;
    document.getElementById('full_name').focus();
  });

  async function loadEvent() {
    try {
      const response = await fetch(`/api/event/${encodeURIComponent(eventSlug)}`);
      if (!response.ok) return;
      const cfg = await response.json();
      if (cfg.page_title) pageTitle.textContent = cfg.page_title;
      if (cfg.page_subtitle) pageSubtitle.textContent = cfg.page_subtitle;
      if (cfg.event_name) {
        eventName.textContent = cfg.event_name;
        eventName.hidden = false;
        document.title = `${cfg.event_name} · Changlong`;
      }
      if (cfg.website_url) websiteLink.href = cfg.website_url;
      if (cfg.privacy_url) privacyLink.href = cfg.privacy_url;
      else privacyLink.hidden = true;
    } catch (_) {
      // Page still works; submit endpoint validates the event server-side.
    }
  }

  function invalidate(id, text) {
    const field = document.getElementById(id);
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    message.textContent = text;
  }

  function clearErrors() {
    message.textContent = '';
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function setLoading(loading) {
    submitButton.disabled = loading;
    submitButton.classList.toggle('loading', loading);
    submitButton.querySelector('.button-label').textContent = loading ? 'saving' : 'confirm';
  }

  function cleanToken(value) {
    if (!value) return null;
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 50);
    return cleaned || null;
  }
})();
