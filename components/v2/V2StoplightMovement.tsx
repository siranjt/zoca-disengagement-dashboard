"use client";

import { useEffect, useState } from "react";
import { POD_MAP } from "@/lib/config";

const POD_COLOR_DOT: Record<string, string> = {
  "Pod 1": "bg-violet-400",
  "Pod 2": "bg-cyan-400",
  "Pod 3": "bg-emerald-400",
  "Pod 4": "bg-amber-400",
  "Pod 5": "bg-pink-400",
  Floating: "bg-slate-400",
};

type Stoplight = "RED" | "YELLOW" | "GREEN";

type MovementRow = {
  entity_id: string;
  bizname: string;
  am_name: string;
  pod?: string;
  from: Stoplight;
  to: Stoplight;
  composite_from: number;
  composite_to: number;
  plan_amount: number;
};

type Movement = {
  days: number;
  comparedAt: string;
  currentAt: string;
  flippedToRed: MovementRow[];
  recoveries: MovementRow[];
  degraded: MovementRow[];
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Movement };

type Props = {
  days?: number;
  onJumpToAm?: (am: string) => void;
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

function StoplightChip({ tier }: { tier: Stoplight }) {
  const map: Record<Stoplight, string> = {
    RED: "bg-rose-500/15 text-rose-300",
    YELLOW: "bg-amber-500/15 text-amber-300",
    GREEN: "bg-emerald-500/15 text-emerald-300",
  };
  return (
    <span className={`rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-semibold ${map[tier]}`}>
      {tier}
    </span>
  );
}

function MovementGroup({
  title,
  hint,
  rows,
  emptyText,
  onJumpToAm,
  maxRows = 8,
}: {
  title: string;
  hint: string;
  rows: MovementRow[];
  emptyText: string;
  onJumpToAm?: (am: string) => void;
  maxRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;
  return (
    <div className="rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-bold text-zoca-text-primary">
            {title}{" "}
            <span className="font-normal text-zoca-text-soft">({rows.length})</span>
          </h4>
          <p className="mt-0.5 text-[10px] text-zoca-text-soft">{hint}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-[12px] text-zoca-text-soft">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-zoca-border text-[12px]">
          {visible.map((r) => {
            const pod = r.pod || POD_MAP[r.am_name] || "Floating";
            return (
              <li key={r.entity_id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zoca-text-primary" title={r.bizname}>
                    {r.bizname}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zoca-text-soft">
                    <button
                      onClick={() => onJumpToAm && onJumpToAm(r.am_name)}
                      className="underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                      aria-label={`Open ${r.am_name}'s book`}
                      title={`Open ${r.am_name}'s book`}
                    >
                      {r.am_name}
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`h-1 w-1 rounded-full ${POD_COLOR_DOT[pod] || "bg-slate-400"}`}
                        aria-hidden
                      />
                      {pod}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <StoplightChip tier={r.from} />
                  <span className="text-zoca-text-soft" aria-hidden>
                    →
                  </span>
                  <StoplightChip tier={r.to} />
                </div>
                <div
                  className="hidden w-20 text-right text-[10px] tabular-nums text-zoca-text-muted sm:block"
                  title={`Composite ${r.composite_from} → ${r.composite_to}`}
                >
                  {r.composite_from} → {r.composite_to}
                </div>
                <div
                  className="w-16 text-right text-[10px] tabular-nums text-zoca-text-soft"
                  title={`Plan amount: ${formatMoney(r.plan_amount)}`}
                >
                  {formatMoney(r.plan_amount)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] text-zoca-text-soft underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
        >
          {expanded ? "Show less" : `Show ${rows.length - maxRows} more`}
        </button>
      )}
    </div>
  );
}

export default function V2StoplightMovement({ days = 7, onJumpToAm }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/v2/snapshot/movement?days=${days}`, { cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => res.statusText);
          if (!cancelled)
            setState({ status: "error", message: `${res.status}: ${txt.slice(0, 200)}` });
          return;
        }
        const data: Movement = await res.json();
        if (!cancelled) setState({ status: "ready", data });
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
  }, [days]);

  return (
    <section aria-label="Stoplight movement" className="mb-7">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-zoca-text-primary">
            Stoplight movement
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            {state.status === "ready"
              ? `Customers whose stoplight changed between ${state.data.comparedAt} and ${state.data.currentAt}.`
              : `Comparing today's snapshot to ${days} days ago.`}
          </p>
        </div>
      </header>

      {state.status === "loading" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30"
            />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-zoca border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200"
        >
          Couldn't load movement: {state.message}. (Likely no snapshot exists for {days} days
          ago yet — the dashboard has been live less than {days} days, or that day's pipeline
          didn't run.)
        </div>
      )}

      {state.status === "ready" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <MovementGroup
            title="Flipped to RED"
            hint="Anything → RED. Top priority for outreach."
            rows={state.data.flippedToRed}
            emptyText="No customers flipped to RED in this window."
            onJumpToAm={onJumpToAm}
          />
          <MovementGroup
            title="Degraded"
            hint="GREEN → YELLOW. Early warning."
            rows={state.data.degraded}
            emptyText="No GREEN→YELLOW movement in this window."
            onJumpToAm={onJumpToAm}
          />
          <MovementGroup
            title="Recoveries"
            hint="Anything → GREEN. Wins worth celebrating."
            rows={state.data.recoveries}
            emptyText="No recoveries to GREEN in this window."
            onJumpToAm={onJumpToAm}
          />
        </div>
      )}
    </section>
  );
}
