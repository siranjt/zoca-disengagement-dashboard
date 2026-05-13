"use client";
import { ZocaLogo } from "./ZocaLogo";

type Props = {
  generatedAt?: string | null;
};

function relativeAge(generatedAt: string | null | undefined): string {
  if (!generatedAt) return "—";
  const ms = Date.now() - Date.parse(generatedAt);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function V2Header({ generatedAt }: Props) {
  return (
    <nav
      className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 border-b border-zoca-border backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.85)" }}
    >
      <a
        href="/v2"
        className="flex items-center gap-3 no-underline"
        aria-label="Zoca Customer Health home"
      >
        <ZocaLogo height={20} color="var(--zoca-text)" />
        <span className="text-zoca-text-3 text-xs">|</span>
        <span
          className="text-zoca-text text-[13px] font-medium"
          style={{ letterSpacing: "-0.005em" }}
        >
          Customer Health
        </span>
      </a>
      <div className="flex items-center gap-3 text-[11px] text-zoca-text-2">
        <span className="zoca-pulse-dot-green" />
        <span>Live · Chargebee + HubSpot + Claude</span>
        <span className="text-zoca-text-3">·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{relativeAge(generatedAt)}</span>
      </div>
    </nav>
  );
}

export default V2Header;
