import type { FlamePalette, FlameVariant } from "../types.ts";

export const FLAME_PALETTES: Record<FlameVariant, FlamePalette> = {
  default: {
    name: "default",
    label: "Sovereign Ember",
    outer: "#f31820",
    mid: "#ff8100",
    inner: "#ffdc00",
    eye: "#35251e",
    glow: "rgba(224, 138, 60, 0.28)",
  },
  azure: {
    name: "azure",
    label: "Azure Spark",
    outer: "#1d4ed8",
    mid: "#0ea5e9",
    inner: "#a5f3fc",
    eye: "#0f172a",
    glow: "rgba(14, 165, 233, 0.28)",
  },
  emerald: {
    name: "emerald",
    label: "Emerald Flame",
    outer: "#047857",
    mid: "#10b981",
    inner: "#bbf7d0",
    eye: "#062c21",
    glow: "rgba(16, 185, 129, 0.28)",
  },
  violet: {
    name: "violet",
    label: "Violet Aether",
    outer: "#6d28d9",
    mid: "#a855f7",
    inner: "#f5d0fe",
    eye: "#241042",
    glow: "rgba(168, 85, 247, 0.28)",
  },
  crimson: {
    name: "crimson",
    label: "Crimson Flare",
    outer: "#9f1239",
    mid: "#f43f5e",
    inner: "#fecdd3",
    eye: "#380818",
    glow: "rgba(244, 63, 94, 0.28)",
  },
  gold: {
    name: "gold",
    label: "Solar Gold",
    outer: "#b45309",
    mid: "#f59e0b",
    inner: "#fef08a",
    eye: "#2e1705",
    glow: "rgba(245, 158, 11, 0.28)",
  },
  teal: {
    name: "teal",
    label: "Glacier Teal",
    outer: "#0f766e",
    mid: "#14b8a6",
    inner: "#99f6e4",
    eye: "#092624",
    glow: "rgba(20, 184, 166, 0.28)",
  },
};

export const SUBAGENT_VARIANTS: FlameVariant[] = [
  "azure",
  "emerald",
  "violet",
  "crimson",
  "gold",
  "teal",
];

export const FLAME_VARIANTS: FlameVariant[] = [...SUBAGENT_VARIANTS, "default"];

export function resolveFlameVariant(variant?: FlameVariant, seed?: string): FlameVariant {
  if (variant && Object.prototype.hasOwnProperty.call(FLAME_PALETTES, variant)) {
    return variant;
  }
  if (!seed || !seed.trim() || seed === "root" || seed === "sovereign" || seed === "default") {
    return "default";
  }
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % SUBAGENT_VARIANTS.length;
  return SUBAGENT_VARIANTS[index] ?? "azure";
}

export function getFlamePalette(variant?: FlameVariant, seed?: string): FlamePalette {
  const resolved = resolveFlameVariant(variant, seed);
  return FLAME_PALETTES[resolved];
}
