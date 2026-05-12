import { fetchAllLiveSubsWithEntityMap } from "./chargebee";
import { fetchUnpaidInvoices, fetchRecentTransactions, buildBillingMetrics, scoreBilling } from "./billing";
import { fetchBaseSheet, fetchAllComms, groupCommsByEntity } from "./metabase";
import { fetchUsageMetrics, scoreUsage } from "./mixpanel";
import { fetchPerformanceMetrics } from "./performance";
import { computeMetrics, scoreCustomer, computeTicketsFlag, composeHybridSignals } from "./scoring";
import { writeSnapshotV2 } from "./postgres";
import {
  TIER_ORDER,
  EXCLUDED_ENTITIES,
  POD_MAP,
  pgConfigured,
} from "./config";
import type {
  ScoredCustomer,
  ScoredCustomerV2,
  Snapshot,
  SnapshotV2,
  CommsEvent,
  BaseSheetRow,
  AmTierRow,
  PodTierRow,
  DataHealth,
  ChargebeeSub,
  ChargebeeInvoice,
  ChargebeeTransaction,
  UsageMetrics,
  PerformanceMetrics,
  BillingMetrics,
  TicketsMetrics,
} from "./types";
import type { Tier, Stoplight } from "./config";

const todayMs = () => Date.now();

/**
 * v2 orchestrator. Pulls everything in parallel, builds active-entity universe
 * from Chargebee cf_entity_id (no BaseSheet dependency for the universe),
 * scores every active entity with the hybrid composite, writes the snapshot
 * to Postgres, and returns the in-memory snapshot.
 *
 * The active-entity universe is the intersection:
 *   Chargebee active subs (status ∈ {active, non_renewing, future}) → cf_entity_id
 *
 * BaseSheet is still pulled for AM/biz-name enrichment + tickets flag, but
 * it's no longer the source of "who's active".
 */
