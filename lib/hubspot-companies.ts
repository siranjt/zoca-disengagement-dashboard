/**
 * Fetch all "active customer" companies from HubSpot, keyed by place_id.
 *
 * Filter: hs_current_customer === "yes" AND has a place_id.
 * Returns a Map<place_id, HubspotCompanyData> usable as the JOIN bridge
 * between the dashboard's entity_id (via Metabase's place_id column) and
 * the HubSpot company record.
 *
 * Used by Stage D to surface ICP tier, AM-owner mismatch, lifecycle drift,
 * business category, deal associations, and note associations.
 */

import { hubspotSearchAll, hubspotConfigured } from "./hubspot";

export type HubspotCompanyRow = {
  id: string;                       // HubSpot company ID
  place_id: string;                 // Google Place ID = join key to BaseSheet
  name: string;
  hubspot_owner_id: string | null;
  hubspot_owner_email?: string | null;
  icp_tier: "Tier 1" | "Tier 2" | "Tier 3" | null;
  lifecycle_stage: string;
  business_category: string | null;
  hs_current_customer: boolean;
  num_associated_deals: number;
  num_associated_contacts: number;
  custom_props: Record<string, string>;
};

type HubspotApiCompany = {
  id: string;
  properties: Record<string, string>;
};

const PROPS = [
  "name",
  "hubspot_owner_id",
  "hs_ideal_customer_profile",
  "lifecyclestage",
  "business_category",
  "hs_current_customer",
  "place_id",
  "num_associated_deals",
  "num_associated_contacts",
];

function parseIcp(v: string | undefined): HubspotCompanyRow["icp_tier"] {
  if (!v) return null;
  // Normalize: lowercase, strip spaces/underscores/hyphens. Handles
  // "TIER_1", "tier_1", "Tier 1", "tier-1", "1" — all → "tier1"
  const k = v.trim().toLowerCase().replace(/[\s_\-]/g, "");
  if (k === "tier1" || k === "1") return "Tier 1";
  if (k === "tier2" || k === "2") return "Tier 2";
  if (k === "tier3" || k === "3") return "Tier 3";
  return null;
}

/** Normalize a business name the same way Metabase BaseSheet does. */
export function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchActiveHubspotCompanies(): Promise<Map<string, HubspotCompanyRow>> {
  const out = new Map<string, HubspotCompanyRow>();
  if (!hubspotConfigured()) return out;

  const results = await hubspotSearchAll<HubspotApiCompany>("companies", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hs_current_customer", operator: "EQ", value: "yes" },
          { propertyName: "place_id", operator: "HAS_PROPERTY" },
        ],
      },
    ],
    properties: PROPS,
  });

  for (const row of results) {
    const p = row.properties || {};
    const placeId = (p.place_id || "").trim();
    if (!placeId) continue;
    const entry: HubspotCompanyRow = {
      id: row.id,
      place_id: placeId,
      name: p.name || "",
      hubspot_owner_id: p.hubspot_owner_id || null,
      icp_tier: parseIcp(p.hs_ideal_customer_profile),
      lifecycle_stage: p.lifecyclestage || "",
      business_category: p.business_category || null,
      hs_current_customer: (p.hs_current_customer || "").toLowerCase() === "yes",
      num_associated_deals: Number(p.num_associated_deals || 0),
      num_associated_contacts: Number(p.num_associated_contacts || 0),
      custom_props: {},
    };
    // De-dupe: if multiple HubSpot companies share a place_id, keep the
    // one with the highest num_associated_deals (likely the primary record)
    const prev = out.get(placeId);
    if (!prev || entry.num_associated_deals > prev.num_associated_deals) {
      out.set(placeId, entry);
    }
  }
  console.log(`[hubspot-companies] fetched ${results.length} rows, ${out.size} unique place_ids`);
  return out;
}

/**
 * Lookup map from HubSpot owner_id → owner email/name.
 * Used for AM-owner mismatch detection (compares to BaseSheet am_name).
 */
export async function fetchHubspotOwners(): Promise<Map<string, { email: string; name: string }>> {
  const map = new Map<string, { email: string; name: string }>();
  if (!hubspotConfigured()) return map;
  // Use the owners endpoint (not search)
  const { hubspotFetch } = await import("./hubspot");
  type OwnersResp = {
    results: Array<{
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }>;
    paging?: { next?: { after: string } };
  };
  let after: string | undefined;
  // Phase 13.3 — raised cap from 20 → 100 pages (handles teams up to 10K owners).
  for (let page = 0; page < 100; page += 1) {
    const path = `/crm/v3/owners${after ? `?after=${after}&limit=100` : "?limit=100"}`;
    const resp = await hubspotFetch<OwnersResp>(path, { timeoutMs: 8_000 });
    if (!resp?.results) break;
    for (const o of resp.results) {
      const name = `${o.firstName || ""} ${o.lastName || ""}`.trim();
      map.set(o.id, { email: o.email || "", name });
    }
    if (!resp.paging?.next?.after) break;
    after = resp.paging.next.after;
  }
  return map;
}
