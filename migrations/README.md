# Database migrations

Run each `.sql` file in order in the Neon / Vercel Postgres Query tab.
Each file is split into "Statement N" blocks so they run one at a time
(Vercel/Neon Query UI doesn't allow multi-statement).

## Order

1. `001_pipeline_state.sql` — Phase 2.0: per-stage pipeline state table for
   the 4-stage refresh architecture
2. `002_customer_trends.sql` — Phase 7.C: flat per-customer per-day trend
   table that replaces LATERAL JSONB scans on dashboard_snapshots

## Idempotency

All migrations use `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`,
so re-running them is safe. The application code (`lib/postgres.ts`) also
self-heals via `CREATE TABLE IF NOT EXISTS` on first use — running these
manually is optional but speeds up initial deployment.

## Not tracked here

- `dashboard_snapshots`, `am_actions`, `signal_feedback` — created by the
  original v1 codebase before migrations were tracked. The DDL lives in
  Neon directly.
