"use client";
import { useState } from "react";

type Props = {
  generatedAt?: string | null;
};

function relativeAge(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FreshnessBanner({ generatedAt }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  if (!generatedAt) return null;

  const ageMs = Date.now() - Date.parse(generatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 24 * 60 * 60 * 1000) return null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v2/refresh", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Refresh failed");
      window.location.reload();
    } catch (e) {
      alert(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      setRefreshing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
      <div className="flex items-center gap-2">
        <span aria-hidden>⚠</span>
        <span>
          Snapshot is <strong>{relativeAge(ageMs)}</strong> — daily refresh may have failed. Data could be stale.
        </span>
      </div>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-medium transition hover:bg-amber-500/30 disabled:opacity-50"
      >
        {refreshing ? "Refreshing…" : "Refresh now"}
      </button>
    </div>
  );
}

export default FreshnessBanner;
