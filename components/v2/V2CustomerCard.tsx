"use client";

import type { ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight } from "@/lib/config";

type Props = {
  customer: ScoredCustomerV2;
};

export default function V2CustomerCard({ customer }: Props) {
  const { signals_v2: s, metrics } = customer;
  const trend = computeTrend(s.trajectory_7d);
  const planText = customer.plan_amount > 0 ? `$${customer.plan_amount.toFixed(0)}/mo` : "";
  const podText = customer.pod ? ` · ${customer.pod}` : "";

  return (
    <article className="rounded-zoca-lg border border-zoca-border bg-zoca-card transition hover:border-zoca-border-3">
      <div className="grid grid-cols-[auto,1fr,auto] items-start gap-3 p-4 md:gap-4 md:p-5">
        {/* Stoplight dot */}
        <StoplightDot light={s.stoplight} />

        {/* Body */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zoca-text-primary md:text-base">
              {customer.company || customer.entity_id.slice(0, 8)}
            </h3>
            {trend.label && (
              <span
                className={`rounded-zoca-sm px-1.5 py-0.5 text-[10px] font-semibold ${trend.className}`}
              >
                {trend.label}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zoca-text-soft">
            {planText}
            {podText}
            {customer.am_name && ` · ${customer.am_name}`}
          </div>
          <p
            className="mt-2 text-[13px] leading-relaxed text-zoca-text-primary/95 md:text-sm"
            dangerouslySetInnerHTML={{ __html: highlightReason(s.reason_one_line) }}
          />
          {/* Modifier flag chips */}
          {(s.flag_performance || s.flag_tickets) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.flag_performance && (
                <FlagChip
                  label={
                    customer.performance?.flag_reasons?.[0] ||
                    "Performance flag"
                  }
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

        {/* Right side: action + secondary links */}
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            className="rounded-zoca-pill bg-zoca-pink-cta px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-zoca-sm transition hover:shadow-zoca-glow md:px-4 md:text-[13px]"
            onClick={() => alert("Mark contacted — Phase 2.C")}
          >
            {actionLabel(customer)}
          </button>
          <div className="flex flex-col items-end gap-1 text-[11px] text-zoca-text-soft md:flex-row md:gap-3">
            <button
              type="button"
              className="border-b border-dashed border-transparent transition hover:border-zoca-text-soft hover:text-zoca-text-muted"
              onClick={() => alert("Why flagged drawer — Phase 2.B")}
            >
              Why flagged ▾
            </button>
            <button
              type="button"
              className="border-b border-dashed border-transparent transition hover:border-zoca-text-soft hover:text-zoca-text-muted"
              onClick={() => alert("Full profile modal — Phase 2.B")}
            >
              Full profile →
            </button>
          </div>
        </div>
      </div>

      {/* Compact metrics summary (last touch + days since) */}
      <div className="border-t border-zoca-border px-4 py-2.5 text-[11px] text-zoca-text-soft md:px-5">
        <span>
          Last touch:{" "}
          {metrics.last_any_iso
            ? `${daysSince(metrics.last_any_iso)} day${daysSince(metrics.last_any_iso) === 1 ? "" : "s"} ago`
            : "never"}
        </span>
        <span className="mx-2 opacity-60">·</span>
        <span>{metrics.total_30d} comms in last 30d</span>
        {customer.usage && (
          <>
            <span className="mx-2 opacity-60">·</span>
            <span>App usage: {customer.usage.engagement_tier}</span>
          </>
        )}
        {customer.billing && customer.billing.unpaid_invoice_count > 0 && (
          <>
            <span className="mx-2 opacity-60">·</span>
            <span className="text-zoca-pink-text">
              {customer.billing.unpaid_invoice_count} unpaid invoice
              {customer.billing.unpaid_invoice_count === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stoplight dot
// ---------------------------------------------------------------------------

function StoplightDot({ light }: { light: Stoplight }) {
  const color = light === "RED" ? "#ef4444" : light === "YELLOW" ? "#f59e0b" : "#10b981";
  return (
    <span
      aria-label={light === "RED" ? "Needs attention" : light === "YELLOW" ? "Keep an eye on" : "Doing fine"}
      className="mt-1.5 inline-block h-3 w-3 flex-shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 12px ${color}`,
      }}
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
// Helpers
// ---------------------------------------------------------------------------

function computeTrend(t: "improving" | "worsening" | "stable" | "unknown"): {
  label: string;
  className: string;
} {
  switch (t) {
    case "worsening":
      return { label: "↑ Worsening", className: "bg-red-500/15 text-red-300" };
    case "improving":
      return { label: "↓ Improving", className: "bg-green-500/15 text-green-300" };
    case "stable":
      return { label: "— Stable", className: "bg-zoca-bg-1/60 text-zoca-text-soft" };
    case "unknown":
    default:
      return { label: "", className: "" };
  }
}

function actionLabel(c: ScoredCustomerV2): string {
  const action = c.signals_v2.suggested_action || "";
  if (!action || action === "No action needed.") return "Note · doing fine";
  // Trim trailing periods + keep concise
  return action.replace(/\.$/, "").slice(0, 48);
}

function daysSince(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400_000));
}

function highlightReason(text: string): string {
  // Already-included <b> tags from the narrative templates pass through cleanly.
  // Strip any other HTML to be safe.
  const allowed = text.replace(/<(?!\/?b\b)[^>]*>/gi, "");
  return allowed;
}
