"use client";
// The developer drawer: a bar along the bottom with the latest step. Open it for every step so far,
// the raw call (request and response) and what happened in plain words. Drag its top edge to resize.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Proof } from "@/scenario/types";
import { Dot } from "./Panel";
import { PLAIN } from "./plain";
import s from "./shell.module.css";

/** A live step shows the real time it ran; a replayed one, when it happens in the demo (m:ss from the start). */
export function stepTime(p: Proof): string {
  if (p.wallMs) return new Date(p.wallMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  if (p.atMs === undefined) return "";
  const sec = Math.floor(p.atMs / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** A long hash as its first and last characters, so the bar stays one line. */
const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

/** A refusal is the guard working: it gets the alert dot so it reads as a block, not a failure of the demo. */
const toneOf = (p: Proof) => (p.kind === "refusal" || p.id.startsWith("refused") ? "alert" : "success") as "alert" | "success";

/** Splits a recorded response into what was sent and what came back, when it holds both. */
function split(response: unknown): { request: unknown; response: unknown } | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const key = "request" in r ? "request" : "input" in r ? "input" : null;
  if (!key) return null;
  const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  return { request: r[key], response: rest };
}

export function Drawer({ proof, open, onToggle, lastProof, history = [], narrow = false }: {
  proof: Proof | null; open: boolean; onToggle: () => void; lastProof: Proof | null; history?: Proof[]; narrow?: boolean;
}) {
  // null: follow the newest step; an id: the step picked in the history.
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ? history.find((h) => h.id === picked) ?? null : null;
  const p = chosen ?? proof ?? lastProof;
  const [height, setHeight] = useState(250);
  const drag = useRef(false);
  const list = useRef<HTMLOListElement>(null);
  // The newest step stays in view as steps arrive.
  useEffect(() => { if (open && list.current) list.current.scrollTop = list.current.scrollHeight; }, [open, history.length]);
  const live = p && !p.synthetic && !p.replay;
  const parts = p ? split(p.response) : null;

  return (
    <section className={s.drawer} data-open={open} data-narrow={narrow} aria-label="Developer drawer" style={open ? { height } : undefined}>
      {open && (
        <div className={s.resize} role="separator" aria-orientation="horizontal" aria-label="Drag to resize the developer drawer"
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const bottom = e.currentTarget.parentElement!.getBoundingClientRect().bottom;
            setHeight(Math.min(window.innerHeight * 0.8, Math.max(140, bottom - e.clientY)));
          }}
          onPointerUp={() => { drag.current = false; }} />
      )}
      <button type="button" className={s.drawerBar} onClick={onToggle} aria-expanded={open} aria-label={open ? "Collapse developer drawer" : "Open developer drawer"}>
        {open && <span className={s.handle} aria-hidden="true" />}
        <span className={s.drawerName}>Developer</span>
        {!open && p && (
          <>
            <Dot tone={toneOf(p)} />
            <span className={s.drawerText}>{p.label}</span>
            <span className={`es-num ${s.drawerHash}`} data-focus="developer.hash" title={p.hash}>{shortHash(p.hash)}</span>
            <span className={`es-num ${s.drawerWhen}`}>{stepTime(p)} · Chapter {p.scene + 1}</span>
          </>
        )}
        <span className={s.drawerToggle}>{open ? <>Collapse<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></> : <>Open<ChevronUp size={12} strokeWidth={2} aria-hidden="true" /></>}</span>
      </button>
      {open && !p && <p className={`${s.note} ${s.pad}`}>No calls yet. Each step the agent takes shows here with its proof.</p>}
      {open && p && (
        <div className={s.drawerGrid}>
          <nav className={s.drawerCol} aria-label="Steps so far">
            <span className="es-micro">Steps so far · <span className="es-num">{history.length}</span></span>
            <ol className={s.steps} ref={list}>
              {history.map((h, i) => (
                <li key={`${h.id}-${i}`}>
                  <button type="button" className={s.stepBtn} aria-current={h.id === p.id ? "step" : undefined}
                    onClick={() => setPicked(i === history.length - 1 ? null : h.id)}>
                    <Dot tone={toneOf(h)} />
                    <span className={s.stepText}>
                      <span className={s.stepName}>{h.label}</span>
                      <span className={`es-num ${s.stepWhen}`}><time>{stepTime(h)}</time> · Ch {h.scene + 1}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {picked && <button type="button" className={s.linkBtn} onClick={() => setPicked(null)}>Follow the latest</button>}
          </nav>
          <div className={s.drawerCol}>
            <div className={s.callTags}>
              <span className="es-tag es-tag-mono" style={{ color: "var(--text-primary)" }}>{p.call}</span>
              <span className="es-tag es-tag-mono">{live ? "live" : p.synthetic ? "synthetic" : "replay"}</span>
              <span className="es-tag es-tag-mono">{p.network}</span>
            </div>
            <div className={s.callMeta}>
              <span className="es-micro">{p.wallMs ? "Ran at" : "When"}</span><span className="es-num">{stepTime(p)} · Chapter {p.scene + 1}</span>
              <span className="es-micro">Code path</span><span className="es-num" title={p.codePath}>{p.codePath}</span>
              <span className="es-micro">Hash</span><span className="es-num" title={p.hash} data-focus="developer.hash">{p.hash}</span>
            </div>
            <div className={s.json} data-single={!parts}>
              {parts ? (
                <>
                  <div className={s.jsonBox}><span className="es-micro">Request</span><pre className="es-num">{JSON.stringify(parts.request, null, 2)}</pre></div>
                  <div className={s.jsonBox}><span className="es-micro">Response</span><pre className="es-num">{JSON.stringify(parts.response, null, 2)}</pre></div>
                </>
              ) : (
                <div className={s.jsonBox}><span className="es-micro">Response</span><pre className="es-num">{JSON.stringify(p.response, null, 2)}</pre></div>
              )}
            </div>
          </div>
          <aside className={s.drawerCol} aria-label="What happened">
            <span className="es-micro">What happened</span>
            <p className={s.happened}>{PLAIN[p.id] ?? p.label}</p>
            {p.explorerUrl
              ? <a className={s.explorer} href={p.explorerUrl} target="_blank" rel="noreferrer">View on explorer<ExternalLink size={12} strokeWidth={2} aria-hidden="true" /></a>
              : <span className={s.note} style={{ marginTop: "auto" }}>{p.synthetic ? "Synthetic placeholder: no explorer link yet." : "No explorer link for this call."}</span>}
          </aside>
        </div>
      )}
    </section>
  );
}
