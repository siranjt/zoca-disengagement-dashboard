/**
 * Phase 31 — Unified ticket model.
 *
 * Both HubSpot Service Hub and Linear ticket adapters produce values of the
 * `UnifiedTicket` shape below. The customer-detail panel, customer-card chip,
 * and 1:1 prep talking points all consume tickets via this unified shape so
 * neither vendor's API leaks into the UI layer.
 *
 * Pure module — no I/O. Safe to import from anywhere (client or server).
 */

export type TicketSource = "hubspot" | "linear";

export type TicketPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "UNSET";

export type TicketStatus =
  | "new"
  | "open"
  | "in_progress"
  | "waiting_on_us"
  | "waiting_on_customer"
  | "triage"
  | "backlog"
  | "todo"
  | "closed_resolved"
  | "closed_unresolved"
  | "unknown";

export type UnifiedTicket = {
  source: TicketSource;
  id: string;
  title: string;
  status: TicketStatus;
  status_label: string;
  priority: TicketPriority;
  owner_name: string | null;
  owner_email: string | null;
  pipeline: string | null;
  created_at: string;
  last_updated_at: string;
  closed_at: string | null;
  url: string;
  age_days: number;
  is_stale: boolean;
  is_closed: boolean;
};

// ---------------------------------------------------------------------------
// Sort + grouping helpers
// ---------------------------------------------------------------------------

export function prioritySortKey(p: TicketPriority): number {
  switch (p) {
    case "URGENT":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    case "UNSET":
    default:
      return 4;
  }
}

// ---------------------------------------------------------------------------
// Color tokens — Tailwind utility class triples + human-readable label.
// `bg`/`fg` are Tailwind class fragments designed to drop into a chip span.
// ---------------------------------------------------------------------------

export function priorityColor(
  p: TicketPriority,
): { bg: string; fg: string; label: string } {
  switch (p) {
    case "URGENT":
      return { bg: "bg-rose-500/18", fg: "text-rose-700", label: "Urgent" };
    case "HIGH":
      return { bg: "bg-amber-500/18", fg: "text-amber-700", label: "High" };
    case "MEDIUM":
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Medium" };
    case "LOW":
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Low" };
    case "UNSET":
    default:
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "—" };
  }
}

export function statusColor(
  s: TicketStatus,
): { bg: string; fg: string; label: string } {
  switch (s) {
    case "new":
      return { bg: "bg-sky-500/18", fg: "text-sky-700", label: "New" };
    case "open":
      return { bg: "bg-sky-500/18", fg: "text-sky-700", label: "Open" };
    case "in_progress":
      return { bg: "bg-violet-500/18", fg: "text-violet-700", label: "In progress" };
    case "waiting_on_us":
      return { bg: "bg-amber-500/18", fg: "text-amber-700", label: "Waiting on us" };
    case "waiting_on_customer":
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Waiting on customer" };
    case "triage":
      return { bg: "bg-rose-500/18", fg: "text-rose-700", label: "Triage" };
    case "backlog":
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Backlog" };
    case "todo":
      return { bg: "bg-sky-500/18", fg: "text-sky-700", label: "Todo" };
    case "closed_resolved":
      return { bg: "bg-emerald-500/18", fg: "text-emerald-700", label: "Resolved" };
    case "closed_unresolved":
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Closed" };
    case "unknown":
    default:
      return { bg: "bg-zoca-bg-tint", fg: "text-zoca-text-2", label: "Unknown" };
  }
}

/**
 * Sort tickets: open first (priority ascending — URGENT before LOW), with
 * older creation date breaking ties; closed tickets at the end, most-recently-
 * closed first.
 */
export function sortTickets(tickets: UnifiedTicket[]): UnifiedTicket[] {
  const copy = tickets.slice();
  copy.sort((a, b) => {
    if (a.is_closed !== b.is_closed) return a.is_closed ? 1 : -1;
    if (!a.is_closed && !b.is_closed) {
      const pa = prioritySortKey(a.priority);
      const pb = prioritySortKey(b.priority);
      if (pa !== pb) return pa - pb;
      return (a.age_days ?? 0) > (b.age_days ?? 0) ? -1 : 1;
    }
    // both closed — recency desc
    const ca = a.closed_at ? Date.parse(a.closed_at) : 0;
    const cb = b.closed_at ? Date.parse(b.closed_at) : 0;
    return cb - ca;
  });
  return copy;
}

/**
 * Group tickets by `pipeline` (falling back to a per-source bucket if pipeline
 * is null). Order of insertion preserved — callers can render the resulting
 * record in entry order.
 */
export function groupTicketsByPipeline(
  tickets: UnifiedTicket[],
): Record<string, UnifiedTicket[]> {
  const groups: Record<string, UnifiedTicket[]> = {};
  for (const t of tickets) {
    const key =
      t.pipeline ||
      (t.source === "linear" ? "Linear" : t.source === "hubspot" ? "HubSpot" : "Other");
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}
