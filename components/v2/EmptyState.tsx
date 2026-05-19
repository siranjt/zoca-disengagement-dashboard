"use client";
// Phase 33.brand-watchfire-pink-sweep-v2 (2 hex/rgba + 0 tailwind-rose swept)

import * as React from "react";

type Variant = "all-clear" | "filter-empty" | "snoozed-none" | "pinned-none";

type Props = {
  variant?: Variant;
  title: string;
  subtitle?: string;
};

/**
 * Phase 22.A — animated empty-state. Renders a bouncing circle with a
 * stroked checkmark that draws in over 1s. Used in V2AMTriage when the
 * current filter has zero matching customers (caught up / nothing pinned
 * / nothing snoozed / etc.).
 */
export function EmptyState({ variant = "filter-empty", title, subtitle }: Props) {
  const accent = variant === "all-clear" ? "#10b981" : "#C8431D";
  const bg =
    variant === "all-clear" ? "rgba(16,185,129,0.10)" : "rgba(200, 67, 29, 0.10)";
  return (
    <div
      className="zoca-fade-in"
      style={{ textAlign: "center", padding: "48px 24px" }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: bg,
          marginBottom: 14,
          animation: "v2-bounce 2s ease-in-out infinite",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 100,
            strokeDashoffset: 0,
            animation: "v2-check 1s cubic-bezier(0.4,0,0.2,1) 0.2s forwards",
            opacity: 0,
          }}
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--zoca-text)",
          marginBottom: 6,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 13,
            color: "var(--zoca-text-2)",
            lineHeight: 1.5,
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
