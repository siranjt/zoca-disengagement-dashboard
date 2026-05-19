import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { fetchAllLiveSubsWithEntityMap } from "@/lib/chargebee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 33.scope diagnostic v2 — isolate the cancelled-30d fetch
 * at THREE layers:
 *   1. Inline Chargebee call (independent — confirms API reachable)
 *   2. Production fetchAllLiveSubsWithEntityMap() (confirms lib/chargebee.ts
 *      runs the second pass correctly)
 *   3. (downstream is runStageA which we'll inspect separately if needed)
 *
 * Auth: same bearer as cron routes (CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const site = process.env.CHARGEBEE_SITE || "zoca";
  const key = process.env.CHARGEBEE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "CHARGEBEE_API_KEY env var is not set" },
      { status: 500 },
    );
  }

  const base = `https://${site}.chargebee.com/api/v2`;
  const authHeader = "Basic " + Buffer.from(`${key}:`).toString("base64");

  const cutoffSec = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const cutoffIso = new Date(cutoffSec * 1000).toISOString();
  const fetchedAtIso = new Date().toISOString();

  // ====================================================================
  // LAYER 1: inline cancelled fetch (proven in v1)
  // ====================================================================
  type Sub = {
    id?: string;
    customer_id?: string;
    cf_entity_id?: string;
    cancelled_at?: number;
    activated_at?: number;
    status?: string;
    recently_cancelled?: boolean;
  };

  const inlineSubs: Sub[] = [];
  {
    let offset: string | undefined;
    let pages = 0;
    try {
      do {
        const params = new URLSearchParams();
        params.set("limit", "100");
        params.set("status[is]", "cancelled");
        params.set("cancelled_at[after]", String(cutoffSec));
        if (offset) params.set("offset", offset);

        const res = await fetch(`${base}/subscriptions?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: authHeader },
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text();
          return NextResponse.json(
            {
              ok: false,
              stage: "inline_chargebee_fetch",
              httpStatus: res.status,
              error: text.slice(0, 300),
            },
            { status: 502 },
          );
        }
        const data = (await res.json()) as {
          list: { subscription: Sub }[];
          next_offset?: string;
        };
        for (const item of data.list || []) inlineSubs.push(item.subscription || {});
        offset = data.next_offset;
        pages++;
        if (pages > 10) break;
      } while (offset);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          stage: "inline_chargebee_exception",
          error: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  }

  const inlineDistinctEntities = new Set<string>();
  let inlineWithCfEntityId = 0;
  for (const s of inlineSubs) {
    if (s.cf_entity_id) {
      inlineWithCfEntityId++;
      inlineDistinctEntities.add(s.cf_entity_id);
    }
  }

  // ====================================================================
  // LAYER 2: PRODUCTION fetchAllLiveSubsWithEntityMap
  // (this confirms whether lib/chargebee.ts is running the second pass)
  // ====================================================================
  let prod: {
    totalSubs: number;
    recentlyCancelledCount: number;
    customerToEntitiesSize: number;
    distinctEntitiesAcrossMap: number;
    sampleRecentlyCancelled: Array<{
      subscription_id: string;
      customer_id: string;
      status: string;
      cancelled_at: string | null;
      activated_at: string | null;
    }>;
    error?: string;
  };

  try {
    const result = await fetchAllLiveSubsWithEntityMap();
    let recentlyCancelledCount = 0;
    const sampleRecentlyCancelled: any[] = [];
    for (const s of result.subs) {
      if ((s as any).recently_cancelled) {
        recentlyCancelledCount++;
        if (sampleRecentlyCancelled.length < 3) {
          sampleRecentlyCancelled.push({
            subscription_id: s.subscription_id || "",
            customer_id: s.customer_id || "",
            status: s.status || "",
            cancelled_at: (s as any).cancelled_at
              ? new Date((s as any).cancelled_at).toISOString()
              : null,
            activated_at: s.activated_at
              ? new Date(s.activated_at).toISOString()
              : null,
          });
        }
      }
    }
    let distinctEntitiesAcrossMap = 0;
    for (const [, eids] of result.customerToEntities) {
      distinctEntitiesAcrossMap += eids.length;
    }
    prod = {
      totalSubs: result.subs.length,
      recentlyCancelledCount,
      customerToEntitiesSize: result.customerToEntities.size,
      distinctEntitiesAcrossMap,
      sampleRecentlyCancelled,
    };
  } catch (e) {
    prod = {
      totalSubs: -1,
      recentlyCancelledCount: -1,
      customerToEntitiesSize: -1,
      distinctEntitiesAcrossMap: -1,
      sampleRecentlyCancelled: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    ok: true,
    fetchedAtIso,
    cutoffIso,
    inline: {
      totalSubs: inlineSubs.length,
      withCfEntityId: inlineWithCfEntityId,
      distinctEntities: inlineDistinctEntities.size,
    },
    prod,
    diagnosis: prod.recentlyCancelledCount === 0
      ? "BUG: prod fetchAllLiveSubsWithEntityMap returns ZERO recently_cancelled subs despite inline fetch returning " + inlineSubs.length + ". lib/chargebee.ts second-pass is not running on Vercel (build cache?) or output is being filtered."
      : prod.recentlyCancelledCount === inlineSubs.length
        ? "OK: prod fetch returns same count as inline. Bug is downstream in runStageA / composeSnapshot."
        : "PARTIAL: prod count (" + prod.recentlyCancelledCount + ") differs from inline (" + inlineSubs.length + "). Some dedupe or filter in lib/chargebee.ts is dropping rows.",
  });
}

export const POST = GET;
