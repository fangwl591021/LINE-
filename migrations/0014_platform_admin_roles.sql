CREATE TABLE IF NOT EXISTS platform_admin_roles (
  user_id TEXT NOT NULL,
  canonical_user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('platform_admin','platform_support','platform_auditor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_by TEXT,
  revoked_at TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_roles_active ON platform_admin_roles(status, role, user_id);
CREATE TABLE IF NOT EXISTS platform_admin_role_audit (
  audit_id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, target_user_id TEXT NOT NULL,
  operation TEXT NOT NULL, old_role TEXT, new_role TEXT, reason TEXT,
  request_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_target ON platform_admin_role_audit(target_user_id, created_at);
CREATE TABLE IF NOT EXISTS platform_admin_bootstrap_state (
  bootstrap_key TEXT PRIMARY KEY CHECK (bootstrap_key = 'platform_admin'),
  initialized_by TEXT NOT NULL, initialized_at TEXT NOT NULL, request_id TEXT NOT NULL
);