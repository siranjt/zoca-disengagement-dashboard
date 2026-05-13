"use client";
import { useEffect, useState } from "react";

type AmOutcomeStats = {
  am_name: string;
  actions_total: number;
  connected: number;
  voicemail: number;
  no_reach: number;
  escalated: number;
  re_engaged: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AmOutcomeStats[] };

/**
 * Phase 15.2 — AM activity rollup. Renders a per-AM table of action counts
 * + outcome breakdown over the last N days. Empty state when no actions
 * have been logged yet (Phase 9 wired but unused).
 */
export default function V2AmActivityRollup({ daysBack = 7 }: { daysBack?: number }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/am-activity?days=${daysBack}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setState({ status: "error", message: data.error || `HTTP ${res.status}` });
          return;
        }
        setState({ status: "ready", rows: (data.rows ?? []) as AmOutcomeStats[] });
      } catch (e) {
        if (!cancelled) {
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [daysBack]);

  return (
    <section className="mb-7">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-zoca-text-primary">
            AM activity — last {daysBack} days
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-soft">
            Per-AM action counts + outcome breakdown from <code className="font-mono">am_actions</code> +{" "}
            <code className="font-mono">outcome_tracking</code>.
          </p>
        </div>
      </header>

      <div className="overflow-hidden rounded-zoca border border-zoca-border bg-zoca-bg-2/40">
        {state.status === "loading" && (
          <div className="px-4 py-6 text-center text-[12px] text-zoca-text-soft">Loading AM activity…</div>
        )}
        {state.status === "error" && (
          <div className="px-4 py-6 text-center text-[12px] text-rose-300">
            Could not load AM activity: {state.message}
          </div>
        )}
        {state.status === "ready" && state.rows.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-zoca-text-soft">
            No AM actions recorded yet. Track outcomes via the customer card buttons to populate this view.
          </div>
        )}
        {state.status === "ready" && state.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-zoca-bg-2/70 text-[10.5px] uppercase tracking-wider text-zoca-text-soft">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">AM</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                  <th className="px-3 py-2 text-right font-medium">Connected</th>
                  <th className="px-3 py-2 text-right font-medium">VM</th>
                  <th className="px-3 py-2 text-right font-medium">No reach</th>
                  <th className="px-3 py-2 text-right font-medium">Escalated</th>
                  <th className="px-3 py-2 text-right font-medium">Re-engaged</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.am_name} className="border-t border-zoca-border/50 hover:bg-zoca-bg-2/60">
                    <td className="px-3 py-2 font-medium text-zoca-text-primary">{row.am_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zoca-text-primary">
                      {row.actions_total}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{row.connected}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-300">{row.voicemail}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zoca-text-soft">{row.no_reach}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">{row.escalated}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{row.re_engaged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
