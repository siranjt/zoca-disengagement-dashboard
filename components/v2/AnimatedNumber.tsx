"use client";
import * as React from "react";
import { useCountUp } from "@/lib/hooks/useCountUp";

type Props = {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Phase 22.A — drop-in animated number. Uses tabular-nums by default so
 * digits don't shift horizontally while the count climbs. Optional
 * `format` lets callers render currency / percentages / abbreviated K-M.
 */
export function AnimatedNumber({
  value,
  duration = 900,
  format,
  className,
  style,
}: Props) {
  const animated = useCountUp(value, { duration });
  const display = format ? format(animated) : animated.toLocaleString();
  return (
    <span
      className={className}
      style={{ fontVariantNumeric: "tabular-nums", ...style }}
    >
      {display}
    </span>
  );
}

export default AnimatedNumber;
