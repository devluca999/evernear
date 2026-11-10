"use client";
// The developer drawer: a bar along the bottom with the latest step. Opened, three columns answer
// three questions. Steps: what has happened so far. Proof: what exactly ran (call, network, code
// path, hash, then the request and response with the fields that matter lit and the rest dimmed).
// Explained: what it means, in a title and three short lines, or (Learn) a small diagram.
// Drag its top edge to resize.
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Cpu, ExternalLink, FileCheck2, Loader, Scale, Send, ShieldCheck, Wallet, X } from "lucide-react";
import type { Proof, WorkspaceState } from "@/scenario/types";
import { EXPLAINERS, highlightFor, SIGNED_NOTE, stepKind, type ExplainerId, type StepKind } from "@/scenario/explain";
import { explorerOf } from "@/scenario/liveLog";
import { Diagram } from "./Diagrams";
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

/** A refusal is the guard working: it gets the alert dot so it reads as a block, not a failure of the demo. */
const toneOf = (p: Proof) => (p.kind === "refusal" || p.id.startsWith("refused") ? "alert" : "success") as "alert" | "success";

const KIND_ICON: Record<StepKind, typeof Cpu> = { enclave: Cpu, attestation: ShieldCheck, wallet: Wallet, policy: Scale, payment: Send, refusal: X };
const KIND_NAME: Record<StepKind, string> = { enclave: "Enclave", attestation: "Attestation", wallet: "Wallet", policy: "Policy", payment: "Payment", refusal: "Refusal" };

/** The explainer a proof opens on by default, when the story is not in an explainer moment. */
const EXPLAINER_OF: Record<string, ExplainerId> = {
  inference_attestation: "enclave", escrow_wallet: "wallet", dock_attestation: "signed", intents_payout: "payout", wallet_closed: "payout",
};
/** The camera's focus id for the Explained column, by proof (the camera keeps the lit JSON beside it in view). */
const PROOF_FOCUS: Record<string, string> = {
  inference_attestation: "developer.attestation", escrow_wallet: "developer.policy", dock_attestation: "developer.signed",
};

/** An explainer moment opens the drawer this tall at least, so its column shows in full. */
const EXPLAIN_H = 540;

/** Splits a recorded response into what was sent and what came back, when it holds both. */
function split(response: unknown): { request: unknown; response: unknown } | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const key = "request" in r ? "request" : "input" in r ? "input" : null;
  if (!key) return null;
  const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  return { request: r[key], response: rest };
}

/** JSON with the fields that matter lit and every other line dimmed. */
function Json({ value, lit }: { value: unknown; lit: string[] }) {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return (
    <pre className={`es-num ${s.jsonLines}`}>
      {lines.map((line, i) => {
        const key = /^\s*"([^"]+)":/.exec(line)?.[1];
        return <span key={i} className={key && lit.includes(key) ? s.jsonLit : s.jsonDim}>{line}{"\n"}</span>;
      })}
    </pre>
  );
}

const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);
/** The scene proof an entry stands for: a real row's key, else its own id. */
const keyOf = (p: Proof) => p.key ?? p.id;

/**
 * Under an entry's title: a button to the transaction on its chain's explorer (new tab), with the
 * network and the short hash beside it; "Confirming" while the hash is not known; plain text when
 * there is no public chain, the entry is synthetic, or the payment was refused.
 */