export async function buildSnapshotV2(): Promise<SnapshotV2> {
  const started = Date.now();
  const errors: string[] = [];
  const today = todayMs();
  const todayIso = new Date(today).toISOString();

  // -------------------------------------------------------------------------
  // Pull all sources in parallel
  // -------------------------------------------------------------------------
  const [
    cbResult,
    invoicesResult,
    transactionsResult,
    baseSheetResult,
    commsResult,
    usageResult,
    perfResult,
  ] = await Promise.all([
    fetchAllLiveSubsWithEntityMap().catch((e: Error) => {
      errors.push(`Chargebee subs: ${e.message}`);
      return { subs: [] as ChargebeeSub[], customerToEntities: new Map<string, string[]>() };
    }),
    fetchUnpaidInvoices().catch((e: Error) => {
      errors.push(`Chargebee invoices: ${e.message}`);
      return [] as ChargebeeInvoice[];
    }),
    fetchRecentTransactions().catch((e: Error) => {
      errors.push(`Chargebee transactions: ${e.message}`);
      return [] as ChargebeeTransaction[];
    }),
    fetchBaseSheet().catch((e: Error) => {
      errors.push(`BaseSheet: ${e.message}`);
      return {
        rows: [] as BaseSheetRow[],
        byCustomerId: {} as Record<string, BaseSheetRow>,
        byCustomerIdMulti: {} as Record<string, BaseSheetRow[]>,
        byEntityId: {} as Record<string, BaseSheetRow>,
        byBizName: {} as Record<string, BaseSheetRow>,
      };
    }),
    fetchAllComms(today).catch((e: Error) => {
      errors.push(`Comms: ${e.message}`);
      return {
        events: [] as CommsEvent[],
        stats: {
          rawRows: { chat: 0, email: 0, phone: 0, video: 0, sms: 0 },
          eventsKept: { chat: 0, email: 0, phone: 0, video: 0, sms: 0 },
          eventsDeduped: { chat: 0, email: 0, phone: 0, video: 0, sms: 0 },
          totalDuplicatesRemoved: 0,
        },
      };
    }),
    fetchUsageMetrics(today).catch((e: Error) => {
      errors.push(`Mixpanel: ${e.message}`);
      return { metrics: new Map<string, UsageMetrics>(), rowCount: 0 };
    }),
    fetchPerformanceMetrics().catch((e: Error) => {
      errors.push(`Performance: ${e.message}`);
      return {
        metrics: new Map<string, PerformanceMetrics>(),
        rowCounts: { gbpClicksMonthly: 0, rankings: 0, reviews12w: 0, locationInsights: 0, bookingEnquiries: 0 },
      };
    }),
  ]);

  const { subs, customerToEntities } = cbResult;
  const baseSheet = baseSheetResult;
  const comms = commsResult.events;
  const commsStats = commsResult.stats;
  const usageMetrics = usageResult.metrics;
  const perfMetrics = perfResult.metrics;

  // -------------------------------------------------------------------------
  // Build billing metrics keyed by entity_id
  // -------------------------------------------------------------------------
  const billingMetrics = buildBillingMetrics(
    invoicesResult,
    transactionsResult,
    subs,
    customerToEntities,
  );

  // -------------------------------------------------------------------------
  // Build active-entity universe
  // -------------------------------------------------------------------------
  // Universe = union of all entity_ids from Chargebee cf_entity_id across active subs
  const activeEntityIds = new Set<string>();
  for (const [, entIds] of customerToEntities) {
    for (const eid of entIds) {
      if (!EXCLUDED_ENTITIES[eid]) activeEntityIds.add(eid);
    }
  }
  let excludedCount = 0;
  for (const [, entIds] of customerToEntities) {
    for (const eid of entIds) {
      if (EXCLUDED_ENTITIES[eid]) excludedCount++;
    }
  }

  // Reverse map: entity_id → customer_id (for joining billing)
  const entityToCustomer = new Map<string, string>();
  for (const [cid, entIds] of customerToEntities) {
    for (const eid of entIds) entityToCustomer.set(eid, cid);
  }

  // Sub lookup by customer_id for plan_amount / auto_collection
  const subsByCustomer = new Map<string, ChargebeeSub>();
  for (const s of subs) {
    if (!s.customer_id) continue;
    // Prefer active over non_renewing/future; take first if multiple
    if (!subsByCustomer.has(s.customer_id) || s.status === "active") {
      subsByCustomer.set(s.customer_id, s);
    }
  }

  const commsByEntity = groupCommsByEntity(comms);

  // -------------------------------------------------------------------------
  // Score each active entity
  // -------------------------------------------------------------------------
  const scored: ScoredCustomerV2[] = [];
  let multiEntityExpansionCount = 0;
  let mixpanelCoverage = 0;

  for (const entityId of activeEntityIds) {
    const customerId = entityToCustomer.get(entityId) || "";
    const sub = subsByCustomer.get(customerId);
    const bs = baseSheet.byEntityId[entityId];

    // Comms metrics
    const events = commsByEntity.get(entityId) || [];
    const cMetrics = computeMetrics(events, today);
    const v1Signals = scoreCustomer(cMetrics);

    // Usage metrics + score
    const usage = usageMetrics.get(entityId) || null;
    if (usage) mixpanelCoverage++;
    const usageScore = scoreUsage(usage);

    // Billing metrics + score
    const billing = billingMetrics.get(entityId) || null;
    const billingScore = scoreBilling(billing);

    // Performance + tickets flags
    const perf = perfMetrics.get(entityId) || null;
    const tickets = computeTicketsFlag(
      entityId,
      Number(bs?.open_tickets_30d || 0),
      Number(bs?.unresolved_issues_last_30_days || 0),
    );

    // Compose hybrid signals
    const signalsV2 = composeHybridSignals({
      commsSignals: v1Signals,
      usageScore,
      billingScore,
      performance: perf,
      tickets,
      commsMetrics: cMetrics,
      mixpanelHasData: usage !== null,
    });

    // Pod lookup from AM
    const amName = bs?.am_name || "";
    const pod = POD_MAP[amName] || "";

    scored.push({
      // v1 fields
      customer_id: customerId,
      entity_id: entityId,
      subscription_id: sub?.subscription_id || "",
      company: bs?.bizname || sub?.company || "",
      email: bs?.app_email || sub?.email || "",
      phone: bs?.phone_number || sub?.phone || "",
      am_name: amName,
      ae_name: bs?.ae_name || "",
      sp_name: bs?.sp_name || "",
      cb_status: sub?.status || "",
      auto_collection: sub?.auto_collection || null,
      plan_amount: (sub?.plan_amount || 0) / 100,
      mrr_basesheet: bs?.total_monthly_revenue || "",
      zoca_status: bs?.chrone_zoca_status || "",
      churn_potential_flag: bs?.churn_potential_flag || "",
      activated_at: sub?.activated_at ? new Date(sub.activated_at).toISOString() : null,
      ob_date: bs?.ob_date || "",
      match_source: bs ? "customer_id" : "unmatched",
      in_chrone: ((bs?.chrone_zoca_status || "").toUpperCase() === "ZOCA"),
      metrics: cMetrics,
      signals: v1Signals,
      // v2 extensions
      pod,
      usage,
      billing,
      performance: perf,
      tickets,
      signals_v2: signalsV2,
    });
  }

  // Count multi-entity customers (for instrumentation)
  for (const [, entIds] of customerToEntities) {
    if (entIds.length > 1) multiEntityExpansionCount += entIds.length - 1;
  }

  // Sort by composite desc, then comms volume desc
  scored.sort((a, b) => {
    if (b.signals_v2.composite !== a.signals_v2.composite) return b.signals_v2.composite - a.signals_v2.composite;
    return b.metrics.total_90d - a.metrics.total_90d;
  });

  // -------------------------------------------------------------------------
  // Aggregates
  // -------------------------------------------------------------------------
  const tierCounts: Record<Tier, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, HEALTHY: 0 };
  const stoplightCounts: Record<Stoplight, number> = { RED: 0, YELLOW: 0, GREEN: 0 };
  for (const c of scored) {
    tierCounts[c.signals_v2.tier]++;
    stoplightCounts[c.signals_v2.stoplight]++;
  }

  const signalCountsV2 = {
    we_silent_any: scored.filter((r) => r.signals_v2.sig_we_silent >= 30).length,
    client_silent_any: scored.filter((r) => r.signals_v2.sig_client_silent >= 30).length,
    response_drop_any: scored.filter((r) => r.signals_v2.sig_response_drop >= 30).length,
    volume_collapse_any: scored.filter((r) => r.signals_v2.sig_volume_collapse >= 30).length,
    usage_dormant: scored.filter((r) => r.signals_v2.sig_usage >= 65).length,
    billing_crisis: scored.filter((r) => r.signals_v2.sig_billing >= 50).length,
    performance_flagged: scored.filter((r) => r.signals_v2.flag_performance).length,
    tickets_flagged: scored.filter((r) => r.signals_v2.flag_tickets).length,
  };

  // v1 signal counts (kept for compat)
  const signalCounts = {
    we_silent_any: signalCountsV2.we_silent_any,
    client_silent_any: signalCountsV2.client_silent_any,
    response_drop_any: signalCountsV2.response_drop_any,
    volume_collapse_any: signalCountsV2.volume_collapse_any,
  };

  // Channel counts
  const channelCounts = { d30: {} as Record<string, number>, d90: {} as Record<string, number> };
  for (const c of scored) {
    for (const ch of (c.metrics.channels_used_30d || "").split(",").filter(Boolean)) {
      channelCounts.d30[ch] = (channelCounts.d30[ch] || 0) + 1;
    }
    for (const ch of (c.metrics.channels_used_90d || "").split(",").filter(Boolean)) {
      channelCounts.d90[ch] = (channelCounts.d90[ch] || 0) + 1;
    }
  }

  // AM breakdown (legacy + tier)
  const amMap = new Map<string, { high: number; total: number }>();
  const amBreakdownMap = new Map<string, AmTierRow>();
  for (const c of scored) {
    const am = c.am_name || "(unassigned)";
    const cur = amMap.get(am) || { high: 0, total: 0 };
    cur.total++;
    if (c.signals_v2.tier === "HIGH") cur.high++;
    amMap.set(am, cur);
    const row = amBreakdownMap.get(am) || { am, HIGH: 0, MEDIUM: 0, LOW: 0, HEALTHY: 0, total: 0 };
    row[c.signals_v2.tier]++;
    row.total++;
    amBreakdownMap.set(am, row);
  }
  const amExposure = Array.from(amMap, ([am, v]) => ({ am, ...v }))
    .sort((a, b) => (b.high - a.high) || (b.total - a.total));
  const amTierBreakdown = Array.from(amBreakdownMap.values())
    .sort((a, b) => (b.HIGH - a.HIGH) || (b.total - a.total));

  // Pod breakdown
  const podMap = new Map<string, PodTierRow>();
  for (const c of scored) {
    const pod = c.pod || "(unassigned)";
    const row = podMap.get(pod) || { pod, HIGH: 0, MEDIUM: 0, LOW: 0, HEALTHY: 0, total: 0, ams: [] };
    row[c.signals_v2.tier]++;
    row.total++;
    if (c.am_name && !row.ams.includes(c.am_name)) row.ams.push(c.am_name);
    podMap.set(pod, row);
  }
  const podBreakdown = Array.from(podMap.values())
    .sort((a, b) => (b.HIGH - a.HIGH) || (b.total - a.total));

  // Score distribution
  const scoreDistribution: number[] = new Array(10).fill(0);
  for (const c of scored) {
    const s = Math.max(0, Math.min(99, c.signals_v2.composite));
    scoreDistribution[Math.floor(s / 10)]++;
  }

  // Book-wide stats
  const t30 = scored.map((c) => c.metrics.total_30d).sort((a, b) => a - b);
  const t90 = scored.map((c) => c.metrics.total_90d).sort((a, b) => a - b);
  const med = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const totalComms90d = scored.reduce((a, c) => a + c.metrics.total_90d, 0);

  // Data health
  const perSourceEventCount = { chat: 0, email: 0, phone: 0, video: 0, sms: 0 };
  const perDirectionCount = { in: 0, out: 0 };
  for (const e of comms) {
    perSourceEventCount[e.channel]++;
    perDirectionCount[e.direction]++;
  }
  const customersWithAnyComms90d = scored.filter((c) => c.metrics.total_90d > 0).length;
  const customersWithEntityId = scored.filter((c) => c.entity_id).length;
  const matchBreakdown = {
    byCustomerId: scored.filter((c) => c.match_source === "customer_id").length,
    byBizName: 0,
    unmatched: scored.filter((c) => c.match_source === "unmatched").length,
    notInChrone: scored.filter((c) => !c.in_chrone).length,
  };

  const health: DataHealth = {
    totalSubsFetched: subs.length,
    customersWithEntityId,
    customersWithAnyComms90d,
    customersWithMixpanelData: mixpanelCoverage,
    customersWithBillingIssues: scored.filter((c) => c.billing && c.billing.unpaid_invoice_count > 0).length,
    customersWithPerformanceFlag: signalCountsV2.performance_flagged,
    customersWithTicketsFlag: signalCountsV2.tickets_flagged,
    matchBreakdown,
    perSourceEventCount,
    perSourceRawRows: commsStats.rawRows,
    perDirectionCount,
    duplicateEventsRemoved: commsStats.totalDuplicatesRemoved,
    baseSheetRowCount: baseSheet.rows.length,
    mixpanelRowCount: usageResult.rowCount,
    performanceRowCounts: perfResult.rowCounts,
    chargebeeInvoiceCount: invoicesResult.length,
    chargebeeTransactionCount: transactionsResult.length,
    excludedEntities: excludedCount,
    multiEntityExpansion: multiEntityExpansionCount,
    fetchErrors: errors,
    refreshDurationMs: Date.now() - started,
  };

  const snapshot: SnapshotV2 = {
    version: "v2",
    generatedAt: new Date().toISOString(),
    todayIso,
    totalActive: scored.length,
    tierCounts,
    stoplightCounts,
    signalCounts,
    signalCountsV2,
    channelCounts,
    amExposure,
    amTierBreakdown,
    podBreakdown,
    scoreDistribution,
    customers: scored,
    activeEntityIds: Array.from(activeEntityIds).sort(),
    mixpanelCoverage: {
      activeWithMixpanel: mixpanelCoverage,
      activeWithoutMixpanel: scored.length - mixpanelCoverage,
    },
    stats: {
      total_comms_90d: totalComms90d,
      median_30d: med(t30),
      mean_30d: Number(mean(t30).toFixed(2)),
      median_90d: med(t90),
      mean_90d: Number(mean(t90).toFixed(2)),
      fetch_duration_ms: Date.now() - started,
    },
    health,
    errors: errors.length ? errors : undefined,
  };

  // Ensure all tiers represented for UI stability
  for (const t of TIER_ORDER) {
    if (snapshot.tierCounts[t] == null) snapshot.tierCounts[t] = 0;
  }

  // Write to Postgres if configured
  if (pgConfigured()) {
    try {
      await writeSnapshotV2(snapshot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[buildSnapshotV2] Postgres write failed:", msg);
      errors.push(`Postgres write: ${msg}`);
    }
  }

  console.log(
    "[buildSnapshotV2] active:", scored.length,
    "tiers:", tierCounts,
    "stoplight:", stoplightCounts,
    "errors:", errors.length,
    "duration:", health.refreshDurationMs + "ms",
  );

  return snapshot;
}

