// Phase 33.E.1.1 — debug endpoint for the health-card enrichment.
//
// Hits getHealthCardMap() in isolation and reports:
//   - map size (should be 900 if cache is reachable)
//   - any thrown error
//   - a 3-row sample of what's in the map
//
// Admin-only. Mounted at /admin/* (middleware admin-gates it).
// Remove this file after diagnosis.

import { NextRequest, NextResponse } from "next/server";
import { getApiUser, requireRole } from "@/lib/api-auth";
import { getHealthCardMap } from "@/lib/health-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getApiUser();
  const denied = requireRole(user, "admin");
  if (denied) return denied;

  try {
    const t0 = Date.now();
    const m = await getHealthCardMap();
    const elapsedMs = Date.now() - t0;

    const sample: Array<{ entity_id: string; health_tier: string | null; composite: number | null }> = [];
    let i = 0;
    for (const [k, v] of m.entries()) {
      if (i++ >= 3) break;
      sample.push({
        entity_id: k,
        health_tier: (v as any)?.health_tier ?? null,
        composite: (v as any)?.composite_health_score ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      map_size: m.size,
      elapsedMs,
      sample,
      env: {
        has_postgres_url: !!process.env.POSTGRES_URL,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.slice(0, 1000) : undefined,
      },
      { status: 500 },
    );
  }
}
