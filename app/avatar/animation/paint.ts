import { FLAME_PATHS } from "../character/paths";
import type { FrameContext } from "../types";

const tokens = Object.entries(FLAME_PATHS).map(([name, d], index) => ({
  name,
  index,
  tokens: d.match(/[MCQZ]|-?\d*\.?\d+/g)!,
}));

export function smooth(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

export function paintFrame(
  ctx: FrameContext & {
    computerWeight?: number;
    waveWeight?: number;
    superWeight?: number;
    computerAge?: number;
  },
) {
  const {
    set,
    t,
    reduced,
    computerWeight = 0,
    waveWeight = 0,
    superWeight = 0,
    computerAge = 0,
  } = ctx;
  const layers = tokens.map((l) => ({
    ...l,
    el: {
      setAttribute: (key: string, value: string) => set(l.name, key, value),
    },
  }));

  function point(x: number, y: number, i: number) {
    const h = Math.max(0, -y / 276);
    const a = h ** 1.48;
    const q = reduced ? 0 : 1;
    // IMPORTANT: Keep `speed` constant (3.3) so changing action weights NEVER multiplies `t` and causes phase-jump teleports!
    const speed = 3.3;
    const phase = t * speed - h * 7.2 + i * 1.5;
    const wave =
      Math.sin(phase) +
      0.44 * Math.sin(phase * 1.65 + 0.8) +
      0.16 * Math.cos(t * 2.9 - h * 4);
    const squeeze =
      q *
      (12.5 * Math.sin(t * 2.15 + i * 2) + 8.5 * Math.sin(t * 3.8 - i)) *
      a;
    // Smooth additive wave/superpower motion (zero frequency jumps!)
    const waveBounce = (waveWeight * 0.7 + superWeight * 0.5) * Math.sin(t * 5.2) * 10 * a;
    const superLift = superWeight * 10 * a;
    return [
      x + q * 22 * a * wave + Math.tanh(x / 45) * squeeze + waveBounce,
      y -
        superLift -
        q *
          (19.5 * a * Math.sin(phase + 0.9) +
            9.5 * a * Math.cos(t * 2.65 + i * 2)),
    ];
  }

  layers.forEach((l) => {
    let s = "";
    let i = 0;
    while (i < l.tokens.length) {
      const v = l.tokens[i];
      if (/[MCQZ]/.test(v)) {
        s += v + " ";
        i++;
      } else {
        s +=
          point(+v, +l.tokens[i + 1], l.index)
            .map((n) => n.toFixed(2))
            .join(" ") + " ";
        i += 2;
      }
    }
    l.el.setAttribute("d", s);
  });

  const q = reduced ? 0 : 1;
  const face = point(0, -58, 2);

  const idleGx = q * Math.sin(t * 0.9) * 3.2;
  const idleGy = q * Math.cos(t * 0.65) * 1.8;
  const compGx = q * Math.sin(computerAge * 2.2) * 7;
  const compGy = 8 + q * Math.sin(computerAge * 1.1) * 2;
  const waveGy = -(waveWeight + superWeight) * 4 * Math.abs(Math.sin(t * 4.5));

  const gx = idleGx * (1 - computerWeight) + compGx * computerWeight;
  const gy = idleGy * (1 - computerWeight) + compGy * computerWeight + waveGy;

  set("face", "transform", `translate(${face[0] + gx} ${face[1] + 58 + gy})`);

  const b = t % 4.6;
  const doubleBlink = t % 13.8 < 0.42;
  const blinkWindow = doubleBlink ? t % 0.21 : b;
  const blink = reduced
    ? 1
    : blinkWindow < 0.16
      ? Math.max(0.08, Math.abs(blinkWindow - 0.08) / 0.08)
      : 1;
  set("eye-left", "ry", 11 * blink);
  set("eye-right", "ry", 11 * blink);
  set("eye-right", "rx", 6);

  for (const [n, o, x, y, period] of [
    ["ember-a", 0, 4, -264, 4.1],
    ["ember-b", 1.6, 62, -210, 4.4],
    ["ember-c", 2.9, -48, -225, 3.8],
  ] as const) {
    const u = ((t + o) % period) / period;
    const window = 0.38;
    const f = u / window;
    set(
      n,
      "opacity",
      u < window && q ? Math.sin(Math.PI * f) * 0.78 : 0,
    );
    set(
      n,
      "transform",
      `translate(${x + Math.sin(f * 3.4 + o) * 14} ${y - f * 52}) scale(${Math.max(0.1, 1 - f * 0.68)})`,
    );
  }

  // Holographic Computer Action (Scene 1B)
  const computer = computerWeight;
  const age = computerAge;
  set("computer", "opacity", computer);
  if (computer > 0.001) {
    set(
      "computer",
      "transform",
      `translate(0 ${-20 + 65 * (1 - computer) + q * Math.sin(age * 1.6) * 2}) rotate(${-8 * (1 - computer)}) scale(${0.72 + 0.28 * computer})`,
    );
    const cycle = age % 4.8;
    (["code-a", "code-b", "code-c"] as const).forEach((n, i) => {
      const progress = reduced ? 1 : smooth((cycle - 0.3 - i * 0.7) / 0.7);
      set(n, "stroke-dasharray", `${progress * 100} 120`);
      set(n, "opacity", progress > 0.01 ? 1 : 0);
    });
    set(
      "cursor",
      "opacity",
      reduced ? 1 : Math.floor(age * 2.4) % 2 ? 1 : 0.15,
    );
  }

  // Superpower Aura Action (Scene 3 Finale)
  set("superpower", "opacity", superWeight);
  if (superWeight > 0.001) {
    set(
      "super-ring",
      "transform",
      `translate(0 ${Math.sin(t * 3) * 6}) rotate(${Math.sin(t * 1.8) * 10}) scale(${0.85 + 0.18 * superWeight})`,
    );
    set("super-ring", "stroke-dashoffset", String(-t * 48));
    set(
      "spark-a",
      "transform",
      `translate(0 ${Math.sin(t * 4.2) * 8}) scale(${0.8 + 0.35 * Math.sin(t * 5)})`,
    );
    set(
      "spark-b",
      "transform",
      `translate(0 ${Math.cos(t * 3.8) * 8}) scale(${0.8 + 0.35 * Math.cos(t * 4.6)})`,
    );
    set(
      "spark-c",
      "transform",
      `translate(0 ${Math.sin(t * 5.1 + 1) * 7}) scale(${0.8 + 0.3 * Math.sin(t * 6.2)})`,
    );
  }
}
