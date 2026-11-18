BEGIN;
-- Persist custom login sessions across Vercel function instances; store only token digests.
CREATE TABLE public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX app_sessions_user_id_idx ON public.app_sessions(user_id);
CREATE INDEX app_sessions_expires_at_idx ON public.app_sessions(expires_at);
-- Retain the current frontend workspace format while moving it to durable PostgreSQL storage.
CREATE TABLE public.app_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  document jsonb NOT NULL CHECK (jsonb_typeof(document)='object')
);
-- Share login throttling between serverless instances without storing emails or IP addresses.
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count>0)
);
CREATE INDEX auth_rate_limits_window_idx ON public.auth_rate_limits(window_start);
-- All three tables are accessed exclusively by the trusted server, never the browser Data API.
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_sessions,public.app_workspaces,public.auth_rate_limits FROM PUBLIC,anon,authenticated;
-- Provision campus_web_backend as a LOGIN role with a generated password separately, outside source control.
GRANT USAGE ON SCHEMA public TO campus_web_backend;
GRANT SELECT,INSERT ON public.users,public.login_accounts TO campus_web_backend;
GRANT SELECT,INSERT,DELETE ON public.app_sessions TO campus_web_backend;
GRANT SELECT,INSERT,UPDATE ON public.app_workspaces,public.auth_rate_limits TO campus_web_backend;
-- The backend enforces user ownership. This restricted role has no schema administration privileges.
CREATE POLICY campus_backend_profiles ON public.users TO campus_web_backend USING (true) WITH CHECK (true);
CREATE POLICY campus_backend_credentials ON public.login_accounts TO campus_web_backend USING (true) WITH CHECK (true);
CREATE POLICY campus_backend_sessions ON public.app_sessions TO campus_web_backend USING (true) WITH CHECK (true);
CREATE POLICY campus_backend_workspaces ON public.app_workspaces TO campus_web_backend USING (true) WITH CHECK (true);
CREATE POLICY campus_backend_rate_limits ON public.auth_rate_limits TO campus_web_backend USING (true) WITH CHECK (true);
COMMIT;
