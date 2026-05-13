-- Phase 19: per-AM customer snooze tracking
-- Run statement-by-statement in Neon Query tab.
--
-- The application code self-heals via ensureSnoozeSchema() (CREATE TABLE IF
-- NOT EXISTS on first use), so running this manually is optional but speeds
-- up initial deployment.

-- =========================================================================
-- Statement 1: snooze_tracking table
-- =========================================================================

CREATE TABLE IF NOT EXISTS snooze_tracking (
  am_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  customer_id TEXT,
  bizname TEXT,
  snoozed_until TIMESTAMPTZ NOT NULL,
  snoozed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  PRIMARY KEY (am_name, entity_id)
);

-- =========================================================================
-- Statement 2: indexes for am-scoped reads + expiry sweeps
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_snooze_tracking_am
  ON snooze_tracking(am_name);

CREATE INDEX IF NOT EXISTS idx_snooze_tracking_until
  ON snooze_tracking(snoozed_until);

-- =========================================================================
-- Statement 3: sanity verify
-- =========================================================================

SELECT COUNT(*) AS snooze_rows FROM snooze_tracking;
