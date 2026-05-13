-- Phase 7.C: flat customer_trends table to replace LATERAL JSONB scans.
-- Run in Vercel Postgres / Neon Query tab with Read-only toggle OFF.
-- One statement at a time (Vercel Query UI doesn't allow multi-statement).
-- The dashboard code also runs CREATE TABLE IF NOT EXISTS on first
-- composeSnapshot after deploy, so this migration is optional / belt-and-
-- suspenders.

-- =========================================================================
-- Statement 1: the table
-- =========================================================================

CREATE TABLE IF NOT EXISTS customer_trends (
  snapshot_date DATE NOT NULL,
  entity_id TEXT NOT NULL,
  am_name TEXT NOT NULL DEFAULT '',
  pod TEXT NOT NULL DEFAULT '',
  composite INT NOT NULL DEFAULT 0,
  stoplight TEXT NOT NULL DEFAULT 'GREEN',
  plan_amount NUMERIC NOT NULL DEFAULT 0,
  perf_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (entity_id, snapshot_date)
);

-- =========================================================================
-- Statement 2: index for per-AM queries (top movers / book trend)
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_trends_am_date
  ON customer_trends (am_name, snapshot_date DESC);

-- =========================================================================
-- Statement 3: index for per-pod queries
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_trends_pod_date
  ON customer_trends (pod, snapshot_date DESC);

-- =========================================================================
-- Statement 4: index for date-range scans
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_trends_date
  ON customer_trends (snapshot_date DESC);

-- =========================================================================
-- Statement 5: backfill from existing snapshots (optional — speeds up the
-- first ~14 days of trend queries; otherwise the table fills as new compose
-- runs land).
-- =========================================================================

INSERT INTO customer_trends (
  snapshot_date, entity_id, am_name, pod, composite, stoplight, plan_amount, perf_flagged
)
SELECT
  snapshot_date,
  (cust.value->>'entity_id')::text AS entity_id,
  COALESCE(cust.value->>'am_name', '') AS am_name,
  COALESCE(cust.value->>'pod', '') AS pod,
  COALESCE((cust.value->'signals_v2'->>'composite')::int, 0) AS composite,
  COALESCE(cust.value->'signals_v2'->>'stoplight', 'GREEN') AS stoplight,
  COALESCE((cust.value->>'plan_amount')::numeric, 0) AS plan_amount,
  COALESCE((cust.value->'performance'->>'flag')::boolean, FALSE) AS perf_flagged
FROM dashboard_snapshots,
LATERAL jsonb_array_elements(customer_data->'customers') AS cust(value)
WHERE cust.value->>'entity_id' IS NOT NULL
ON CONFLICT (entity_id, snapshot_date) DO NOTHING;

-- =========================================================================
-- Statement 6: sanity verify
-- =========================================================================

SELECT
  'customer_trends' AS table_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT entity_id) AS unique_entities,
  COUNT(DISTINCT snapshot_date) AS unique_days,
  MAX(snapshot_date) AS latest_snapshot
FROM customer_trends;
