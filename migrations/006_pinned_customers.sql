-- Phase 18.A: pinned customers per AM
-- Run statement-by-statement in Neon Query tab.
--
-- The application code self-heals via ensurePinnedSchema() (CREATE TABLE IF
-- NOT EXISTS on first use), so running this manually is optional but speeds
-- up initial deployment.

-- =========================================================================
-- Statement 1: pinned_customers table
-- =========================================================================

CREATE TABLE IF NOT EXISTS pinned_customers (
  am_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  customer_id TEXT,
  bizname TEXT,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (am_name, entity_id)
);

-- =========================================================================
-- Statement 2: index for am-scoped reads
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_pinned_customers_am
  ON pinned_customers(am_name);

-- =========================================================================
-- Statement 3: sanity verify
-- =========================================================================

SELECT COUNT(*) AS pinned_rows FROM pinned_customers;
