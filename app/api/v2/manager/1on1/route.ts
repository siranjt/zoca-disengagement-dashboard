import { NextResponse } from "next/server";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { readLastOneOnOneDatesByAm, type OneOnOneAmSummary } from "@/lib/one-on-one";
import { ACTIVE_AMS, POD_MAP } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v2/manager/1on1
 *
 * Returns one summary row per ACTIVE_AM for the 1:1 picker page:
 *   am_name, pod, last_one_on_one_date, red_count, mrr_at_risk_cents
 *
 * Read-only over the latest snapshot + one_on_one_log.
 */
export async function GET() {
  try {
    const snap = await readLatestSnapshotV2();
    const lastDates = await readLastOneOnOneDatesByAm();

    const byAm = new Map<string, { red: number; mrr: number }>();
    if (snap) {
      for (const c of snap.customers || []) {
        if (!c?.am_name) continue;
        if (c.signals_v2?.stoplight !== "RED") continue;
        const cur = byAm.get(c.am_name) ?? { red: 0, mrr: 0 };
        cur.red += 1;
        cur.mrr += Math.round((c.plan_amount || 0) * 100);
        byAm.set(c.am_name, cur);
      }
    }

    const ams: OneOnOneAmSummary[] = ACTIVE_AMS.map((am) => {
      const agg = byAm.get(am) ?? { red: 0, mrr: 0 };
      return {
        am_name: am,
        pod: POD_MAP[am] ?? null,
        last_one_on_one_date: lastDates.get(am) ?? null,
        red_count: agg.red,
        mrr_at_risk_cents: agg.mrr,
      };
    });

    // Default sort: most RED first, then by MRR at risk desc, then name asc.
    ams.sort((a, b) => {
      if (b.red_count !== a.red_count) return b.red_count - a.red_count;
      if (b.mrr_at_risk_cents !== a.mrr_at_risk_cents) {
        return b.mrr_at_risk_cents - a.mrr_at_risk_cents;
      }
      return a.am_name.localeCompare(b.am_name);
    });

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      ams,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, ams: [] }, { status: 500 });
  }
}
