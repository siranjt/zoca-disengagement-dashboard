"use client";

import { useMemo } from "react";
import type { SnapshotV2 } from "@/lib/types";
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

type SignalKey = "we" | "client" | "drop" | "vol" | "usage" | "billing";

const SIGNALS: { key: SignalKey; label: string; help: string }[] = [
  { key: "we", label: "We silent", help: "We haven't reached out (sig_we_silent ≥ 70)" },
  { key: "client", label: "Client silent", help: "Customer has gone dark (sig_client_silent ≥ 70)" },
  { key: "drop", label: "Resp drop", help: "Response rate has fallen sharply (sig_response_drop ≥ 70)" },
  { key: "vol", label: "Vol collapse", help: "Conversation volume tanked vs baseline (sig_volume_collapse ≥ 70)" },
  { key: "usage", label: "Usage low", help: "Zoca app usage tanked or non-existent (sig_usage ≥ 70)" },
  { key: "billing", label: "Billing", help: "Stacked unpaid invoices (sig_billing ≥ 70)" },
];

type Props = {
  snapshot: SnapshotV2;
  onCellClick?: (pod: string, signalKey: SignalKey) => void;
};

export default function V2SignalHeatmap({ snapshot, onCellClick }: Props) {
  const { matrix, max, totalsByPod, totalsBySignal } = useMemo(() => {
    const matrix: Record<string, Record<SignalKey, number>> = {};
    const totalsByPod: Record<string, number> = {};
    const totalsBySignal: Record<SignalKey, number> = {
      we: 0,
      client: 0,
      drop: 0,
      vol: 0,
      usage: 0,
      billing: 0,
    };
    for (const pod of POD_ORDER) {
      matrix[pod] = { we: 0, client: 0, drop: 0, vol: 0, usage: 0, billing: 0 };
      totalsByPod[pod] = 0;
    }
    for (const c of snapshot.customers) {
      const pod = POD_MAP[c.am_name] || "Floating";
      if (!matrix[pod]) continue;
      const s = c.signals_v2;
      totalsByPod[pod] += 1;
      if (s.sig_we_silent >= 70) {
        matrix[pod].we += 1;
        totalsBySignal.we += 1;
      }
      if (s.sig_client_silent >= 70) {
        matrix[pod].client += 1;
        totalsBySignal.client += 1;
      }
      if (s.sig_response_drop >= 70) {
        matrix[pod].drop += 1;
        totalsBySignal.drop += 1;
      }
      if (s.sig_volume_collapse >= 70) {
        matrix[pod].vol += 1;
        totalsBySignal.vol += 1;
      }
      if (s.sig_usage >= 70) {
        matrix[pod].usage += 1;
        totalsBySignal.usage += 1;
      }
      if (s.sig_billing >= 70) {
        matrix[pod].billing += 1;
        totalsBySignal.billing += 1;
      }
    }
    let max = 0;
    for (const pod of POD_ORDER) {
      for (const sig of SIGNALS) {
        if (matrix[pod][sig.key] > max) max = matrix[pod][sig.key];
      }
    }
    return { matrix, max, totalsByPod, totalsBySignal };
  }, [snapshot]);

  return (
    <section aria-label="Pod-signal heatmap">
      <header className="mt-2 mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-zoca-text-primary">
            Signal heatmap
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            Customers per pod carrying each strong signal (≥70). Darker = more concentrated.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-zoca-text-soft">
          <span>0</span>
          <div className="flex h-2 w-24 overflow-hidden rounded-full">
            <div className="flex-1 bg-rose-500/10" />
            <div className="flex-1 bg-rose-500/25" />
            <div className="flex-1 bg-rose-500/45" />
            <div className="flex-1 bg-rose-500/65" />
            <div className="flex-1 bg-rose-500/85" />
          </div>
          <span>{max || "—"}</span>
        </div>
      </header>

      <div className="overflow-x-auto rounded-zoca border border-zoca-border-2">
        <table className="min-w-full text-[12px]">
          <thead className="bg-zoca-bg-2/60 text-[10px] uppercase tracking-wider text-zoca-text-soft">
            <tr>
              <th className="px-3 py-2 text-left font-semibold" scope="col">
                Pod
              </th>
              {SIGNALS.map((s) => (
                <th
                  key={s.key}
                  scope="col"
                  className="px-2 py-2 text-center font-semibold"
                  title={s.help}
                >
                  {s.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold" scope="col">
                Customers
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zoca-border bg-zoca-bg-2/20">
            {POD_ORDER.map((pod) => {
              const row = matrix[pod];
              const total = totalsByPod[pod];
              return (
                <tr key={pod} className="transition hover:bg-zoca-bg-3/30">
                  <th
                    scope="row"
                    className="px-3 py-2 text-left text-[12px] font-medium text-zoca-text-primary"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${POD_COLOR_DOT[pod] || "bg-slate-400"}`}
                        aria-hidden
                      />
                      {pod}
                    </span>
                  </th>
                  {SIGNALS.map((s) => {
                    const v = row[s.key];
                    const intensity = max ? v / max : 0;
                    const opacity =
                      v === 0
                        ? "bg-zoca-bg-3/10"
                        : intensity <= 0.2
                          ? "bg-rose-500/10"
                          : intensity <= 0.4
                            ? "bg-rose-500/25"
                            : intensity <= 0.6
                              ? "bg-rose-500/45"
                              : intensity <= 0.8
                                ? "bg-rose-500/65"
                                : "bg-rose-500/85";
                    const pct = total ? ((v / total) * 100).toFixed(0) : "0";
                    return (
                      <td
                        key={s.key}
                        className="px-1.5 py-1 text-center"
                        title={`${pod} · ${s.label}: ${v} of ${total} (${pct}%)`}
                      >
                        {onCellClick && v > 0 ? (
                          <button
                            onClick={() => onCellClick(pod, s.key)}
                            className={`block w-full rounded px-2 py-1.5 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${opacity} ${
                              v === 0 ? "text-zoca-text-soft" : "text-zoca-text-primary"
                            } hover:ring-1 hover:ring-zoca-border-3`}
                            aria-label={`${pod} ${s.label}: ${v} customers (${pct}%). Click to drill.`}
                          >
                            {v}
                          </button>
                        ) : (
                          <div
                            className={`block w-full rounded px-2 py-1.5 font-semibold ${opacity} ${
                              v === 0 ? "text-zoca-text-soft" : "text-zoca-text-primary"
                            }`}
                          >
                            {v || <span className="opacity-40">·</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-zoca-text-muted">
                    {total || <span className="text-zoca-text-soft">·</span>}
                  </td>
                </tr>
              );
            })}
            {/* totals row */}
            <tr className="bg-zoca-bg-2/40 text-[11px] uppercase tracking-wider text-zoca-text-soft">
              <th scope="row" className="px-3 py-2 text-left font-semibold">
                All pods
              </th>
              {SIGNALS.map((s) => (
                <td
                  key={s.key}
                  className="px-2 py-2 text-center font-semibold text-zoca-text-muted tabular-nums"
                >
                  {totalsBySignal[s.key]}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold text-zoca-text-muted tabular-nums">
                {Object.values(totalsByPod).reduce((a, b) => a + b, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
