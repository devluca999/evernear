"use client";
// The developer drawer: a bar along the bottom with the latest call and a chevron. The chevron pulls
// it up to half the screen; drag its top edge to adjust. Raw call on the left, plain words on the right.
import { useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import type { Proof } from "@/scenario/types";
import { Chip, Pill } from "./ui";
import { Led } from "./Led";
import { PLAIN } from "./plain";
import s from "./workspace.module.css";

const BAR = 36;

/** A live step shows the real time it ran; a replayed one, when it happens in the demo (m:ss from the start). */
export function stepTime(p: Proof): string {
  if (p.wallMs) return new Date(p.wallMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  if (p.atMs === undefined) return "";
  const sec = Math.floor(p.atMs / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} in the demo`;
}

export function Drawer({ proof, open, onToggle, lastProof, history = [] }: { proof: Proof | null; open: boolean; onToggle: () => void; lastProof: Proof | null; history?: Proof[] }) {
  // null: follow the newest step; an id: the step picked in the history.
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ? history.find((h) => h.id === picked) ?? null : null;
  const p = chosen ?? proof ?? lastProof;
  const [height, setHeight] = useState<number | null>(null);
  const drag = useRef(false);
  const live = p && !p.synthetic && !p.replay;
  const h = open ? (height ?? (typeof window === "undefined" ? 360 : Math.round(window.innerHeight * 0.5))) : BAR;

  return (
    <section className={`${s.drawer} ${open ? s.drawerOpen : ""}`} aria-label="Developer drawer" style={{ height: h }}>
      {open && (
        <div className={s.drawerGrip} role="separator" aria-orientation="horizontal" aria-label="Drag to resize the developer drawer"
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) setHeight(Math.min(window.innerHeight * 0.85, Math.max(140, window.innerHeight - e.clientY))); }}
          onPointerUp={() => { drag.current = false; }} />
      )}
      <button className={s.drawerTab} onClick={onToggle} aria-expanded={open} aria-label={open ? "Collapse developer drawer" : "Expand developer drawer"}>
        <span>Developer{p ? <span className={s.faint}> · {p.label}{p.hash !== "none" ? ` · ${p.hash.slice(0, 10)}` : ""}</span> : null}</span>
        <ChevronUp className={s.chevron} data-open={open} size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && p && (
        <div className={s.drawerBody}>
          <nav className={s.drawerHistory} aria-label="Steps so far">
            <span className={s.micro}>STEPS SO FAR · {history.length}</span>
            <ol>
              {history.map((h, i) => {
                const selected = h.id === p.id;
                return (
                  <li key={`${h.id}-${i}`}>
                    <button type="button" className={s.historyItem} aria-current={selected ? "step" : undefined}
                      onClick={() => setPicked(i === history.length - 1 ? null : h.id)}>
                      <Led tone={h.kind === "refusal" ? "success" : h.synthetic ? "idle" : "success"} />
                      <span className={s.historyText}>
                        <span className={s.historyLabel}>{h.label}</span>
                        <span className={`${s.fig} ${s.faint}`}><time>{stepTime(h)}</time> · Scene {h.scene}{h.hash !== "none" ? ` · ${h.hash.slice(0, 10)}` : ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {picked && <button type="button" className={s.pinClear} onClick={() => setPicked(null)}>Follow the latest</button>}
          </nav>
          <div className={s.drawerRaw}>
            <div className={s.drawerRow}>
              <span className={s.micro}>CALL</span><code className={s.mono}>{p.call}</code>
              {live ? <Pill tone="success" led>live</Pill> : p.synthetic ? <Pill tone="idle">synthetic</Pill> : <Pill tone="success" led>replay</Pill>}
              <Chip>{p.network}</Chip>
            </div>
            <div className={s.drawerRow}><span className={s.micro}>{p.wallMs ? "RAN AT" : "WHEN"}</span><span className={s.fig}>{stepTime(p)}{p.wallMs ? " (live)" : ""}</span></div>
            <div className={s.drawerRow}><span className={s.micro}>CODE PATH</span><code className={s.mono}>{p.codePath}</code></div>
            <div className={s.drawerRow}><span className={s.micro}>HASH</span><code className={s.mono}>{p.hash}</code>
              {p.explorerUrl ? <a className={s.link} href={p.explorerUrl} target="_blank" rel="noreferrer">Explorer</a> : <span className={s.faint}>{p.synthetic ? "No explorer link: synthetic placeholder" : "No explorer link for this call"}</span>}
            </div>
            <pre className={s.json}>{JSON.stringify(p.response, null, 2)}</pre>
          </div>
          <aside className={s.drawerPlain} aria-label="What happened">
            <span className={s.micro}>WHAT HAPPENED</span>
            <p className={s.drawerLabel}>{p.label}</p>
            {PLAIN[p.id] && <p className={s.plainText}>{PLAIN[p.id]}</p>}
          </aside>
        </div>
      )}
    </section>
  );
}
