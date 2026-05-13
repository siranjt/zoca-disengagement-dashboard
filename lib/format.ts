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
