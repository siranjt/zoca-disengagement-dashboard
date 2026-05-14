/**
 * Phase 31 — Linear adapter for customer-tagged issues.
 *
 * Pulls every Linear issue with the label "customer request" (state.type IN
 * triage/backlog/unstarted/started, plus completed/canceled in the last
 * TICKETS_RECENT_CLOSED_DAYS days), then maps each to the unified ticket
 * shape and matches them to Zoca customers via a best-effort resolver.
 *
 * Customer matching is the Phase 31 fallback strategy. We check, in order:
 *   1) a structured marker in the issue's description ("entity_id: <uuid>" or
 *      "customer_id: <handle>") — exact match;
 *   2) a label of the form "customer:<slug>" where slug is the kebab-cased
 *      bizname;
 *   3) bizname substring in the issue title;
 *   4) bizname substring in the description.
 *
 * When the team adopts a single convention, only `resolveCustomerForLinearIssue`
 * needs to change. The fetcher caches the full label-scoped issue list for 60s
 * so back-to-back per-customer fetches don't re-query Linear.
 *
 * Soft-fails to `[]` everywhere — missing LINEAR_API_KEY, network error,
 * Linear-side error, or no matches all produce an empty array, never throw.
 */

import { TICKETS_STALE_DAYS, TICKETS_RECENT_CLOSED_DAYS } from "./config";
import type {
  UnifiedTicket,
  TicketStatus,
  TicketPriority,
} from "./tickets-unified";
import type { ScoredCustomerV2 } from "./types";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

export function linearConfigured(): boolean {
  return !!process.env.LINEAR_API_KEY;
}

// ---------------------------------------------------------------------------
// Local types — Linear GraphQL response shape (slim).
// ---------------------------------------------------------------------------

type LinearStateType =
  | "triage"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string; type: LinearStateType } | null;
  priority: number | null;
  priorityLabel: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  url: string;
  assignee: { name: string | null; email: string | null } | null;
  team: { name: string | null } | null;
  labels: { nodes: Array<{ name: string }> } | null;
};

type LinearGraphqlResponse = {
  data?: {
    issues?: {
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      nodes?: LinearIssue[];
    };
  };
  errors?: unknown;
};

// ---------------------------------------------------------------------------
// Resolver — best-effort customer matching.
// ---------------------------------------------------------------------------

type ResolveStrategy = "custom_field" | "label" | "title_match" | "description_match";

