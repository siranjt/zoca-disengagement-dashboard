/**
 * Fetch HubSpot call engagement counts per company for the last 30 days.
 *
 * Pattern mirrors lib/hubspot-deals.ts (associations -> batch search by id).
 * Returns per-company { call_count_30d, last_call_at } so the compose stage
 * can compare HubSpot's logged calls against Metabase's phone CSV and
 * surface a "comms drift" hygiene flag.
 *
 * HubSpot's `calls` object exists in newer accounts. If the search fails
 * (404 / object type not found), we log the error and return an empty Map
 * — Stage D must not crash because the optional calls endpoint isn't
 * available.
 */

import { hubspotSearchAll, hubspotBatchAssociations, hubspotConfigured } from "./hubspot";

export type CallsForCompany = {
  call_count_30d: number;
  last_call_at: string | null;
};

const CALL_PROPS = ["hs_timestamp", "hs_call_duration", "hs_call_direction", "hubspot_owner_id"];

type HubspotApiCall = {
  id: string;
  properties: Record<string, string>;
};

export async function fetchCallsForCompanies(
  hubspotCompanyIds: string[],
): Promise<Map<string, CallsForCompany>> {
  const out = new Map<string, CallsForCompany>();
  if (!hubspotConfigured() || !hubspotCompanyIds.length) return out;

  // 1) company -> call_ids
  let companyToCallIds: Map<string, number[]>;
  try {
    companyToCallIds = await hubspotBatchAssociations(
      "companies",
      hubspotCompanyIds,
      "calls",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[hubspot-calls] associations error (skipping): ${msg}`);
    return out;
  }
  console.log(
    `[hubspot-calls] companies with calls: ${companyToCallIds.size}/${hubspotCompanyIds.length}`,
  );
  if (companyToCallIds.size === 0) return out;

  // 2) collect unique call ids
  const allCallIds = new Set<number>();
  for (const ids of companyToCallIds.values()) {
    for (const id of ids) allCallIds.add(id);
  }
  console.log(`[hubspot-calls] unique call IDs to fetch: ${allCallIds.size}`);
  if (allCallIds.size === 0) return out;

  // 3) batch search by id, filtering to last 30 days at the server.
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const callRecords = new Map<string, HubspotApiCall>();
  const callIdsArr = Array.from(allCallIds);
  const CHUNK = 100;
  for (let i = 0; i < callIdsArr.length; i += CHUNK) {
    const chunk = callIdsArr.slice(i, i + CHUNK);
    let results: HubspotApiCall[] = [];
    try {
      results = await hubspotSearchAll<HubspotApiCall>("calls", {
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_object_id", operator: "IN", values: chunk.map(String) },
              { propertyName: "hs_timestamp", operator: "GTE", value: String(cutoffMs) },
            ],
          },
        ],
        properties: CALL_PROPS,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[hubspot-calls] search error (chunk skipped): ${msg}`);
      continue;
    }
    for (const c of results) callRecords.set(c.id, c);
  }

  // 4) aggregate per company
  for (const [companyId, callIds] of companyToCallIds) {
    let count = 0;
    let lastMs = 0;
    let lastIso: string | null = null;
    for (const cid of callIds) {
      const call = callRecords.get(String(cid));
      if (!call) continue;
      const ts = call.properties.hs_timestamp;
      const tsMs = ts ? Number(ts) : 0;
      if (!tsMs || tsMs < cutoffMs) continue;
      count += 1;
      if (tsMs > lastMs) {
        lastMs = tsMs;
        lastIso = new Date(tsMs).toISOString();
      }
    }
    if (count > 0) out.set(companyId, { call_count_30d: count, last_call_at: lastIso });
  }

  console.log(
    `[hubspot-calls] fetched 30d calls for ${out.size}/${hubspotCompanyIds.length} companies (${callRecords.size} call records scanned)`,
  );
  return out;
}
