-- Run once AFTER 001-original.sql, only if the prior update was not applied.
BEGIN;
-- Preserve profiles while removing the Supabase Auth dependency.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
-- One credential record per student; this matches the new backend's scrypt format.
CREATE TABLE public.login_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  role text NOT NULL DEFAULT 'student',
  CONSTRAINT login_accounts_email_check CHECK (
    email = btrim(email) AND length(email) <= 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  CONSTRAINT login_accounts_password_hash_check CHECK (password_hash ~ '^[0-9a-f]{128}$'),
  CONSTRAINT login_accounts_password_salt_check CHECK (password_salt ~ '^[0-9a-f]{32}$'),
  CONSTRAINT login_accounts_role_check CHECK (role IN ('student','admin'))
);
-- Make emails unique regardless of case.
CREATE UNIQUE INDEX login_accounts_email_lower_unique ON public.login_accounts (lower(email));
-- Restrict credentials to trusted backend access.
ALTER TABLE public.login_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.login_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_accounts TO service_role;
-- Save subject colors; existing subjects are assigned colors by the app.
ALTER TABLE public.courses ADD COLUMN color text,
  ADD CONSTRAINT courses_color_check CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
CREATE UNIQUE INDEX courses_user_color_unique ON public.courses (user_id, lower(color)) WHERE color IS NOT NULL;
-- Store local appointment requests.
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  contact_email text NOT NULL,
  title text NOT NULL,
  planned_start_at timestamptz NOT NULL,
  description text,
  CONSTRAINT appointments_full_name_check CHECK (length(btrim(full_name)) BETWEEN 1 AND 100),
  CONSTRAINT appointments_contact_email_check CHECK (
    contact_email = btrim(contact_email) AND length(contact_email) <= 254
    AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  CONSTRAINT appointments_title_check CHECK (
    title IN ('Academic advising','Study support','University procedures','Budget guidance')
  ),
  CONSTRAINT appointments_description_check CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT appointments_user_start_unique UNIQUE (user_id, planned_start_at)
);
-- Keep bookings behind the backend.
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.appointments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appointments TO service_role;
COMMIT;
