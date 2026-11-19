import { paintFrame } from "./paint";
import type { AnimationConfig } from "../types";

/** One controller per mounted avatar. Supports both live rAF and deterministic export time (`window.__exportTimeSec`). */
export function createController(
  root: SVGSVGElement,
  initial: AnimationConfig,
) {
  let config = initial;
  let time = 1;
  let computerWeight = initial.action === "computer" ? 1 : 0;
  let waveWeight = initial.action === "wave" ? 1 : 0;
  let superWeight = initial.action === "superpower" ? 1 : 0;
  let computerAge = 0;
  let last: number | null = null;
  let frameId: number | null = null;
  let disposed = false;
  let visible = true;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const elements = new Map<string, Element>();
  const set = (name: string, key: string, value: string | number) => {
    let element = elements.get(name);
    if (!element) {
      element = root.querySelector(`[data-${name}]`) ?? undefined;
      if (!element) return;
      elements.set(name, element);
    }
    element.setAttribute(key, String(value));
  };
  const reduced = () =>
    config.reducedMotion === "system" ? media.matches : config.reducedMotion;
  const paint = () =>
    paintFrame({
      set,
      t: time,
      reduced: reduced(),
      action: config.action,
      computerWeight,
      waveWeight,
      superWeight,
      computerAge,
    });
  const cancel = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    last = null;
  };

  // Step physics by an exact delta-time `dt` (used by both live rAF and deterministic video export)
  const stepByDt = (dt: number) => {
    time += dt;
    const targetComp = config.action === "computer" ? 1 : 0;
    const targetWave = config.action === "wave" ? 1 : 0;
    const targetSuper = config.action === "superpower" ? 1 : 0;
    const rate = Math.min(1, dt * 5.0);
    computerWeight += (targetComp - computerWeight) * rate;
    waveWeight += (targetWave - waveWeight) * rate;
    superWeight += (targetSuper - superWeight) * rate;
    if (targetComp > 0.5 || computerWeight > 0.05) {
      computerAge += dt;
    } else {
      computerAge = 0;
    }
    paint();
  };

  const tick = (now: number) => {
    frameId = null;
    if (disposed || config.paused || reduced() || !visible || document.hidden)
      return;
    // If deterministic export mode is driving the clock, do not advance by wall-clock time!
    if (typeof window !== "undefined" && (window as any).__exportManualClock === true) {
      return;
    }
    const dt = last === null ? 0 : Math.min(0.04, (now - last) / 1000);
    last = now;
    stepByDt(dt);
    frameId = requestAnimationFrame(tick);
  };

  // Register this avatar controller on `root` so deterministic video export can step all avatars by exact 1/FPS!
  (root as any).__stepExportAvatar = (dt: number) => {
    stepByDt(dt);
  };

  const sync = () => {
    if (typeof window !== "undefined" && (window as any).__exportManualClock === true) {
      cancel();
      paint();
      return;
    }
    const shouldRun = !disposed && !config.paused && !reduced() && visible && !document.hidden;
    if (shouldRun && frameId !== null) {
      return;
    }
    cancel();
    if (disposed) return;
    if (reduced()) {
      paint();
    }
    if (shouldRun) {
      frameId = requestAnimationFrame(tick);
    }
  };
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
  observer?.observe(root);
  media.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  paint();
  sync();
  return {
    update(next: AnimationConfig) {
      config = next;
      if (
        config.paused ||
        reduced() ||
        (typeof window !== "undefined" && (window as any).__exportManualClock === true)
      ) {
        paint();
      }
      sync();
    },
    dispose() {
      disposed = true;
      cancel();
      observer?.disconnect();
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      elements.clear();
    },
  };
}
