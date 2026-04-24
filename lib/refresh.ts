import { fetchAllLiveSubs } from "./chargebee";
import { fetchBaseSheet, fetchAllComms, groupCommsByEntity } from "./metabase";
import { computeMetrics, scoreCustomer } from "./scoring";
import { TIER_ORDER } from "./config";
import type {
  ScoredCustomer,
  Snapshot,
  CommsEvent,
  BaseSheetRow,
} from "./types";
import type { Tier } from "./config";

/**
 * End-to-end refresh: pull live subs, pull comms feeds, score every customer,
 * build aggregate stats, and return the snapshot.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const started = Date.now();
  const errors: string[] = [];
  const todayMs = Date.now();
  const todayIso = new Date(todayMs).toISOString();

  // Run fetches in parallel — they're independent
  const [subs, baseSheet, comms] = await Promise.all([
    fetchAllLiveSubs().catch((e: Error) => {
      errors.push(`Chargebee: ${e.message}`);
      return [] as Awaited<ReturnType<typeof fetchAllLiveSubs>>;
    }),
    fetchBaseSheet().catch((e: Error) => {
      errors.push(`BaseSheet: ${e.message}`);
      return { rows: [] as BaseSheetRow[], byCustomerId: {} as Record<string, BaseSheetRow>, byEntityId: {} as Record<string, BaseSheetRow> };
    }),
    fetchAllComms(todayMs).catch((e: Error) => {
      errors.push(`Comms: ${e.message}`);
      return [] as CommsEvent[];
    }),
  ]);

  const byEntity = groupCommsByEntity(comms);

  // Build scored customer list — only customers with an entity_id mapping
  // (otherwise we can't join to comms).
  const seen = new Set<string>();
  const scored: ScoredCustomer[] = [];

  for (const s of subs) {
    if (seen.has(s.customer_id)) continue;
    seen.add(s.customer_id);
    const bs = baseSheet.byCustomerId[s.customer_id];
    const entityId = bs?.entity_id || "";
    const evs = entityId ? byEntity.get(entityId) || [] : [];
    const metrics = computeMetrics(evs, todayMs);
    const signals = scoreCustomer(metrics);

    scored.push({
      customer_id: s.customer_id,
      entity_id: entityId,
      subscription_id: s.subscription_id,
      company: bs?.bizname || s.company || "",
      email: bs?.app_email || s.email || "",
      phone: bs?.phone_number || s.phone || "",
      am_name: bs?.am_name || "",
      ae_name: bs?.ae_name || "",
      sp_name: bs?.sp_name || "",
      cb_status: s.status,
      auto_collection: s.auto_collection,
      plan_amount: s.plan_amount / 100,
      mrr_basesheet: bs?.total_monthly_revenue || "",
      zoca_status: bs?.chrone_zoca_status || "",
      churn_potential_flag: bs?.churn_potential_flag || "",
      activated_at: s.activated_at ? new Date(s.activated_at).toISOString() : null,
      ob_date: bs?.ob_date || "",
      metrics,
      signals,
    });
  }

  // Sort by score desc, then 90d volume desc
  scored.sort((a, b) => {
    if (b.signals.score !== a.signals.score) return b.signals.score - a.signals.score;
    return b.metrics.total_90d - a.metrics.total_90d;
  });

  // Aggregate: tier counts
  const tierCounts: Record<Tier, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, HEALTHY: 0 };
  for (const c of scored) tierCounts[c.signals.tier]++;

  // Signal counts (≥ 30)
  const signalCounts = {
    we_silent_any: scored.filter((r) => r.signals.sig_we_silent >= 30).length,
    client_silent_any: scored.filter((r) => r.signals.sig_client_silent >= 30).length,
    response_drop_any: scored.filter((r) => r.signals.sig_response_drop >= 30).length,
    volume_collapse_any: scored.filter((r) => r.signals.sig_volume_collapse >= 30).length,
  };

  // Channel counts (distinct customers per channel per window)
  const channelCounts = {
    d30: {} as Record<string, number>,
    d90: {} as Record<string, number>,
  };
  for (const c of scored) {
    for (const ch of (c.metrics.channels_used_30d || "").split(",").filter(Boolean)) {
      channelCounts.d30[ch] = (channelCounts.d30[ch] || 0) + 1;
    }
    for (const ch of (c.metrics.channels_used_90d || "").split(",").filter(Boolean)) {
      channelCounts.d90[ch] = (channelCounts.d90[ch] || 0) + 1;
    }
  }

  // AM exposure
  const amMap = new Map<string, { high: number; total: number }>();
  for (const c of scored) {
    const am = c.am_name || "(unassigned)";
    const cur = amMap.get(am) || { high: 0, total: 0 };
    cur.total++;
    if (c.signals.tier === "HIGH") cur.high++;
    amMap.set(am, cur);
  }
  const amExposure = Array.from(amMap, ([am, v]) => ({ am, ...v }))
    .sort((a, b) => (b.high - a.high) || (b.total - a.total));

  // Book-wide numeric stats
  const t30 = scored.map((c) => c.metrics.total_30d).sort((a, b) => a - b);
  const t90 = scored.map((c) => c.metrics.total_90d).sort((a, b) => a - b);
  const med = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const totalComms90d = scored.reduce((a, c) => a + c.metrics.total_90d, 0);

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    todayIso,
    totalActive: scored.length,
    tierCounts,
    signalCounts,
    channelCounts,
    amExposure,
    customers: scored,
    stats: {
      total_comms_90d: totalComms90d,
      median_30d: med(t30),
      mean_30d: Number(mean(t30).toFixed(2)),
      median_90d: med(t90),
      mean_90d: Number(mean(t90).toFixed(2)),
      fetch_duration_ms: Date.now() - started,
    },
    errors: errors.length ? errors : undefined,
  };

  // Ensure every tier is represented (for UI stability)
  for (const t of TIER_ORDER) {
    if (snapshot.tierCounts[t] == null) snapshot.tierCounts[t] = 0;
  }

  return snapshot;
}
