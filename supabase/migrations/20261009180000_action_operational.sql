-- Plano de Ação operacional (casos, planos, histórico, revisão de prioridade)
-- Business Data: rckpuebaiswrxzmywllv (schema analytics_nps)

CREATE TABLE IF NOT EXISTS analytics_nps.action_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  response_id text,
  cycle_code text,
  source text DEFAULT 'action_queue',
  status text DEFAULT 'Novo',
  final_priority text,
  ai_priority text,
  human_priority text,
  hybrid_priority text,
  urgency text,
  suggested_owner_area text,
  action_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_cases_client_response_cycle UNIQUE (client_id, response_id, cycle_code)
);

CREATE INDEX IF NOT EXISTS idx_action_cases_client_id ON analytics_nps.action_cases (client_id);
CREATE INDEX IF NOT EXISTS idx_action_cases_cycle ON analytics_nps.action_cases (cycle_code);

CREATE TABLE IF NOT EXISTS analytics_nps.action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_case_id uuid REFERENCES analytics_nps.action_cases (id) ON DELETE CASCADE,
  client_id text NOT NULL,
  response_id text,
  cycle_code text,
  objective text,
  main_problem text,
  action_text text,
  responsible text,
  due_date date,
  status text DEFAULT 'Novo',
  success_criteria text,
  notes text,
  plan_origin text DEFAULT 'manual',
  ai_suggestion_snapshot jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_plans_case_unique UNIQUE (action_case_id)
);

CREATE TABLE IF NOT EXISTS analytics_nps.action_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_case_id uuid REFERENCES analytics_nps.action_cases (id) ON DELETE CASCADE,
  change_type text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_plan_history_case ON analytics_nps.action_plan_history (action_case_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_nps.action_priority_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_case_id uuid REFERENCES analytics_nps.action_cases (id) ON DELETE CASCADE,
  client_id text NOT NULL,
  response_id text,
  previous_ai_priority text,
  human_priority text NOT NULL,
  urgency text,
  suggested_owner_area text,
  action_category text,
  review_reason text,
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_nps.action_classifications
  ADD COLUMN IF NOT EXISTS main_problem text,
  ADD COLUMN IF NOT EXISTS recommended_action text,
  ADD COLUMN IF NOT EXISTS themes jsonb,
  ADD COLUMN IF NOT EXISTS action_case_id uuid REFERENCES analytics_nps.action_cases (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_action_classifications_case ON analytics_nps.action_classifications (action_case_id);

ALTER TABLE analytics_nps.action_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.action_plan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_nps.action_priority_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON analytics_nps.action_cases FROM anon, authenticated;
REVOKE ALL ON analytics_nps.action_plans FROM anon, authenticated;
REVOKE ALL ON analytics_nps.action_plan_history FROM anon, authenticated;
REVOKE ALL ON analytics_nps.action_priority_reviews FROM anon, authenticated;
