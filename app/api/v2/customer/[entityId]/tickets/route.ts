import { NextRequest, NextResponse } from "next/server";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { fetchTicketsForCompany } from "@/lib/hubspot-tickets";
import { fetchLinearTicketsForCustomer } from "@/lib/linear-tickets";
import { sortTickets } from "@/lib/tickets-unified";
import type { UnifiedTicket } from "@/lib/tickets-unified";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v2/customer/:entityId/tickets
 *
 * Live tickets fetch for the customer detail page. Combines HubSpot Service
 * Hub tickets (filtered to the customer's HubSpot company id from the latest
 * snapshot) and Linear "customer request" issues matched to this customer by
 * the resolver in `lib/linear-tickets.ts`.
 *
 * Soft-fails per source: a failed Linear call doesn't block HubSpot results
 * and vice versa. Errors are returned in the `errors` object so the UI can
 * surface them inline.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const { entityId } = ctx.params;
  const fetched_at = new Date().toISOString();

  let hubspotCompanyId: string | null = null;
  let customer: import("@/lib/types").ScoredCustomerV2 | null = null;
  try {
    const snap = await readLatestSnapshotV2();
    if (snap?.customers) {
      const found = snap.customers.find((c) => c.entity_id === entityId);
      if (found) {
        customer = found;
        hubspotCompanyId = found.hubspot?.hubspot_company_id ?? null;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        entity_id: entityId,
        hubspot_company_id: null,
        tickets: [] as UnifiedTicket[],
        errors: { hubspot: `snapshot read failed: ${msg}` },
        fetched_at,
      },
      { status: 200 },
    );
  }

  if (!customer) {
    return NextResponse.json(
      {
        ok: false,
        entity_id: entityId,
        hubspot_company_id: null,
        tickets: [] as UnifiedTicket[],
        errors: { hubspot: "customer not found in latest snapshot" },
        fetched_at,
      },
      { status: 200 },
    );
  }

  const errors: { hubspot?: string; linear?: string } = {};
  const hubspotPromise = hubspotCompanyId
    ? fetchTicketsForCompany(hubspotCompanyId).catch((e: unknown) => {
        errors.hubspot = e instanceof Error ? e.message : String(e);
        return [] as UnifiedTicket[];
      })
    : Promise.resolve([] as UnifiedTicket[]);
  const linearPromise = fetchLinearTicketsForCustomer(customer).catch((e: unknown) => {
    errors.linear = e instanceof Error ? e.message : String(e);
    return [] as UnifiedTicket[];
  });
  const [hubspotTickets, linearTickets] = await Promise.all([hubspotPromise, linearPromise]);
  const merged = sortTickets([...hubspotTickets, ...linearTickets]);
  return NextResponse.json(
    {
      ok: true,
      entity_id: entityId,
      hubspot_company_id: hubspotCompanyId,
      tickets: merged,
      errors,
      fetched_at,
    },
    { status: 200 },
  );
}
