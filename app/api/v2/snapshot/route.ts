// Phase 33.D.3 — Snapshot route enriched with HubSpot Locations record id.
//
// Strategy: enrich at READ time, not at compose time. This avoids needing to
// regenerate the snapshot for every HubSpot Locations sync — the mapping
// changes more often than the snapshot does. Cost is one extra Postgres read
// (already cached for the page lifetime by the route handler).

import { NextRequest, NextResponse } from "next/server";
import { buildSnapshotV2 } from "@/lib/refresh";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { getLocationRecordIdMap } from "@/lib/hubspot-locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/v2/snapshot
 *   → latest v2 snapshot (from Postgres, or rebuilt if missing)
 *
 * GET /api/v2/snapshot?rebuild=1
 *   → forces a rebuild
 *
 * Phase 33.D.3 — each customer in the response now carries
 * `hubspot.hubspot_location_record_id` (when present in hubspot_location_mapping).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantRebuild = url.searchParams.get("rebuild") === "1";

  try {
    let snap = wantRebuild ? null : await readLatestSnapshotV2();
    if (!snap) {
      snap = await buildSnapshotV2();
    }

    // Phase 33.D.3 — enrich each customer with their HubSpot Locations record
    // id from the cached mapping table. Fire-and-forget on miss (entities
    // without a Locations record stay un-enriched and the card falls back to
    // plain text, same as before).
    try {
      const locMap = await getLocationRecordIdMap();
      if (locMap.size > 0 && Array.isArray(snap.customers)) {
        for (const c of snap.customers) {
          const eid = (c.entity_id || "").toLowerCase();
          const rec = locMap.get(eid);
          if (rec) {
            c.hubspot = c.hubspot || ({} as any);
            (c.hubspot as any).hubspot_location_record_id = rec;
          }
        }
      }
    } catch (e) {
      // Don't fail the snapshot if the location mapping read errors —
      // worst case the cards show plain biznames instead of links.
      console.warn(
        "[snapshot] could not enrich with HubSpot Locations mapping:",
        e instanceof Error ? e.message : String(e),
      );
    }

    return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
