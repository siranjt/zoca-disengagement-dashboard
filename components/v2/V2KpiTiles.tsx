"use client";

// Phase 33.D — KPI tiles with proper filter wiring.
//
// Previously: every tile rendered `<a href={tile.href || "#"}>` and the
// "selected" prop was just a visual hint (no actual filter). Need to call /
// Watch / Healthy all looked clickable but only Need-to-call had a pink
// outline — Watch & Healthy did nothing on click.
//
// Phase 33.D:
//   - `onClick` is now a first-class prop. If set, clicking the tile fires
//     the handler instead of navigating. Existing `href` still works as a
//     fallback for tiles that are just deep-links.
//   - The `selected` pink-outline treatment is independent of which tile it
//     decorates — wire it to your filter state and it'll Just Work.

import { AnimatedNumber } from "./AnimatedNumber";
import { useTilt } from "@/lib/hooks/useTilt";

type Tile = {
  label: string;
  value: number | string;
  subtitle: string;
  color: "midnight" | "pink" | "amber" | "green";
  href?: string;
  /** Phase 33.D — fires on click. If set, prevents default <a> navigation. */
  onClick?: () => void;
  selected?: boolean;
};

type Props = {
  tiles: Tile[];
};

const COLORS: Record<Tile["color"], string> = {
  midnight: "var(--zoca-text)",
  pink: "var(--zoca-pink)",
  amber: "#b45309",
  green: "#047857",
};

// Selected-state palette — kept per color so each tile glows in its own hue.
const SELECTED_OUTLINE: Record<Tile["color"], { border: string; shadow: string; gradient: string; labelColor: string }> = {
  midnight: {
    border: "var(--zoca-text)",
    shadow: "0 0 0 1px rgba(11,5,29,0.25), 0 0 24px rgba(11,5,29,0.18)",
    gradient: "linear-gradient(180deg, rgba(11,5,29,0.04), rgba(11,5,29,0.06)), #fff",
    labelColor: "var(--zoca-text)",
  },
  pink: {
    border: "var(--zoca-pink)",
    shadow: "0 0 0 1px rgba(255,86,187,0.35), 0 0 24px rgba(255,168,205,0.35)",
    gradient: "linear-gradient(180deg, rgba(255,86,187,0.04), rgba(255,168,205,0.06)), #fff",
    labelColor: "#c026d3",
  },
  amber: {
    border: "#f59e0b",
    shadow: "0 0 0 1px rgba(245,158,11,0.35), 0 0 24px rgba(252,211,77,0.35)",
    gradient: "linear-gradient(180deg, rgba(245,158,11,0.04), rgba(252,211,77,0.06)), #fff",
    labelColor: "#b45309",
  },
  green: {
    border: "#10b981",
    shadow: "0 0 0 1px rgba(16,185,129,0.35), 0 0 24px rgba(110,231,183,0.35)",
    gradient: "linear-gradient(180deg, rgba(16,185,129,0.04), rgba(110,231,183,0.06)), #fff",
    labelColor: "#047857",
  },
};

export function V2KpiTiles({ tiles }: Props) {
  return (
    <div
      className="mx-6 mb-6 grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}
    >
      {tiles.map((tile, i) => (
        <KpiTile key={i} tile={tile} index={i} />
      ))}
    </div>
  );
}

function KpiTile({ tile, index }: { tile: Tile; index: number }) {
  const isSelected = !!tile.selected;
  const sel = isSelected ? SELECTED_OUTLINE[tile.color] : null;
  const tiltRef = useTilt<HTMLAnchorElement>();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (tile.onClick) {
      e.preventDefault();
      tile.onClick();
    }
    // If only `href` is set, let the default navigation happen.
  };

  return (
    <a
      ref={tiltRef}
      href={tile.href || "#"}
      onClick={handleClick}
      role={tile.onClick && !tile.href ? "button" : undefined}
      aria-pressed={tile.onClick ? isSelected : undefined}
      className="block bg-white rounded-2xl px-4 py-4 no-underline transition cursor-pointer"
      style={{
        border: sel ? `1px solid ${sel.border}` : "1px solid var(--zoca-border)",
        boxShadow: sel ? sel.shadow : "0 1px 3px rgba(11,5,29,0.04)",
        background: sel ? sel.gradient : "#fff",
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="zoca-micro-label"
          style={sel ? { color: sel.labelColor } : undefined}
        >
          {tile.label}
        </span>
        <span
          className="text-[13px] text-zoca-text-3"
          style={sel ? { color: sel.border } : undefined}
        >
          →
        </span>
      </div>
      <div
        className="font-extrabold leading-none"
        style={{
          fontSize: "32px",
          color: COLORS[tile.color],
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {typeof tile.value === "number" ? (
          <AnimatedNumber value={tile.value} duration={900} style={{ animationDelay: `${index * 80}ms` }} />
        ) : (
          tile.value
        )}
      </div>
      <div className="text-[11px] text-zoca-text-2 mt-1.5">{tile.subtitle}</div>
    </a>
  );
}

export default V2KpiTiles;
