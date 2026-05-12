"use client";

import { useMemo } from "react";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight } from "@/lib/config";
import V2Sparkline from "./V2Sparkline";
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
  topAms: { am: string; red: number }[];
  total: number;
  RED: number;
  YELLOW: number;
  GREEN: number;
  pctRed: number;
  mrr: number;
  mrrAtRisk: number;
  topSignal: string | null;
  redDelta: number | null;
  flagged: number;
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

function classifyTopSignal(customers: ScoredCustomerV2[]): string | null {
  const tally = { we: 0, client: 0, drop: 0, vol: 0, usage: 0, billing: 0 };
  for (const c of customers) {
    const s = c.signals_v2;
    if (s.sig_we_silent >= 70) tally.we += 1;
    if (s.sig_client_silent >= 70) tally.client += 1;
    if (s.sig_response_drop >= 70) tally.drop += 1;
    if (s.sig_volume_collapse >= 70) tally.vol += 1;
    if (s.sig_usage >= 70) tally.usage += 1;
    if (s.sig_billing >= 70) tally.billing += 1;
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!ranked[0] || ranked[0][1] === 0) return null;
  const label: Record<string, string> = {
    we: "We silent",
    client: "Client silent",
    drop: "Resp drop",
    vol: "Vol collapse",
    usage: "Usage low",
    billing: "Billing",
  };
  return label[ranked[0][0]];
}

type PodTrendPoint = {
  date: string;
  red: number;
  yellow: number;
  green: number;
  total: number;
};

type Props = {
  snapshot: SnapshotV2;
  comparison?: SnapshotV2 | null;
  selectedPod: string;
  onSelectPod: (pod: string) => void;
  trends?: Record<string, PodTrendPoint[]>; // pod name -> daily series
};

