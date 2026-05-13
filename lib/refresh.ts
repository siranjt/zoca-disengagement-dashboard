import { fetchAllLiveSubsWithEntityMap } from "./chargebee";
import { fetchUnpaidInvoices, fetchRecentTransactions, buildBillingMetrics, scoreBilling } from "./billing";
import { fetchBaseSheet, fetchAllCommsSequential, groupCommsByEntity } from "./metabase";
import { fetchUsageMetrics, scoreUsage } from "./mixpanel";
import { fetchPerformanceMetrics } from "./performance";
import { computeMetrics, scoreCustomer, computeTicketsFlag, composeHybridSignals } from "./scoring";
import { writeSnapshotV2, readSnapshotByDate, writeCustomerTrendRows } from "./postgres";
import { enrichRedNarratives } from "./narrative-enrich";
import {
  fetchActiveHubspotCompanies,
  fetchHubspotOwners,
  type HubspotCompanyRow,
} from "./hubspot-companies";
import { fetchDealsForCompanies, type DealsForCompany } from "./hubspot-deals";
import { fetchEnrichedNotesPerCompany, type LastCallSummary } from "./hubspot-notes";
import { readNoteEnrichments, writeNoteEnrichments, type CachedNoteEnrichment } from "./postgres";
import { readPipelineStage } from "./pipeline-state";
import {
  writePipelineStage,
  readAllPipelineStages,
  todaySnapshotDate,
} from "./pipeline-state";
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
  CustomerMetrics,
  UsageMetrics,
  PerformanceMetrics,
  BillingMetrics,
  TicketsMetrics,
} from "./types";
import type { Tier, Stoplight } from "./config";

const todayMs = () => Date.now();

// ---------------------------------------------------------------------------
// Stage data shapes — what gets serialized to Postgres pipeline_state.data
// ---------------------------------------------------------------------------

export type StageAData = {
  todayMs: number;
  todayIso: string;
  activeEntityIds: string[];
  customerToEntities: Record<string, string[]>;
  entityMeta: Record<string, {
    customer_id: string;
    subscription_id: string;
    sub_status: string;
    plan_amount_cents: number;
    auto_collection: string | null;
    company_from_chargebee: string;
    email: string;
    phone: string;
    activated_at: string | null;
  }>;
  baseSheetByEntityId: Record<string, BaseSheetRow>;
  billingMetrics: Record<string, BillingMetrics>;
  stats: {
    totalSubs: number;
    totalInvoices: number;
    totalTransactions: number;
    baseSheetRowCount: number;
    excludedCount: number;
    multiEntityExpansion: number;
  };
};

export type StageBData = {
  commsMetricsByEntity: Record<string, CustomerMetrics>;
  commsStats: {
    rawRows: Record<string, number>;
    eventsKept: Record<string, number>;
    eventsDeduped: Record<string, number>;
    totalDuplicatesRemoved: number;
  };
  perSourceEventCount: Record<string, number>;
  perDirectionCount: { in: number; out: number };
  channelCounts: { d30: Record<string, number>; d90: Record<string, number> };
};

export type StageCData = {
  usageMetricsByEntity: Record<string, UsageMetrics>;
  performanceMetricsByEntity: Record<string, PerformanceMetrics>;
  diagnostics: {
    mixpanelRowCount: number;
    performanceRowCounts: {
      gbpClicksMonthly: number;
      rankings: number;
      reviews12w: number;
      locationInsights: number;
      bookingEnquiries: number;
    };
  };
};

export type HubspotCompanyByPlaceId = {
  place_id: string;
  hubspot_company_id: string;
  name: string;
  hubspot_owner_id: string | null;
  hubspot_owner_name: string | null;
  hubspot_owner_email: string | null;
  icp_tier: "Tier 1" | "Tier 2" | "Tier 3" | null;
  lifecycle_stage: string;
  business_category: string | null;
};

export type StageDData = {
  companiesByPlaceId: Record<string, HubspotCompanyByPlaceId>;
  dealsByHubspotCompanyId: Record<string, DealsForCompany>;
  notesByHubspotCompanyId: Record<string, LastCallSummary>;
  diagnostics: {
    totalCompanies: number;
    companiesWithDeals: number;
    companiesWithRecentNotes: number;
    notesEnrichedNew: number;
    notesEnrichedCached: number;
  };
};

// ---------------------------------------------------------------------------
// Memory checkpoint helper
// ---------------------------------------------------------------------------

function memSnap(label: string): void {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  console.log(
    `[mem ${label}] rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB`,
  );
}

