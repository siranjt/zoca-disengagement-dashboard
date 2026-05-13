"use client";

import * as React from "react";
import { memo, useState } from "react";
import type { ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight, EngagementTier } from "@/lib/config";
import V2Sparkline from "./V2Sparkline";
import V2PerformancePanel from "./V2PerformancePanel";
import NotesField from "./NotesField";

type CompositeTrendPoint = { date: string; composite: number };

type Props = {
  customer: ScoredCustomerV2;
  trend?: CompositeTrendPoint[];
  recentlyContacted?: boolean;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  /** Phase 18.B — selected AM threaded from V2Dashboard for per-AM notes. */
  amName?: string;
};

const STOPLIGHT_TITLE: Record<Stoplight, string> = {
  RED: "Needs attention",
  YELLOW: "Keep an eye on",
  GREEN: "Doing fine",
};

const ENGAGEMENT_COLOR: Record<EngagementTier, string> = {
  Active: "text-emerald-700",
  Light: "text-zoca-text-2",
  Cold: "text-amber-700",
  Dormant: "text-rose-700",
};
const ENGAGEMENT_FALLBACK = "text-zoca-text-2";

function V2CustomerCardInner({ customer, trend, recentlyContacted, isPinned, onTogglePinned, amName }: Props) {
  // Phase 18.B — selected AM from parent, fall back to the card's own AM if not passed.
  const notesAmName = amName ?? customer.am_name;
  const { signals_v2: s, metrics } = customer;
  const trajectoryBadge = computeTrend(s.trajectory_7d);
  const planText = customer.plan_amount > 0 ? `$${customer.plan_amount.toFixed(0)}/mo` : "";
  const podText = customer.pod ? ` · ${customer.pod}` : "";

  // Feedback flow ("this signal is wrong" report)
  type FeedbackState =
    | { kind: "idle" }
    | { kind: "open"; comment: string }
    | { kind: "submitting" }
    | { kind: "done" }
    | { kind: "error"; message: string };
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({ kind: "idle" });

  async function submitFeedback(comment: string) {
    setFeedbackState({ kind: "submitting" });
    try {
      const res = await fetch("/api/v2/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_id: customer.entity_id,
          signal_name: "overall",
          am_name: customer.am_name,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        setFeedbackState({ kind: "error", message: `${res.status}: ${txt.slice(0, 120)}` });
        return;
      }
      setFeedbackState({ kind: "done" });
    } catch (e) {
      setFeedbackState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Auto-expand for RED stoplight OR YELLOW with performance flag so the
  // "why" is visible without an extra click on cards that need attention.
  const autoExpand =
    s.stoplight === "RED" ||
    (s.stoplight === "YELLOW" && !!customer.performance?.flag);
  const [expanded, setExpanded] = useState<boolean>(autoExpand);

  // Action-button state machine:
  //   idle -> selecting (3 channel chips)
  //         -> tagging (channel chosen, capture reason + optional follow-up)
  //         -> submitting -> done
  //   idle -> escalating (capture note) -> submittingEscalation -> escalated
  type ReasonCode = "renewal" | "performance" | "billing" | "complaint" | "check_in" | "onboarding" | "other";
  type ActionState =
    | { kind: "idle" }
    | { kind: "selecting" }
    | { kind: "tagging"; choice: ActionChoice; reason: ReasonCode | ""; followUp: boolean }
    | { kind: "submitting"; choice: ActionChoice }
    | { kind: "done"; choice: ActionChoice; at: number }
    | { kind: "escalating"; note: string }
    | { kind: "submittingEscalation" }
    | { kind: "escalated"; to: string | null }
    | { kind: "error"; message: string };
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });

  async function submitTaggedAction(choice: ActionChoice, reason: ReasonCode | "", followUp: boolean) {
    setActionState({ kind: "submitting", choice });
    try {
      const followUpDate = followUp
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return d.toISOString().slice(0, 10);
          })()
        : null;
      const res = await fetch("/api/v2/actions/contacted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          am_name: customer.am_name,
          entity_id: customer.entity_id,
          action_type: `contacted_${choice}`,
          composite_at_action: customer.signals_v2.composite,
          reason_code: reason || null,
          follow_up_date: followUpDate,
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

  async function submitEscalation(note: string) {
    setActionState({ kind: "submittingEscalation" });
    try {
      const res = await fetch("/api/v2/actions/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          am_name: customer.am_name,
          entity_id: customer.entity_id,
          composite_at_action: customer.signals_v2.composite,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        setActionState({ kind: "error", message: `${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { escalated_to?: string };
      setActionState({ kind: "escalated", to: json.escalated_to ?? null });
    } catch (e) {
      setActionState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 17.B.1 + 17.C — Tier-based rendering. Cards now have three shapes:
  //   GREEN  = one-line collapsed (pulse dot + bizname + meta + trend)
  //   YELLOW = compact card (lighter, "Schedule check-in" / "Snooze 7d")
  //   RED    = full card with inline action buttons (existing flow below)
  // -------------------------------------------------------------------------
  if (s.stoplight === "GREEN") {
    return (
      <article
        role="article"
        aria-label={`${customer.company} — Doing fine`}
        className="zoca-fade-in"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          background: "#ffffff",
          border: "1px solid var(--zoca-border)",
          borderRadius: "10px",
          boxShadow: "0 1px 2px rgba(11,5,29,0.03)",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        <span
          className="zoca-pulse-dot-green"
          style={{ flexShrink: 0 }}
          aria-hidden
        />
        <span
          className="font-medium text-zoca-text"
          style={{
            fontSize: "13px",
            maxWidth: "260px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {customer.company || customer.entity_id.slice(0, 8)}
        </span>
        <span className="text-[11px] text-zoca-text-2" style={{ flexShrink: 0 }}>
          {planText}
          {podText}
        </span>
        <span style={{ marginLeft: "auto" }} className="flex items-center gap-3">
          {trajectoryBadge.label && (
            <span
              className="text-[10px] font-semibold"
              style={{
                color:
                  s.trajectory_7d === "improving"
                    ? "var(--zoca-green)"
                    : s.trajectory_7d === "worsening"
                      ? "var(--zoca-pink)"
                      : "var(--zoca-text-3)",
              }}
              title={trajectoryBadge.title}
            >
              {trajectoryBadge.label}
            </span>
          )}
          {trend && trend.length > 1 && (
            <V2Sparkline
              values={trend.map((p) => p.composite)}
              width={56}
              height={14}
              color="rgb(16, 185, 129)"
              gradient
              label="Composite score trend"
            />
          )}
          {onTogglePinned && (
            <PinButton isPinned={!!isPinned} onToggle={onTogglePinned} />
          )}
        </span>
      </article>
    );
  }

  if (s.stoplight === "YELLOW") {
    return (
      <article
        role="article"
        aria-label={`${customer.company} — Keep an eye on${recentlyContacted ? " (contacted recently)" : ""}`}
        className="zoca-fade-in"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(245, 158, 11, 0.28)",
          borderRadius: "12px",
          padding: "12px 16px",
          boxShadow: "0 1px 3px rgba(11,5,29,0.04)",
          transition: "box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="zoca-pulse-dot-amber"
            aria-hidden
            style={{ marginTop: "5px", flexShrink: 0 }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3
                className="text-[14px] font-semibold text-zoca-text"
                style={{ margin: 0 }}
              >
                {customer.company || customer.entity_id.slice(0, 8)}
              </h3>
              <span className="text-[11px] text-zoca-text-2">
                {planText}
                {podText}
              </span>
              {recentlyContacted && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: "rgba(16, 185, 129, 0.10)",
                    color: "#047857",
                    border: "1px solid rgba(16, 185, 129, 0.24)",
                  }}
                  title="Contacted in the last 7 days"
                >
                  ✓ Contacted
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zoca-text-2">
              {renderReason(s.reason_one_line)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {onTogglePinned && (
              <PinButton isPinned={!!isPinned} onToggle={onTogglePinned} />
            )}
            <button
              type="button"
              className="zoca-btn zoca-btn-ghost"
              style={{ fontSize: "11px", padding: "5px 12px" }}
              onClick={() => setActionState({ kind: "selecting" })}
              aria-label="Schedule check-in"
            >
              Schedule check-in
            </button>
            <button
              type="button"
              className="zoca-btn zoca-btn-ghost"
              style={{ fontSize: "10.5px", padding: "4px 10px" }}
              onClick={() => setActionState({ kind: "selecting" })}
              aria-label="Snooze 7 days"
            >
              Snooze 7d
            </button>
          </div>
        </div>
        {actionState.kind === "selecting" && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
            <ActionChip
              label="✓ Connected"
              tone="emerald"
              busy={false}
              disabled={false}
              onClick={() =>
                setActionState({
                  kind: "tagging",
                  choice: "connected",
                  reason: "",
                  followUp: false,
                })
              }
            />
            <ActionChip
              label="📞 VM"
              tone="amber"
              busy={false}
              disabled={false}
              onClick={() =>
                setActionState({
                  kind: "tagging",
                  choice: "vm",
                  reason: "",
                  followUp: true,
                })
              }
            />
            <ActionChip
              label="× No reach"
              tone="rose"
              busy={false}
              disabled={false}
              onClick={() =>
                setActionState({
                  kind: "tagging",
                  choice: "noreach",
                  reason: "",
                  followUp: true,
                })
              }
            />
            <button
              type="button"
              onClick={() => setActionState({ kind: "idle" })}
              className="text-[10px] text-zoca-text-2 underline-offset-2 hover:underline"
            >
              cancel
            </button>
          </div>
        )}
      </article>
    );
  }

  // -------------------------------------------------------------------------
  // RED — full card render below (existing flow).
  // -------------------------------------------------------------------------
  return (
    <article
      role="article"
      aria-label={`${customer.company} — ${STOPLIGHT_TITLE[s.stoplight]}${recentlyContacted ? " (contacted recently)" : ""}`}
      className="zoca-card group"
      style={{
        borderColor: "rgba(255, 86, 187, 0.22)",
        background:
          "linear-gradient(180deg, rgba(255, 86, 187, 0.03) 0%, #ffffff 100%)",
        boxShadow: "0 1px 3px rgba(11, 5, 29, 0.04), 0 0 0 1px rgba(255, 86, 187, 0.08)",
      }}
    >
      <div className="grid grid-cols-[auto,1fr,auto] items-start gap-3 p-4 md:gap-4 md:p-5">
        {/* Stoplight dot — with hover title */}
        <StoplightDot light={s.stoplight} />

        {/* Body */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zoca-text md:text-base">
              {customer.company || customer.entity_id.slice(0, 8)}
            </h3>
            {s.pre_launch && (
              <span
                className="rounded-zoca-pill bg-sky-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700"
                title={
                  customer.activated_at
                    ? `Pre-launch — contract signed, activation scheduled ${new Date(customer.activated_at).toLocaleDateString()}.`
                    : "Pre-launch — contract signed, not yet activated."
                }
              >
                🚀 Pre-launch
              </span>
            )}
            {customer.hubspot?.icp_tier && (
              <span
                className={`rounded-zoca-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  customer.hubspot.icp_tier === "Tier 1"
                    ? "bg-emerald-500/18 text-emerald-700"
                    : customer.hubspot.icp_tier === "Tier 2"
                      ? "bg-amber-500/18 text-amber-700"
                      : "bg-rose-500/18 text-rose-700"
                }`}
                title={`HubSpot ICP rating: ${customer.hubspot.icp_tier}. Tier 1 = strong fit · Tier 2 = workable · Tier 3 = low priority.`}
              >
                ICP {customer.hubspot.icp_tier.replace("Tier ", "")}
              </span>
            )}
            {customer.hubspot?.open_deal_count !== undefined &&
              customer.hubspot.open_deal_count > 0 && (
                <span
                  className="rounded-zoca-pill bg-violet-500/18 px-2 py-0.5 text-[10px] font-medium text-violet-700"
                  title={`${customer.hubspot.open_deal_count} open deal${customer.hubspot.open_deal_count === 1 ? "" : "s"}: ${customer.hubspot.open_deal_stages?.join(", ")}. Total $${customer.hubspot.total_open_amount?.toLocaleString()}`}
                >
                  💼 {customer.hubspot.open_deal_count} deal{customer.hubspot.open_deal_count === 1 ? "" : "s"}
                </span>
              )}
            {/* Phase 14B (Tier C): HubSpot vs. Metabase calls drift */}
            {customer.hubspot?.comms_drift && (
              <span
                className={`rounded-zoca-pill px-2 py-0.5 text-[10px] font-medium ${
                  customer.hubspot.comms_drift.delta > 0
                    ? "bg-amber-500/18 text-amber-700"
                    : "bg-sky-500/18 text-sky-700"
                }`}
                title={`HubSpot logged ${customer.hubspot.comms_drift.hubspot_calls_30d} calls in 30d; Metabase phone CSV shows ${customer.hubspot.comms_drift.metabase_calls_30d}. Data hygiene flag.`}
              >
                {customer.hubspot.comms_drift.delta > 0
                  ? `📞 +${customer.hubspot.comms_drift.delta} missing`
                  : `📞 ${customer.hubspot.comms_drift.delta} extra`}
              </span>
            )}
            {recentlyContacted && (
              <span
                className="rounded-zoca-pill bg-emerald-500/18 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                title="You've already logged a contact attempt against this customer in the last 7 days — avoid double-calling."
              >
                ✓ Contacted recently
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
                className="text-zoca-text-2"
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
          <div className="mt-1 text-[11px] text-zoca-text-2">
            {planText}
            {podText}
            {customer.am_name && ` · ${customer.am_name}`}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-zoca-text md:text-sm">
            {renderReason(s.reason_one_line)}
            <FeedbackButton state={feedbackState} setState={setFeedbackState} submit={submitFeedback} />
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
          {onTogglePinned && (
            <PinButton isPinned={!!isPinned} onToggle={onTogglePinned} />
          )}
          {actionState.kind === "done" ? (
            <div
              className="max-w-[260px] rounded-zoca-lg border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2 text-right text-[12px] font-semibold leading-snug text-emerald-700 md:max-w-[300px] md:px-4 md:text-[13px]"
              aria-live="polite"
            >
              \u2713 Logged {actionState.choice === "connected" ? "as connected" : actionState.choice === "vm" ? "voicemail" : "no reach"}
              <button
                type="button"
                onClick={() => setActionState({ kind: "idle" })}
                className="ml-2 text-[10px] font-normal text-emerald-700/70 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                aria-label="Undo logged action"
              >
                Undo
              </button>
            </div>
          ) : actionState.kind === "selecting" ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zoca-text-2">
                How did it go?
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ActionChip
                  label="\u2713 Connected"
                  tone="emerald"
                  busy={false}
                  disabled={false}
                  onClick={() => setActionState({ kind: "tagging", choice: "connected", reason: "", followUp: false })}
                />
                <ActionChip
                  label="\ud83d\udcde VM"
                  tone="amber"
                  busy={false}
                  disabled={false}
                  onClick={() => setActionState({ kind: "tagging", choice: "vm", reason: "", followUp: true })}
                />
                <ActionChip
                  label="\u00d7 No reach"
                  tone="rose"
                  busy={false}
                  disabled={false}
                  onClick={() => setActionState({ kind: "tagging", choice: "noreach", reason: "", followUp: true })}
                />
                <button
                  type="button"
                  onClick={() => setActionState({ kind: "idle" })}
                  className="text-[10px] text-zoca-text-2 underline-offset-2 hover:text-zoca-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                  aria-label="Cancel logging"
                >
                  cancel
                </button>
              </div>
            </div>
          ) : actionState.kind === "tagging" || actionState.kind === "submitting" ? (
            <div className="flex max-w-[300px] flex-col items-end gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zoca-text-2">
                {actionState.kind === "submitting" ? "Saving…" : "Tag the call"}
              </div>
              <div className="rounded-zoca border border-zoca-border bg-zoca-bg-tint p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zoca-text-2">Channel</span>
                  <span className="font-medium text-zoca-text">
                    {actionState.kind === "tagging"
                      ? actionState.choice === "connected"
                        ? "✓ Connected"
                        : actionState.choice === "vm"
                          ? "📞 Voicemail"
                          : "× No reach"
                      : "…"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <label htmlFor={`reason-${customer.entity_id}`} className="text-zoca-text-2">
                    Why
                  </label>
                  <select
                    id={`reason-${customer.entity_id}`}
                    value={actionState.kind === "tagging" ? actionState.reason : ""}
                    onChange={(e) => {
                      if (actionState.kind !== "tagging") return;
                      setActionState({
                        ...actionState,
                        reason: e.target.value as ReasonCode | "",
                      });
                    }}
                    disabled={actionState.kind === "submitting"}
                    className="rounded border border-zoca-border bg-zoca-bg-soft/80 px-1.5 py-0.5 text-[11px] text-zoca-text focus:border-zoca-pink-cta focus:outline-none"
                  >
                    <option value="">(skip)</option>
                    <option value="renewal">Renewal</option>
                    <option value="performance">Performance</option>
                    <option value="billing">Billing</option>
                    <option value="complaint">Complaint</option>
                    <option value="check_in">Check-in</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <label className="mt-1.5 flex items-center gap-1.5 text-zoca-text-2">
                  <input
                    type="checkbox"
                    checked={actionState.kind === "tagging" ? actionState.followUp : false}
                    onChange={(e) => {
                      if (actionState.kind !== "tagging") return;
                      setActionState({ ...actionState, followUp: e.target.checked });
                    }}
                    disabled={actionState.kind === "submitting"}
                    className="h-3 w-3 cursor-pointer accent-zoca-pink-cta"
                  />
                  Remind me in 7 days
                </label>
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActionState({ kind: "idle" })}
                    disabled={actionState.kind === "submitting"}
                    className="text-[10px] text-zoca-text-2 underline-offset-2 hover:text-zoca-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:opacity-50"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (actionState.kind !== "tagging") return;
                      submitTaggedAction(actionState.choice, actionState.reason, actionState.followUp);
                    }}
                    disabled={actionState.kind === "submitting"}
                    className="rounded-zoca-pill bg-zoca-pink-cta/20 px-2 py-0.5 text-[11px] font-medium text-zoca-pink-cta transition hover:bg-zoca-pink-cta/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:opacity-50"
                  >
                    {actionState.kind === "submitting" ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : actionState.kind === "escalating" || actionState.kind === "submittingEscalation" ? (
            <div className="flex max-w-[300px] flex-col items-end gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-amber-700">
                ↗ Escalate to pod lead
              </div>
              <div className="rounded-zoca border border-amber-400/30 bg-amber-500/10 p-2 text-[11px]">
                <textarea
                  rows={2}
                  autoFocus
                  placeholder="What's blocking you? (optional)"
                  value={actionState.kind === "escalating" ? actionState.note : ""}
                  disabled={actionState.kind === "submittingEscalation"}
                  onChange={(e) => {
                    if (actionState.kind !== "escalating") return;
                    setActionState({ kind: "escalating", note: e.target.value });
                  }}
                  className="w-full rounded border border-zoca-border bg-zoca-bg-soft/80 px-1.5 py-1 text-[11px] text-zoca-text placeholder:text-zoca-text-2 focus:border-zoca-pink-cta focus:outline-none"
                />
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActionState({ kind: "idle" })}
                    disabled={actionState.kind === "submittingEscalation"}
                    className="text-[10px] text-zoca-text-2 underline-offset-2 hover:text-zoca-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:opacity-50"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const note = actionState.kind === "escalating" ? actionState.note : "";
                      submitEscalation(note);
                    }}
                    disabled={actionState.kind === "submittingEscalation"}
                    className="rounded-zoca-pill bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:opacity-50"
                  >
                    {actionState.kind === "submittingEscalation" ? "Sending…" : "Escalate"}
                  </button>
                </div>
              </div>
            </div>
          ) : actionState.kind === "escalated" ? (
            <div
              className="max-w-[260px] rounded-zoca-lg border border-amber-400/30 bg-amber-500/10 px-3.5 py-2 text-right text-[12px] font-semibold leading-snug text-amber-700 md:max-w-[300px] md:px-4 md:text-[13px]"
              aria-live="polite"
            >
              ↗ Escalated{actionState.to ? ` to ${actionState.to.split(" ")[0]}` : ""}
              <button
                type="button"
                onClick={() => setActionState({ kind: "idle" })}
                className="ml-2 text-[10px] font-normal text-amber-700/70 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
              >
                Undo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                aria-label={`Action: ${actionLabel(customer)}. Click to log how it went.`}
                className="max-w-[260px] rounded-zoca-lg bg-zoca-pink-cta px-3.5 py-2 text-left text-[12px] font-semibold leading-snug text-white shadow-zoca-sm transition hover:shadow-zoca-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zoca-bg-0 md:max-w-[300px] md:px-4 md:text-[13px]"
                onClick={() => setActionState({ kind: "selecting" })}
              >
                {actionLabel(customer)}
              </button>
              {s.stoplight === "RED" && (
                <button
                  type="button"
                  onClick={() => setActionState({ kind: "escalating", note: "" })}
                  className="text-[10px] text-zoca-text-2 underline-offset-2 hover:text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                  aria-label="Escalate to pod lead"
                  title="Stuck on this customer? Send to your pod lead."
                >
                  ↗ Escalate
                </button>
              )}
            </div>
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
      <div className="border-t border-zoca-border px-4 py-2.5 text-[11px] text-zoca-text-2 md:px-5">
        {renderMetricsSummary(customer)}
      </div>

      {/* HubSpot "last call" summary — Fireflies-derived sentiment + topics (Phase 13) */}
      {customer.hubspot?.last_call && (
        <div className="border-t border-zoca-border px-4 py-2 text-[11px] text-zoca-text-2 md:px-5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-zoca-text-2">📞 Last call</span>
            <span title={customer.hubspot.last_call.date}>
              {daysSince(customer.hubspot.last_call.date)}d ago
            </span>
            <span
              className={`rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-medium ${
                customer.hubspot.last_call.sentiment === "frustrated"
                  ? "bg-rose-500/18 text-rose-700"
                  : customer.hubspot.last_call.sentiment === "warm"
                    ? "bg-emerald-500/18 text-emerald-700"
                    : "bg-zoca-bg-tint text-zoca-text-2"
              }`}
            >
              {customer.hubspot.last_call.sentiment === "frustrated"
                ? "😟 frustrated"
                : customer.hubspot.last_call.sentiment === "warm"
                  ? "😊 warm"
                  : "— neutral"}
            </span>
            {customer.hubspot.last_call.topics.length > 0 && (
              <span className="text-zoca-text-2" title="Topics extracted from the meeting note">
                · topics: <span className="text-zoca-text-2">{customer.hubspot.last_call.topics.join(", ")}</span>
              </span>
            )}
            {customer.hubspot.last_call.fireflies_url && (
              <a
                href={customer.hubspot.last_call.fireflies_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-zoca-pink-cta underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
              >
                Fireflies →
              </a>
            )}
          </div>
          {customer.hubspot.last_call.action_items.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[11px] text-zoca-text-2">
              {customer.hubspot.last_call.action_items.slice(0, 3).map((item, i) => (
                <li key={i} className="truncate" title={item}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Performance signals (expand-on-demand; auto-expanded for RED) */}
      <div className="border-t border-zoca-border px-4 py-2 md:px-5">
{customer.performance ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zoca-text-2 transition hover:text-zoca-pink-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
              aria-expanded={expanded}
              aria-controls={`perf-${customer.entity_id}`}
              title={expanded ? "Hide performance signals" : "Show performance signals (why this customer is on this stoplight)"}
            >
              <span aria-hidden>{expanded ? "▾" : "▸"}</span>
              {expanded ? "Hide" : "Why?"}
              {customer.performance?.flag && !expanded && (
                <span
                  className="ml-1 inline-flex items-center rounded-zoca-pill bg-rose-500/18 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                  title={(customer.performance.flag_reasons || []).join(" · ") || "Performance trajectory flagged"}
                >
                  ⚑ {performanceChipSummary(customer.performance) || "trajectory"}
                </span>
              )}
            </button>
            {expanded && (
              <div id={`perf-${customer.entity_id}`}>
                {/* Phase 18.B — private notes (AM-specific) */}
                <div style={{ marginTop: "12px", marginBottom: "16px" }}>
                  <div className="zoca-micro-label" style={{ marginBottom: "8px" }}>
                    Notes (private)
                  </div>
                  <NotesField
                    amName={notesAmName}
                    entityId={customer.entity_id}
                    customerId={customer.customer_id ?? null}
                    bizname={customer.company ?? null}
                  />
                </div>
                <V2PerformancePanel performance={customer.performance} />
                {customer.hubspot?.contacts && customer.hubspot.contacts.length > 0 && (
                  <ContactsSection contacts={customer.hubspot.contacts} />
                )}
              </div>
            )}
          </>
        ) : customer.hubspot?.contacts && customer.hubspot.contacts.length > 0 ? (
          // No performance data, but we have contacts — still expose the
          // CONTACTS section behind a "Why?" toggle so the buyer-side org
          // chart is reachable on every matched customer.
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zoca-text-2 transition hover:text-zoca-pink-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
              aria-expanded={expanded}
              aria-controls={`contacts-${customer.entity_id}`}
              title={expanded ? "Hide contacts" : "Show contacts"}
            >
              <span aria-hidden>{expanded ? "▾" : "▸"}</span>
              {expanded ? "Hide" : "Why?"}
            </button>
            {expanded && (
              <div id={`contacts-${customer.entity_id}`}>
                {/* Phase 18.B — private notes (AM-specific) */}
                <div style={{ marginTop: "12px", marginBottom: "16px" }}>
                  <div className="zoca-micro-label" style={{ marginBottom: "8px" }}>
                    Notes (private)
                  </div>
                  <NotesField
                    amName={notesAmName}
                    entityId={customer.entity_id}
                    customerId={customer.customer_id ?? null}
                    bizname={customer.company ?? null}
                  />
                </div>
                <ContactsSection contacts={customer.hubspot.contacts} />
              </div>
            )}
          </>
        ) : (
          // No performance data and no contacts — but every customer still
          // gets a private-notes expand (Phase 18.B). Notes are universal.
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zoca-text-2 transition hover:text-zoca-pink-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
              aria-expanded={expanded}
              aria-controls={`notes-${customer.entity_id}`}
              title={expanded ? "Hide notes" : "Show notes"}
            >
              <span aria-hidden>{expanded ? "▾" : "▸"}</span>
              {expanded ? "Hide" : "Why?"}
            </button>
            {expanded && (
              <div id={`notes-${customer.entity_id}`}>
                <div style={{ marginTop: "12px", marginBottom: "16px" }}>
                  <div className="zoca-micro-label" style={{ marginBottom: "8px" }}>
                    Notes (private)
                  </div>
                  <NotesField
                    amName={notesAmName}
                    entityId={customer.entity_id}
                    customerId={customer.customer_id ?? null}
                    bizname={customer.company ?? null}
                  />
                </div>
              </div>
            )}
          </>
        )}
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
    <span className="rounded-zoca-sm bg-amber-500/18 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-500/30">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phase 18.A — Pin button. Lives top-right on every tier variant. Pink when
// pinned (glow + filled), muted when not. Parent owns the toggled state.
// ---------------------------------------------------------------------------

function PinButton({
  isPinned,
  onToggle,
}: {
  isPinned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center justify-center transition cursor-pointer"
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "8px",
        background: "transparent",
        border: "1px solid var(--zoca-border)",
        color: isPinned ? "var(--zoca-pink)" : "var(--zoca-text-2)",
        boxShadow: isPinned ? "0 0 12px rgba(255, 168, 205, 0.4)" : "none",
        flexShrink: 0,
      }}
      title={isPinned ? "Unpin" : "Pin"}
      aria-label={isPinned ? "Unpin customer" : "Pin customer"}
      aria-pressed={isPinned}
    >
      <i className="ti ti-pin" style={{ fontSize: "15px" }} />
    </button>
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
        className: "bg-zoca-bg-soft/60 text-zoca-text-2",
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
      <strong key={i} className="font-semibold text-zoca-text">
        {part}
      </strong>
    ),
  );
}

function FeedbackButton({
  state,
  setState,
  submit,
}: {
  state:
    | { kind: "idle" }
    | { kind: "open"; comment: string }
    | { kind: "submitting" }
    | { kind: "done" }
    | { kind: "error"; message: string };
  setState: React.Dispatch<React.SetStateAction<any>>;
  submit: (comment: string) => Promise<void>;
}) {
  if (state.kind === "done") {
    return (
      <span
        className="ml-2 inline-flex items-center rounded-zoca-pill bg-emerald-500/18 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
        aria-live="polite"
      >
        ✓ Reported — thanks
      </span>
    );
  }
  if (state.kind === "open" || state.kind === "submitting" || state.kind === "error") {
    const comment = state.kind === "open" ? state.comment : "";
    return (
      <span className="ml-2 inline-flex items-center gap-1 align-baseline">
        <input
          type="text"
          autoFocus
          placeholder="What's wrong? (optional)"
          value={comment}
          disabled={state.kind === "submitting"}
          onChange={(e) =>
            state.kind === "open" && setState({ kind: "open", comment: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") setState({ kind: "idle" });
            if (e.key === "Enter") submit(comment);
          }}
          className="w-44 rounded border border-zoca-border bg-zoca-bg-soft/80 px-2 py-0.5 text-[11px] text-zoca-text placeholder:text-zoca-text-2 focus:border-zoca-pink-cta focus:outline-none"
          aria-label="Feedback comment"
        />
        <button
          type="button"
          onClick={() => submit(comment)}
          disabled={state.kind === "submitting"}
          className="text-[11px] text-zoca-pink-cta underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:opacity-50"
          aria-label="Submit feedback"
        >
          {state.kind === "submitting" ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-[11px] text-zoca-text-2 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
          aria-label="Cancel feedback"
        >
          cancel
        </button>
        {state.kind === "error" && (
          <span className="text-[10px] text-rose-700" role="alert">
            {state.message}
          </span>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setState({ kind: "open", comment: "" })}
      className="ml-2 inline-flex items-center rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-medium text-zoca-text-2 transition hover:bg-zoca-bg-tint hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 align-baseline"
      aria-label="This signal looks wrong — send feedback"
      title="This signal looks wrong — let us know"
    >
      ✗ wrong?
    </button>
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
      ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-700 hover:bg-emerald-500/25"
      : tone === "amber"
        ? "border-amber-400/40 bg-amber-500/18 text-amber-700 hover:bg-amber-500/25"
        : "border-rose-400/40 bg-rose-500/18 text-rose-700 hover:bg-rose-500/25";
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
    prev.trend === next.trend &&
    prev.recentlyContacted === next.recentlyContacted &&
    prev.isPinned === next.isPinned &&
    prev.onTogglePinned === next.onTogglePinned
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

// ---------------------------------------------------------------------------
// CONTACTS section (Phase 14C — Tier E: buyer-side org chart)
//
// Surfaces up to 5 HubSpot contacts per customer inside the "Why?" expand,
// matching the styling of the PERFORMANCE SIGNALS section in V2PerformancePanel.
// ---------------------------------------------------------------------------

type ContactsSectionProps = {
  contacts: NonNullable<NonNullable<ScoredCustomerV2["hubspot"]>["contacts"]>;
};

function ContactsSection({ contacts }: ContactsSectionProps) {
  if (!contacts || contacts.length === 0) return null;
  return (
    <div className="mt-3 rounded-zoca-sm border border-zoca-border bg-zoca-surface-soft/40 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zoca-text-2">
        Contacts
      </div>
      <ul className="space-y-1.5">
        {contacts.slice(0, 5).map((c) => {
          const sinceLabel = c.last_activity ? `${daysSince(c.last_activity)}d ago` : "—";
          return (
            <li
              key={c.contact_id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-zoca-text">{c.name}</span>
                {c.job_title && (
                  <span className="text-[10px] text-zoca-text-2">{c.job_title}</span>
                )}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="text-zoca-pink-cta hover:underline"
                    title={`Email ${c.name}`}
                  >
                    {c.email}
                  </a>
                ) : (
                  <span className="text-zoca-text-2">—</span>
                )}
                <span className="text-[10px] text-zoca-text-2" title={c.last_activity || ""}>
                  {sinceLabel}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
