"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScoredCustomerV2 } from "@/lib/types";
import {
  type UnifiedTicket,
  groupTicketsByPipeline,
  priorityColor,
  sortTickets,
  statusColor,
} from "@/lib/tickets-unified";
import { buildHubspotCompanyUrl, buildMailto } from "@/lib/contact-links";

type Props = {
  customer: ScoredCustomerV2;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      tickets: UnifiedTicket[];
      errors: { hubspot?: string; linear?: string };
      fetchedAt: string;
      hubspotCompanyId: string | null;
    };

/**
 * Phase 31 — Rich tickets panel.
 *
 * Replaces the Phase 28 stub (which showed only BaseSheet counts) with a live
 * fetch of HubSpot Service Hub + Linear "customer request" tickets via
 * `/api/v2/customer/:entityId/tickets`. Tickets are grouped by pipeline, sorted
 * by priority within each group, and rendered with priority + status chips.
 *
 * Closed tickets (last 30 days) are still shown but dimmed.
 */
function V2TicketsPanel({ customer }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/v2/customer/${encodeURIComponent(customer.entity_id)}/tickets`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        setState({ kind: "error", message: `${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        tickets?: UnifiedTicket[];
        errors?: { hubspot?: string; linear?: string };
        fetched_at?: string;
        hubspot_company_id?: string | null;
      };
      setState({
        kind: "ready",
        tickets: Array.isArray(json.tickets) ? json.tickets : [],
        errors: json.errors ?? {},
        fetchedAt: json.fetched_at ?? new Date().toISOString(),
        hubspotCompanyId: json.hubspot_company_id ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", message: msg });
    }
  }, [customer.entity_id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section
      id="tickets"
      className="rounded-zoca-lg border border-zoca-border bg-white p-4 md:p-5"
      aria-label="Tickets"
    >
      <Header
        state={state}
        hubspotCompanyId={
          state.kind === "ready"
            ? state.hubspotCompanyId
            : (customer.hubspot?.hubspot_company_id ?? null)
        }
        onReload={load}
      />

      {state.kind === "loading" && <LoadingBody />}

      {state.kind === "error" && (
        <ErrorBody message={state.message} onRetry={load} />
      )}

      {state.kind === "ready" && (
        <ReadyBody
          tickets={state.tickets}
          errors={state.errors}
          fetchedAt={state.fetchedAt}
        />
      )}
    </section>
  );
}

