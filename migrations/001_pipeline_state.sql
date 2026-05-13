-- Phase 2.0 schema migration
-- Run in Vercel Postgres Query tab with Read-only toggle OFF.
-- One statement at a time (Vercel Query UI doesn't allow multi-statement).

-- =========================================================================
-- Statement 1: create the pipeline_state table
-- =========================================================================

CREATE TABLE IF NOT EXISTS pipeline_state (
  snapshot_date DATE NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('A', 'B', 'C')),
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INT,
  errors JSONB DEFAULT '[]'::jsonb,
  row_count INT,
  PRIMARY KEY (snapshot_date, stage)
);

-- =========================================================================
-- Statement 2: index for date-range reads (compose + history)
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_pipeline_state_date_desc
  ON pipeline_state(snapshot_date DESC);

-- =========================================================================
-- Statement 3: sanity verify
-- =========================================================================

SELECT
  'pipeline_state' AS table_name,
  COUNT(*) AS row_count
FROM pipeline_state;