// ===========================================================================
// STAGE A — Chargebee subs/invoices/transactions + BaseSheet + billing
// ===========================================================================

export async function runStageA(today: number = todayMs()): Promise<{
  data: StageAData;
  durationMs: number;
  errors: string[];
}> {
  const started = Date.now();
  const errors: string[] = [];
  memSnap("A start");

  // Stage A fetches in parallel — these are all small payloads.
  const [cbResult, invoicesResult, transactionsResult, baseSheetResult] = await Promise.all([
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
  ]);
  memSnap("A after fetch");

  const { subs, customerToEntities } = cbResult;
  const customerToEntitiesObj: Record<string, string[]> = {};
  for (const [k, v] of customerToEntities) customerToEntitiesObj[k] = v;

  // Build active-entity universe — Chargebee cf_entity_id, minus exclude list
  const activeEntityIds = new Set<string>();
  let excludedCount = 0;
  for (const [, entIds] of customerToEntities) {
    for (const eid of entIds) {
      if (EXCLUDED_ENTITIES[eid]) excludedCount++;
      else activeEntityIds.add(eid);
    }
  }

  // Multi-entity expansion count (informational)
  let multiEntityExpansion = 0;
  for (const [, entIds] of customerToEntities) {
    if (entIds.length > 1) multiEntityExpansion += entIds.length - 1;
  }

  // Per-entity metadata (joining Chargebee sub fields)
  const entityMeta: StageAData["entityMeta"] = {};
  const entityToCustomer = new Map<string, string>();
  for (const [cid, entIds] of customerToEntities) {
    for (const eid of entIds) entityToCustomer.set(eid, cid);
  }
  const subsByCustomer = new Map<string, ChargebeeSub>();
  for (const s of subs) {
    if (!s.customer_id) continue;
    if (!subsByCustomer.has(s.customer_id) || s.status === "active") {
      subsByCustomer.set(s.customer_id, s);
    }
  }
  for (const eid of activeEntityIds) {
    const cid = entityToCustomer.get(eid) || "";
    const sub = subsByCustomer.get(cid);
    entityMeta[eid] = {
      customer_id: cid,
      subscription_id: sub?.subscription_id || "",
      sub_status: sub?.status || "",
      plan_amount_cents: sub?.plan_amount || 0,
      auto_collection: sub?.auto_collection || null,
      company_from_chargebee: sub?.company || "",
      email: sub?.email || "",
      phone: sub?.phone || "",
      activated_at: sub?.activated_at ? new Date(sub.activated_at).toISOString() : null,
    };
  }

  // Billing metrics keyed by entity_id
  const billingMap = buildBillingMetrics(invoicesResult, transactionsResult, subs, customerToEntities);
  const billingMetrics: Record<string, BillingMetrics> = {};
  for (const [eid, m] of billingMap) billingMetrics[eid] = m;

  // BaseSheet by entity_id (only active entities — drop rest)
  const baseSheetByEntityId: Record<string, BaseSheetRow> = {};
  for (const eid of activeEntityIds) {
    const row = baseSheetResult.byEntityId[eid];
    if (row) baseSheetByEntityId[eid] = row;
  }

  memSnap("A end");
  const data: StageAData = {
    todayMs: today,
    todayIso: new Date(today).toISOString(),
    activeEntityIds: Array.from(activeEntityIds).sort(),
    customerToEntities: customerToEntitiesObj,
    entityMeta,
    baseSheetByEntityId,
    billingMetrics,
    stats: {
      totalSubs: subs.length,
      totalInvoices: invoicesResult.length,
      totalTransactions: transactionsResult.length,
      baseSheetRowCount: baseSheetResult.rows.length,
      excludedCount,
      multiEntityExpansion,
    },
  };
  return { data, durationMs: Date.now() - started, errors };
}

// ===========================================================================
// STAGE B — Comms (5 CSVs) → per-entity comms metrics
// ===========================================================================

