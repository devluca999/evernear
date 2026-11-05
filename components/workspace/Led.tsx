import p from "./premium.module.css";

export type Tone = "active" | "attention" | "success" | "alert" | "idle" | "proposed";

/** StatusDot: the one LED implementation. A small lamp under glass; active and alert breathe. */
export function Led({ tone, label, className }: { tone: Tone; label?: string; className?: string }) {
  return <span className={`${p.led} ${p[`led_${tone}`]} ${className ?? ""}`} data-tone={tone} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
