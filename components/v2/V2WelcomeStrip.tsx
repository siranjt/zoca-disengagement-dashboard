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
  const total = customers.length;

  return (
    <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-zoca-lg border border-zoca-border-2 bg-zoca-banner px-5 py-4">
      <div className="text-sm text-zoca-text-primary">
        <strong>Welcome back{amName ? `, ${firstName(amName)}` : ""}.</strong>{" "}
        <span className="text-zoca-text-muted">
          {total === 0
            ? "No customers in your book yet."
            : redCount === 0 && yellowCount === 0
              ? `${total} customers in your book — all doing fine right now.`
              : `${redCount} needs attention, ${yellowCount} to keep an eye on${
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
