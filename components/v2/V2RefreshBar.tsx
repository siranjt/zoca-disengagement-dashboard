"use client";
import { useState } from "react";

type Props = {
  showing?: number;
  total?: number;
  generatedAt?: string | null;
  amName?: string | null;
  pod?: string | null;
};

export function V2RefreshBar({ showing, total, generatedAt, amName, pod }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v2/refresh", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Refresh failed");
      window.location.reload();
    } catch (e) {
      alert(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      setRefreshing(false);
    }
  }

  const time = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";
  const date = generatedAt ? new Date(generatedAt).toISOString().slice(0, 10) : "";

  return (
    <div
      className="mx-6 mb-4 rounded-2xl border border-zoca-border bg-white px-5 py-3.5 flex items-center justify-between flex-wrap gap-3"
      style={{ boxShadow: "0 4px 18px rgba(11,5,29,0.04)" }}
    >
      <div className="flex items-center gap-5 flex-wrap text-[12px] text-zoca-text">
        <span>
          <span className="zoca-micro-label">Showing</span>{" "}
          <strong className="ml-1.5 font-semibold">
            {showing ?? 0} / {total ?? 0}
          </strong>
        </span>
        <span className="text-zoca-text-3">·</span>
        <span>
          <span className="zoca-micro-label">Last refresh</span>{" "}
          <strong
            className="ml-1.5 font-semibold"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {time}
          </strong>
        </span>
        {date && (
          <>
            <span className="text-zoca-text-3">·</span>
            <span className="text-zoca-text-2 text-[11px]">
              {date}
              {amName ? ` · ${amName}` : ""}
              {pod ? ` · ${pod}` : ""}
            </span>
          </>
        )}
      </div>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold cursor-pointer transition disabled:opacity-50"
        style={{
          background: "transparent",
          color: "var(--zoca-pink)",
          border: "1px solid rgba(255,86,187,0.32)",
          letterSpacing: "-0.005em",
        }}
        onMouseEnter={(e) => {
          if (!refreshing) {
            e.currentTarget.style.boxShadow = "0 0 18px rgba(255,168,205,0.4)";
            e.currentTarget.style.background = "rgba(255,134,225,0.04)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            border: "1.5px solid currentColor",
            display: "inline-block",
          }}
        />
        {refreshing ? "Refreshing…" : "Refresh live data"}
      </button>
    </div>
  );
}

export default V2RefreshBar;