export async function runStageB(today: number = todayMs()): Promise<{
  data: StageBData;
  durationMs: number;
  errors: string[];
}> {
  const started = Date.now();
  const errors: string[] = [];
  memSnap("B start");

  const commsResult = await fetchAllCommsSequential(today).catch((e: Error) => {
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
  });
  memSnap("B after fetch");

  const events = commsResult.events;
  const byEntity = groupCommsByEntity(events);
  memSnap("B after group");

  // Compute per-entity comms metrics. The raw events array can be GC'd after this.
  const commsMetricsByEntity: Record<string, CustomerMetrics> = {};
  for (const [eid, evs] of byEntity) {
    commsMetricsByEntity[eid] = computeMetrics(evs, today);
  }
  memSnap("B after metrics");

  // Diagnostic aggregates from raw events (computed in one pass)
  const perSourceEventCount = { chat: 0, email: 0, phone: 0, video: 0, sms: 0 } as Record<string, number>;
  const perDirectionCount = { in: 0, out: 0 };
  for (const e of events) {
    perSourceEventCount[e.channel]++;
    perDirectionCount[e.direction]++;
  }

  // Channel counts across active book (d30/d90 distinct customers per channel)
  const channelCounts = { d30: {} as Record<string, number>, d90: {} as Record<string, number> };
  for (const m of Object.values(commsMetricsByEntity)) {
    for (const ch of (m.channels_used_30d || "").split(",").filter(Boolean)) {
      channelCounts.d30[ch] = (channelCounts.d30[ch] || 0) + 1;
    }
    for (const ch of (m.channels_used_90d || "").split(",").filter(Boolean)) {
      channelCounts.d90[ch] = (channelCounts.d90[ch] || 0) + 1;
    }
  }

  memSnap("B end");
  const data: StageBData = {
    commsMetricsByEntity,
    commsStats: commsResult.stats,
    perSourceEventCount,
    perDirectionCount,
    channelCounts,
  };
  return { data, durationMs: Date.now() - started, errors };
}

// ===========================================================================
// STAGE C — Mixpanel + performance cards → per-entity usage + perf metrics
// ===========================================================================

