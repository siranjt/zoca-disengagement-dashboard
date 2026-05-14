"use client";

import React from "react";
import type { CoachingRow, CoachingMetric } from "@/lib/coaching";

type Mode = "manager" | "am";

type Props = {
  mode: Mode;
  rows: CoachingRow[];
  onMetricClick?: (amName: string, metric: CoachingMetric) => void;
};

type MetricDef = {
  key: CoachingMetric;
  label: string;
  short: string;
  explainer: string;
  tone: {
    fg: string;
    bg: string;
    border: string;
  };
};

const METRICS: MetricDef[] = [
  {
    key: "untouched_7d",
    label: "RED untouched >7d",
    short: "Untouched 7d",
    explainer:
      "RED customers in this AM's book where no am_action was logged AND no comms recorded in the last 7 days. These are the ones falling through.",
    tone: {
      fg: "#e11d48", // rose-600
      bg: "rgba(244,63,94,0.08)",
      border: "rgba(244,63,94,0.22)",
    },
  },
  {
    key: "stale_14d",
    label: "Stale RED >14d",
    short: "Stale 14d",
    explainer:
      "RED customers whose last_any_iso is null or more than 14 days old — they've been RED a long time without a reset. (v1 uses last-comms recency as a proxy for 'RED 14+ days running'.)",
    tone: {
      fg: "#b45309", // amber-700
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.22)",
    },
  },
  {
    key: "noreach_streak",
    label: "No-reach streak (3+)",
    short: "No-reach 3+",
    explainer:
      "Customers where the last three am_actions logged by this AM are all 'No reach'. Worth escalating or trying a different channel.",
    tone: {
      fg: "#7c3aed", // violet-600
      bg: "rgba(124,58,237,0.08)",
      border: "rgba(124,58,237,0.22)",
    },
  },
  {
    key: "snooze_ignored",
    label: "Snooze ignored",
    short: "Snooze ignored",
    explainer:
      "Customers this AM snoozed where the snooze has elapsed AND no am_action has been logged since. These quietly fell off the radar.",
    tone: {
      fg: "#0284c7", // sky-600
      bg: "rgba(2,132,199,0.08)",
      border: "rgba(2,132,199,0.22)",
    },
  },
];

function getCount(row: CoachingRow, key: CoachingMetric): number {
  switch (key) {
    case "untouched_7d":
      return row.red_untouched_7d.count;
    case "stale_14d":
      return row.stale_red_14d.count;
    case "noreach_streak":
      return row.noreach_streak_3plus.count;
    case "snooze_ignored":
      return row.snooze_ignored.count;
  }
}

function rowTotal(row: CoachingRow): number {
  return (
    row.red_untouched_7d.count +
    row.stale_red_14d.count +
    row.noreach_streak_3plus.count +
    row.snooze_ignored.count
  );
}

