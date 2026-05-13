-- Phase 9: workflow + outcome tracking + health alerting extensions
-- Run statement-by-statement in Neon Query tab.
--
-- The application code self-heals via CREATE TABLE IF NOT EXISTS + ALTER ... IF NOT EXISTS
-- on first use; running this manually is optional but speeds up initial deployment.

-- =========================================================================
-- Statement 1: extend am_actions with workflow fields
-- =========================================================================

ALTER TABLE am_actions ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE am_actions ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE am_actions ADD COLUMN IF NOT EXISTS escalated_to TEXT;

-- =========================================================================
-- Statement 2: outcome_tracking table
-- =========================================================================

CREATE TABLE IF NOT EXISTS outcome_tracking (
  action_id INT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_after INT NOT NULL,
  tier_at_action TEXT NOT NULL DEFAULT '',
  tier_now TEXT NOT NULL DEFAULT '',
  composite_at_action INT,
  composite_now INT,
  recovered BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (action_id, days_after)
);

-- =========================================================================
-- Statement 3: outcome_tracking index for analytics
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_outcome_tracking_evaluated
  ON outcome_tracking (evaluated_at DESC);

-- =========================================================================
-- Statement 4: health_check_log table for alerting + history
-- =========================================================================

CREATE TABLE IF NOT EXISTS health_check_log (
  id SERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL,
  probes JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_count INT NOT NULL DEFAULT 0,
  alerted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_health_check_log_checked_at
  ON health_check_log (checked_at DESC);

-- =========================================================================
-- Statement 5: sanity verify
-- =========================================================================

SELECT
  'am_actions' AS table_name,
  COUNT(*) AS rows
FROM am_actions
UNION ALL
SELECT 'outcome_tracking', COUNT(*) FROM outcome_tracking
UNION ALL
SELECT 'health_check_log', COUNT(*) FROM health_check_log;
