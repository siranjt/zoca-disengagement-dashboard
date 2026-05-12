"use client";

import { useEffect, useState } from "react";
import V2Sparkline from "./V2Sparkline";

type Point = {
  date: string;
  total: number;
  red: number;
  yellow: number;
  green: number;
  mrr: number;
  mrr_at_risk: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; points: Point[] };

type Props = {
  amName: string;
  days?: number;
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

export default function V2AMBookTrendStrip({ amName, days = 14 }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!amName) {
      setState({ status: "empty" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/am/${encodeURIComponent(amName)}/trend?days=${days}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => res.statusText);
          if (!cancelled)
            setState({ status: "error", message: `${res.status}: ${txt.slice(0, 200)}` });
          return;
        }
        const json = (await res.json()) as { points: Point[] };
        if (cancelled) return;
        if (!json.points || json.points.length < 2) {
          setState({ status: "empty" });
        } else {
          setState({ status: "ready", points: json.points });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amName, days]);

  if (state.status === "loading") {
    return (
      <div className="my-4 flex items-center gap-3 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 px-4 py-3">
        <div className="h-3 w-32 animate-pulse rounded bg-zoca-bg-3/40" />
        <div className="h-6 flex-1 animate-pulse rounded bg-zoca-bg-3/30" />
      </div>
    );
  }

  if (state.status === "error" || state.status === "empty") {
    // Soft-fail: hide entirely if no data yet (dashboard live <2 days)
    return null;
  }

  const { points } = state;
  const first = points[0];
  const last = points[points.length - 1];
  const redDelta = last.red - first.red;
  const mrrDelta = last.mrr_at_risk - first.mrr_at_risk;

  return (
    <section
      aria-label={`${amName} book trend over the last ${days} days`}
      className="my-4 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 p-4"
    >
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold text-zoca-text-primary">
            Your book over the last {days} days
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            Stoplight counts + MRR-at-risk trend across your {last.total} customers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <DeltaBadge label="RED" delta={redDelta} lowerIsBetter />
          <DeltaBadge label="MRR @ risk" delta={mrrDelta} lowerIsBetter unit="$" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <TrendRow
          label="RED"
          values={points.map((p) => p.red)}
          color="rgb(251 113 133)"
          lastValue={last.red}
        />
        <TrendRow
          label="YELLOW"
          values={points.map((p) => p.yellow)}
          color="rgb(252 211 77)"
          lastValue={last.yellow}
        />
        <TrendRow
          label="GREEN"
          values={points.map((p) => p.green)}
          color="rgb(110 231 183)"
          lastValue={last.green}
        />
        <TrendRow
          label="MRR @ risk"
          values={points.map((p) => p.mrr_at_risk)}
          color="rgb(251 113 133)"
          lastValue={formatMoney(last.mrr_at_risk)}
        />
      </div>
    </section>
  );
}

function TrendRow({
  label,
  values,
  color,
  lastValue,
}: {
  label: string;
  values: number[];
  color: string;
  lastValue: number | string;
}) {
  return (
    <div className="flex items-center gap-2" title={`${label}: last ${values.length} days`}>
      <span className="text-[10px] uppercase tracking-wider text-zoca-text-soft">{label}</span>
      <V2Sparkline
        values={values}
        width={90}
        height={20}
        color={color}
        gradient
        label={`${label} trend`}
      />
      <span className="font-display text-sm font-semibold tabular-nums text-zoca-text-primary">
        {lastValue}
      </span>
    </div>
  );
}

function DeltaBadge({
  label,
  delta,
  lowerIsBetter,
  unit,
}: {
  label: string;
  delta: number;
  lowerIsBetter?: boolean;
  unit?: string;
}) {
  if (delta === 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-zoca-pill bg-zoca-bg-3/40 px-1.5 py-0.5 text-[10px] font-medium text-zoca-text-soft"
        title={`No change in ${label}`}
      >
        ± 0 {label}
      </span>
    );
  }
  const positive = delta > 0;
  const isGood = lowerIsBetter ? !positive : positive;
  const tone = isGood
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-rose-500/15 text-rose-300";
  const arrow = positive ? "▲" : "▼";
  const abs = Math.abs(delta);
  const display = unit === "$" ? formatMoney(abs) : `${abs}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`}
      title={`${label} change over window: ${positive ? "+" : "-"}${abs}`}
    >
      {arrow} {display} {label}
    </span>
  );
}