export function resolveCustomerForLinearIssue(
  issue: LinearIssue,
  customer: ScoredCustomerV2,
): { matched: boolean; strategy: ResolveStrategy | null } {
  // Strategy 1: structured marker in description.
  if (issue.description) {
    const eidMatch = issue.description.match(/entity[_-]?id:\s*([a-f0-9-]{36})/i);
    if (eidMatch && eidMatch[1].toLowerCase() === customer.entity_id.toLowerCase()) {
      return { matched: true, strategy: "custom_field" };
    }
    const cidMatch = issue.description.match(/customer[_-]?id:\s*([a-z0-9_-]+)/i);
    if (cidMatch && customer.customer_id && cidMatch[1] === customer.customer_id) {
      return { matched: true, strategy: "custom_field" };
    }
  }

  // Strategy 2: customer:<slug> label.
  const customerLabel = issue.labels?.nodes?.find((l) =>
    l.name.toLowerCase().startsWith("customer:"),
  );
  if (customerLabel) {
    const slug = customerLabel.name.slice("customer:".length).toLowerCase();
    const bizSlug = (customer.company || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug && slug === bizSlug) return { matched: true, strategy: "label" };
  }

  // Strategy 3 + 4: bizname substring in title/description.
  const biznameNormalized = (customer.company || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (biznameNormalized && biznameNormalized.length >= 3) {
    if (issue.title.toLowerCase().includes(biznameNormalized)) {
      return { matched: true, strategy: "title_match" };
    }
    if (issue.description?.toLowerCase().includes(biznameNormalized)) {
      return { matched: true, strategy: "description_match" };
    }
  }

  return { matched: false, strategy: null };
}

// ---------------------------------------------------------------------------
// GraphQL fetcher (paginated, soft-failing).
// ---------------------------------------------------------------------------

const ISSUES_QUERY = `
query CustomerRequestIssues($cursor: String) {
  issues(
    first: 100
    after: $cursor
    filter: {
      labels: { name: { eq: "customer request" } }
    }
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      title
      description
      state { name type }
      priority
      priorityLabel
      createdAt
      updatedAt
      completedAt
      canceledAt
      url
      assignee { name email }
      team { name }
      labels { nodes { name } }
    }
  }
}
`;

async function graphqlOnce(cursor: string | null): Promise<LinearGraphqlResponse | null> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        // Linear API keys do NOT use the Bearer prefix.
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: ISSUES_QUERY, variables: { cursor } }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      console.warn(`[linear] ${res.status} on issues query: ${text.slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as LinearGraphqlResponse;
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[linear] graphql error: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 60s in-memory cache of the full label-scoped issue list. Avoids re-querying
// Linear when many customers fetch tickets back-to-back during a snapshot or
// during multiple per-customer route calls in quick succession.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;
let cache: { issues: LinearIssue[]; at: number } | null = null;

async function loadAllCustomerRequestIssues(): Promise<LinearIssue[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.issues;
  if (!linearConfigured()) {
    cache = { issues: [], at: Date.now() };
    return cache.issues;
  }
  const out: LinearIssue[] = [];
  let cursor: string | null = null;
  // Hard cap at 50 pages * 100 = 5000 issues to bound any runaway pagination.
  for (let page = 0; page < 50; page += 1) {
    const resp = await graphqlOnce(cursor);
    if (!resp || resp.errors || !resp.data?.issues) break;
    const nodes = resp.data.issues.nodes ?? [];
    out.push(...nodes);
    const pi = resp.data.issues.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    cursor = pi.endCursor;
  }
  cache = { issues: out, at: Date.now() };
  return out;
}

// ---------------------------------------------------------------------------
// Mapping: Linear issue → UnifiedTicket
// ---------------------------------------------------------------------------

function mapState(issue: LinearIssue, now: number): TicketStatus {
  const stateType = issue.state?.type;
  const completedMs = issue.completedAt ? Date.parse(issue.completedAt) : 0;
  const canceledMs = issue.canceledAt ? Date.parse(issue.canceledAt) : 0;
  if (stateType === "completed") return "closed_resolved";
  if (stateType === "canceled") return "closed_unresolved";
  if (stateType === "triage") return "triage";
  if (stateType === "backlog") return "backlog";
  if (stateType === "unstarted") return "todo";
  if (stateType === "started") return "in_progress";
  void completedMs;
  void canceledMs;
  void now;
  return "unknown";
}

function mapPriority(priority: number | null): TicketPriority {
  // Linear: 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low
  switch (priority) {
    case 1:
      return "URGENT";
    case 2:
      return "HIGH";
    case 3:
      return "MEDIUM";
    case 4:
      return "LOW";
    case 0:
    case null:
    default:
      return "UNSET";
  }
}

function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function inRetention(issue: LinearIssue, now: number): boolean {
  const t = issue.state?.type;
  if (!t) return false;
  if (t === "triage" || t === "backlog" || t === "unstarted" || t === "started") return true;
  const endIso = t === "completed" ? issue.completedAt : t === "canceled" ? issue.canceledAt : null;
  if (!endIso) return false;
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return false;
  return now - endMs <= TICKETS_RECENT_CLOSED_DAYS * 86_400_000;
}

function toUnified(issue: LinearIssue, now: number): UnifiedTicket | null {
  const stateType = issue.state?.type;
  if (!stateType) return null;
  const isClosed = stateType === "completed" || stateType === "canceled";
  const closedAt =
    stateType === "completed"
      ? issue.completedAt
      : stateType === "canceled"
        ? issue.canceledAt
        : null;
  const createdMs = Date.parse(issue.createdAt);
  const ageDays = Number.isFinite(createdMs) ? daysBetween(createdMs, now) : 0;
  return {
    source: "linear",
    id: issue.identifier || issue.id,
    title: issue.title || `Issue ${issue.identifier}`,
    status: mapState(issue, now),
    status_label: issue.state?.name || "Unknown",
    priority: mapPriority(issue.priority),
    owner_name: issue.assignee?.name ?? null,
    owner_email: issue.assignee?.email ?? null,
    pipeline: issue.team?.name ? `Linear · ${issue.team.name}` : "Linear",
    created_at: issue.createdAt,
    last_updated_at: issue.updatedAt,
    closed_at: closedAt,
    url: issue.url,
    age_days: ageDays,
    is_stale: !isClosed && ageDays >= TICKETS_STALE_DAYS,
    is_closed: isClosed,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchLinearTicketsForCustomer(
  customer: ScoredCustomerV2,
): Promise<UnifiedTicket[]> {
  if (!linearConfigured()) return [];
  try {
    const issues = await loadAllCustomerRequestIssues();
    const now = Date.now();
    const out: UnifiedTicket[] = [];
    for (const issue of issues) {
      if (!inRetention(issue, now)) continue;
      const match = resolveCustomerForLinearIssue(issue, customer);
      if (!match.matched) continue;
      const u = toUnified(issue, now);
      if (u) out.push(u);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[linear-tickets] fetchLinearTicketsForCustomer error: ${msg}`);
    return [];
  }
}
