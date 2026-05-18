// Phase 33.C — Client-side renderer for /admin/usage.
//
// Six sections, top-to-bottom:
//   1. KPI tiles — DAU / WAU / MAU / Events 7d / Sign-ins 7d
//   2. 30-day activity chart — line: events per day + unique users per day
//   3. Per-user table — sortable. Last active, role, sign-ins, events, customer opens, pages viewed
//   4. Top endpoints — last 7 days, path frequency
//   5. Cold users alert — anyone with 7+ days of no activity (assumes they're on allowlist)
//   6. Raw feed — last 50 events, for spot-checking
//
// Brand: Zoca midnight + pink/blue. Same palette as the rest of the dashboard.

"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type {
  UsageSummary,
  DailyActivityRow,
  PerUserRow,
  TopPathRow,
  ColdUserRow,
  RecentEventRow,
} from "@/lib/usage-queries";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface Props {
  summary: UsageSummary;
  daily: DailyActivityRow[];
  perUser: PerUserRow[];
  topPaths: TopPathRow[];
  coldUsers: ColdUserRow[];
  recentEvents: RecentEventRow[];
}

type SortKey = "last_active" | "total_events" | "sign_ins" | "customer_opens" | "pages_viewed";

const fmtTimeAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

const roleColor = (role: string): string => {
  if (role === "admin") return "#ff56bb";
  if (role === "manager") return "#146ef5";
  return "#10b981";
};

const eventColor = (event: string): string => {
  if (event === "sign_in") return "#10b981";
  if (event === "page_view") return "#146ef5";
  if (event === "customer_opened") return "#ff56bb";
  if (event === "mark_contacted") return "#f59e0b";
  if (event === "note_saved") return "#047857";
  if (event === "snooze_set") return "#d97706";
  if (event === "coaching_acted") return "#8b5cf6";
  if (event === "one_on_one_opened") return "#3b82f6";
  if (event === "coaching_dismissed") return "rgba(255,255,255,0.35)";
  if (event === "filter_changed") return "rgba(255,255,255,0.55)";
  if (event === "sort_changed") return "rgba(255,255,255,0.55)";
  if (event === "view_switched") return "rgba(255,255,255,0.55)";
  if (event === "am_switched") return "rgba(255,255,255,0.55)";
  if (event === "refresh_clicked") return "rgba(255,255,255,0.55)";
  return "rgba(255,255,255,0.5)";
};

