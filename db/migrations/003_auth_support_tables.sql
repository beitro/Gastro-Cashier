-- Reconcile legacy development branches with the canonical auth support schema.
-- Must run before 004_signed_rls_context.sql. RLS is enabled immediately and
-- remains default-deny until migration 004 installs signed-context policies.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES public.outlets(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_active
  ON public.staff_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  scope_hash TEXT PRIMARY KEY CHECK (length(scope_hash) = 64),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON public.auth_rate_limits(updated_at);

ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits FORCE ROW LEVEL SECURITY;

COMMIT;
