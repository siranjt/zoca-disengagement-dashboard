/**
 * Phase 31 — HubSpot Service Hub tickets adapter.
 *
 * Pulls tickets associated with a given HubSpot company across ALL pipelines.
 * Keeps anything currently open OR closed within the last
 * TICKETS_RECENT_CLOSED_DAYS window. Maps HubSpot's pipeline-stage taxonomy +
 * `hs_ticket_priority` to the project-wide `UnifiedTicket` shape.
 *
 * All external calls go through `hubspotFetch`/`hubspotSearchAll` so we inherit
 * the 5s timeout, 429/5xx backoff, and missing-token soft-fail behavior.
 *
 * Soft-fails to `[]`/empty map on every error path — never throws to callers.
 */

import {
  hubspotFetch,
  hubspotSearchAll,
  hubspotConfigured,
} from "./hubspot";
import { TICKETS_RECENT_CLOSED_DAYS } from "./config";
import { buildHubspotCompanyUrl } from "./contact-links";
import type {
  UnifiedTicket,
  TicketStatus,
  TicketPriority,
} from "./tickets-unified";
import { TICKETS_STALE_DAYS } from "./config";

const TICKET_PROPS = [
  "subject",
  "content",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "hs_ticket_category",
  "hubspot_owner_id",
  "createdate",
  "hs_lastmodifieddate",
  "hs_resolution",
  "closed_date",
];

type HubspotTicketRecord = {
  id: string;
  properties: Record<string, string | null | undefined>;
  associations?: {
    companies?: { results?: Array<{ id: string }> };
  };
};

type HubspotOwner = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

// 5-minute in-process owner cache. Avoids repeat lookups for the same owner
// across companies — the typical Zoca portal has <50 unique support owners.
const ownerCache = new Map<string, { value: HubspotOwner | null; at: number }>();
const OWNER_TTL_MS = 5 * 60 * 1000;

async function getOwner(ownerId: string): Promise<HubspotOwner | null> {
  if (!ownerId) return null;
  const now = Date.now();
  const hit = ownerCache.get(ownerId);
  if (hit && now - hit.at < OWNER_TTL_MS) return hit.value;
  const owner = await hubspotFetch<HubspotOwner>(
    `/crm/v3/owners/${encodeURIComponent(ownerId)}`,
    { timeoutMs: 4_000 },
  );
  ownerCache.set(ownerId, { value: owner ?? null, at: now });
  return owner ?? null;
}

// -------- pipeline metadata caching ----------------------------------------
// We resolve HubSpot's `hs_pipeline` + `hs_pipeline_stage` IDs to human-readable
// labels via `/crm/v3/pipelines/tickets`. The list of pipelines is small and
// rarely changes — cache for the lifetime of the process.

type HubspotPipelineStage = { id: string; label: string };
type HubspotPipeline = { id: string; label: string; stages: HubspotPipelineStage[] };

let pipelinesCache: HubspotPipeline[] | null = null;

async function getPipelines(): Promise<HubspotPipeline[]> {
  if (pipelinesCache) return pipelinesCache;
  type Resp = { results?: HubspotPipeline[] };
  const resp = await hubspotFetch<Resp>(`/crm/v3/pipelines/tickets`, {
    timeoutMs: 4_000,
  });
  pipelinesCache = resp?.results ?? [];
  return pipelinesCache;
}

function pipelineLabel(pipelines: HubspotPipeline[], id: string | null | undefined): string | null {
  if (!id) return null;
  const p = pipelines.find((p) => p.id === id);
  return p ? p.label : null;
}

function stageLabel(
  pipelines: HubspotPipeline[],
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
): string | null {
  if (!pipelineId || !stageId) return null;
  const p = pipelines.find((p) => p.id === pipelineId);
  if (!p) return null;
  const s = p.stages?.find((s) => s.id === stageId);
  return s ? s.label : null;
}

// -------- mapping ----------------------------------------------------------

function mapStatus(
  stageLabelText: string | null,
  resolution: string | null,
  closedAt: string | null,
): TicketStatus {
  const isClosed = !!closedAt;
  const labelLower = (stageLabelText || "").toLowerCase();
  const resLower = (resolution || "").toLowerCase();
  if (isClosed) {
    if (resLower.includes("won't") || resLower.includes("wont") || resLower.includes("duplicate")) {
      return "closed_unresolved";
    }
    return "closed_resolved";
  }
  if (labelLower.includes("waiting on contact") || labelLower.includes("waiting on customer")) {
    return "waiting_on_customer";
  }
  if (labelLower.includes("waiting on us")) return "waiting_on_us";
  if (labelLower.includes("in progress") || labelLower.includes("working")) return "in_progress";
  if (labelLower.includes("new")) return "new";
  if (labelLower) return "open";
  return "unknown";
}

function mapPriority(p: string | null | undefined): TicketPriority {
  const v = (p || "").toUpperCase();
  if (v === "URGENT") return "URGENT";
  if (v === "HIGH") return "HIGH";
  if (v === "MEDIUM") return "MEDIUM";
  if (v === "LOW") return "LOW";
  return "UNSET";
}

function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

// -------- ticket record → UnifiedTicket -----------------------------------

