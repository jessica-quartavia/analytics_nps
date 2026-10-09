-- Log operacional central (Business Data rckpuebaiswrxzmywllv)

CREATE TABLE IF NOT EXISTS analytics_nps.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_email text NOT NULL,
  user_name text,
  action_type text NOT NULL,
  entity_type text,
  entity_id text,
  client_id text,
  client_name text,
  cycle_code text,
  page text,
  summary text,
  before jsonb,
  after jsonb,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_audit_log_occurred_at ON analytics_nps.system_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_action_type ON analytics_nps.system_audit_log (action_type);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_client_id ON analytics_nps.system_audit_log (client_id);

ALTER TABLE analytics_nps.system_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_nps.system_audit_log FROM anon, authenticated;
GRANT SELECT, INSERT ON analytics_nps.system_audit_log TO service_role;