function formatMrr(cents: number): string {
  if (!cents) return "$0/mo";
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString()}/mo`;
}

export default function V2CoachingLoops({ mode, rows, onMetricClick }: Props) {
  if (mode === "am") return <CoachingPills row={rows[0]} onMetricClick={onMetricClick} />;
  return <CoachingTable rows={rows} onMetricClick={onMetricClick} />;
}

// ---------------------------------------------------------------------------
// Manager mode — full per-AM table
// ---------------------------------------------------------------------------
function CoachingTable({
  rows,
  onMetricClick,
}: {
  rows: CoachingRow[];
  onMetricClick?: (amName: string, metric: CoachingMetric) => void;
}) {
  const explainerSummary = METRICS.map(
    (m) => `${m.label}: ${m.explainer}`,
  ).join("\n\n");

  return (
    <section className="mb-7">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            className="font-extrabold text-zoca-text inline-flex items-center gap-2"
            style={{ fontSize: "17px", letterSpacing: "-0.015em" }}
          >
            Coaching loops
            <span
              role="img"
              aria-label="Coaching loops — what each column means"
              title={explainerSummary}
              tabIndex={0}
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--zoca-bg-soft)",
                color: "var(--zoca-text-2)",
                border: "1px solid var(--zoca-border)",
              }}
            >
              i
            </span>
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-2">
            Per-AM behavioral signals: who has RED customers falling through. Click a non-zero cell to filter the rollup below.
          </p>
        </div>
      </header>

      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "#ffffff",
          border: "1px solid var(--zoca-border)",
          boxShadow: "0 1px 2px rgba(11,5,29,0.03)",
        }}
      >
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-zoca-text-2">
            No coaching signals across the team this week — keep it up.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead
                className="text-[10.5px] uppercase tracking-wider text-zoca-text-2"
                style={{ background: "var(--zoca-bg-soft)" }}
              >
                <tr>
                  <th className="px-3 py-2 text-left font-medium">AM</th>
                  {METRICS.map((m) => (
                    <th
                      key={m.key}
                      className="px-3 py-2 text-center font-medium"
                      title={m.explainer}
                    >
                      {m.short}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total RED</th>
                  <th className="px-3 py-2 text-right font-medium">MRR @ risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const sum = rowTotal(row);
                  const muted = sum === 0;
                  return (
                    <tr
                      key={row.am_name}
                      style={{
                        borderTop: "1px solid var(--zoca-border)",
                        opacity: muted ? 0.6 : 1,
                      }}
                    >
                      <td className="px-3 py-2 font-medium text-zoca-text">
                        {row.am_name}
                      </td>
                      {METRICS.map((m) => {
                        const c = getCount(row, m.key);
                        const active = c > 0;
                        return (
                          <td
                            key={m.key}
                            className="px-2 py-2 text-center"
                          >
                            <button
                              type="button"
                              disabled={!active}
                              onClick={() =>
                                active && onMetricClick?.(row.am_name, m.key)
                              }
                              title={
                                active
                                  ? `${c} ${m.label} — click to filter`
                                  : `0 ${m.label}`
                              }
                              className="inline-flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 transition focus:outline-none focus-visible:ring-2"
                              style={
                                active
                                  ? {
                                      background: m.tone.bg,
                                      color: m.tone.fg,
                                      border: `1px solid ${m.tone.border}`,
                                      cursor: "pointer",
                                      minWidth: 56,
                                    }
                                  : {
                                      background: "transparent",
                                      color: "var(--zoca-text-soft)",
                                      border: "1px solid transparent",
                                      cursor: "default",
                                      minWidth: 56,
                                    }
                              }
                              onMouseEnter={(e) => {
                                if (!active) return;
                                (e.currentTarget as HTMLElement).style.boxShadow =
                                  "0 1px 6px rgba(11,5,29,0.08)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.boxShadow = "";
                              }}
                            >
                              <span
                                className="font-extrabold tabular-nums"
                                style={{ fontSize: "16px", lineHeight: 1 }}
                              >
                                {c}
                              </span>
                              <span
                                className="mt-0.5"
                                style={{ fontSize: "9.5px", letterSpacing: "0.02em" }}
                              >
                                {m.short.toLowerCase()}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-zoca-text">
                        {row.total_red}
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular-nums font-semibold"
                        style={{ color: "var(--zoca-pink)" }}
                      >
                        {formatMrr(row.total_mrr_at_risk_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AM mode — pill bar (used at top of the AM card list)
// ---------------------------------------------------------------------------
function CoachingPills({
  row,
  onMetricClick,
}: {
  row: CoachingRow | undefined;
  onMetricClick?: (amName: string, metric: CoachingMetric) => void;
}) {
  if (!row) return null;
  const allZero = METRICS.every((m) => getCount(row, m.key) === 0);

  if (allZero) {
    return (
      <div
        role="status"
        className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold"
        style={{
          background: "rgba(16,185,129,0.08)",
          color: "#047857",
          border: "1px solid rgba(16,185,129,0.22)",
        }}
      >
        <span aria-hidden>✓</span>
        All clear — nothing falling through this week.
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Coaching heads-up"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zoca-text-2">
        Heads up
      </span>
      {METRICS.map((m) => {
        const c = getCount(row, m.key);
        const active = c > 0;
        return (
          <button
            key={m.key}
            type="button"
            disabled={!active}
            onClick={() => active && onMetricClick?.(row.am_name, m.key)}
            title={m.explainer}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition focus:outline-none focus-visible:ring-2"
            style={
              active
                ? {
                    background: m.tone.bg,
                    color: m.tone.fg,
                    border: `1px solid ${m.tone.border}`,
                    cursor: "pointer",
                  }
                : {
                    background: "var(--zoca-bg-soft)",
                    color: "var(--zoca-text-soft)",
                    border: "1px solid var(--zoca-border)",
                    cursor: "default",
                  }
            }
          >
            <span className="tabular-nums font-extrabold">{c}</span>
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
