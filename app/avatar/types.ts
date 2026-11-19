import type { CSSProperties } from "react";

export type FlameVariant =
  | "default"
  | "azure"
  | "emerald"
  | "violet"
  | "crimson"
  | "gold"
  | "teal";

export type CozyAction = "idle" | "wave" | "computer" | "superpower";

export interface FlamePalette {
  name: FlameVariant;
  label: string;
  outer: string;
  mid: string;
  inner: string;
  eye: string;
  glow: string;
}

export interface FrameContext {
  set: (name: string, attribute: string, value: string | number) => void;
  t: number;
  reduced: boolean;
  action?: CozyAction;
}

export interface AnimationConfig {
  paused: boolean;
  reducedMotion: boolean | "system";
  action?: CozyAction;
}

export interface CozyAvatarProps {
  variant?: FlameVariant;
  seed?: string;
  size?: number | string;
  cropped?: boolean;
  paused?: boolean;
  reducedMotion?: boolean | "system";
  action?: CozyAction;
  className?: string;
  style?: CSSProperties;
  label?: string;
  /** Hide from assistive technology when adjacent text already labels it. */
  decorative?: boolean;
}
