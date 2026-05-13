-- Phase 13.1 — expand pipeline_state stage CHECK constraint to allow Stage D
-- Idempotent: safe to run multiple times. If the constraint is already
-- correctly defined, the DROP IF EXISTS no-ops and the ADD re-asserts.
ALTER TABLE pipeline_state DROP CONSTRAINT IF EXISTS pipeline_state_stage_check;
ALTER TABLE pipeline_state ADD CONSTRAINT pipeline_state_stage_check
  CHECK (stage IN ('A', 'B', 'C', 'D'));
