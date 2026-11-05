import s from "./workspace.module.css";

export type Tone = "active" | "attention" | "success" | "alert" | "idle";

/** A status lamp. Colour is state only. Active and alert breathe; all are legible without motion. */
export function Led({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={`${s.led} ${s[`led_${tone}`]}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
