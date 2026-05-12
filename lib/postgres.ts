import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { pgConfigured, SNAPSHOT_RETENTION_DAYS } from "./config";
import type {
  DashboardSnapshotRow,
  AmActionRow,
  SignalFeedbackRow,
  SnapshotV2,
} from "./types";

/**
 * Thin Neon Postgres client wrapper. Returns null when POSTGRES_URL is unset
 * so local development without Neon still works (falls back to in-memory).
 */
let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> | null {
  if (!pgConfigured()) return null;
  if (!_sql) _sql = neon(process.env.POSTGRES_URL!);
  return _sql;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/** Write today's snapshot. Overwrites if same snapshot_date already exists. */
export async function writeSnapshotV2(snap: SnapshotV2): Promise<void> {
  const sql = getSql();
  if (!sql) {
    console.warn("[postgres] POSTGRES_URL not set — skipping snapshot write");
    return;
  }
  const date = snap.generatedAt.slice(0, 10);  // YYYY-MM-DD
  const sources: Record<string, string> = {};
  if (snap.errors) for (const e of snap.errors) sources[e.split(":")[0]] = "error";

  await sql`
    INSERT INTO dashboard_snapshots (
      snapshot_date, generated_at, total_customers,
      total_high_risk, total_watch, total_medium, total_low, total_healthy,
      customer_data, data_sources_status, refresh_duration_ms
    ) VALUES (
      ${date}, ${snap.generatedAt}, ${snap.totalActive},
      ${snap.tierCounts.HIGH || 0},
      ${snap.stoplightCounts?.YELLOW || 0},
      ${snap.tierCounts.MEDIUM || 0},
      ${snap.tierCounts.LOW || 0},
      ${snap.tierCounts.HEALTHY || 0},
      ${JSON.stringify(snap)}::jsonb,
      ${JSON.stringify(sources)}::jsonb,
      ${snap.health.refreshDurationMs}
    )
    ON CONFLICT (snapshot_date) DO UPDATE SET
      generated_at = EXCLUDED.generated_at,
      total_customers = EXCLUDED.total_customers,
      total_high_risk = EXCLUDED.total_high_risk,
      total_watch = EXCLUDED.total_watch,
      total_medium = EXCLUDED.total_medium,
      total_low = EXCLUDED.total_low,
      total_healthy = EXCLUDED.total_healthy,
      customer_data = EXCLUDED.customer_data,
      data_sources_status = EXCLUDED.data_sources_status,
      refresh_duration_ms = EXCLUDED.refresh_duration_ms
  `;
  console.log("[postgres] snapshot written for", date);
}

/** Read latest snapshot (today's, or most recent). */
export async function readLatestSnapshotV2(): Promise<SnapshotV2 | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT customer_data FROM dashboard_snapshots
    ORDER BY snapshot_date DESC LIMIT 1
  `;
  if (!rows.length) return null;
  return rows[0].customer_data as SnapshotV2;
}

/** Read snapshot for a specific date (YYYY-MM-DD), null if none. */
export async function readSnapshotByDate(date: string): Promise<SnapshotV2 | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT customer_data FROM dashboard_snapshots
    WHERE snapshot_date = ${date}
  `;
  if (!rows.length) return null;
  return rows[0].customer_data as SnapshotV2;
}

/** List snapshot dates available (most recent first), useful for trend views. */
export async function listSnapshotDates(limit: number = 90): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT snapshot_date FROM dashboard_snapshots
    ORDER BY snapshot_date DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => (r as { snapshot_date: string }).snapshot_date);
}

/** Prune snapshots older than retention window. Returns number of rows deleted. */
export async function pruneOldSnapshots(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql`
    DELETE FROM dashboard_snapshots
    WHERE snapshot_date < (CURRENT_DATE - (${SNAPSHOT_RETENTION_DAYS}::int * INTERVAL '1 day'))
    RETURNING snapshot_date
  `;
  console.log("[postgres] pruned snapshots:", rows.length);
  return rows.length;
}

/** Tier-trend over the last N days for the Leadership view. */
export type TierTrendRow = {
  snapshot_date: string;
  total_customers: number;
  total_high_risk: number;
  total_watch: number;
  total_medium: number;
  total_low: number;
  total_healthy: number;
};
export async function readTierTrend(days: number = 30): Promise<TierTrendRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT snapshot_date, total_customers,
           total_high_risk, total_watch, total_medium, total_low, total_healthy
    FROM dashboard_snapshots
    WHERE snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    ORDER BY snapshot_date ASC
  `;
  return rows as TierTrendRow[];
}

// ---------------------------------------------------------------------------
// AM actions
// ---------------------------------------------------------------------------

export async function writeAmAction(row: AmActionRow): Promise<number | null> {
  const sql = getSql();
  if (!sql) return null;
  const result = await sql`
    INSERT INTO am_actions (am_name, entity_id, action_type, note, composite_at_action)
    VALUES (
      ${row.am_name},
      ${row.entity_id},
      ${row.action_type},
      ${row.note || null},
      ${row.composite_at_action ?? null}
    )
    RETURNING id
  `;
  return result[0]?.id as number;
}

/** Recent actions across the book (for Pod Rollup "movers" + Wins panel). */
export async function readRecentActions(daysBack: number = 7): Promise<AmActionRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT id, am_name, entity_id, action_type, note, composite_at_action, created_at
    FROM am_actions
    WHERE created_at >= (NOW() - (${daysBack}::int * INTERVAL '1 day'))
    ORDER BY created_at DESC
  `;
  return rows as AmActionRow[];
}

/** Actions for a specific customer (for drill-down modal notes tab). */
export async function readCustomerActions(entityId: string, limit: number = 20): Promise<AmActionRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT id, am_name, entity_id, action_type, note, composite_at_action, created_at
    FROM am_actions
    WHERE entity_id = ${entityId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as AmActionRow[];
}

/** "Has this customer been contacted in last N days?" — drives Act-today quieting. */
export async function entitiesContactedRecently(amName: string, daysBack: number = 7): Promise<Set<string>> {
  const sql = getSql();
  if (!sql) return new Set();
  const rows = await sql`
    SELECT DISTINCT entity_id FROM am_actions
    WHERE am_name = ${amName}
      AND created_at >= (NOW() - (${daysBack}::int * INTERVAL '1 day'))
  `;
  return new Set(rows.map((r) => (r as { entity_id: string }).entity_id));
}

// ---------------------------------------------------------------------------
// Signal feedback
// ---------------------------------------------------------------------------

export async function writeSignalFeedback(row: SignalFeedbackRow): Promise<number | null> {
  const sql = getSql();
  if (!sql) return null;
  const result = await sql`
    INSERT INTO signal_feedback (entity_id, signal_name, am_name, comment)
    VALUES (${row.entity_id}, ${row.signal_name}, ${row.am_name}, ${row.comment || null})
    RETURNING id
  `;
  return result[0]?.id as number;
}

export async function readFeedbackForEntity(entityId: string): Promise<SignalFeedbackRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT id, entity_id, signal_name, am_name, comment, created_at
    FROM signal_feedback
    WHERE entity_id = ${entityId}
    ORDER BY created_at DESC
  `;
  return rows as SignalFeedbackRow[];
}

// ---------------------------------------------------------------------------
// Connection health check
// ---------------------------------------------------------------------------

export async function pingPostgres(): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  if (!sql) return { ok: false, error: "POSTGRES_URL not set" };
  try {
    await sql`SELECT 1`;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
