"use client";

// ---------------------------------------------------------------------------
// Phase 23.A — book health donut.
//
// Renders the RED / Yellow / Green distribution of the current AM's book as
// a clickable doughnut. Each slice routes to /v2 with a stoplight filter so
// the user can drill into the cohort they just clicked.
//
// Reuses AnimatedNumber + Toast from Phase 22.A and the shared chart-theme
// constants so animation cadence matches every other Phase-22 surface.
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

ChartJS.register(ArcElement, Tooltip, Legend);

type Props = {
  redCount: number;
  yellowCount: number;
  greenCount: number;
  amName: string;
};

export function BookHealthDonut({
  redCount,
  yellowCount,
  greenCount,
  amName,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const total = redCount + yellowCount + greenCount;

  const data = {
    labels: ["RED", "Yellow", "Green"],
    datasets: [
      {
        data: [redCount, yellowCount, greenCount],
        backgroundColor: [
          CHART_COLORS.red,
          CHART_COLORS.amber,
          CHART_COLORS.green,
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
    animation: {
      animateRotate: true,
      duration: CHART_ANIMATION.duration,
      easing: CHART_ANIMATION.easing,
    },
    plugins: {
      legend: { display: false },
      tooltip: CHART_TOOLTIP_STYLE,
    },
    onClick: (_e: unknown, els: { index: number }[]) => {
      if (!els[0]) return;
      const lanes = ["act", "improving", "quiet"];
      const labels = ["RED", "Yellow", "Green"];
      const counts = [redCount, yellowCount, greenCount];
      const idx = els[0].index;
      const filterValue = lanes[idx];
      const params = new URLSearchParams();
      params.set("am", amName);
      params.set("filter", filterValue);
      router.push(`/v2?${params.toString()}`);
      showToast(
        `Filtered to ${labels[idx]} - ${counts[idx]} customers`,
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
        <AnimatedNumber value={total} /> customers - click to filter
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          marginBottom: "8px",
          fontSize: "11px",
          color: CHART_COLORS.muted,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: CHART_COLORS.red,
            }}
          ></span>
          RED{" "}
          <strong style={{ color: CHART_COLORS.midnight, fontWeight: 600 }}>
            <AnimatedNumber value={redCount} />
          </strong>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: CHART_COLORS.amber,
            }}
          ></span>
          Yellow{" "}
          <strong style={{ color: CHART_COLORS.midnight, fontWeight: 600 }}>
            <AnimatedNumber value={yellowCount} />
          </strong>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: CHART_COLORS.green,
            }}
          ></span>
          Green{" "}
          <strong style={{ color: CHART_COLORS.midnight, fontWeight: 600 }}>
            <AnimatedNumber value={greenCount} />
          </strong>
        </span>
      </div>
      <div style={{ position: "relative", width: "100%", height: "180px" }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Doughnut data={data} options={options as any} />
      </div>
    </div>
  );
}
