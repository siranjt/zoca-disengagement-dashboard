"use client";

import { useMemo } from "react";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight } from "@/lib/config";
import { POD_MAP } from "@/lib/config";

const POD_ORDER = ["Pod 1", "Pod 2", "Pod 3", "Pod 4", "Pod 5", "Floating"];

const POD_COLOR_DOT: Record<string, string> = {
  "Pod 1": "bg-violet-400",
  "Pod 2": "bg-cyan-400",
  "Pod 3": "bg-emerald-400",
  "Pod 4": "bg-amber-400",
  "Pod 5": "bg-pink-400",
  Floating: "bg-slate-400",
};

type PodSummary = {
  pod: string;
  ams: string[];
  total: number;
  RED: number;
  YELLOW: number;
  GREEN: number;
  pctRed: number;
  mrr: number;
  mrrAtRisk: number;
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

type Props = {
  snapshot: SnapshotV2;
  selectedPod: string;
  onSelectPod: (pod: string) => void;
};

export default function V2PodSummaryGrid({ snapshot, selectedPod, onSelectPod }: Props) {
  const summaries = useMemo<PodSummary[]>(() => {
    const byPod = new Map<string, ScoredCustomerV2[]>();
    const amsByPod = new Map<string, Set<string>>();
    for (const c of snapshot.customers) {
      const pod = POD_MAP[c.am_name] || "Floating";
      if (!byPod.has(pod)) byPod.set(pod, []);
      if (!amsByPod.has(pod)) amsByPod.set(pod, new Set());
      byPod.get(pod)!.push(c);
      if (c.am_name) amsByPod.get(pod)!.add(c.am_name);
    }
    return POD_ORDER.map<PodSummary>((pod) => {
      const list = byPod.get(pod) || [];
      const counts: Record<Stoplight, number> = { RED: 0, YELLOW: 0, GREEN: 0 };
      let mrr = 0;
      let mrrAtRisk = 0;
      for (const c of list) {
        const sl = c.signals_v2.stoplight;
        counts[sl] += 1;
        const plan = c.plan_amount || 0;
        mrr += plan;
        if (sl === "RED") mrrAtRisk += plan;
      }
      return {
        pod,
        ams: Array.from(amsByPod.get(pod) || []).sort(),
        total: list.length,
        RED: counts.RED,
        YELLOW: counts.YELLOW,
        GREEN: counts.GREEN,
        pctRed: list.length ? (counts.RED / list.length) * 100 : 0,
        mrr,
        mrrAtRisk,
      };
    });
  }, [snapshot]);

  return (
    <section aria-label="Pod summary">
      <header className="mt-2 mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-zoca-text-primary">Pods</h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            Click any pod to filter the rollup below.
          </p>
        </div>
        {selectedPod !== "All" && (
          <button
            onClick={() => onSelectPod("All")}
            className="text-[11px] text-zoca-text-soft underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
            aria-label="Clear pod selection"
          >
            Show all pods
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {summaries.map((s) => {
          const active = s.pod === selectedPod;
          const r = s.total ? (s.RED / s.total) * 100 : 0;
          const y = s.total ? (s.YELLOW / s.total) * 100 : 0;
          const g = s.total ? (s.GREEN / s.total) * 100 : 0;
          return (
            <button
              key={s.pod}
              onClick={() => onSelectPod(s.pod)}
              aria-pressed={active}
              aria-label={`${s.pod}: ${s.total} customers, ${s.RED} red, ${formatMoney(s.mrrAtRisk)} MRR at risk. Click to filter.`}
              className={`group flex flex-col rounded-zoca border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${
                active
                  ? "border-zoca-pink-cta bg-zoca-pink-cta/10"
                  : "border-zoca-border-2 bg-zoca-bg-2/40 hover:border-zoca-border-3 hover:bg-zoca-bg-3/30"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${POD_COLOR_DOT[s.pod] || "bg-slate-400"}`}
                  aria-hidden
                />
                <span className="text-[12px] font-semibold text-zoca-text-primary">{s.pod}</span>
                <span className="ml-auto text-[10px] text-zoca-text-soft">
                  {s.ams.length} AM{s.ams.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-display text-xl font-bold text-zoca-text-primary tabular-nums">
                  {s.total}
                </span>
                <span className="text-[10px] text-zoca-text-soft">customers</span>
              </div>

              <div
                className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-zoca-bg-3/40"
                role="img"
                aria-label={`Tier spread: ${s.RED} red, ${s.YELLOW} yellow, ${s.GREEN} green`}
                title={`${s.RED} RED · ${s.YELLOW} YEL · ${s.GREEN} GRN`}
              >
                {r > 0 && <div className="bg-rose-400" style={{ width: `${r}%` }} />}
                {y > 0 && <div className="bg-amber-400" style={{ width: `${y}%` }} />}
                {g > 0 && <div className="bg-emerald-400" style={{ width: `${g}%` }} />}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                <div className="text-zoca-text-soft">RED</div>
                <div className="text-right font-semibold text-rose-300 tabular-nums">
                  {s.RED} <span className="text-zoca-text-soft">({s.pctRed.toFixed(0)}%)</span>
                </div>
                <div className="text-zoca-text-soft">MRR</div>
                <div className="text-right text-zoca-text-muted tabular-nums">
                  {formatMoney(s.mrr)}
                </div>
                <div className="text-zoca-text-soft">@ risk</div>
                <div className="text-right text-rose-300 tabular-nums">
                  {formatMoney(s.mrrAtRisk)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