export function Explorer({ p }: { p: Proof }) {
  const v = explorerOf(p);
  if (v.kind === "button") {
    return (
      <span className={s.exRow}>
        <a className={s.exBtn} href={v.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {v.label}<ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
        </a>
        <span className={s.exMeta}>{v.network} · <span className="es-num" data-abbr>{v.short}</span></span>
      </span>
    );
  }
  if (v.kind === "confirming") {
    return (
      <span className={s.exRow}>
        <span className={s.exBtn} data-state="confirming" role="status">Confirming<Loader size={14} strokeWidth={2} aria-hidden="true" className={s.spin} /></span>
        <span className={s.exMeta}>{v.network}</span>
      </span>
    );
  }
  return <span className={s.exText}>{v.text}</span>;
}

export function Drawer({ proof, open, onToggle, lastProof, history = [], narrow = false, explain = null, st = null, fullHash = false }: {
  proof: Proof | null; open: boolean; onToggle: () => void; lastProof: Proof | null; history?: Proof[]; narrow?: boolean;
  /** The explainer moment the story is in, if any: the right column shows it. */
  explain?: ExplainerId | null;
  st?: WorkspaceState | null;
  /** Show the proof's whole hash, not its short form (the story holds this entry open). */
  fullHash?: boolean;
}) {
  // null: follow the newest step; an id: the step picked in the history.
  const [picked, setPicked] = useState<string | null>(null);
  const [learn, setLearn] = useState(false);
  const chosen = picked ? history.find((h) => h.id === picked) ?? null : null;
  const p = chosen ?? proof ?? lastProof;
  const [height, setHeight] = useState(330);
  const drag = useRef(false);
  const list = useRef<HTMLOListElement>(null);
  // The newest step stays in view as steps arrive.
  useEffect(() => { if (open && list.current) list.current.scrollTop = list.current.scrollHeight; }, [open, history.length]);
  // A new explainer moment starts on its three lines.
  useEffect(() => { queueMicrotask(() => setLearn(false)); }, [explain]);
  const live = p && !p.synthetic && !p.replay;
  const parts = p ? split(p.response) : null;
  const ex = (explain && !chosen ? EXPLAINERS[explain] : p ? EXPLAINERS[EXPLAINER_OF[keyOf(p)]] : undefined) ?? null;
  const lit = p ? highlightFor(keyOf(p)) : [];
  const facts = ex?.facts && st ? ex.facts(st, p).filter((f) => f.v) : [];

  return (
    <section className={s.drawer} data-open={open} data-narrow={narrow} data-explain={!!explain} aria-label="Developer drawer" style={open ? { height: explain ? Math.max(height, EXPLAIN_H) : height } : undefined}>
      {open && (
        <div className={s.resize} role="separator" aria-orientation="horizontal" aria-label="Drag to resize the developer drawer"
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const bottom = e.currentTarget.parentElement!.getBoundingClientRect().bottom;
            setHeight(Math.min(window.innerHeight * 0.8, Math.max(160, bottom - e.clientY)));
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
            {p.pending
              ? <span className={s.drawerHash} role="status">Confirming<Loader size={12} strokeWidth={2} aria-hidden="true" className={s.spin} style={{ marginLeft: 6, verticalAlign: "-2px" }} /></span>
              : <span className={`es-num ${s.drawerHash}`} data-focus="developer.hash" data-abbr title={p.hash}>{shortHash(p.hash)}</span>}
            <span className={`es-num ${s.drawerWhen}`}>{stepTime(p)} · Chapter {p.scene + 1}</span>
          </>
        )}
        <span className={s.drawerToggle}>{open ? <>Collapse<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></> : <>Open<ChevronUp size={12} strokeWidth={2} aria-hidden="true" /></>}</span>
      </button>
      {open && !p && <p className={`${s.note} ${s.pad}`}>No calls yet. Each step the agent takes shows here with its proof.</p>}
      {open && p && (
        <div className={s.drawerGrid}>
          <nav className={s.drawerCol} aria-label="Steps so far">
            <span className="es-micro">Steps · <span className="es-num">{history.length}</span></span>
            <ol className={s.steps} ref={list}>
              {history.map((h, i) => {
                const kind = stepKind({ id: keyOf(h), kind: h.kind });
                const Icon = KIND_ICON[kind];
                return (
                  <li key={`${h.id}-${i}`} className={s.stepItem}>
                    <button type="button" className={s.stepBtn} aria-current={h.id === p.id ? "step" : undefined}
                      onClick={() => setPicked(i === history.length - 1 ? null : h.id)}>
                      <span className={s.stepIcon} data-tone={toneOf(h)} title={KIND_NAME[kind]}><Icon size={14} strokeWidth={2} aria-label={KIND_NAME[kind]} /></span>
                      <span className={s.stepText}>
                        <span className={s.stepName}>{h.label}</span>
                        <span className={`es-num ${s.stepWhen}`}><time>{stepTime(h)}</time>{h.day ? <> · {h.day}</> : null} · Ch {h.scene + 1}</span>
                      </span>
                    </button>
                    <span className={s.stepExplorer}><Explorer p={h} /></span>
                  </li>
                );
              })}
            </ol>
            {picked && <button type="button" className={s.linkBtn} onClick={() => setPicked(null)}>Follow the latest</button>}
          </nav>
          <div className={s.drawerCol} aria-label="Proof">
            <span className="es-micro">Proof</span>
            <div className={s.callTags}>
              <span className="es-tag es-tag-mono" style={{ color: "var(--text-primary)" }}>{p.call}</span>
              <span className="es-tag es-tag-mono">{p.network}</span>
              <span className="es-tag es-tag-mono">{live ? "live" : p.synthetic ? "synthetic" : "replay"}</span>
            </div>
            <div className={s.chain} data-focus="developer.chain">
              <div className={s.callMeta}>
                <span className="es-micro">Code path</span><span className="es-num" title={p.codePath}>{p.codePath}</span>
                <span className="es-micro">Hash</span>
                {fullHash && p.hash
                  ? <span className={`es-num ${s.fullHash}`} title={p.hash} data-focus="developer.hash">{p.hash}</span>
                  : <span className="es-num" title={p.hash} data-focus="developer.hash" data-abbr>{p.hash ? shortHash(p.hash) : "not known yet"}</span>}
              </div>
              <div className={s.proofExplorer}>
                <Explorer p={p} />
              </div>
            </div>
            <div className={s.json} data-single={!parts}>
              {parts ? (
                <>
                  <div className={s.jsonBox}><span className="es-micro">Request</span><Json value={parts.request} lit={lit} /></div>
                  <div className={s.jsonBox}><span className="es-micro">Response</span><Json value={parts.response} lit={lit} /></div>
                </>
              ) : (
                <div className={s.jsonBox}><span className="es-micro">Response</span><Json value={p.response} lit={lit} /></div>
              )}
            </div>
          </div>
          <aside className={s.drawerCol} aria-label="Explained" data-focus={PROOF_FOCUS[keyOf(p)]}>
            <div className={s.headRow}>
              <span className="es-micro">Explained</span>
              {ex && (
                <button type="button" className={`${s.learnBtn} ${s.push}`} aria-pressed={learn} onClick={() => setLearn((x) => !x)}>
                  <BookOpen size={13} strokeWidth={2} aria-hidden="true" />Learn
                </button>
              )}
            </div>
            <p className={s.exTitle}>{ex?.title ?? p.label}</p>
            {ex && learn ? (
              <Diagram id={ex.diagram} lifecycle={st?.escrow?.lifecycle ?? null} />
            ) : ex && st ? (
              <dl className={s.exLines}>
                <div><dt>What happened</dt><dd>{ex.happened(st)}</dd></div>
                <div><dt>Why it matters for Astro</dt><dd>{ex.matters(st)}</dd></div>
                <div><dt>Why NEAR</dt><dd>{ex.whyNear}</dd></div>
                {facts.length > 0 && (
                  <div className={s.exFacts}>
                    {facts.map((f) => <span key={f.k}><span className="es-micro">{f.k}</span><span className="es-num" data-tone={f.tone} data-abbr={f.v.includes("…") || undefined} title={f.v}>{f.v}</span></span>)}
                  </div>
                )}
                {ex.id === "signed" && <p className={s.note}><FileCheck2 size={13} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{SIGNED_NOTE}</p>}
              </dl>
            ) : (
              <dl className={s.exLines}><div><dt>What happened</dt><dd>{PLAIN[keyOf(p)] ?? p.label}</dd></div></dl>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
