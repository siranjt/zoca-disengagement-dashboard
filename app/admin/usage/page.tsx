// Phase 33.C — /admin/usage page.
//
// Server component. Resolves the session, double-checks admin role
// (middleware already gates /admin/*, this is belt-and-braces), then
// fetches six aggregates from am_activity_log and hands them to
// AdminUsageView for rendering.
//
// All data is at most 30 days old (older rows would need a wider window
// — easy follow-up). Defaults are tuned for daily ops: DAU/WAU/MAU on top,
// 30-day trend chart, per-user table, top endpoints, cold users, raw feed.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  getUsageSummary,
  getDailyActivity,
  getPerUserStats,
  getTopPaths,
  getColdUsers,
  getRecentEvents,
} from "@/lib/usage-queries";
import AdminUsageView from "./AdminUsageView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUsagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }
  if (session.user.role !== "admin") {
    redirect("/v2");
  }

  // Fetch all six aggregates in parallel — Postgres can handle it.
  const [summary, daily, perUser, topPaths, coldUsers, recentEvents] =
    await Promise.all([
      getUsageSummary(),
      getDailyActivity(30),
      getPerUserStats(),
      getTopPaths(15),
      getColdUsers(7),
      getRecentEvents(50),
    ]);

  return (
    <AdminUsageView
      summary={summary}
      daily={daily}
      perUser={perUser}
      topPaths={topPaths}
      coldUsers={coldUsers}
      recentEvents={recentEvents}
    />
  );
}
