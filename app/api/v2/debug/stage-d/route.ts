import { NextResponse } from "next/server";
import {
  readAllPipelineStages,
  todaySnapshotDate,
} from "@/lib/pipeline-state";
import type { StageDData } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Phase 14.2 debug — inspect current Stage D payload shape.
 * Returns counts of each major Stage D field so we can see whether
 * fetchers succeeded silently or returned empty data.
 */
export async function GET() {
  try {
    const stages = await readAllPipelineStages(todaySnapshotDate());
    const stageD = (stages?.d?.data as StageDData | undefined) ?? null;
    if (!stageD) {
      return NextResponse.json({
        ok: false,
        error: "No Stage D in pipeline_state. Run Stage D first.",
      });
    }
    return NextResponse.json({
      ok: true,
      generatedAt: stages?.d?.generatedAt || null,
      counts: {
        companies: Object.keys(stageD.companiesByPlaceId ?? {}).length,
        deals: Object.keys(stageD.dealsByHubspotCompanyId ?? {}).length,
        notes: Object.keys(stageD.notesByHubspotCompanyId ?? {}).length,
        calls: Object.keys(stageD.callsByHubspotCompanyId ?? {}).length,
        contacts: Object.keys(stageD.contactsByHubspotCompanyId ?? {}).length,
      },
      hasNewFields: {
        callsByHubspotCompanyId:
          stageD.callsByHubspotCompanyId !== undefined,
        contactsByHubspotCompanyId:
          stageD.contactsByHubspotCompanyId !== undefined,
      },
      sampleKeys: {
        firstCompanyPlaceId:
          Object.keys(stageD.companiesByPlaceId ?? {})[0] || null,
        firstHubspotCompanyId:
          Object.keys(stageD.dealsByHubspotCompanyId ?? {})[0] || null,
      },
      diagnostics: stageD.diagnostics ?? null,
      stageErrors: stages?.d?.errors ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
