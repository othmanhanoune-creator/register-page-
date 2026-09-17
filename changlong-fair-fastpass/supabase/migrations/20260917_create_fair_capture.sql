-- Reusable event + lead capture schema for Changlong trade fairs.
-- Public clients receive NO direct table policies. Writes go through the Cloudflare Pages Function.

create extension if not exists pgcrypto;

create table if not exists public.fair_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  event_code text not null unique,
  event_name text not null,
  country text,
  city text,
  venue text,
  start_date date,
  end_date date,
  page_title text not null default 'Build with Changlong',
  page_subtitle text not null default 'Please enter your details to register as a partner.',
  website_url text not null default 'https://www.changlongflor.com/',
  privacy_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fair_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null references public.fair_events(id) on delete restrict,
  lead_code text not null unique,

  full_name text not null,
  company_name text not null,
  email text,
  phone text,
  position text,
  region text,

  capture_channel text not null default 'direct',
  sales_rep text,
  source text not null default 'trade_fair',
  lead_status text not null default 'new',
  ai_outreach boolean not null default true,

  latitude double precision,
  longitude double precision,
  geocode_status text not null default 'not_requested',
  geocoded_at timestamptz,

  page_url text,
  user_agent text,
  client_ip inet,
  converted_to_lead_id text,

  constraint fair_leads_contact_check check (
    nullif(btrim(coalesce(email, '')), '') is not null
    or nullif(btrim(coalesce(phone, '')), '') is not null
  )
);

create index if not exists fair_leads_event_created_idx
  on public.fair_leads(event_id, created_at desc);

create index if not exists fair_leads_email_idx
  on public.fair_leads(lower(email))
  where email is not null;

create index if not exists fair_leads_company_idx
  on public.fair_leads(lower(company_name));

create index if not exists fair_leads_status_idx
  on public.fair_leads(lead_status, created_at desc);

alter table public.fair_events enable row level security;
alter table public.fair_leads enable row level security;

-- Intentionally no anon/authenticated policies. Cloudflare Pages Functions use the
-- server-side service role key, which MUST only exist as a Cloudflare secret.
revoke all on table public.fair_events from anon, authenticated;
revoke all on table public.fair_leads from anon, authenticated;
