import { NextRequest, NextResponse } from "next/server";
import { pruneOldSnapshots } from "@/lib/postgres";
import { prunePipelineStateOlderThan } from "@/lib/pipeline-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/prune
 *   → Bearer-authed cron job that deletes snapshot rows older than the
 *     retention window (SNAPSHOT_RETENTION_DAYS, default 90).
 *     Scheduled in vercel.json at 00:30 UTC daily.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const ok =
    (secret && auth === `Bearer ${secret}`) ||
    (!secret && !!req.headers.get("x-vercel-cron"));
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const [snapshotsDeleted, pipelineStateDeleted] = await Promise.all([
      pruneOldSnapshots(),
      // Keep 7 days of stage data — once a snapshot is composed and persisted,
      // the per-stage pipeline_state rows are only useful for debugging recent
      // failures. 7 days is enough headroom for a missed run + investigation.
      prunePipelineStateOlderThan(7),
    ]);
    return NextResponse.json({
      ok: true,
      snapshotsDeleted,
      pipelineStateDeleted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const POST = GET;
