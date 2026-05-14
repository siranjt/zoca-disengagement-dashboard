/**
 * Phase 17.A — produce personalized planner hero title.
 * Examples:
 *   "Sudha's Monday planner"  (Monday + first name available)
 *   "Sudha's planner"          (other day + first name)
 *   "AM's planner"             (no name)
 */
export function formatPlannerTitle(amName: string | null | undefined, now: Date = new Date()): string {
  const firstName = (amName || "").trim().split(/\s+/)[0];
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const subject = firstName || "AM";
  const dayPrefix = day === "Monday" ? "Monday " : "";
  return `${subject}'s ${dayPrefix}planner`;
}

/**
 * Phase 17.D — produce hero title for the manager rollup view.
 *
 * Returns the canonical title shown at the top of /v2/manager. Intentionally
 * verb-first ("Team this week") to mirror the AM-side "Sudha's planner" beat
 * and to read as the lens being applied to the rollup. Keep stable — used by
 * V2ManagerHero and the dashboard hero block.
 */
export function formatManagerTitle(): string {
  return "Manager's view";
}