async function toUnified(
  rec: HubspotTicketRecord,
  pipelines: HubspotPipeline[],
  now: number,
  companyId: string,
): Promise<UnifiedTicket | null> {
  const p = rec.properties || {};
  const subject = (p.subject || "").trim() || `Ticket ${rec.id}`;
  const pipelineId = p.hs_pipeline ?? null;
  const stageId = p.hs_pipeline_stage ?? null;
  const closedAt = p.closed_date || null;
  const created = p.createdate || new Date(now).toISOString();
  const lastUpdated = p.hs_lastmodifieddate || created;
  const stageLbl = stageLabel(pipelines, pipelineId, stageId);
  const status = mapStatus(stageLbl, p.hs_resolution ?? null, closedAt);
  const priority = mapPriority(p.hs_ticket_priority);
  const owner = p.hubspot_owner_id ? await getOwner(String(p.hubspot_owner_id)) : null;
  const ownerName = owner
    ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || null
    : null;
  const createdMs = Date.parse(created);
  const ageDays = Number.isFinite(createdMs) ? daysBetween(createdMs, now) : 0;
  const isClosed = !!closedAt;
  const portal = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "";
  const url = portal
    ? `https://app.hubspot.com/contacts/${portal}/ticket/${rec.id}`
    : `${buildHubspotCompanyUrl(companyId)}/ticket/${rec.id}`;
  return {
    source: "hubspot",
    id: rec.id,
    title: subject,
    status,
    status_label: stageLbl || "Open",
    priority,
    owner_name: ownerName,
    owner_email: owner?.email ?? null,
    pipeline: pipelineLabel(pipelines, pipelineId),
    created_at: created,
    last_updated_at: lastUpdated,
    closed_at: closedAt,
    url,
    age_days: ageDays,
    is_stale: !isClosed && ageDays >= TICKETS_STALE_DAYS,
    is_closed: isClosed,
  };
}

function withinRetention(rec: HubspotTicketRecord, now: number): boolean {
  const p = rec.properties || {};
  if (!p.closed_date) return true; // any open ticket included
  const closedMs = Date.parse(p.closed_date || "");
  if (!Number.isFinite(closedMs)) return false;
  return now - closedMs <= TICKETS_RECENT_CLOSED_DAYS * 86_400_000;
}

// -------- public API: per-company fetcher (used by the live route) --------

export async function fetchTicketsForCompany(
  hubspotCompanyId: string,
): Promise<UnifiedTicket[]> {
  if (!hubspotConfigured() || !hubspotCompanyId) return [];
  try {
    const records = await hubspotSearchAll<HubspotTicketRecord>("tickets", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "associations.company",
              operator: "EQ",
              value: hubspotCompanyId,
            },
          ],
        },
      ],
      properties: TICKET_PROPS,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    });
    const now = Date.now();
    const kept = records.filter((r) => withinRetention(r, now));
    const pipelines = await getPipelines();
    const out: UnifiedTicket[] = [];
    for (const r of kept) {
      const u = await toUnified(r, pipelines, now, hubspotCompanyId).catch(() => null);
      if (u) out.push(u);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[hubspot-tickets] fetchTicketsForCompany(${hubspotCompanyId}): ${msg}`);
    return [];
  }
}

// -------- public API: batched fetcher (used by snapshot pipeline) --------

/**
 * Batched per-company fetch.
 *
 * Strategy: search HubSpot tickets in one shot using an `IN` filter on
 * `associations.company`, then bucket the results by their associated company
 * id. Falls back to per-company calls (cap concurrency = 3) if the search API
 * rejects the IN clause for any reason.
 */
export async function fetchTicketsForCompanies(
  hubspotCompanyIds: string[],
): Promise<Map<string, UnifiedTicket[]>> {
  const out = new Map<string, UnifiedTicket[]>();
  if (!hubspotConfigured() || !hubspotCompanyIds.length) return out;
  // Pre-seed map so callers can iterate predictably.
  for (const id of hubspotCompanyIds) out.set(id, []);

  const pipelines = await getPipelines();
  const now = Date.now();

  // Process IDs in chunks of 50 to keep search payloads reasonable.
  const CHUNK = 50;
  for (let i = 0; i < hubspotCompanyIds.length; i += CHUNK) {
    const chunk = hubspotCompanyIds.slice(i, i + CHUNK);
    try {
      const records = await hubspotSearchAll<HubspotTicketRecord>("tickets", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "associations.company",
                operator: "IN",
                values: chunk,
              },
            ],
          },
        ],
        properties: TICKET_PROPS,
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
        associations: ["companies"],
      });
      const kept = records.filter((r) => withinRetention(r, now));
      for (const r of kept) {
        const companies = r.associations?.companies?.results ?? [];
        const targetIds = companies.map((c) => c.id).filter((id) => chunk.includes(id));
        if (!targetIds.length) continue;
        // Each ticket may associate with multiple companies — attach to all.
        for (const cid of targetIds) {
          // toUnified is idempotent per record; we recompute the url with the
          // matched company id so links land correctly.
          // eslint-disable-next-line no-await-in-loop
          const u = await toUnified(r, pipelines, now, cid).catch(() => null);
          if (!u) continue;
          const bucket = out.get(cid) ?? [];
          bucket.push(u);
          out.set(cid, bucket);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[hubspot-tickets] batch search failed for chunk ${i}-${i + chunk.length}: ${msg}. Falling back to per-company.`,
      );
      // Per-company fallback with concurrency 3
      const concurrency = 3;
      for (let j = 0; j < chunk.length; j += concurrency) {
        const sub = chunk.slice(j, j + concurrency);
        const settled = await Promise.all(
          sub.map((cid) => fetchTicketsForCompany(cid).catch(() => [] as UnifiedTicket[])),
        );
        sub.forEach((cid, idx) => out.set(cid, settled[idx] ?? []));
      }
    }
  }
  return out;
}