export default V2TicketsPanel;

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  state,
  hubspotCompanyId,
  onReload,
}: {
  state: FetchState;
  hubspotCompanyId: string | null;
  onReload: () => void;
}) {
  const summary = useMemo(() => {
    if (state.kind !== "ready") return null;
    const open = state.tickets.filter((t) => !t.is_closed);
    const urgent = open.filter((t) => t.priority === "URGENT").length;
    const stale = open.filter((t) => t.is_stale).length;
    return { openCount: open.length, urgent, stale };
  }, [state]);

  const ticketsUrl = hubspotCompanyId
    ? `${buildHubspotCompanyUrl(hubspotCompanyId)}/tickets`
    : null;

  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zoca-text-2">
          Tickets
        </h3>
        {summary && summary.openCount > 0 && (
          <span className="text-[12px] text-zoca-text-2">
            {summary.openCount} open
            {summary.urgent > 0 && (
              <>
                {" · "}
                <span className="text-rose-700 font-medium">
                  {summary.urgent} urgent
                </span>
              </>
            )}
            {summary.stale > 0 && (
              <>
                {" · "}
                <span className="text-amber-700">
                  {summary.stale} unresolved &gt;7d
                </span>
              </>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          className="text-[11px] font-medium text-zoca-text-2 hover:text-zoca-pink-cta transition-colors"
          title="Re-fetch tickets from HubSpot + Linear"
        >
          Reload
        </button>
        {ticketsUrl && (
          <a
            href={ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-zoca-pink-cta hover:underline"
            title="Open this company's tickets in HubSpot"
          >
            Open all in HubSpot →
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / error / empty states
// ---------------------------------------------------------------------------

function LoadingBody() {
  return (
    <div className="space-y-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[68px] rounded-zoca-md bg-zoca-bg-tint animate-pulse"
        />
      ))}
    </div>
  );
}

function ErrorBody({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-zoca-md border border-rose-500/30 bg-rose-50 p-3 text-[12px] text-rose-700">
      <div className="font-medium">Failed to load tickets</div>
      <div className="mt-1 opacity-90">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-zoca-pill bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyBody() {
  return (
    <div className="rounded-zoca-md border border-dashed border-zoca-border p-4 text-center text-[12px] text-zoca-text-2">
      No tickets found in HubSpot or Linear in the last 30 days.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ready body — pipeline groups + rows
// ---------------------------------------------------------------------------

function ReadyBody({
  tickets,
  errors,
  fetchedAt,
}: {
  tickets: UnifiedTicket[];
  errors: { hubspot?: string; linear?: string };
  fetchedAt: string;
}) {
  if (tickets.length === 0) {
    return (
      <>
        <EmptyBody />
        <SourceErrors errors={errors} />
        <Footer count={0} total={0} fetchedAt={fetchedAt} />
      </>
    );
  }
  const sorted = sortTickets(tickets);
  const groups = groupTicketsByPipeline(sorted);
  const groupKeys = Object.keys(groups);
  return (
    <>
      <SourceErrors errors={errors} />
      <div className="space-y-3">
        {groupKeys.map((key) => {
          const items = groups[key];
          const openCount = items.filter((t) => !t.is_closed).length;
          const collapsedByDefault = items.length > 5;
          return (
            <details
              key={key}
              {...(collapsedByDefault ? {} : { open: true })}
              className="rounded-zoca-md border border-zoca-border bg-white"
            >
              <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-zoca-text">
                  {key}{" "}
                  <span className="font-normal text-zoca-text-2">
                    · {openCount} open · {items.length} total
                  </span>
                </span>
                <span className="text-[11px] text-zoca-text-2">▾</span>
              </summary>
              <ul className="border-t border-zoca-border divide-y divide-zoca-border">
                {items.map((t) => (
                  <li key={`${t.source}:${t.id}`}>
                    <TicketRow ticket={t} />
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <Footer count={tickets.length} total={tickets.length} fetchedAt={fetchedAt} />
    </>
  );
}

function SourceErrors({ errors }: { errors: { hubspot?: string; linear?: string } }) {
  if (!errors.hubspot && !errors.linear) return null;
  return (
    <div className="mb-3 space-y-1">
      {errors.hubspot && (
        <div className="rounded-zoca-md border border-amber-500/30 bg-amber-50 p-2 text-[11px] text-amber-800">
          HubSpot fetch failed: {errors.hubspot}
        </div>
      )}
      {errors.linear && (
        <div className="rounded-zoca-md border border-amber-500/30 bg-amber-50 p-2 text-[11px] text-amber-800">
          Linear fetch failed: {errors.linear}
        </div>
      )}
    </div>
  );
}

function Footer({
  count,
  total,
  fetchedAt,
}: {
  count: number;
  total: number;
  fetchedAt: string;
}) {
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 1000));
  return (
    <div className="mt-3 flex items-center justify-between text-[10px] text-zoca-text-2">
      <span>
        Showing {count} of {total} · last 30 days
      </span>
      <span>Refreshed {sec}s ago</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket row
// ---------------------------------------------------------------------------

function TicketRow({ ticket }: { ticket: UnifiedTicket }) {
  const pri = priorityColor(ticket.priority);
  const st = statusColor(ticket.status);
  const dimmed = ticket.is_closed;
  return (
    <div
      className={`grid grid-cols-[auto,1fr,auto] items-start gap-3 px-3 py-2.5 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      {/* Priority pill */}
      <span
        className={`mt-0.5 rounded-zoca-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pri.bg} ${pri.fg}`}
        title={`Priority: ${pri.label}`}
      >
        {pri.label}
      </span>

      {/* Title + meta */}
      <div className="min-w-0">
        <a
          href={ticket.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[13px] font-medium hover:text-zoca-pink-cta transition-colors ${
            dimmed ? "line-through" : ""
          }`}
        >
          {ticket.title}{" "}
          <span aria-hidden className="opacity-70">↗</span>
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zoca-text-2">
          <span
            className={`rounded-zoca-pill px-1.5 py-0.5 font-medium ${st.bg} ${st.fg}`}
          >
            {ticket.status_label}
          </span>
          {ticket.owner_name && (
            <span>
              {ticket.owner_email ? (
                <a
                  href={buildMailto(ticket.owner_email)}
                  className="hover:text-zoca-pink-cta transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ticket.owner_name}
                </a>
              ) : (
                ticket.owner_name
              )}
            </span>
          )}
          <span>
            {ticket.age_days}d old
            {ticket.last_updated_at && (
              <>
                {" · "}
                last touched {daysAgo(ticket.last_updated_at)}d ago
              </>
            )}
          </span>
          {ticket.is_stale && (
            <span className="rounded-zoca-pill bg-amber-500/18 px-1.5 py-0.5 font-medium text-amber-700">
              stale &gt;7d
            </span>
          )}
        </div>
      </div>

      {/* Source chip */}
      <span
        className={`mt-0.5 rounded-zoca-pill px-2 py-0.5 text-[10px] font-medium ${
          ticket.source === "hubspot"
            ? "bg-orange-500/18 text-orange-700"
            : "bg-violet-500/18 text-violet-700"
        }`}
        title={`Source: ${ticket.source === "hubspot" ? "HubSpot Service Hub" : "Linear"}`}
      >
        {ticket.source === "hubspot" ? "HubSpot" : "Linear"}
      </span>
    </div>
  );
}

function daysAgo(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}