export default function AdminUsageView({
  summary,
  daily,
  perUser,
  topPaths,
  coldUsers,
  recentEvents,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("last_active");

  const chartData = useMemo(
    () => ({
      labels: daily.map((d) => d.date.slice(5)),
      datasets: [
        {
          label: "Events",
          data: daily.map((d) => d.events),
          borderColor: "#ff56bb",
          backgroundColor: "rgba(255, 86, 187, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Unique users",
          data: daily.map((d) => d.unique_users),
          borderColor: "#146ef5",
          backgroundColor: "rgba(20, 110, 245, 0.0)",
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          borderDash: [4, 4],
          yAxisID: "y1",
        },
      ],
    }),
    [daily],
  );

  const sortedUsers = useMemo(() => {
    const arr = [...perUser];
    arr.sort((a, b) => {
      if (sortKey === "last_active") {
        return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
      }
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return arr;
  }, [perUser, sortKey]);

  const maxPathHits = topPaths.length > 0 ? topPaths[0].hits : 1;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0b051d",
      color: "white",
      fontFamily: "Inter, -apple-system, sans-serif",
      padding: "48px 32px 80px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.25em",
            color: "#ff56bb",
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Admin · Usage
          </div>
          <h1 style={{
            fontSize: "2.4rem",
            fontWeight: 800,
            margin: "0 0 8px",
            background: "linear-gradient(135deg, #fff 0%, #ff86d9 60%, #5b9eff 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Who's actually using this?
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", margin: 0 }}>
            Live activity from <code style={{ fontFamily: "JetBrains Mono, monospace" }}>am_activity_log</code>. All times in your browser's local zone.
          </p>
        </div>

        {/* KPI tiles */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}>
          {[
            { label: "DAU", value: summary.dau, hint: "last 24 hours" },
            { label: "WAU", value: summary.wau, hint: "last 7 days" },
            { label: "MAU", value: summary.mau, hint: "last 30 days" },
            { label: "Events 7d", value: summary.total_events_7d, hint: "all event types" },
            { label: "Sign-ins 7d", value: summary.total_sign_ins_7d, hint: "fresh JWT logins" },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "20px 22px",
            }}>
              <div style={{
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: "rgba(255,134,225,0.85)",
                fontWeight: 700,
                marginBottom: 8,
              }}>{kpi.label}</div>
              <div style={{
                fontSize: "2.2rem",
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                lineHeight: 1,
              }}>{kpi.value}</div>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", marginTop: 8 }}>{kpi.hint}</div>
            </div>
          ))}
        </div>

        {/* 30-day chart */}
        <Section title="Activity · last 30 days" subtitle="Events per day (pink, left axis) and unique users per day (blue dashed, right axis).">
          <div style={{ height: 280 }}>
            {daily.length === 0 ? (
              <EmptyHint message="No activity data yet. Try the dashboard, refresh, click around — rows should appear here within a minute." />
            ) : (
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { labels: { color: "rgba(255,255,255,0.7)", font: { family: "Inter" } } },
                    tooltip: {
                      backgroundColor: "#150b2f",
                      borderColor: "#ff56bb",
                      borderWidth: 1,
                      titleFont: { family: "Inter" },
                      bodyFont: { family: "JetBrains Mono" },
                    },
                  },
                  scales: {
                    x: {
                      grid: { color: "rgba(255,255,255,0.06)" },
                      ticks: { color: "rgba(255,255,255,0.5)", maxRotation: 0 },
                    },
                    y: {
                      type: "linear",
                      position: "left",
                      grid: { color: "rgba(255,255,255,0.06)" },
                      ticks: { color: "rgba(255,86,187,0.8)" },
                      title: { display: true, text: "Events", color: "rgba(255,86,187,0.8)" },
                    },
                    y1: {
                      type: "linear",
                      position: "right",
                      grid: { drawOnChartArea: false },
                      ticks: { color: "rgba(20,110,245,0.8)" },
                      title: { display: true, text: "Unique users", color: "rgba(20,110,245,0.8)" },
                    },
                  },
                }}
              />
            )}
          </div>
        </Section>

        {/* Per-user table */}
        <Section
          title={`Per user · last 30 days (${perUser.length})`}
          subtitle="Sorted by last activity. Click a header to re-sort."
        >
          {perUser.length === 0 ? (
            <EmptyHint message="No users have any activity in the last 30 days." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <Th label="User" />
                    <Th label="Role" />
                    <Th label="AM book" />
                    <Th label="Last active" onClick={() => setSortKey("last_active")} active={sortKey === "last_active"} />
                    <Th label="Sign-ins" onClick={() => setSortKey("sign_ins")} active={sortKey === "sign_ins"} alignRight />
                    <Th label="Total events" onClick={() => setSortKey("total_events")} active={sortKey === "total_events"} alignRight />
                    <Th label="Pages" onClick={() => setSortKey("pages_viewed")} active={sortKey === "pages_viewed"} alignRight />
                    <Th label="Cust. opens" onClick={() => setSortKey("customer_opens")} active={sortKey === "customer_opens"} alignRight />
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => (
                    <tr key={u.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 16px 12px 0", fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px 12px 0" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          background: `${roleColor(u.role)}22`,
                          color: roleColor(u.role),
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}>{u.role}</span>
                      </td>
                      <td style={{ padding: "12px 16px 12px 0", color: "rgba(255,255,255,0.55)" }}>{u.am_name ?? "—"}</td>
                      <td style={{ padding: "12px 16px 12px 0", color: "rgba(255,255,255,0.75)" }}>{fmtTimeAgo(u.last_active)}</td>
                      <td style={{ padding: "12px 16px 12px 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{u.sign_ins}</td>
                      <td style={{ padding: "12px 16px 12px 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{u.total_events}</td>
                      <td style={{ padding: "12px 16px 12px 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{u.pages_viewed}</td>
                      <td style={{ padding: "12px 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{u.customer_opens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Cold users */}
        {coldUsers.length > 0 && (
          <Section
            title={`Cold users (${coldUsers.length})`}
            subtitle="On the allowlist but no activity in 7+ days. Worth a nudge."
            accent="warn"
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <Th label="User" />
                    <Th label="Role" />
                    <Th label="AM book" />
                    <Th label="Last active" />
                    <Th label="Days cold" alignRight />
                  </tr>
                </thead>
                <tbody>
                  {coldUsers.map((u) => (
                    <tr key={u.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 16px 12px 0", fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px 12px 0" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          background: `${roleColor(u.role)}22`,
                          color: roleColor(u.role),
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}>{u.role}</span>
                      </td>
                      <td style={{ padding: "12px 16px 12px 0", color: "rgba(255,255,255,0.55)" }}>{u.am_name ?? "—"}</td>
                      <td style={{ padding: "12px 16px 12px 0", color: "rgba(255,255,255,0.75)" }}>{fmtTimeAgo(u.last_active)}</td>
                      <td style={{ padding: "12px 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: u.days_inactive > 14 ? "#ef4444" : "#f59e0b", fontWeight: 700 }}>{u.days_inactive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Top endpoints */}
        <Section
          title={`Top endpoints · last 7 days (${topPaths.length})`}
          subtitle="From api_call rows with metadata.path. Shows backend traffic shape."
        >
          {topPaths.length === 0 ? (
            <EmptyHint message="No api_call rows have metadata.path yet. Did Phase 33.B.6 (path capture) deploy? After it does, this populates within a minute." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topPaths.map((p) => (
                <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 10 }}>
                  <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.82rem", flex: 1, color: "rgba(255,255,255,0.85)" }}>{p.path}</code>
                  <div style={{ width: 180, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{
                      width: `${(p.hits / maxPathHits) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #ff56bb, #146ef5)",
                      borderRadius: 999,
                    }} />
                  </div>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem", color: "white", fontWeight: 700, minWidth: 50, textAlign: "right" }}>{p.hits}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", minWidth: 60, textAlign: "right" }}>{p.unique_users}u</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Raw event feed */}
        <Section
          title="Latest 50 events"
          subtitle="Live tail. Useful for confirming events are landing as expected."
        >
          {recentEvents.length === 0 ? (
            <EmptyHint message="No events yet." />
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead style={{ position: "sticky", top: 0, background: "#0b051d", zIndex: 1 }}>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <Th label="When" small />
                    <Th label="User" small />
                    <Th label="Event" small />
                    <Th label="Surface / path" small />
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "8px 12px 8px 14px", fontFamily: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.55)" }}>{fmtTimeAgo(e.ts)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.8)" }}>{e.email}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ color: eventColor(e.event_name), fontWeight: 600 }}>{e.event_name}</span>
                      </td>
                      <td style={{ padding: "8px 14px 8px 12px", fontFamily: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.5)" }}>
                        {e.path ?? e.surface ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: "0.75rem",
          fontFamily: "JetBrains Mono, monospace",
          color: "rgba(255,255,255,0.4)",
        }}>
          Phase 33.C · Admin · Usage · See <code>docs/usage-tracking.md</code> for schema + query patterns.
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tiny presentational subcomponents (kept local to avoid a new file).
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "warn";
  children: React.ReactNode;
}) {
  return (
    <section style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005))",
      border: `1px solid ${accent === "warn" ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 18,
      padding: "24px 28px",
      marginBottom: 24,
    }}>
      <h2 style={{
        fontSize: "1.15rem",
        fontWeight: 700,
        margin: "0 0 4px",
        color: accent === "warn" ? "#f59e0b" : "white",
      }}>{title}</h2>
      {subtitle && (
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 18px" }}>{subtitle}</p>
      )}
      {children}
    </section>
  );
}

function Th({
  label,
  onClick,
  active,
  alignRight,
  small,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  alignRight?: boolean;
  small?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: alignRight ? "right" : "left",
        padding: small ? "10px 12px" : "12px 16px 12px 0",
        fontSize: small ? "0.65rem" : "0.7rem",
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        fontWeight: 700,
        color: active ? "#ff86d9" : "rgba(255,255,255,0.5)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {label}{onClick && active ? " ▾" : ""}
    </th>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div style={{
      padding: "32px 24px",
      textAlign: "center",
      color: "rgba(255,255,255,0.45)",
      fontSize: "0.9rem",
      background: "rgba(255,255,255,0.02)",
      border: "1px dashed rgba(255,255,255,0.08)",
      borderRadius: 12,
    }}>
      {message}
    </div>
  );
}
