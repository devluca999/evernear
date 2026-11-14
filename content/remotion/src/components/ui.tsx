import React from "react";
import { AbsoluteFill } from "remotion";
import { color, fonts, shadow } from "../theme";

/** Size unit. 1 = layout tuned for a 1920 wide frame; vertical/square scenes pass their own. */
export type Sized = { readonly u?: number };

export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ backgroundColor: color.bg, color: color.text, fontFamily: fonts.sans, ...style }}>{children}</AbsoluteFill>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; u?: number; tone?: "default" | "refused" | "done" | "needs" }> = ({
  children,
  style,
  u = 1,
  tone = "default",
}) => {
  const border = tone === "refused" ? color.refused : tone === "done" ? color.accent : tone === "needs" ? color.needsYou : color.hairline;
  return (
    <div
      style={{
        backgroundColor: color.surface,
        border: `${Math.max(1, 1.5 * u)}px solid ${border}`,
        borderRadius: 18 * u,
        boxShadow: shadow,
        padding: 36 * u,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Uppercase micro-label (the only place uppercase is used). */
export const Micro: React.FC<{ children: React.ReactNode; u?: number; c?: string; style?: React.CSSProperties }> = ({ children, u = 1, c = color.muted, style }) => (
  <div style={{ fontSize: 18 * u, letterSpacing: 2.4 * u, textTransform: "uppercase", fontWeight: 600, color: c, ...style }}>{children}</div>
);

/** Figures and identifiers: Geist Mono with tabular figures. Long values wrap, never crop. */
export const Mono: React.FC<{ children: React.ReactNode; size: number; c?: string; weight?: number; wrap?: boolean; style?: React.CSSProperties }> = ({
  children,
  size,
  c = color.text,
  weight = 400,
  wrap = false,
  style,
}) => (
  <span
    style={{
      fontFamily: fonts.mono,
      fontVariantNumeric: "tabular-nums",
      fontSize: size,
      color: c,
      fontWeight: weight,
      ...(wrap ? { overflowWrap: "anywhere" as const, wordBreak: "break-all" as const } : { whiteSpace: "nowrap" as const }),
      ...style,
    }}
  >
    {children}
  </span>
);

export const Tag: React.FC<{ children: React.ReactNode; u?: number; tone?: "simulated" | "done" | "refused" | "needs" | "neutral" }> = ({ children, u = 1, tone = "neutral" }) => {
  const c = tone === "done" ? color.accent : tone === "refused" ? color.refused : tone === "needs" ? color.needsYou : color.muted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8 * u,
        border: `${1.5 * u}px ${tone === "simulated" ? "dashed" : "solid"} ${c}`,
        color: c,
        borderRadius: 999,
        padding: `${6 * u}px ${16 * u}px`,
        fontSize: 17 * u,
        letterSpacing: 2 * u,
        textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

export const Row: React.FC<{ label: string; children: React.ReactNode; u?: number }> = ({ label, children, u = 1 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 * u, padding: `${12 * u}px 0`, borderTop: `1px solid ${color.hairline}` }}>
    <Micro u={u * 0.85}>{label}</Micro>
    <div style={{ fontSize: 26 * u, lineHeight: 1.35 }}>{children}</div>
  </div>
);

/** Burned-in caption at the bottom of the frame. */
export const Caption: React.FC<{ text: string; u?: number; opacity?: number; bottom?: number }> = ({ text, u = 1, opacity = 1, bottom }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: bottom ?? 64 * u,
      display: "flex",
      justifyContent: "center",
      opacity,
      padding: `0 ${80 * u}px`,
    }}
  >
    <div
      style={{
        backgroundColor: "rgba(17,18,22,0.92)",
        border: `1px solid ${color.hairline}`,
        borderRadius: 12 * u,
        padding: `${14 * u}px ${26 * u}px`,
        fontSize: 32 * u,
        lineHeight: 1.35,
        color: color.text,
        textAlign: "center",
        maxWidth: 1500 * u,
      }}
    >
      {text}
    </div>
  </div>
);

export const Check: React.FC<{ size: number; c?: string }> = ({ size, c = color.accent }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" stroke={c} strokeWidth="1.6" />
    <path d="M7 12.5l3.2 3.2L17 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Cross: React.FC<{ size: number; c?: string }> = ({ size, c = color.refused }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" stroke={c} strokeWidth="1.6" />
    <path d="M8 8l8 8M16 8l-8 8" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Empty: React.FC<{ size: number; c?: string; dashed?: boolean }> = ({ size, c = color.faint, dashed }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" stroke={c} strokeWidth="1.6" strokeDasharray={dashed ? "3 3" : undefined} />
  </svg>
);

/** Inside <Settled>, components render their final, fully revealed state (used by Stills). */
const SettledContext = React.createContext(false);
export const Settled: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SettledContext.Provider value>{children}</SettledContext.Provider>
);
export const useIsSettled = () => React.useContext(SettledContext);
