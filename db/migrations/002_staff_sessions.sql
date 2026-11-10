-- Persistent bearer sessions for API authentication.
CREATE TABLE IF NOT EXISTS staff_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 staff_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
 tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 outlet_id UUID NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_active ON staff_sessions(token_hash,expires_at) WHERE revoked_at IS NULL;
