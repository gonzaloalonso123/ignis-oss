"use client";

import { memo } from "react";
import { Flame } from "./character/Flame";
import { getFlamePalette } from "./character/palettes";
import { useCozyAnimation } from "./animation/useCozyAnimation";
import type { CozyAvatarProps } from "./types";

export const CozyAvatar = memo(function CozyAvatar({
  variant,
  seed,
  size = 320,
  cropped = false,
  paused = false,
  reducedMotion = "system",
  action = "idle",
  className,
  style,
  label,
  decorative = false,
}: CozyAvatarProps) {
  const palette = getFlamePalette(variant, seed);
  const ref = useCozyAnimation({
    paused,
    reducedMotion,
    action,
  });
  return (
    <svg
      ref={ref}
      viewBox={cropped ? "155 60 280 285" : "0 0 600 410"}
      className={className}
      width={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (label ?? "Ignis")}
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        overflow: "visible",
        ...style,
      }}
    >
      <g transform="translate(290 325) scale(.84)">
        <Flame palette={palette} />
      </g>
    </svg>
  );
});
