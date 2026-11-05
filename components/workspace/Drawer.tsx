"use client";
// The developer drawer: a bar along the bottom with the latest call and a chevron. The chevron pulls
// it up to half the screen; drag its top edge to adjust. Raw call on the left, plain words on the right.
import { useRef, useState } from "react";
import type { Proof } from "@/scenario/types";
import { Chip, Pill } from "./ui";
import { PLAIN } from "./plain";
import s from "./workspace.module.css";

const BAR = 36;

export function Drawer({ proof, open, onToggle, lastProof }: { proof: Proof | null; open: boolean; onToggle: () => void; lastProof: Proof | null }) {
  const p = proof ?? lastProof;
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
        <svg className={s.chevron} data-open={open} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && p && (
        <div className={s.drawerBody}>
          <div className={s.drawerRaw}>
            <div className={s.drawerRow}>
              <span className={s.micro}>CALL</span><code className={s.mono}>{p.call}</code>
              {live ? <Pill tone="success" led>live</Pill> : p.synthetic ? <Pill tone="idle">synthetic</Pill> : <Pill tone="success" led>replay</Pill>}
              <Chip>{p.network}</Chip>
            </div>
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
