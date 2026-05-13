"use client";

import * as React from "react";
import { memo, useState } from "react";
import type { ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight, EngagementTier } from "@/lib/config";
import V2Sparkline from "./V2Sparkline";
import V2PerformancePanel from "./V2PerformancePanel";

type CompositeTrendPoint = { date: string; composite: number };

type Props = {
  customer: ScoredCustomerV2;
  trend?: CompositeTrendPoint[];
};

const STOPLIGHT_TITLE: Record<Stoplight, string> = {
  RED: "Needs attention",
  YELLOW: "Keep an eye on",
  GREEN: "Doing fine",
};

const ENGAGEMENT_COLOR: Record<EngagementTier, string> = {
  Active: "text-emerald-300",
  Light: "text-zoca-text-muted",
  Cold: "text-amber-300",
  Dormant: "text-red-300",
};
const ENGAGEMENT_FALLBACK = "text-zoca-text-soft";

function V2CustomerCardInner({ customer, trend }: Props) {
  const { signals_v2: s, metrics } = customer;
  const trajectoryBadge = computeTrend(s.trajectory_7d);
  const planText = customer.plan_amount > 0 ? `$${customer.plan_amount.toFixed(0)}/mo` : "";
  const podText = customer.pod ? ` · ${customer.pod}` : "";

  // Auto-expand for RED stoplight OR YELLOW with performance flag so the
  // "why" is visible without an extra click on cards that need attention.
  const autoExpand =
    s.stoplight === "RED" ||
    (s.stoplight === "YELLOW" && !!customer.performance?.flag);
  const [expanded, setExpanded] = useState<boolean>(autoExpand);

  // Action-button state machine: idle -> selecting -> submitting -> done
  type ActionState =
    | { kind: "idle" }
    | { kind: "selecting" }
    | { kind: "submitting"; choice: ActionChoice }
    | { kind: "done"; choice: ActionChoice; at: number }
    | { kind: "error"; message: string };
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });

  async function logAction(choice: ActionChoice) {
    setActionState({ kind: "submitting", choice });
    try {
      const res = await fetch("/api/v2/actions/contacted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          am_name: customer.am_name,
          entity_id: customer.entity_id,
          action_type: `contacted_${choice}`,
          composite_at_action: customer.signals_v2.composite,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        setActionState({ kind: "error", message: `${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      setActionState({ kind: "done", choice, at: Date.now() });
    } catch (e) {
      setActionState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <article
      role="article"
      aria-label={`${customer.company} — ${STOPLIGHT_TITLE[s.stoplight]}`}
      className="group rounded-zoca-lg border border-zoca-border bg-zoca-card transition-all duration-150 hover:border-zoca-border-3 hover:shadow-zoca-sm"
    >
      <div className="grid grid-cols-[auto,1fr,auto] items-start gap-3 p-4 md:gap-4 md:p-5">
        {/* Stoplight dot — with hover title */}
        <StoplightDot light={s.stoplight} />

        {/* Body */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zoca-text-primary md:text-base">
              {customer.company || customer.entity_id.slice(0, 8)}
            </h3>
            {s.pre_launch && (
              <span
                className="rounded-zoca-pill bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300"
                title={
                  customer.activated_at
                    ? `Pre-launch — contract signed, activation scheduled ${new Date(customer.activated_at).toLocaleDateString()}.`
                    : "Pre-launch — contract signed, not yet activated."
                }
              >
                🚀 Pre-launch
              </span>
            )}
            {trajectoryBadge.label && (
              <span
                className={`rounded-zoca-sm px-1.5 py-0.5 text-[10px] font-semibold ${trajectoryBadge.className}`}
                title={trajectoryBadge.title}
              >
                {trajectoryBadge.label}
              </span>
            )}
            {trend && trend.length > 1 && (
              <span
                className="text-zoca-text-soft"
                title={`Composite score over last ${trend.length} days, latest ${s.composite}`}
              >
                <V2Sparkline
                  values={trend.map((p) => p.composite)}
                  width={56}
                  height={16}
                  color={
                    s.stoplight === "RED"
                      ? "rgb(251 113 133)"
                      : s.stoplight === "YELLOW"
                        ? "rgb(252 211 77)"
                        : "rgb(110 231 183)"
                  }
                  gradient
                  label="Composite score trend"
                />
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zoca-text-soft">
            {planText}
            {podText}
            {customer.am_name && ` · ${customer.am_name}`}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-zoca-text-primary/95 md:text-sm">
            {renderReason(s.reason_one_line)}
          </p>
          {/* Modifier flag chips */}
          {(s.flag_performance || s.flag_tickets) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.flag_performance && (
                <FlagChip
                  label={customer.performance?.flag_reasons?.[0] || "Performance flag"}
                />
              )}
              {s.flag_tickets && (
                <FlagChip
                  label={
                    customer.tickets
                      ? `${customer.tickets.open_tickets_30d} open ticket${
                          customer.tickets.open_tickets_30d === 1 ? "" : "s"
                        }`
                      : "Tickets flag"
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* Right side: action button (state machine) */}
        <div className="flex flex-col items-end gap-2">
          {actionState.kind === "done" ? (
            <div
              className="max-w-[260px] rounded-zoca-lg border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2 text-right text-[12px] font-semibold leading-snug text-emerald-300 md:max-w-[300px] md:px-4 md:text-[13px]"
              aria-live="polite"
            >
              \u2713 Logged {actionState.choice === "connected" ? "as connected" : actionState.choice === "vm" ? "voicemail" : "no reach"}
              <button
                type="button"
                onClick={() => setActionState({ kind: "idle" })}
                className="ml-2 text-[10px] font-normal text-emerald-300/70 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                aria-label="Undo logged action"
              >
                Undo
              </button>
            </div>
          ) : actionState.kind === "selecting" || actionState.kind === "submitting" ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zoca-text-soft">
                How did it go?
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ActionChip
                  label="\u2713 Connected"
                  tone="emerald"
                  busy={actionState.kind === "submitting" && actionState.choice === "connected"}
                  disabled={actionState.kind === "submitting"}
                  onClick={() => logAction("connected")}
                />
                <ActionChip
                  label="\ud83d\udcde VM"
                  tone="amber"
                  busy={actionState.kind === "submitting" && actionState.choice === "vm"}
                  disabled={actionState.kind === "submitting"}
                  onClick={() => logAction("vm")}
                />
                <ActionChip
                  label="\u00d7 No reach"
                  tone="rose"
                  busy={actionState.kind === "submitting" && actionState.choice === "noreach"}
                  disabled={actionState.kind === "submitting"}
                  onClick={() => logAction("noreach")}
                />
                <button
                  type="button"
                  onClick={() => setActionState({ kind: "idle" })}
                  className="text-[10px] text-zoca-text-soft underline-offset-2 hover:text-zoca-text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                  aria-label="Cancel logging"
                >
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Action: ${actionLabel(customer)}. Click to log how it went.`}
              className="max-w-[260px] rounded-zoca-lg bg-zoca-pink-cta px-3.5 py-2 text-left text-[12px] font-semibold leading-snug text-white shadow-zoca-sm transition hover:shadow-zoca-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zoca-bg-0 md:max-w-[300px] md:px-4 md:text-[13px]"
              onClick={() => setActionState({ kind: "selecting" })}
            >
              {actionLabel(customer)}
            </button>
          )}
          {actionState.kind === "error" && (
            <div
              role="alert"
              className="max-w-[260px] rounded-zoca-sm border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-right text-[10px] text-rose-200 md:max-w-[300px]"
            >
              Couldn\u2019t log: {actionState.message}
              <button
                type="button"
                onClick={() => setActionState({ kind: "idle" })}
                className="ml-1 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40"
                aria-label="Dismiss error and retry"
              >
                retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics summary line — enriched with channels, app tier, billing detail */}
      <div className="border-t border-zoca-border px-4 py-2.5 text-[11px] text-zoca-text-soft md:px-5">
        {renderMetricsSummary(customer)}
      </div>

      {/* Performance signals (expand-on-demand; auto-expanded for RED) */}
      <div className="border-t border-zoca-border px-4 py-2 md:px-5">
{customer.performance ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zoca-text-soft transition hover:text-zoca-pink-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
              aria-expanded={expanded}
              aria-controls={`perf-${customer.entity_id}`}
              title={expanded ? "Hide performance signals" : "Show performance signals (why this customer is on this stoplight)"}
            >
              <span aria-hidden>{expanded ? "▾" : "▸"}</span>
              {expanded ? "Hide" : "Why?"}
              {customer.performance?.flag && !expanded && (
                <span
                  className="ml-1 inline-flex items-center rounded-zoca-pill bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300"
                  title={(customer.performance.flag_reasons || []).join(" · ") || "Performance trajectory flagged"}
                >
                  ⚑ {performanceChipSummary(customer.performance) || "trajectory"}
                </span>
              )}
            </button>
            {expanded && (
              <div id={`perf-${customer.entity_id}`}>
                <V2PerformancePanel performance={customer.performance} />
              </div>
            )}
          </>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stoplight dot — with hover tooltip
// ---------------------------------------------------------------------------

function StoplightDot({ light }: { light: Stoplight }) {
  const color =
    light === "RED" ? "#ef4444" : light === "YELLOW" ? "#f59e0b" : "#10b981";
  const label = STOPLIGHT_TITLE[light];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="mt-1.5 inline-block h-3 w-3 flex-shrink-0 cursor-help rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
    />
  );
}

function FlagChip({ label }: { label: string }) {
  return (
    <span className="rounded-zoca-sm bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metrics summary — render with channels used + app tier color + billing detail
// ---------------------------------------------------------------------------

function renderMetricsSummary(c: ScoredCustomerV2) {
  const { metrics } = c;
  const lastTouch =
    metrics.last_any_iso === null
      ? "Last touch: never"
      : `Last touch: ${daysSince(metrics.last_any_iso)}d ago`;

  const channelsUsed = (metrics.channels_used_30d || "").split(",").filter(Boolean);
  const channelText =
    metrics.total_30d === 0
      ? "0 comms in 30d"
      : channelsUsed.length === 0
        ? `${metrics.total_30d} comms in 30d`
        : `${metrics.total_30d} comms in 30d · ${channelsUsed.join("/")}`;

  const usageNode =
    c.usage != null ? (
      <span>
        App: <span className={(ENGAGEMENT_COLOR[c.usage.engagement_tier] || ENGAGEMENT_FALLBACK)}>{c.usage.engagement_tier}</span>
      </span>
    ) : (
      <span className="text-red-300">App: no data</span>
    );

  const billingNode = c.billing && c.billing.unpaid_invoice_count > 0 ? (
    <span className="text-zoca-pink-text">
      {c.billing.unpaid_invoice_count} unpaid
      {c.billing.total_amount_due_cents > 0 &&
        ` ($${Math.round(c.billing.total_amount_due_cents / 100)})`}
      {c.billing.days_past_oldest_unpaid > 0 &&
        ` · ${c.billing.days_past_oldest_unpaid}d overdue`}
    </span>
  ) : null;

  const parts: React.ReactNode[] = [
    <span key="lt">{lastTouch}</span>,
    <span key="ct">{channelText}</span>,
    <span key="us">{usageNode}</span>,
  ];
  if (billingNode) parts.push(<span key="bl">{billingNode}</span>);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.map((node, i) => (
        <span key={i} className="inline-flex items-center gap-3">
          {i > 0 && <span className="opacity-60">·</span>}
          {node}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTrend(t: "improving" | "worsening" | "stable" | "unknown"): {
  label: string;
  className: string;
  title: string;
} {
  switch (t) {
    case "worsening":
      return {
        label: "↑ Worsening",
        className: "bg-red-500/15 text-red-300",
        title: "Composite score increased vs. 7 days ago",
      };
    case "improving":
      return {
        label: "↓ Improving",
        className: "bg-green-500/15 text-green-300",
        title: "Composite score decreased vs. 7 days ago",
      };
    case "stable":
      return {
        label: "— Stable",
        className: "bg-zoca-bg-1/60 text-zoca-text-soft",
        title: "Composite score unchanged vs. 7 days ago",
      };
    case "unknown":
    default:
      return { label: "", className: "", title: "" };
  }
}

function actionLabel(c: ScoredCustomerV2): string {
  const action = c.signals_v2.suggested_action || "";
  if (!action || action === "No action needed.") return "Note · doing fine";
  return action.replace(/\.$/, "");
}

function daysSince(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400_000));
}

/**
 * Render the rationale safely: parse only <b>...</b> markers into React
 * <strong> nodes; all other markup is stripped to plain text. XSS-safe.
 */
function renderReason(text: string): React.ReactNode {
  if (!text) return null;
  const stripped = text.replace(/<(?!\/?b\b)[^>]*>/gi, "");
  const parts = stripped.split(/<b\b[^>]*>([\s\S]*?)<\/b>/gi);
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      <span key={i}>{part}</span>
    ) : (
      <strong key={i} className="font-semibold text-zoca-text-primary">
        {part}
      </strong>
    ),
  );
}

type ActionChoice = "connected" | "vm" | "noreach";

function ActionChip({
  label,
  tone,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  tone: "emerald" | "amber" | "rose";
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
      : tone === "amber"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
        : "border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-zoca-pill border px-2 py-1 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${toneClass} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${busy ? "animate-pulse" : ""}`}
      aria-label={`Log contact result: ${label}`}
    >
      {label}
    </button>
  );
}

const V2CustomerCard = memo(V2CustomerCardInner, (prev, next) => {
  return (
    prev.customer.entity_id === next.customer.entity_id &&
    prev.customer.signals_v2.composite === next.customer.signals_v2.composite &&
    prev.customer.signals_v2.stoplight === next.customer.signals_v2.stoplight &&
    prev.customer.performance?.flag === next.customer.performance?.flag &&
    prev.trend === next.trend
  );
});

export default V2CustomerCard;

function performanceChipSummary(p: NonNullable<ScoredCustomerV2["performance"]>): string | null {
  if (!p.flag) return null;
  const parts: string[] = [];
  if (p.gbp_clicks_drop_pct !== null && p.gbp_clicks_drop_pct >= 25) {
    parts.push(`GBP \u25BC${Math.round(p.gbp_clicks_drop_pct)}%`);
  }
  if (p.weeks_with_zero_reviews !== null && p.weeks_with_zero_reviews >= 4) {
    parts.push(`${p.weeks_with_zero_reviews}wk zero`);
  }
  if (p.ytd_leads_change_pct !== null && p.ytd_leads_change_pct <= -20) {
    parts.push(`YTD \u25BC${Math.abs(Math.round(p.ytd_leads_change_pct))}%`);
  }
  if (!parts.length) return null;
  return parts.slice(0, 2).join(" \u00B7 ");
}
