import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { pgConfigured, SNAPSHOT_RETENTION_DAYS } from "./config";
import type {
  DashboardSnapshotRow,
  AmActionRow,
  SignalFeedbackRow,
  SnapshotV2,
} from "./types";
import type { Stoplight } from "./config";

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
// Phase 3 — trend & movement queries
// Add these to lib/postgres.ts just before "Connection health check".
// ---------------------------------------------------------------------------


export type CustomerTrendPoint = {
  date: string;          // YYYY-MM-DD
  composite: number;
  stoplight: Stoplight;
  am_name: string;
  bizname: string;
};

/**
 * Per-customer composite-score trend over the last `days` days.
 * Uses LATERAL jsonb_array_elements on customer_data.customers so we don't
 * have to load the entire snapshot per day.
 */
export async function readCustomerTrend(
  entityId: string,
  days: number = 84,
): Promise<CustomerTrendPoint[]> {
  // Delegated to flat customer_trends table — Phase 7.C.
  return readCustomerTrendFlat(entityId, days);
}

export type AmBookTrendPoint = {
  date: string;
  total: number;
  red: number;
  yellow: number;
  green: number;
  mrr: number;
  mrr_at_risk: number;
};

/**
 * Per-AM book trend over the last `days` days. Aggregates customer
 * stoplights per snapshot day for one AM's book.
 */
export async function readAmBookTrend(
  amName: string,
  days: number = 84,
): Promise<AmBookTrendPoint[]> {
  // Delegated to flat customer_trends table — Phase 7.C.
  return readAmBookTrendFlat(amName, days);
}

export type StoplightMovementRow = {
  entity_id: string;
  bizname: string;
  am_name: string;
  pod?: string;
  from: Stoplight;
  to: Stoplight;
  composite_from: number;
  composite_to: number;
  plan_amount: number;
};

export type StoplightMovementResult = {
  days: number;
  comparedAt: string;
  currentAt: string;
  flippedToRed: StoplightMovementRow[];
  recoveries: StoplightMovementRow[];     // anything → GREEN
  degraded: StoplightMovementRow[];        // GREEN → YELLOW
};

/**
 * Compute stoplight movement between latest snapshot and N days ago.
 * Three buckets: flippedToRed, recoveries (→GREEN), degraded (GREEN→YELLOW).
 */
