// ---------------------------------------------------------------------------
// Phase 23.A — shared chart-theme constants.
//
// Centralizes color palette, animation timing, and tooltip style so every
// chart component in /v2 stays visually coordinated. The palette mirrors
// the Zoca brand tokens used elsewhere in the dashboard (pink for RED,
// amber for YELLOW, green for healthy) — keeping these in one module
// means the day we re-skin to dark mode, only one file changes.
//
// Animation timing matches Phase 22's 1100ms ease-out cubic curve so chart
// entrance feels continuous with the rest of the UI (AnimatedNumber on KPI
// tiles, card stagger, etc.).
// ---------------------------------------------------------------------------

export const CHART_COLORS = {
  red: "#ff56bb",
  amber: "#f59e0b",
  green: "#10b981",
  blue: "#3b82f6",
  purple: "#7c3aed",
  rose: "#ec4899",
  midnight: "#0b051d",
  muted: "#696376",
  bg: "#fafafa",
  gridLine: "rgba(0,0,0,0.04)",
} as const;

export const CHART_ANIMATION = {
  duration: 1100,
  easing: "easeOutCubic" as const,
};

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#0b051d",
  padding: 10,
  cornerRadius: 8,
  titleFont: { size: 12, weight: "600" as const },
  bodyFont: { size: 12 },
};
