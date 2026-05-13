import { NextResponse } from "next/server";
import { hubspotSearchAll, hubspotConfigured } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Phase 13.3 — temporary debug route to inspect raw HubSpot data.
 * Returns 3 sample "active customer" companies with their full property bag.
 * Used to diagnose ICP and AM-drift wiring (Phase 13.3).
 *
 * Safe to remove after ICP/AM-drift validation is complete.
 */
export async function GET() {
  if (!hubspotConfigured()) {
    return NextResponse.json(
      { error: "HUBSPOT_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }
  try {
    // Pull a wider property set — anything ICP / owner / AM-related
    const props = [
      "name",
      "hubspot_owner_id",
      "hs_ideal_customer_profile",
      "lifecyclestage",
      "business_category",
      "hs_current_customer",
      "place_id",
      "num_associated_deals",
      "num_associated_contacts",
      "createdate",
      "hs_lastmodifieddate",
      // Common Zoca/CS custom property guesses — return whatever exists:
      "icp_tier",
      "ideal_customer_profile",
      "account_manager",
      "am_name",
      "am_email",
      "cs_owner",
      "customer_success_owner",
    ];
    const rows = await hubspotSearchAll<{
      id: string;
      properties: Record<string, string | null>;
    }>("companies", {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_current_customer", operator: "EQ", value: "yes" },
            { propertyName: "place_id", operator: "HAS_PROPERTY" },
          ],
        },
      ],
      properties: props,
      // limit isn't a real hubspot field — hubspotSearchAll handles pagination.
      // We slice to 3 below.
    });
    return NextResponse.json({
      sampleSize: Math.min(rows.length, 3),
      totalAvailable: rows.length,
      sample: rows.slice(0, 3).map((r) => ({
        id: r.id,
        properties: r.properties,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
