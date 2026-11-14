import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Easing } from "remotion";

const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const fonts = {
  sans: inter.fontFamily,
  mono: mono.fontFamily,
};

// docs/BUILD.md section 10: near-black warm graphite, flat surfaces, hairline borders,
// colour is state (jade = done, orange = needs you, crimson = refused). Jade is the one accent.
export const color = {
  bg: "#111216",
  surface: "#1A1B20",
  surface2: "#202128",
  hairline: "#2C2D35",
  text: "#F1EEE8",
  muted: "#9C9AA3",
  faint: "#66656E",
  accent: "#3FB68B", // jade: done, paid, verified
  needsYou: "#D97A2B", // orange: needs a human
  refused: "#D9475A", // crimson: refused
};

export const shadow = "0 1px 2px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.28)";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** Opacity + rise for an element entering at `start` frames. */
export const enter = (frame: number, start: number, dur = 18) => {
  const t = Math.min(1, Math.max(0, (frame - start) / dur));
  const e = ease(t);
  return { opacity: e, translate: `0px ${(1 - e) * 24}px` } as const;
};

/** 0..1 eased progress between two frames. */
export const progress = (frame: number, start: number, dur: number) => {
  const t = Math.min(1, Math.max(0, (frame - start) / dur));
  return ease(t);
};
