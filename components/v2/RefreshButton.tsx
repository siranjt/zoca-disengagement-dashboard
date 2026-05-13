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
 */
export function RefreshButton() {
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">("idle");
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
      // Force a hard reload so the page re-fetches the new snapshot.
      startTransition(() => {
        window.location.reload();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setErrorMsg(msg);
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === "refreshing"}
      className="inline-flex items-center gap-1.5 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1 text-[11px] font-medium text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      title={errorMsg || "Re-run compose to refresh the snapshot from current stage data"}
    >
      {status === "refreshing" ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Refreshing…
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
