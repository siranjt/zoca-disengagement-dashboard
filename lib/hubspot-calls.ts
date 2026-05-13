/**
 * Fetch HubSpot call engagement counts per company for the last 30 days.
 *
 * Phase 14.3: switched from associations-API to a direct search of the
 * /crm/v3/objects/calls endpoint with associations.companies expansion.
 * The previous /crm/v4/associations/companies/calls path returned 0
 * results on this portal — likely because the association object type
 * name differs per account (HubSpot Pro vs Enterprise) or because the
 * portal doesn't index that join. Searching calls directly is
 * symmetrical and works regardless of the association direction's
 * indexing.
 *
 * Returns per-company { call_count_30d, last_call_at } so the compose
 * stage can compare HubSpot's logged calls against Metabase's phone CSV
 * and surface a "comms drift" hygiene flag.
 *
 * HubSpot's `calls` object exists in newer accounts. If the search fails
 * (404 / object type not found), we log the error and return an empty
 * Map — Stage D must not crash because the optional calls endpoint
 * isn't available.
 */

import { hubspotSearchAll, hubspotConfigured } from "./hubspot";

export type CallsForCompany = {
  call_count_30d: number;
  last_call_at: string | null;
};

const CALL_PROPS = [
  "hs_timestamp",
  "hs_call_duration",
  "hs_call_direction",
  "hs_call_disposition",
  "hubspot_owner_id",
];

type HubspotApiCall = {
  id: string;
  properties: Record<string, string>;
  associations?: { companies?: { results?: Array<{ id: string }> } };
};

export async function fetchCallsForCompanies(
  hubspotCompanyIds: string[],
): Promise<Map<string, CallsForCompany>> {
  const out = new Map<string, CallsForCompany>();
  if (!hubspotConfigured() || !hubspotCompanyIds.length) return out;

  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  try {
    // Search ALL calls in the last 30d, then group by associated company.
    // hubspotSearchAll's `body` arg is Record<string, unknown> so the
    // `associations` field passes through to the HubSpot API unmodified.
    const calls = await hubspotSearchAll<HubspotApiCall>("calls", {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_timestamp", operator: "GTE", value: String(cutoffMs) },
          ],
        },
      ],
      properties: CALL_PROPS,
      associations: ["companies"],
    });

    console.log(`[hubspot-calls] search returned ${calls.length} calls in last 30d`);

    // Build company_id -> call_aggregate map.
    const companyIdSet = new Set(hubspotCompanyIds.map(String));
    let attributedCount = 0;
    for (const call of calls) {
      const tsMs = Number(call.properties?.hs_timestamp || 0);
      if (!tsMs || tsMs < cutoffMs) continue;
      const assocs = call.associations?.companies?.results ?? [];

      for (const assoc of assocs) {
        const cid = String(assoc.id);
        if (!companyIdSet.has(cid)) continue; // not one of our customers
        attributedCount += 1;

        const existing = out.get(cid);
        if (existing) {
          existing.call_count_30d += 1;
          const existingMs = existing.last_call_at ? Date.parse(existing.last_call_at) : 0;
          if (tsMs > existingMs) {
            existing.last_call_at = new Date(tsMs).toISOString();
          }
        } else {
          out.set(cid, {
            call_count_30d: 1,
            last_call_at: new Date(tsMs).toISOString(),
          });
        }
      }
    }

    console.log(
      `[hubspot-calls] attributed ${attributedCount} calls to ${out.size}/${hubspotCompanyIds.length} companies`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[hubspot-calls] search failed: ${msg}`);
  }

  return out;
}