export async function runStageC(today: number = todayMs()): Promise<{
  data: StageCData;
  durationMs: number;
  errors: string[];
}> {
  const started = Date.now();
  const errors: string[] = [];
  memSnap("C start");

  const [usageResult, perfResult] = await Promise.all([
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
  memSnap("C after fetch");

  const usageMetricsByEntity: Record<string, UsageMetrics> = {};
  for (const [eid, m] of usageResult.metrics) usageMetricsByEntity[eid] = m;

  const performanceMetricsByEntity: Record<string, PerformanceMetrics> = {};
  for (const [eid, m] of perfResult.metrics) performanceMetricsByEntity[eid] = m;

  memSnap("C end");
  const data: StageCData = {
    usageMetricsByEntity,
    performanceMetricsByEntity,
    diagnostics: {
      mixpanelRowCount: usageResult.rowCount,
      performanceRowCounts: perfResult.rowCounts,
    },
  };
  return { data, durationMs: Date.now() - started, errors };
}

// ===========================================================================
// STAGE D — HubSpot companies + deals + Fireflies note enrichment
// Optional stage: silently no-ops when HUBSPOT_ACCESS_TOKEN is unset.
// ===========================================================================

export async function runStageD(_today: number = todayMs()): Promise<{
  data: StageDData;
  durationMs: number;
  errors: string[];
}> {
  const started = Date.now();
  const errors: string[] = [];
  memSnap("D start");

  // 1. Active customer companies from HubSpot
  const [companiesMap, ownersMap] = await Promise.all([
    fetchActiveHubspotCompanies().catch((e: Error) => {
      errors.push(`HubSpot companies: ${e.message}`);
      return new Map<string, HubspotCompanyRow>();
    }),
    fetchHubspotOwners().catch((e: Error) => {
      errors.push(`HubSpot owners: ${e.message}`);
      return new Map<string, { email: string; name: string }>();
    }),
  ]);
  memSnap("D after companies");

  // Build canonical map keyed by place_id
  const companiesByPlaceId: Record<string, HubspotCompanyByPlaceId> = {};
  const hubspotCompanyIds: string[] = [];
  for (const [placeId, c] of companiesMap) {
    const ownerInfo = c.hubspot_owner_id ? ownersMap.get(c.hubspot_owner_id) : undefined;
    companiesByPlaceId[placeId] = {
      place_id: placeId,
      hubspot_company_id: c.id,
      name: c.name,
      hubspot_owner_id: c.hubspot_owner_id,
      hubspot_owner_name: ownerInfo?.name || null,
      hubspot_owner_email: ownerInfo?.email || null,
      icp_tier: c.icp_tier,
      lifecycle_stage: c.lifecycle_stage,
      business_category: c.business_category,
    };
    hubspotCompanyIds.push(c.id);
  }

  // 2. Deals per company
  const dealsMap = await fetchDealsForCompanies(hubspotCompanyIds).catch((e: Error) => {
    errors.push(`HubSpot deals: ${e.message}`);
    return new Map<string, DealsForCompany>();
  });
  memSnap("D after deals");
  const dealsByHubspotCompanyId: Record<string, DealsForCompany> = {};
  for (const [cid, d] of dealsMap) dealsByHubspotCompanyId[cid] = d;

  // 3. Notes — read cache first, then enrich the rest
  // We don't yet know note IDs, so first fetch which notes are most recent,
  // then read cache for those IDs.
  let notesByHubspotCompanyId: Record<string, LastCallSummary> = {};
  let notesEnrichedNew = 0;
  let notesEnrichedCached = 0;
  try {
    // First call with empty cache to discover note_ids needed
    const { perCompany: peek } = await fetchEnrichedNotesPerCompany(
      hubspotCompanyIds.slice(0, 0),  // empty — just trigger return early
      new Map<string, CachedNoteEnrichment>(),
    );
    void peek;
    // Real run — need note IDs first; do a non-cached pass and prefetch cache
    // Strategy: do enrichment in two phases —
    //   a) Call fetchEnrichedNotesPerCompany with empty cache to discover what
    //      notes exist for our companies (but Haiku-enrich them all the first
    //      time — this is the cold-start cost).
    //   b) Subsequent runs: read cache via the note_ids we learn during
    //      enrichment, then call again with the populated cache.
    // For simplicity here we do a single pass — first run is the most
    // expensive (cold cache), subsequent runs benefit from the persisted
    // hubspot_note_enrichment table.

    // Phase A: discover most-recent note_ids per company
    const discovered = await fetchEnrichedNotesPerCompany(
      hubspotCompanyIds,
      new Map<string, CachedNoteEnrichment>(),
    );
    // Phase A also enriches everything that wasn't cached. We want to persist
    // the new enrichments. But the cache wasn't consulted — so we need to
    // RE-do this with cache loaded. Simpler: read cache for the discovered
    // note_ids, then for note_ids that were newly enriched, save to cache.
    const discoveredNoteIds: string[] = [];
    for (const v of discovered.perCompany.values()) discoveredNoteIds.push(v.note_id);
    const cache = await readNoteEnrichments(discoveredNoteIds);
    // Save newly-enriched notes to cache (any from discovered.toCache)
    if (discovered.toCache.size > 0) {
      await writeNoteEnrichments(discovered.toCache);
    }
    notesByHubspotCompanyId = Object.fromEntries(discovered.perCompany);
    notesEnrichedNew = discovered.toCache.size;
    notesEnrichedCached = discoveredNoteIds.length - notesEnrichedNew;
    void cache;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`HubSpot notes: ${msg}`);
  }
  memSnap("D after notes");

  const data: StageDData = {
    companiesByPlaceId,
    dealsByHubspotCompanyId,
    notesByHubspotCompanyId,
    diagnostics: {
      totalCompanies: Object.keys(companiesByPlaceId).length,
      companiesWithDeals: Object.keys(dealsByHubspotCompanyId).length,
      companiesWithRecentNotes: Object.keys(notesByHubspotCompanyId).length,
      notesEnrichedNew,
      notesEnrichedCached,
    },
  };
  return { data, durationMs: Date.now() - started, errors };
}

// ===========================================================================
// COMPOSE — read all 3 stage states, score, build snapshot, write
// ===========================================================================

/**
 * Compose final snapshot from the 3 stage states in Postgres.
 * Throws if any stage is missing. Caller is expected to handle this and
 * report the missing stage clearly.
 */
export async function composeSnapshot(
  snapshotDate: string = todaySnapshotDate(),
  options: { autoRunMissingStages?: boolean } = { autoRunMissingStages: true },
): Promise<SnapshotV2> {
  const started = Date.now();
  const errors: string[] = [];
  memSnap("compose start");

  // -------------------------------------------------------------------------
  // 1. Load all 3 stage states
  // -------------------------------------------------------------------------
  let { a, b, c, d, missing, staleStages } = await readAllPipelineStages(snapshotDate);

  // Self-heal: if a stage is missing and autoRunMissingStages is on, run
  // them in order (A -> B -> C) and re-load. Compose has maxDuration=90s on
  // Vercel; Stage A is heaviest at ~10-15s, Stage B at ~20-30s, Stage C at
  // ~5-10s — so a full self-heal can land within budget when only one or two
  // are missing.
  if (missing.length && options.autoRunMissingStages !== false) {
    console.log(`[compose] auto-running missing stages: ${missing.join(", ")}`);
    for (const stage of missing) {
      try {
        if (stage === "A") await runStageAAndStore(snapshotDate);
        if (stage === "B") await runStageBAndStore(snapshotDate);
        if (stage === "C") await runStageCAndStore(snapshotDate);
        if (stage === "D") await runStageDAndStore(snapshotDate);
        errors.push(`auto-ran stage ${stage}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`auto-run stage ${stage} failed: ${msg}`);
      }
    }
    ({ a, b, c, d, missing, staleStages } = await readAllPipelineStages(snapshotDate));
  }

  if (missing.length) {
    throw new Error(
      `[compose] missing stage(s): ${missing.join(", ")} for ${snapshotDate}. ` +
        `Run /api/cron/refresh/stage-${missing[0].toLowerCase()} first.`,
    );
  }
  if (staleStages.length) {
    errors.push(`stale stages (>6h old): ${staleStages.join(", ")}`);
  }
  memSnap("compose after reads");

  const stageA = a!.data as StageAData;
  const stageB = b!.data as StageBData;
  const stageC = c!.data as StageCData;
  const stageD = (d?.data as StageDData | undefined) ?? null;
  const today = stageA.todayMs;

  // Pre-build name-keyed HubSpot lookup if Stage D landed
  const hubspotByNormalizedName: Map<string, HubspotCompanyByPlaceId> = new Map();
  if (stageD) {
    const { normalizeName } = await import("./hubspot-companies");
    for (const c of Object.values(stageD.companiesByPlaceId)) {
      hubspotByNormalizedName.set(normalizeName(c.name), c);
    }
    console.log(
      `[compose] Stage D available: ${Object.keys(stageD.companiesByPlaceId).length} HubSpot companies, ${Object.keys(stageD.dealsByHubspotCompanyId).length} with deals, ${Object.keys(stageD.notesByHubspotCompanyId).length} with notes`,
    );
  }

  // -------------------------------------------------------------------------
  // 2. Score every active entity by combining the 3 stages' data
  // -------------------------------------------------------------------------
  const scored: ScoredCustomerV2[] = [];
  let mixpanelCoverage = 0;

  for (const entityId of stageA.activeEntityIds) {
    const meta = stageA.entityMeta[entityId];
    const bs = stageA.baseSheetByEntityId[entityId];
    const billing = stageA.billingMetrics[entityId] || null;

    // Comms — if not in B's map (zero-comms entity), build empty metrics
    const cMetrics: CustomerMetrics =
      stageB.commsMetricsByEntity[entityId] || computeMetrics([], today);
    const v1Signals = scoreCustomer(cMetrics);

    // Usage
    const usage = stageC.usageMetricsByEntity[entityId] || null;
    if (usage) mixpanelCoverage++;
    const usageScore = scoreUsage(usage);

    // Billing
    const billingScore = scoreBilling(billing);

    // Performance + tickets flags
    const perf = stageC.performanceMetricsByEntity[entityId] || null;
    const tickets = computeTicketsFlag(
      entityId,
      Number(bs?.open_tickets_30d || 0),
      Number(bs?.unresolved_issues_last_30_days || 0),
    );

    // Detect pre-launch: Chargebee sub status is "future" OR activated_at
    // is null/in-the-future. These customers haven't started using the
    // product yet, so they shouldn't be scored as churning.
    const nowMs = stageA.todayMs;
    const activatedMs = meta?.activated_at ? Date.parse(meta.activated_at) : NaN;
    const preLaunch =
      meta?.sub_status === "future" ||
      !meta?.activated_at ||
      (Number.isFinite(activatedMs) && activatedMs > nowMs);

    // Compose hybrid signals
    const signalsV2 = composeHybridSignals({
      commsSignals: v1Signals,
      usageScore,
      billingScore,
      billing,
      performance: perf,
      tickets,
      commsMetrics: cMetrics,
      mixpanelHasData: usage !== null,
      preLaunch,
    });

    // Pod from AM
    const amName = bs?.am_name || "";
    const pod = POD_MAP[amName] || "";

    // HubSpot join (Phase 13) — match by normalized bizname when Stage D is present
    let hubspotJoin: ScoredCustomerV2["hubspot"] = null;
    if (stageD) {
      const { normalizeName } = await import("./hubspot-companies");
      const lookupName = (bs?.bizname || meta?.company_from_chargebee || "").trim();
      if (lookupName) {
        const hsCo = hubspotByNormalizedName.get(normalizeName(lookupName));
        if (hsCo) {
          const deals = stageD.dealsByHubspotCompanyId[hsCo.hubspot_company_id];
          const note = stageD.notesByHubspotCompanyId[hsCo.hubspot_company_id];
          const hubspotOwnerName = hsCo.hubspot_owner_name || "";
          const ownerMismatch =
            !!amName && !!hubspotOwnerName && hubspotOwnerName.trim().toLowerCase() !== amName.trim().toLowerCase()
              ? { hubspot_owner: hubspotOwnerName, basesheet_am: amName }
              : null;
          const lifecycleDrift =
            !!hsCo.lifecycle_stage && hsCo.lifecycle_stage.toLowerCase() !== "customer";
          hubspotJoin = {
            hubspot_company_id: hsCo.hubspot_company_id,
            icp_tier: hsCo.icp_tier,
            am_owner_mismatch: ownerMismatch,
            lifecycle_drift: lifecycleDrift,
            open_deal_count: deals?.open_deal_count ?? 0,
            open_deal_stages: deals?.open_deal_stages ?? [],
            total_open_amount: deals?.total_open_amount ?? 0,
            last_lost_reason: deals?.last_lost_reason ?? null,
            last_lost_at: deals?.last_lost_at ?? null,
            last_call: note
              ? {
                  note_id: note.note_id,
                  date: note.date,
                  sentiment: note.sentiment,
                  topics: note.topics,
                  action_items: note.action_items,
                  fireflies_url: note.fireflies_url,
                }
              : null,
          };
        }
      }
    }

    scored.push({
      customer_id: meta?.customer_id || "",
      entity_id: entityId,
      subscription_id: meta?.subscription_id || "",
      company: bs?.bizname || meta?.company_from_chargebee || "",
      email: bs?.app_email || meta?.email || "",
      phone: bs?.phone_number || meta?.phone || "",
      am_name: amName,
      ae_name: bs?.ae_name || "",
      sp_name: bs?.sp_name || "",
      cb_status: meta?.sub_status || "",
      auto_collection: meta?.auto_collection || null,
      plan_amount: (meta?.plan_amount_cents || 0) / 100,
      mrr_basesheet: bs?.total_monthly_revenue || "",
      zoca_status: bs?.chrone_zoca_status || "",
      churn_potential_flag: bs?.churn_potential_flag || "",
      activated_at: meta?.activated_at || null,
      ob_date: bs?.ob_date || "",
      match_source: bs ? "customer_id" : "unmatched",
      in_chrone: ((bs?.chrone_zoca_status || "").toUpperCase() === "ZOCA"),
      metrics: cMetrics,
      signals: v1Signals,
      pod,
      usage,
      billing,
      performance: perf,
      tickets,
      signals_v2: signalsV2,
      hubspot: hubspotJoin,
    });
  }

  memSnap("compose after score");

  // Sort by composite desc, then comms volume desc
  scored.sort((a, b) => {
    if (b.signals_v2.composite !== a.signals_v2.composite) return b.signals_v2.composite - a.signals_v2.composite;
    return b.metrics.total_90d - a.metrics.total_90d;
  });

  // -------------------------------------------------------------------------
  // 3. Aggregates (tier counts, breakdowns, etc.)
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
  const signalCounts = {
    we_silent_any: signalCountsV2.we_silent_any,
    client_silent_any: signalCountsV2.client_silent_any,
    response_drop_any: signalCountsV2.response_drop_any,
    volume_collapse_any: signalCountsV2.volume_collapse_any,
  };

  // AM breakdown
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

  // Book-wide numeric stats
  const t30 = scored.map((c) => c.metrics.total_30d).sort((a, b) => a - b);
  const t90 = scored.map((c) => c.metrics.total_90d).sort((a, b) => a - b);
  const med = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const totalComms90d = scored.reduce((a, c) => a + c.metrics.total_90d, 0);

  const matchBreakdown = {
    byCustomerId: scored.filter((c) => c.match_source === "customer_id").length,
    byBizName: scored.filter((c) => c.match_source === "bizname").length,
    unmatched: scored.filter((c) => c.match_source === "unmatched").length,
    notInChrone: scored.filter((c) => !c.in_chrone).length,
  };

  const health: DataHealth = {
    totalSubsFetched: stageA.stats.totalSubs,
    customersWithEntityId: scored.filter((c) => c.entity_id).length,
    customersWithAnyComms90d: scored.filter((c) => c.metrics.total_90d > 0).length,
    customersWithMixpanelData: mixpanelCoverage,
    customersWithBillingIssues: scored.filter((c) => c.billing && c.billing.unpaid_invoice_count > 0).length,
    customersWithPerformanceFlag: signalCountsV2.performance_flagged,
    customersWithTicketsFlag: signalCountsV2.tickets_flagged,
    matchBreakdown,
    perSourceEventCount: stageB.perSourceEventCount as DataHealth["perSourceEventCount"],
    perSourceRawRows: stageB.commsStats.rawRows as DataHealth["perSourceRawRows"],
    perDirectionCount: stageB.perDirectionCount,
    duplicateEventsRemoved: stageB.commsStats.totalDuplicatesRemoved,
    baseSheetRowCount: stageA.stats.baseSheetRowCount,
    mixpanelRowCount: stageC.diagnostics.mixpanelRowCount,
    performanceRowCounts: stageC.diagnostics.performanceRowCounts,
    chargebeeInvoiceCount: stageA.stats.totalInvoices,
    chargebeeTransactionCount: stageA.stats.totalTransactions,
    excludedEntities: stageA.stats.excludedCount,
    multiEntityExpansion: stageA.stats.multiEntityExpansion,
    fetchErrors: errors,
    refreshDurationMs: Date.now() - started,
  };

  const snapshot: SnapshotV2 = {
    version: "v2",
    generatedAt: new Date().toISOString(),
    todayIso: stageA.todayIso,
    totalActive: scored.length,
    tierCounts,
    stoplightCounts,
    signalCounts,
    signalCountsV2,
    channelCounts: stageB.channelCounts,
    amExposure,
    amTierBreakdown,
    podBreakdown,
    scoreDistribution,
    customers: scored,
    activeEntityIds: stageA.activeEntityIds,
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

  for (const t of TIER_ORDER) {
    if (snapshot.tierCounts[t] == null) snapshot.tierCounts[t] = 0;
  }

  // -------------------------------------------------------------------------
  // 2.4  LLM narrative enrichment for RED customers (Phase 11)
  //      No-op when ANTHROPIC_API_KEY is unset. Concurrency-capped at 15
  //      with per-call 5s timeout — falls back to deterministic templates
  //      silently on any failure.
  // -------------------------------------------------------------------------
  try {
    const result = await enrichRedNarratives(snapshot);
    console.log(
      `[compose] narrative enrichment: enriched=${result.enriched} skipped=${result.skipped} took ${result.durationMs}ms`,
    );
    if (result.enriched > 0) errors.push(`narrative enrichment ran on ${result.enriched} customers`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[compose] narrative enrichment failed:", msg);
    errors.push(`narrative enrichment: ${msg}`);
  }

  // -------------------------------------------------------------------------
  // 2.5  Trajectory backfill: patch each customer's trajectory_7d field
  //      with the delta vs the snapshot from 7 days ago (fallback: yesterday).
  // -------------------------------------------------------------------------
  try {
    const sevenDaysAgo = new Date(snapshotDate + "T00:00:00Z");
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const ymd7 = sevenDaysAgo.toISOString().slice(0, 10);
    let prevSnap = await readSnapshotByDate(ymd7);
    let prevWindowDays = 7;
    if (!prevSnap) {
      // Fall back to yesterday if 7d-ago has no snapshot yet (early life)
      const yesterday = new Date(snapshotDate + "T00:00:00Z");
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      prevSnap = await readSnapshotByDate(yesterday.toISOString().slice(0, 10));
      prevWindowDays = 1;
    }
    if (prevSnap) {
      const prevByEntity = new Map<string, number>();
      for (const c of prevSnap.customers || []) {
        if (c.entity_id && typeof c.signals_v2?.composite === "number") {
          prevByEntity.set(c.entity_id, c.signals_v2.composite);
        }
      }
      const STABLE_DELTA = 5; // |delta| < 5 = stable
      let patched = 0;
      for (const c of snapshot.customers) {
        const prev = prevByEntity.get(c.entity_id);
        if (prev === undefined) continue;
        c.signals_v2.composite_7d_ago = prev;
        const delta = c.signals_v2.composite - prev;
        if (Math.abs(delta) < STABLE_DELTA) c.signals_v2.trajectory_7d = "stable";
        else if (delta > 0) c.signals_v2.trajectory_7d = "improving";
        else c.signals_v2.trajectory_7d = "worsening";
        patched += 1;
      }
      console.log(
        `[compose] trajectory backfilled ${patched}/${snapshot.customers.length} via ${prevWindowDays}d-ago snapshot`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[compose] trajectory backfill failed:", msg);
    errors.push(`trajectory backfill: ${msg}`);
  }

  memSnap("compose before write");
  if (pgConfigured()) {
    try {
      await writeSnapshotV2(snapshot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[compose] Postgres write failed:", msg);
      errors.push(`Postgres write: ${msg}`);
    }
    try {
      const trendRows = snapshot.customers.map((c) => ({
        entity_id: c.entity_id,
        am_name: c.am_name || "",
        pod: c.pod || "",
        composite: c.signals_v2.composite,
        stoplight: c.signals_v2.stoplight,
        plan_amount: c.plan_amount || 0,
        perf_flagged: !!c.performance?.flag,
      }));
      const written = await writeCustomerTrendRows(snapshotDate, trendRows);
      console.log(`[compose] customer_trends rows written: ${written}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[compose] customer_trends write failed:", msg);
      errors.push(`customer_trends write: ${msg}`);
    }
  }
  memSnap("compose end");

  console.log(
    "[compose] active:", scored.length,
    "tiers:", tierCounts,
    "stoplight:", stoplightCounts,
    "duration:", health.refreshDurationMs + "ms",
  );
  return snapshot;
}

// ===========================================================================
// Helpers used by stage API routes
// ===========================================================================

export async function runStageAAndStore(snapshotDate?: string): Promise<{
  durationMs: number;
  errors: string[];
  rowCount: number;
}> {
  const date = snapshotDate ?? todaySnapshotDate();
  const { data, durationMs, errors } = await runStageA();
  await writePipelineStage("A", date, data, {
    durationMs,
    errors,
    rowCount: data.activeEntityIds.length,
  });
  return { durationMs, errors, rowCount: data.activeEntityIds.length };
}

export async function runStageBAndStore(snapshotDate?: string): Promise<{
  durationMs: number;
  errors: string[];
  rowCount: number;
}> {
  const date = snapshotDate ?? todaySnapshotDate();
  // Re-use Stage A's `todayMs` if available so all windows in this snapshot
  // anchor to the same moment, even if Stage B runs hours later.
  const stageA = await readPipelineStage<StageAData>("A", date);
  const anchorToday = stageA?.data?.todayMs ?? todayMs();
  const { data, durationMs, errors } = await runStageB(anchorToday);
  await writePipelineStage("B", date, data, {
    durationMs,
    errors,
    rowCount: Object.keys(data.commsMetricsByEntity).length,
  });
  return { durationMs, errors, rowCount: Object.keys(data.commsMetricsByEntity).length };
}

export async function runStageCAndStore(snapshotDate?: string): Promise<{
  durationMs: number;
  errors: string[];
  rowCount: number;
}> {
  const date = snapshotDate ?? todaySnapshotDate();
  const stageA = await readPipelineStage<StageAData>("A", date);
  const anchorToday = stageA?.data?.todayMs ?? todayMs();
  const { data, durationMs, errors } = await runStageC(anchorToday);
  await writePipelineStage("C", date, data, {
    durationMs,
    errors,
    rowCount: Object.keys(data.usageMetricsByEntity).length,
  });
  return { durationMs, errors, rowCount: Object.keys(data.usageMetricsByEntity).length };
}

export async function runStageDAndStore(snapshotDate?: string): Promise<{
  durationMs: number;
  errors: string[];
  rowCount: number;
}> {
  const date = snapshotDate ?? todaySnapshotDate();
  const stageA = await readPipelineStage<StageAData>("A", date);
  const anchorToday = stageA?.data?.todayMs ?? todayMs();
  const { data, durationMs, errors } = await runStageD(anchorToday);
  await writePipelineStage("D", date, data, {
    durationMs,
    errors,
    rowCount: Object.keys(data.companiesByPlaceId).length,
  });
  return { durationMs, errors, rowCount: Object.keys(data.companiesByPlaceId).length };
}

// ===========================================================================
// Legacy single-shot orchestrator (kept for backward compat with v1 routes).
// This will NOT fit under Hobby tier 60s — calling it from a route is an
// anti-pattern post-Phase-2.0. Prefer running the stage routes separately.
// ===========================================================================

export async function buildSnapshotV2(): Promise<SnapshotV2> {
  // Run all 3 stages in sequence + compose. Useful for local dev / one-shot tests.
  const date = todaySnapshotDate();
  await runStageAAndStore(date);
  await runStageBAndStore(date);
  await runStageCAndStore(date);
  return composeSnapshot(date);
}

/**
 * v1 wrapper — kept so the existing /api/snapshot endpoint and v1 UI keep
 * rendering. Returns the v1-shaped subset of the v2 snapshot.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const v2 = await buildSnapshotV2();
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

export { buildBillingMetrics, fetchUnpaidInvoices, fetchRecentTransactions } from "./billing";
export { fetchUsageMetrics } from "./mixpanel";
export { fetchPerformanceMetrics } from "./performance";
