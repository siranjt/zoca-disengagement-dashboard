"use client";

// ---------------------------------------------------------------------------
// Phase 33.E.7 — 4-tier book health donut (Critical / At-risk / Monitor / Healthy)
//
// Renders the 4-tier distribution of the current AM's book as a clickable
// doughnut. Each slice routes to /v2 with a tier filter so the user can
// drill into the cohort they just clicked.
//
// Replaces the Phase 23.A 3-segment donut (RED/Yellow/Green).
// ---------------------------------------------------------------------------

import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useRouter } from "next/navigation";
import { useToast } from "../Toast";
import {
  CHART_COLORS,
  CHART_ANIMATION,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chart-theme";
import { AnimatedNumber } from "../AnimatedNumber";
import { HEALTH_TIER_COLORS } from "@/lib/config";

ChartJS.register(ArcElement, Tooltip, Legend);

type Props = {
  criticalCount: number;
  atRiskCount: number;
  monitorCount: number;
  healthyCount: number;
  amName: string;
};

export function BookHealthDonut({
  criticalCount,
  atRiskCount,
  monitorCount,
  healthyCount,
  amName,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const total = criticalCount + atRiskCount + monitorCount + healthyCount;

  const data = {
    labels: ["Critical", "At-risk", "Monitor", "Healthy"],
    datasets: [
      {
        data: [criticalCount, atRiskCount, monitorCount, healthyCount],
        backgroundColor: [
          HEALTH_TIER_COLORS.CRITICAL,
          HEALTH_TIER_COLORS["AT-RISK"],
          HEALTH_TIER_COLORS.MONITOR,
          HEALTH_TIER_COLORS.HEALTHY,
        ],
        borderWidth: 2,
        borderColor: CHART_COLORS.bg,
        hoverBorderWidth: 3,
        hoverOffset: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    // Phase 33.brand-watchfire-PR6-complete — spec §11 row 9: 1.5s clockwise sweep.
    animation: {
      animateRotate: true,
      animateScale: false,
      duration: 1500,
      easing: CHART_ANIMATION.easing,
    },
    rotation: -90,
    plugins: {
      legend: { display: false },
      tooltip: CHART_TOOLTIP_STYLE,
    },
    onClick: (_e: unknown, els: { index: number }[]) => {
      if (!els[0]) return;
      const tiers = ["CRITICAL", "AT-RISK", "MONITOR", "HEALTHY"];
      const labels = ["Critical", "At-risk", "Monitor", "Healthy"];
      const counts = [criticalCount, atRiskCount, monitorCount, healthyCount];
      const idx = els[0].index;
      const tierValue = tiers[idx];
      const params = new URLSearchParams();
      params.set("am", amName);
      params.set("tier", tierValue);
      router.push(`/v2?${params.toString()}`);
      showToast(
        `Filtered to ${labels[idx]} — ${counts[idx]} customers`,
        { type: "info", icon: "filter" },
      );
    },
    onHover: (
      e: { native?: { target?: HTMLElement } } | null,
      els: unknown[],
    ) => {
      if (e?.native?.target) {
        e.native.target.style.cursor = els[0] ? "pointer" : "default";
      }
    },
  } as const;

  return (
    <div
      className="zoca-card"
      style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          fontSize: "10px",
          color: CHART_COLORS.muted,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "4px",
        }}
      >
        Book health
      </div>
      <div
        style={{
          fontSize: "11px",
          color: CHART_COLORS.muted,
          marginBottom: "10px",
        }}
      >
        <AnimatedNumber value={total} /> customers — click to filter
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 10px",
          marginBottom: "8px",
          fontSize: "11px",
          color: CHART_COLORS.muted,
        }}
      >
        <LegendChip color={HEALTH_TIER_COLORS.CRITICAL} label="Critical" value={criticalCount} />
        <LegendChip color={HEALTH_TIER_COLORS["AT-RISK"]} label="At-risk" value={atRiskCount} />
        <LegendChip color={HEALTH_TIER_COLORS.MONITOR} label="Monitor" value={monitorCount} />
        <LegendChip color={HEALTH_TIER_COLORS.HEALTHY} label="Healthy" value={healthyCount} />
      </div>
      <div style={{ position: "relative", width: "100%", height: "180px" }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Doughnut data={data} options={options as any} />
      </div>
    </div>
  );
}

function LegendChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
        }}
      ></span>
      {label}{" "}
      <strong style={{ color: CHART_COLORS.midnight, fontWeight: 600 }}>
        <AnimatedNumber value={value} />
      </strong>
    </span>
  );
}
