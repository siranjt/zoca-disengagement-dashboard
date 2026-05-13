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
 *
 * Phase 17.D — light-themed to match the Zoca brand palette.
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
          <h3
            className="font-extrabold text-zoca-text"
            style={{ fontSize: "17px", letterSpacing: "-0.015em" }}
          >
            AM activity — last {daysBack} days
          </h3>
          <p className="mt-0.5 text-[11px] text-zoca-text-2">
            Per-AM action counts + outcome breakdown from{" "}
            <code className="font-mono">am_actions</code> +{" "}
            <code className="font-mono">outcome_tracking</code>.
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
        {state.status === "loading" && (
          <div className="px-4 py-6 text-center text-[12px] text-zoca-text-2">
            Loading AM activity…
          </div>
        )}
        {state.status === "error" && (
          <div
            className="px-4 py-6 text-center text-[12px]"
            style={{ color: "var(--zoca-pink)" }}
          >
            Could not load AM activity: {state.message}
          </div>
        )}
        {state.status === "ready" && state.rows.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-zoca-text-2">
            No AM actions recorded yet. Track outcomes via the customer card buttons to populate this view.
          </div>
        )}
        {state.status === "ready" && state.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead
                className="text-[10.5px] uppercase tracking-wider text-zoca-text-2"
                style={{ background: "var(--zoca-bg-soft)" }}
              >
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
                  <tr
                    key={row.am_name}
                    className="transition"
                    style={{ borderTop: "1px solid var(--zoca-border)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(20,110,245,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <td className="px-3 py-2 font-medium text-zoca-text">{row.am_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zoca-text">
                      {row.actions_total}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "#047857" }}
                    >
                      {row.connected}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "var(--zoca-blue)" }}
                    >
                      {row.voicemail}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zoca-text-2">
                      {row.no_reach}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "#b45309" }}
                    >
                      {row.escalated}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "#047857" }}
                    >
                      {row.re_engaged}
                    </td>
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
