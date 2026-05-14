import { NextRequest, NextResponse } from "next/server";
import { readSnapshot, writeSnapshot } from "@/lib/store";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { buildSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/snapshot
 *   → returns the latest scored snapshot from KV (or the in-memory fallback).
 *
 * GET /api/snapshot?rebuild=1
 *   → forces an on-demand rebuild (useful when KV is empty, e.g. first deploy).
 *     Still respects the shared Basic Auth gate from middleware.ts.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantRebuild = url.searchParams.get("rebuild") === "1";

  try {
    let snap = await readSnapshot();
    // Phase 1.1: prefer Postgres v2 snapshot (downcast to v1 shape) if available
    if (!snap && !wantRebuild) {
      const v2 = await readLatestSnapshotV2();
      if (v2) {
        snap = {
          generatedAt: v2.generatedAt,
          todayIso: v2.todayIso,
          totalActive: v2.totalActive,
          tierCounts: v2.tierCounts,
          signalCounts: v2.signalCounts,
          channelCounts: v2.channelCounts,
          amExposure: v2.amExposure,
          amTierBreakdown: v2.amTierBreakdown,
          scoreDistribution: v2.scoreDistribution,
          customers: v2.customers.map((c: any) => ({
            customer_id: c.customer_id, entity_id: c.entity_id, subscription_id: c.subscription_id,
            company: c.company, email: c.email, phone: c.phone,
            am_name: c.am_name, ae_name: c.ae_name, sp_name: c.sp_name,
            cb_status: c.cb_status, auto_collection: c.auto_collection, plan_amount: c.plan_amount,
            mrr_basesheet: c.mrr_basesheet, zoca_status: c.zoca_status, churn_potential_flag: c.churn_potential_flag,
            activated_at: c.activated_at, ob_date: c.ob_date, match_source: c.match_source, in_chrone: c.in_chrone,
            metrics: c.metrics, signals: c.signals,
          })),
          stats: v2.stats, health: v2.health, errors: v2.errors,
        };
        await writeSnapshot(snap);  // also warm the in-memory cache
      }
    }
    if (!snap || wantRebuild) {
      snap = await buildSnapshot();
      await writeSnapshot(snap);
    }
    return NextResponse.json(snap, {
      headers: {
        // Tell the browser not to cache — the page always asks for fresh.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
