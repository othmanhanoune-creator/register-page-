-- Example fair. Change dates/details if needed before running.
insert into public.fair_events (
  slug,
  event_code,
  event_name,
  country,
  city,
  page_title,
  page_subtitle,
  website_url,
  privacy_url,
  is_active
) values (
  'batimat-paris-2026',
  'BATIMAT_PARIS_2026',
  'BATIMAT Paris 2026',
  'France',
  'Paris',
  'Build with Changlong',
  'Please enter your details to register as a partner.',
  'https://www.changlongflor.com/',
  null, -- replace with the actual privacy-policy URL before production
  true
)
on conflict (slug) do update set
  event_code = excluded.event_code,
  event_name = excluded.event_name,
  country = excluded.country,
  city = excluded.city,
  page_title = excluded.page_title,
  page_subtitle = excluded.page_subtitle,
  website_url = excluded.website_url,
  privacy_url = excluded.privacy_url,
  is_active = excluded.is_active,
  updated_at = now();