export async function readStoplightMovement(days: number = 7): Promise<StoplightMovementResult | null> {
  const sql = getSql();
  if (!sql) return null;
  // Fetch latest + N-days-ago in one round-trip via two queries:
  const latestRows = await sql`
    SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date,
           customer_data
    FROM dashboard_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;
  if (!latestRows.length) return null;
  const latest = latestRows[0] as { date: string; customer_data: any };
  const currentAt = latest.date;

  const compareRows = await sql`
    SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date,
           customer_data
    FROM dashboard_snapshots
    WHERE snapshot_date <= ((${currentAt})::date - (${days}::int * INTERVAL '1 day'))
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;
  if (!compareRows.length) return null;
  const compare = compareRows[0] as { date: string; customer_data: any };

  const prevByEntity = new Map<string, any>();
  for (const c of compare.customer_data?.customers || []) {
    if (c?.entity_id) prevByEntity.set(c.entity_id, c);
  }

  const flippedToRed: StoplightMovementRow[] = [];
  const recoveries: StoplightMovementRow[] = [];
  const degraded: StoplightMovementRow[] = [];

  for (const c of latest.customer_data?.customers || []) {
    if (!c?.entity_id) continue;
    const prev = prevByEntity.get(c.entity_id);
    if (!prev) continue;
    const prevSl = prev.signals_v2?.stoplight as Stoplight;
    const curSl = c.signals_v2?.stoplight as Stoplight;
    if (!prevSl || !curSl || prevSl === curSl) continue;
    const row: StoplightMovementRow = {
      entity_id: c.entity_id,
      bizname: (c.bizname || c.company || "") as string,
      am_name: c.am_name || "",
      pod: c.pod || undefined,
      from: prevSl,
      to: curSl,
      composite_from: Number(prev.signals_v2?.composite || 0),
      composite_to: Number(c.signals_v2?.composite || 0),
      plan_amount: Number(c.plan_amount || 0),
    };
    if (curSl === "RED" && prevSl !== "RED") flippedToRed.push(row);
    if (curSl === "GREEN" && prevSl !== "GREEN") recoveries.push(row);
    if (prevSl === "GREEN" && curSl === "YELLOW") degraded.push(row);
  }

  // Sort by impact: flippedToRed by plan_amount desc, recoveries by composite jump desc
  flippedToRed.sort((a, b) => b.plan_amount - a.plan_amount);
  recoveries.sort((a, b) => (b.composite_to - b.composite_from) - (a.composite_to - a.composite_from));
  degraded.sort((a, b) => b.plan_amount - a.plan_amount);

  return {
    days,
    comparedAt: compare.date,
    currentAt,
    flippedToRed,
    recoveries,
    degraded,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 polish — bundled multi-AM trend
// ---------------------------------------------------------------------------

export type AmBookTrendBundle = {
  am_name: string;
  points: AmBookTrendPoint[];
};

/**
 * Fetch book trend for multiple AMs in a single SQL pass. Used for the
 * "Top Movers" panel where we want a sparkline next to each AM row.
 */
export async function readMultipleAmBookTrends(
  amNames: string[],
  days: number = 14,
): Promise<AmBookTrendBundle[]> {
  // Delegated to flat customer_trends table — Phase 7.C.
  return readMultipleAmBookTrendsFlat(amNames, days);
}

// ---------------------------------------------------------------------------
// Phase 3 deep polish — pod trend + batch customer trend
// Append to lib/postgres.ts just before the "Connection health check" section.
// Re-exports the AmBookTrendPoint type already defined above.
// ---------------------------------------------------------------------------

export type CustomerTrendPointLite = {
  date: string;
  composite: number;
  stoplight: Stoplight;
};

export type CustomerTrendBundle = {
  entity_id: string;
  points: CustomerTrendPointLite[];
};

/**
 * Batch per-customer composite-score trend in a single SQL pass.
 * Used by V2CustomerCard to show a tiny sparkline per visible card.
 */
export async function readMultipleCustomerTrends(
  entityIds: string[],
  days: number = 14,
): Promise<CustomerTrendBundle[]> {
  // Delegated to flat customer_trends table — Phase 7.C.
  return readMultipleCustomerTrendsFlat(entityIds, days);
}

export type PodTrendPoint = {
  date: string;
  red: number;
  yellow: number;
  green: number;
  total: number;
};

export type PodTrendBundle = {
  pod: string;
  points: PodTrendPoint[];
};

/**
 * Per-pod book trend. Groups by am_name in SQL then aggregates to pod in JS
 * (so we can use the canonical POD_MAP in code rather than re-encoding it
 * as a SQL CASE statement).
 */
export async function readPodTrend(
  amToPod: Record<string, string>,
  days: number = 14,
): Promise<PodTrendBundle[]> {
  // Delegated to flat customer_trends table — Phase 7.C.
  // amToPod argument is kept for backward compat but ignored — pod is denormalized.
  void amToPod;
  return readPodTrendFlat(days);
}

let _customerTrendsReady = false;

/** Idempotently ensure the customer_trends table + indexes exist. */
export async function ensureCustomerTrendsTable(): Promise<void> {
  if (_customerTrendsReady) return;
  const sql = getSql();
  if (!sql) return;
  await sql`
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_trends_am_date ON customer_trends (am_name, snapshot_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_trends_pod_date ON customer_trends (pod, snapshot_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_trends_date ON customer_trends (snapshot_date DESC)`;
  _customerTrendsReady = true;
}

/** Bulk-write per-customer rows for a snapshot. One HTTP round-trip via unnest. */
export async function writeCustomerTrendRows(
  snapshotDate: string,
  rows: Array<{
    entity_id: string;
    am_name: string;
    pod: string;
    composite: number;
    stoplight: string;
    plan_amount: number;
    perf_flagged: boolean;
  }>,
): Promise<number> {
  const sql = getSql();
  if (!sql || !rows.length) return 0;
  await ensureCustomerTrendsTable();

  const entityIds = rows.map((r) => r.entity_id);
  const amNames = rows.map((r) => r.am_name || "");
  const pods = rows.map((r) => r.pod || "");
  const composites = rows.map((r) => Math.round(r.composite || 0));
  const stoplights = rows.map((r) => r.stoplight || "GREEN");
  const planAmounts = rows.map((r) => Number(r.plan_amount || 0));
  const flagged = rows.map((r) => !!r.perf_flagged);

  await sql`
    INSERT INTO customer_trends
      (snapshot_date, entity_id, am_name, pod, composite, stoplight, plan_amount, perf_flagged)
    SELECT
      ${snapshotDate}::date,
      e.entity_id,
      e.am_name,
      e.pod,
      e.composite,
      e.stoplight,
      e.plan_amount,
      e.perf_flagged
    FROM unnest(
      ${entityIds}::text[],
      ${amNames}::text[],
      ${pods}::text[],
      ${composites}::int[],
      ${stoplights}::text[],
      ${planAmounts}::numeric[],
      ${flagged}::boolean[]
    ) AS e(entity_id, am_name, pod, composite, stoplight, plan_amount, perf_flagged)
    ON CONFLICT (entity_id, snapshot_date) DO UPDATE SET
      am_name = EXCLUDED.am_name,
      pod = EXCLUDED.pod,
      composite = EXCLUDED.composite,
      stoplight = EXCLUDED.stoplight,
      plan_amount = EXCLUDED.plan_amount,
      perf_flagged = EXCLUDED.perf_flagged
  `;

  return rows.length;
}

// ---------------------------------------------------------------------------
// Replaces the LATERAL-based versions below: same signatures, flat-table SQL.
// ---------------------------------------------------------------------------

export async function readCustomerTrendFlat(
  entityId: string,
  days: number = 84,
): Promise<CustomerTrendPoint[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT
      to_char(snapshot_date, 'YYYY-MM-DD') AS date,
      composite,
      stoplight,
      am_name
    FROM customer_trends
    WHERE entity_id = ${entityId}
      AND snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    ORDER BY snapshot_date ASC
  `;
  return rows.map((r) => {
    const row = r as { date: string; composite: number; stoplight: string; am_name: string };
    return {
      date: row.date,
      composite: row.composite,
      stoplight: (row.stoplight as Stoplight) || "GREEN",
      am_name: row.am_name || "",
      bizname: "",                          // not stored in the flat table
    };
  });
}

export async function readMultipleCustomerTrendsFlat(
  entityIds: string[],
  days: number = 14,
): Promise<CustomerTrendBundle[]> {
  const sql = getSql();
  if (!sql || !entityIds.length) return [];
  const rows = await sql`
    SELECT
      entity_id,
      to_char(snapshot_date, 'YYYY-MM-DD') AS date,
      composite,
      stoplight
    FROM customer_trends
    WHERE entity_id = ANY(${entityIds}::text[])
      AND snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    ORDER BY entity_id ASC, snapshot_date ASC
  `;
  const byEntity = new Map<string, CustomerTrendPointLite[]>();
  for (const r of rows) {
    const row = r as {
      entity_id: string;
      date: string;
      composite: number;
      stoplight: string;
    };
    if (!byEntity.has(row.entity_id)) byEntity.set(row.entity_id, []);
    byEntity.get(row.entity_id)!.push({
      date: row.date,
      composite: row.composite,
      stoplight: (row.stoplight as Stoplight) || "GREEN",
    });
  }
  return entityIds.map((eid) => ({
    entity_id: eid,
    points: byEntity.get(eid) || [],
  }));
}

export async function readAmBookTrendFlat(
  amName: string,
  days: number = 84,
): Promise<AmBookTrendPoint[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT
      to_char(snapshot_date, 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE stoplight = 'RED')::int AS red,
      COUNT(*) FILTER (WHERE stoplight = 'YELLOW')::int AS yellow,
      COUNT(*) FILTER (WHERE stoplight = 'GREEN')::int AS green,
      COALESCE(SUM(plan_amount), 0)::numeric AS mrr,
      COALESCE(SUM(CASE WHEN stoplight = 'RED' THEN plan_amount ELSE 0 END), 0)::numeric AS mrr_at_risk
    FROM customer_trends
    WHERE am_name = ${amName}
      AND snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    GROUP BY snapshot_date
    ORDER BY snapshot_date ASC
  `;
  return rows.map((r) => {
    const row = r as {
      date: string;
      total: number;
      red: number;
      yellow: number;
      green: number;
      mrr: string | number;
      mrr_at_risk: string | number;
    };
    return {
      date: row.date,
      total: row.total,
      red: row.red,
      yellow: row.yellow,
      green: row.green,
      mrr: Number(row.mrr),
      mrr_at_risk: Number(row.mrr_at_risk),
    };
  });
}

export async function readMultipleAmBookTrendsFlat(
  amNames: string[],
  days: number = 14,
): Promise<AmBookTrendBundle[]> {
  const sql = getSql();
  if (!sql || !amNames.length) return [];
  const rows = await sql`
    SELECT
      am_name,
      to_char(snapshot_date, 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE stoplight = 'RED')::int AS red,
      COUNT(*) FILTER (WHERE stoplight = 'YELLOW')::int AS yellow,
      COUNT(*) FILTER (WHERE stoplight = 'GREEN')::int AS green,
      COALESCE(SUM(plan_amount), 0)::numeric AS mrr,
      COALESCE(SUM(CASE WHEN stoplight = 'RED' THEN plan_amount ELSE 0 END), 0)::numeric AS mrr_at_risk
    FROM customer_trends
    WHERE am_name = ANY(${amNames}::text[])
      AND snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    GROUP BY am_name, snapshot_date
    ORDER BY am_name ASC, snapshot_date ASC
  `;
  const byAm = new Map<string, AmBookTrendPoint[]>();
  for (const r of rows) {
    const row = r as {
      am_name: string;
      date: string;
      total: number;
      red: number;
      yellow: number;
      green: number;
      mrr: string | number;
      mrr_at_risk: string | number;
    };
    if (!byAm.has(row.am_name)) byAm.set(row.am_name, []);
    byAm.get(row.am_name)!.push({
      date: row.date,
      total: row.total,
      red: row.red,
      yellow: row.yellow,
      green: row.green,
      mrr: Number(row.mrr),
      mrr_at_risk: Number(row.mrr_at_risk),
    });
  }
  return amNames.map((am) => ({
    am_name: am,
    points: byAm.get(am) || [],
  }));
}

export async function readPodTrendFlat(days: number = 14): Promise<PodTrendBundle[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT
      pod,
      to_char(snapshot_date, 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE stoplight = 'RED')::int AS red,
      COUNT(*) FILTER (WHERE stoplight = 'YELLOW')::int AS yellow,
      COUNT(*) FILTER (WHERE stoplight = 'GREEN')::int AS green
    FROM customer_trends
    WHERE snapshot_date >= (CURRENT_DATE - (${days}::int * INTERVAL '1 day'))
    GROUP BY pod, snapshot_date
    ORDER BY pod ASC, snapshot_date ASC
  `;
  const byPod = new Map<string, PodTrendPoint[]>();
  for (const r of rows) {
    const row = r as {
      pod: string;
      date: string;
      total: number;
      red: number;
      yellow: number;
      green: number;
    };
    const pod = row.pod || "Floating";
    if (!byPod.has(pod)) byPod.set(pod, []);
    byPod.get(pod)!.push({
      date: row.date,
      total: row.total,
      red: row.red,
      yellow: row.yellow,
      green: row.green,
    });
  }
  return Array.from(byPod.entries())
    .map(([pod, points]) => ({ pod, points }))
    .sort((a, b) => a.pod.localeCompare(b.pod));
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
