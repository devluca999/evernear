import { createContext, useContext, type ReactNode } from "react";
import { Lock, LockOpen, X } from "lucide-react";
import type { PanelId } from "@/scenario/types";
import s from "./shell.module.css";

/** The board (scenario/board.ts): drag a card by its header to a spot, lock it there, or close it. */
export const BoardContext = createContext<{
  isMine: (id: PanelId) => boolean; isLocked: (id: PanelId) => boolean; dragging: PanelId | null;
  startDrag: (id: PanelId, e: React.PointerEvent) => void; step: (id: PanelId, dx: number, dy: number) => void;
  lock: (id: PanelId) => void; close: (id: PanelId) => void;
} | null>(null);

/** A workspace card: grip, title, an optional meta line, then lock and close. */
export function Panel({ id, title, pulse, children, meta, tools }: { id: PanelId; title: string; pulse: boolean; children: ReactNode; meta?: ReactNode; tools?: ReactNode }) {
  const board = useContext(BoardContext);
  const locked = !!board?.isLocked(id);
  const mine = !!board?.isMine(id);
  return (
    <section className={s.card} data-panel={id} data-pulse={pulse} data-locked={locked} data-dragging={board?.dragging === id} aria-label={title}>
      <header className={s.cardHead} data-draggable={!!board && !locked}
        onPointerDown={(e) => {
          // The whole header drags the card, except its buttons and tabs.
          if (!board || locked || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          board.startDrag(id, e);
        }}>
        {board && (
          <button type="button" className={s.grip} aria-label={`Move ${title}`} disabled={locked}
            title={locked ? "Locked in place" : "Drag to a spot on the workspace. Alt and the arrow keys move it too"}
            onPointerDown={(e) => { if (!locked && e.button === 0) board.startDrag(id, e); }}
            onKeyDown={(e) => {
              const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
              if (e.altKey && d) { e.preventDefault(); e.stopPropagation(); board.step(id, d[0], d[1]); }
            }} />
        )}
        <h2 className={s.cardTitle}>{title}</h2>
        {meta && <span className={s.cardMeta}>{meta}</span>}
        <span className={s.cardTools}>
          {tools}
          {board && (
            <button type="button" className={s.iconBtn} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${title}`}
              title={locked ? "Unlock: it stays here, and you can move it again" : "Lock: keep it in this spot"} onClick={() => board.lock(id)}>
              {locked ? <Lock size={13} strokeWidth={2} aria-hidden="true" /> : <LockOpen size={13} strokeWidth={2} aria-hidden="true" />}
            </button>
          )}
          {board && mine && !locked && (
            <button type="button" className={s.iconBtn} aria-label={`Close ${title}`} title="Close" onClick={() => board.close(id)}>
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </span>
      </header>
      <div className={s.cardBody}>{children}</div>
    </section>
  );
}

/** Customer / Purchase style tabs in a card header. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <span className={s.seg} role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </span>
  );
}

/** A state dot from the design system. */
export const Dot = ({ tone, pulse, className }: { tone?: "active" | "attention" | "success" | "alert" | "proposed"; pulse?: boolean; className?: string }) => (
  <span className={`es-dot${tone ? ` es-dot-${tone}` : ""}${pulse ? " es-dot-pulse" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true" />
);

/** A status badge from the design system. */
export const Badge = ({ tone, children }: { tone: "active" | "attention" | "success" | "alert"; children: ReactNode }) => (
  <span className={`es-badge es-badge-${tone}`}><Dot tone={tone} />{children}</span>
);

/** Executed work: a past-tense word and a time. */
export const Stamp = ({ word, time, tone }: { word: string; time: string; tone?: "active" }) => (
  <span className={s.stampBox} data-tone={tone} role="status">{word}<time>{time}</time></span>
);

/** A figure in Geist Mono. */
export const N = ({ children, className }: { children: ReactNode; className?: string }) => <span className={`es-num${className ? ` ${className}` : ""}`}>{children}</span>;
