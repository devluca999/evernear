import type { ReactNode } from "react";
import { Led, type Tone } from "./Led";
import p from "./premium.module.css";

/** A solid status pill. Every state pill is solid fill and solid text. */
export function Pill({ tone = "idle", children, led }: { tone?: Tone; children: ReactNode; led?: boolean }) {
  return <span className={`${p.pill} ${p[`pill_${tone}`]}`}>{led && tone !== "idle" && <Led tone={tone} />}{children}</span>;
}

/** A neutral, stateless chip (outlined is allowed only here). */
export const Chip = ({ children }: { children: ReactNode }) => <span className={p.chip}>{children}</span>;

/** Default's commit mark: past-tense word plus a mono time, executed work only. */
export function Stamp({ word, time }: { word: string; time: string }) {
  return <span className={p.stamp} role="status"><Led tone="success" />{word}<span className={p.stampTime}>{time}</span></span>;
}

const BARS = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 1, 2];

/** Label: the identity card for an order. Fixed field order; only fields with a value. */
export function PoLabel({ po, tone, title, fields, stamp, code }: {
  po: string; tone: Tone; title: string;
  fields: { label: string; value: string }[]; stamp?: ReactNode; code: string;
}) {
  return (
    <article className={p.label} aria-label={`PO ${po}`}>
      <header className={p.labelHead}>
        <span className={p.labelTitle}><Led tone={tone} />{title}</span>
        {stamp}
      </header>
      <dl className={p.labelFields}>
        {fields.map((f) => <div key={f.label}><dt>{f.label.toUpperCase()}</dt><dd title={f.value}>{f.value}</dd></div>)}
      </dl>
      <div className={p.barcodeRow}>
        <span className={p.barcode} aria-hidden>{BARS.map((w, i) => <i key={i} style={{ width: w, marginRight: (BARS[(i + 3) % BARS.length] % 2) + 1, opacity: i % 2 ? 0 : 1 }} />)}</span>
        <span className={p.barcodeText}>{code}</span>
      </div>
    </article>
  );
}

/** A tick scale with LED markers for each reading and a dashed limit line. No fill. */
export function Ruler({ max, step, major, limit, limitText, marks, fmt }: {
  max: number; step: number; major: number; limit: number; limitText: string;
  marks: { at: number; tone: Tone; text: string }[]; fmt: (n: number) => string;
}) {
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const x = (v: number) => `${(Math.min(max, Math.max(0, v)) / max) * 100}%`;
  return (
    <div className={p.ruler} role="img" aria-label={`${limitText}. ${marks.map((m) => m.text).join(", ")}`}>
      <div className={p.rulerTicks}>
        {ticks.map((t) => <span key={t} className={p.rulerTick} data-major={t % major === 0} style={{ left: x(t) }} />)}
      </div>
      {ticks.filter((t) => t % major === 0).map((t) => <span key={t} className={p.rulerNum} style={{ left: x(t) }}>{fmt(t)}</span>)}
      <span className={p.rulerLimit} style={{ left: x(limit) }}><span className={p.rulerLimitText}>{limitText}</span></span>
      {marks.map((m) => (
        <span key={m.text} className={p.rulerMark} style={{ left: x(m.at) }} data-side={Math.abs(m.at - limit) < max * 0.08 ? (m.at < limit ? "left" : "right") : undefined}>
          <Led tone={m.tone} /><span className={p.rulerMarkText}>{m.text}</span>
        </span>
      ))}
    </div>
  );
}