export default function V2PodSummaryGrid({
  snapshot,
  comparison,
  selectedPod,
  onSelectPod,
  trends,
}: Props) {
  const summaries = useMemo<PodSummary[]>(() => {
    // Comparison RED counts by pod
    const compareRedByPod = new Map<string, number>();
    if (comparison) {
      for (const c of comparison.customers) {
        if (c.signals_v2.stoplight === "RED") {
          const pod = POD_MAP[c.am_name] || "Floating";
          compareRedByPod.set(pod, (compareRedByPod.get(pod) || 0) + 1);
        }
      }
    }

    const byPod = new Map<string, ScoredCustomerV2[]>();
    const amsByPod = new Map<string, Map<string, number>>();
    for (const c of snapshot.customers) {
      const pod = POD_MAP[c.am_name] || "Floating";
      if (!byPod.has(pod)) byPod.set(pod, []);
      if (!amsByPod.has(pod)) amsByPod.set(pod, new Map());
      byPod.get(pod)!.push(c);
      if (c.am_name) {
        const amMap = amsByPod.get(pod)!;
        const prev = amMap.get(c.am_name) || 0;
        amMap.set(c.am_name, prev + (c.signals_v2.stoplight === "RED" ? 1 : 0));
      }
    }
    return POD_ORDER.map<PodSummary>((pod) => {
      const list = byPod.get(pod) || [];
      const counts: Record<Stoplight, number> = { RED: 0, YELLOW: 0, GREEN: 0 };
      let mrr = 0;
      let mrrAtRisk = 0;
      let flagged = 0;
      for (const c of list) {
        const sl = c.signals_v2.stoplight;
        counts[sl] += 1;
        const plan = c.plan_amount || 0;
        mrr += plan;
        if (sl === "RED") mrrAtRisk += plan;
        if (c.performance?.flag) flagged += 1;
      }
      const amMap = amsByPod.get(pod) || new Map();
      const ams = Array.from(amMap.keys()).sort();
      const topAms = Array.from(amMap.entries())
        .map(([am, red]) => ({ am, red }))
        .sort((a, b) => b.red - a.red)
        .slice(0, 3);
      const prevRed = compareRedByPod.get(pod);
      return {
        pod,
        ams,
        topAms,
        total: list.length,
        RED: counts.RED,
        YELLOW: counts.YELLOW,
        GREEN: counts.GREEN,
        pctRed: list.length ? (counts.RED / list.length) * 100 : 0,
        mrr,
        mrrAtRisk,
        topSignal: classifyTopSignal(list),
        redDelta: comparison && prevRed !== undefined ? counts.RED - prevRed : null,
        flagged,
      };
    });
  }, [snapshot, comparison]);

  return (
    <section aria-label="Pod summary">
      <header className="mt-2 mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-zoca-text-primary">Pods</h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            Click any pod to filter the rollup below.
            {comparison ? " Delta badges compare to your selected comparison snapshot." : ""}
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
              onClick={() => onSelectPod(active ? "All" : s.pod)}
              aria-pressed={active}
              aria-label={`${s.pod}: ${s.total} customers, ${s.RED} red, ${formatMoney(s.mrrAtRisk)} MRR at risk. Click to ${active ? "clear" : "filter"}.`}
              className={`group flex flex-col rounded-zoca border px-3 py-3 text-left transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${
                active
                  ? "-translate-y-0.5 border-zoca-pink-cta bg-zoca-pink-cta/10 shadow-zoca-md"
                  : "border-zoca-border-2 bg-zoca-bg-2/40 hover:-translate-y-0.5 hover:border-zoca-border-3 hover:bg-zoca-bg-3/30 hover:shadow-zoca-md"
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
              {trends && trends[s.pod] && trends[s.pod].length > 1 && (
                <div className="mt-2 text-rose-300 print:hidden" title={`RED-count trend for ${s.pod} over the last ${trends[s.pod].length} days`}>
                  <V2Sparkline
                    values={trends[s.pod].map((pt) => pt.red)}
                    width={120}
                    height={18}
                    color="rgb(251 113 133)"
                    gradient
                    label={`${s.pod} RED trend`}
                  />
                </div>
              )}

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
                <div className="text-zoca-text-soft" title="Performance-flagged customers in this pod">{"\u26D1"} Flagged</div>
                <div className="text-right tabular-nums" title={s.flagged ? `${s.flagged} of ${s.total} (${((s.flagged / Math.max(s.total, 1)) * 100).toFixed(0)}%)` : "None flagged"}>
                  {s.flagged > 0 ? <span className="text-rose-300">{s.flagged}</span> : <span className="text-zoca-text-soft">·</span>}
                </div>
              </div>

              {s.redDelta !== null && (
                <div className="mt-2">
                  <PodDeltaPill delta={s.redDelta} />
                </div>
              )}

              {s.topSignal && (
                <div
                  className="mt-2 truncate text-[10px] text-zoca-text-soft"
                  title={`Most common strong signal across ${s.pod}: ${s.topSignal}`}
                >
                  Mostly:{" "}
                  <span className="font-medium text-zoca-text-muted">{s.topSignal}</span>
                </div>
              )}

              {s.topAms.length > 0 && s.topAms[0].red > 0 && (
                <div
                  className="mt-1 truncate text-[10px] text-zoca-text-soft"
                  title={`Top AMs by RED: ${s.topAms.map((a) => `${a.am} (${a.red})`).join(", ")}`}
                >
                  Hotspot:{" "}
                  <span className="font-medium text-zoca-text-muted">
                    {s.topAms
                      .filter((a) => a.red > 0)
                      .slice(0, 2)
                      .map((a) => `${a.am.split(" ")[0]} (${a.red})`)
                      .join(" · ")}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PodDeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-zoca-pill bg-zoca-bg-3/40 px-1.5 py-0.5 text-[10px] font-medium text-zoca-text-soft">
        ± 0 RED
      </span>
    );
  }
  const worse = delta > 0;
  const cls = worse
    ? "bg-rose-500/15 text-rose-300"
    : "bg-emerald-500/15 text-emerald-300";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}
      title={`${worse ? "+" : ""}${delta} RED vs comparison`}
    >
      {worse ? "▲" : "▼"} {Math.abs(delta)} RED
    </span>
  );
}
