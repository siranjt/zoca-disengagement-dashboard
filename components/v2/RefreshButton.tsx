"use client";

import { useState, useTransition } from "react";

/**
 * Manual refresh button — wired into the V2 dashboard headers.
 *
 * POSTs to /api/v2/refresh (gated by the dashboard basic-auth middleware),
 * which re-runs compose on the current stage data. On success, hard-reloads
 * the page so the freshly-stored snapshot is picked up. On failure, surfaces
 * the error inline and auto-resets to idle after 5 s.
 *
 * Compose-only: does NOT re-pull from Chargebee/HubSpot/Metabase. The daily
 * 22:00 UTC cron still owns the upstream stages.
 *
 * Phase 17.D — restyled to the Zoca brand light theme (pink outline pill
 * matching V2RefreshBar's "Refresh live data" CTA).
 */
export function RefreshButton() {
  // Phase 33.brand-watchfire-PR8 — "caught" status added for the 1.5s success beat.
  const [status, setStatus] = useState<"idle" | "refreshing" | "caught" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleClick() {
    setStatus("refreshing");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v2/refresh", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Refresh failed");
      }
      // Phase 33.brand-watchfire-PR8 — show "✓ caught" for 1.5s before reloading,
      // so the user sees confirmation before the page swap.
      setStatus("caught");
      setTimeout(() => {
        startTransition(() => {
          window.location.reload();
        });
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setErrorMsg(msg);
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  const refreshing = status === "refreshing";
  return (
    <button
      onClick={handleClick}
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: "transparent",
        color: "var(--zoca-pink)",
        border: "1px solid rgba(255,86,187,0.32)",
        letterSpacing: "-0.005em",
      }}
      onMouseEnter={(e) => {
        if (!refreshing) {
          e.currentTarget.style.background = "rgba(255,134,225,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      title={errorMsg || "Re-run compose to refresh the snapshot from current stage data"}
    >
      {status === "refreshing" ? (
        <>
          <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Catching signals…
        </>
      ) : status === "caught" ? (
        // Phase 33.brand-watchfire-PR8 — success beat.
        <>
          <span aria-hidden>✓</span>
          caught
        </>
      ) : status === "error" ? (
        <>
          <span aria-hidden>⚠</span>
          Failed — retry
        </>
      ) : (
        <>
          <span aria-hidden>↻</span>
          Refresh
        </>
      )}
    </button>
  );
}
