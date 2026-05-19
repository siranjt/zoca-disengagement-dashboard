/**
 * BeaconMark — the four-tier stepped tower with a two-tone flame.
 *
 * Geometry (source-unit coordinates, viewBox -6 -32 12 32):
 *   Tier 1 (base):   12w × 4h   at y = -4
 *   Tier 2:          10w × 4h   at y = -10  (2-unit gap)
 *   Tier 3:           8w × 4h   at y = -16
 *   Tier 4 (top):     6w × 4h   at y = -22
 *   Flame outer:     teardrop   y = -32 to -21
 *   Flame inner:     teardrop   y = -27 to -19
 *
 * Aspect ratio: 3:8 (width:height). At size=20 → width=7.5.
 *
 * Defaults match the Zoca-dashboard palette:
 *   tower:        --zoca-text  (#0b051d)
 *   flame outer:  red          (#dc2626 — fire)
 *   flame inner:  warm yellow  (#facc15 — fire glow)
 *
 * Pass flicker={true} to enable the subtle scale-pulse animation.
 * Defined in app/globals.css as @keyframes beacon-flicker and
 * @keyframes beacon-flicker-inner (1.8s + 1.4s, so the flame never
 * looks like a single rigid shape).
 *
 * Phase 33.brand-PR1
 */

import React from "react";

interface BeaconMarkProps {
  /** Pixel height. Width is computed at 3:8 ratio. Default: 32 */
  size?: number;
  /** Override tower color. Default: --zoca-text (#0b051d) */
  towerFill?: string;
  /** Override outer flame color. Default: #dc2626 (red) */
  flameOuter?: string;
  /** Override inner flame color. Default: #facc15 (yellow) */
  flameInner?: string;
  /** Enable the subtle flame-flicker animation. Off by default. */
  flicker?: boolean;
  className?: string;
}

export function BeaconMark({
  size = 32,
  towerFill = "#0b051d",
  flameOuter = "#dc2626",
  flameInner = "#facc15",
  flicker = false,
  className,
}: BeaconMarkProps) {
  const width = Math.round((size * 12) / 32 * 100) / 100;
  return (
    <svg
      width={width}
      height={size}
      viewBox="-6 -32 12 32"
      className={className}
      role="img"
      aria-label="Beacon"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect x="-6" y="-4"  width="12" height="4" fill={towerFill} />
      <rect x="-5" y="-10" width="10" height="4" fill={towerFill} />
      <rect x="-4" y="-16" width="8"  height="4" fill={towerFill} />
      <rect x="-3" y="-22" width="6"  height="4" fill={towerFill} />
      <path
        d="M 0 -32 C 4 -28 5 -23 3 -21 L -3 -21 C -5 -23 -4 -28 0 -32 Z"
        fill={flameOuter}
        style={
          flicker
            ? {
                transformOrigin: "0px -21px",
                animation: "beacon-flicker 1.8s ease-in-out infinite",
              }
            : undefined
        }
      />
      <path
        d="M 0 -27 C 2 -24 3 -21 2 -19 L -2 -19 C -3 -21 -2 -24 0 -27 Z"
        fill={flameInner}
        style={
          flicker
            ? {
                transformOrigin: "0px -19px",
                animation: "beacon-flicker-inner 1.4s ease-in-out infinite",
              }
            : undefined
        }
      />
    </svg>
  );
}
