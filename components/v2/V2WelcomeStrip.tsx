"use client";

import type { ScoredCustomerV2 } from "@/lib/types";

type Props = {
  amName: string;
  customers: ScoredCustomerV2[];
  onDismiss: () => void;
};

export default function V2WelcomeStrip({ amName, customers, onDismiss }: Props) {
  const redCount = customers.filter((c) => c.signals_v2.stoplight === "RED").length;
  const yellowCount = customers.filter((c) => c.signals_v2.stoplight === "YELLOW").length;
  // Phase 33.H.2 — tier-based counts (MONITOR fallback for missing metabase_health)
  const needsCallCount = customers.filter((c) => {
    const _htRaw = ((c as any).metabase_health?.tier as string | null | undefined) || "";
    return _htRaw === "CRITICAL - DEAL BREAKER" || _htRaw === "CRITICAL" || _htRaw === "AT-RISK";
  }).length;
  const watchingCount = customers.filter((c) => {
    const _htRaw = ((c as any).metabase_health?.tier as string | null | undefined) || "";
    return _htRaw !== "CRITICAL - DEAL BREAKER" && _htRaw !== "CRITICAL" && _htRaw !== "AT-RISK" && _htRaw !== "HEALTHY";
  }).length;
  const total = customers.length;

  return (
    <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-zoca-lg border border-zoca-border-2 bg-zoca-banner px-5 py-4">
      <div className="text-sm text-zoca-text-primary">
        <strong>Welcome back{amName ? `, ${firstName(amName)}` : ""}.</strong>{" "}
        <span className="text-zoca-text-muted">
          {total === 0
            ? "No customers in your book yet."
            : needsCallCount === 0 && watchingCount === 0
              ? `${total} customers in your book — all doing fine right now.`
              : `${needsCallCount} need a call, ${watchingCount} to watch${
                  total > 0 ? `, out of ${total} in your book.` : "."
                }`}
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-zoca-pill border border-zoca-border-2 px-3 py-1.5 text-[12px] text-zoca-text-muted transition hover:bg-zoca-bg-3/60 hover:text-zoca-text-primary"
      >
        Got it
      </button>
    </div>
  );
}

function firstName(am: string): string {
  return am.split(" ")[0] || am;
}
