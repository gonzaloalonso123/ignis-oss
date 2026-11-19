"use client"
import { useEffect, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { getFlamePalette, type FlamePalette, type FlameVariant } from "@/app/avatar";

export const THEME_COLORS = {
  light: "#f3efe8",
  dark: "#12110f",
} as const;

export function flameDotBackground(palette: FlamePalette, gradient = true): string {
  if (!gradient) return palette.mid;
  return `radial-gradient(circle at 35% 35%, ${palette.inner}, ${palette.mid} 60%, ${palette.outer})`;
}

export function PaletteDot({
  palette,
  variant,
  seed,
  size = "sm",
  live = false,
  gradient = true,
  className = "",
  title,
}: {
  palette?: FlamePalette;
  variant?: FlameVariant;
  seed?: string;
  size?: "xs" | "sm" | "md" | "lg";
  live?: boolean;
  gradient?: boolean;
  className?: string;
  title?: string;
}) {
  const resolved = palette ?? getFlamePalette(variant, seed);
  const sizeClass =
    size === "xs"
      ? "size-1.5"
      : size === "sm"
        ? "size-2"
        : size === "md"
          ? "size-2.5"
          : "size-3.5";

  return (
    <span
      title={title}
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${live ? "dot-live" : ""} ${className}`}
      style={{ background: flameDotBackground(resolved, gradient) }}
    />
  );
}

export type BadgeTone = "neutral" | "surface" | "ember" | "ember-soft" | "ok" | "bad" | "ink";

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-recess text-muted",
  surface: "bg-paper-raised text-muted",
  ink: "bg-recess text-ink",
  ember: "bg-recess text-ember",
  "ember-soft": "bg-ember/15 text-ember",
  ok: "bg-ok/15 text-ok",
  bad: "bg-recess text-bad",
};

export function Badge({
  tone = "neutral",
  pill = false,
  live = false,
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"span"> & {
  tone?: BadgeTone;
  pill?: boolean;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 font-mono text-2xs tabular-nums ${
        pill ? "rounded-full px-2 py-0.5" : "rounded px-1.5 py-0.5"
      } ${BADGE_TONE_CLASSES[tone]} ${live ? "dot-live" : ""} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function SurfaceCard({
  subtle = false,
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  subtle?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-line ${
        subtle ? "bg-recess/40" : "bg-paper-raised"
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3.5 3.5l7 7m0-7l-7 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.2 6.3 4.8 8.9 9.8 3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="6.2"
        height="6.2"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M2.6 8H2.2A1.2 1.2 0 0 1 1 6.8V2.2A1.2 1.2 0 0 1 2.2 1h4.6A1.2 1.2 0 0 1 8 2.2v.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowUpIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M7.5 12.5V3.2M3.6 6.6 7.5 2.7l3.9 3.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowDownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 2.2v7.2M2.8 6.6 6 9.8l3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h12M4 10h12M4 14.5h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChatBubbleIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H6.5A2.5 2.5 0 0 1 4 10.5v-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function formatShortRelativeTime(iso: string): string {
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const targetMs = Date.parse(iso);
  if (Number.isNaN(targetMs)) return iso;
  const diffMs = targetMs - Date.now();
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  if (absSec < 45) return diffMs >= 0 ? "in moments" : "just now";
  const mins = Math.round(absSec / 60);
  if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) {
    const label = remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
    return diffMs >= 0 ? `in ${label}` : `${label} ago`;
  }
  const days = Math.floor(hrs / 24);
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function formatShortTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useEscapeKey(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, enabled]);
}