/**
 * v1 wrapper — kept for backward compatibility with existing UI code that
 * reads Snapshot (not SnapshotV2). Returns the v1-shaped subset of v2 output.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const v2 = await buildSnapshotV2();
  // Strip v2-specific fields, downcast customers
  const customersV1: ScoredCustomer[] = v2.customers.map((c) => ({
    customer_id: c.customer_id,
    entity_id: c.entity_id,
    subscription_id: c.subscription_id,
    company: c.company,
    email: c.email,
    phone: c.phone,
    am_name: c.am_name,
    ae_name: c.ae_name,
    sp_name: c.sp_name,
    cb_status: c.cb_status,
    auto_collection: c.auto_collection,
    plan_amount: c.plan_amount,
    mrr_basesheet: c.mrr_basesheet,
    zoca_status: c.zoca_status,
    churn_potential_flag: c.churn_potential_flag,
    activated_at: c.activated_at,
    ob_date: c.ob_date,
    match_source: c.match_source,
    in_chrone: c.in_chrone,
    metrics: c.metrics,
    signals: c.signals,
  }));

  return {
    generatedAt: v2.generatedAt,
    todayIso: v2.todayIso,
    totalActive: v2.totalActive,
    tierCounts: v2.tierCounts,
    signalCounts: v2.signalCounts,
    channelCounts: v2.channelCounts,
    amExposure: v2.amExposure,
    amTierBreakdown: v2.amTierBreakdown,
    scoreDistribution: v2.scoreDistribution,
    customers: customersV1,
    stats: v2.stats,
    health: v2.health,
    errors: v2.errors,
  };
}

// Re-export individual fetchers for convenience (used by API routes)
export { buildBillingMetrics, fetchUnpaidInvoices, fetchRecentTransactions } from "./billing";
export { fetchUsageMetrics } from "./mixpanel";
export { fetchPerformanceMetrics } from "./performance";
