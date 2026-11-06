"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stateAt, sceneStartMs, stageStartMs } from "@/scenario/runner";
import { scenes, timeline, totalDurationMs } from "@/scenario/scenes";
import { suppliers } from "@/seed/astro";
import type { Beat, PanelId, WorkspaceState } from "@/scenario/types";
import { Rail } from "./Rail";
import { Drawer } from "./Drawer";
import { Phone } from "./Phone";
import { DemandPanel } from "./panels/DemandPanel";
import { MapPanel } from "./panels/MapPanel";
import { InboxPanel } from "./panels/InboxPanel";
import { BomPanel } from "./panels/BomPanel";
import { RulesPanel } from "./panels/RulesPanel";
import { ProductsPanel } from "./panels/ProductsPanel";
import { ActionsContext, type WorkspaceActions } from "./actions";
import { PhotoViewer } from "./PhotoViewer";
import { Pill } from "./ui";
import { CHECKPOINTS } from "@/scenario/shipment";
import { PANEL_ORDER } from "@/scenario/layout";
import { arrange, closeCard, COLS, emptyBoard, loadBoard, lockCard, openCard, placeCard, rowsUsed, SPOTS, type Board } from "@/scenario/board";
import { heldAt, liveStepOf, stepClockWith } from "@/scenario/gates";
import { useLive } from "./useLive";
import { loadPolicy, PolicyContext, POLICY_KEY, sameRules } from "./rules";
import { policy as defaultPolicy } from "@/seed/astro";
import type { Policy } from "@/engine/types";
import { BoardContext } from "./Panel";
import { Sidebar } from "./Sidebar";
import { StatsBar } from "./StatsBar";
import s from "./workspace.module.css";

const PANELS: Record<PanelId, (p: { st: WorkspaceState; pulse: boolean }) => React.ReactNode> = {
  products: ProductsPanel, demand: DemandPanel, map: MapPanel, inbox: InboxPanel, bom: BomPanel, rules: RulesPanel,
};

const BOARD_KEY = "evernear.board";
const LOCK_KEY = "evernear.locked";
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
const HAOYUN = suppliers.find((x) => x.id === "haoyun")!.receiveAddress;

const TIME_CARD: Record<number, string> = { 7: "Day 9 · Chicago dock" };
/** One line per scene: what the viewer is looking at, in plain words. */
const SCENE_LINE: Record<number, string> = {
  0: "Astro sets up its own wallet and the rules the agent must follow.",
  1: "14 robots are ordered and there are motors for 6. The usual supplier is out.",
  2: "A small reorder under the cap pays itself. No person needed.",
  3: "Four alternatives are checked against the 10MA's specs, privately.",
  4: "A new supplier over the cap needs two signatures.",
  5: "Haoyun asks for 8% more. Your limit is 3%.",
  6: "The PO total moves into its own account, which can only pay Haoyun or Astro.",
  7: "The shipment is counted at the dock: 1,800 of 2,000 arrived.",
  8: "Haoyun is paid for what arrived. The rest goes back to Astro.",
  9: "",
};

export function Workspace({ initialMs = 0, autoplay = true }: { initialMs?: number; autoplay?: boolean }) {
  const [t, setT] = useState(initialMs);
  const [playing, setPlaying] = useState(autoplay);
  // Waits at each human moment and at the end of each scene; ?autoplay=1 plays straight through.
  const [waitForMe, setWaitForMe] = useState(true);
  const live = useLive();
  const [policy, setPolicyState] = useState<Policy>(defaultPolicy);
  const policyCtx = useMemo(() => ({
    policy,
    setPolicy: (p: Policy) => { setPolicyState(p); try { localStorage.setItem(POLICY_KEY, JSON.stringify(p)); } catch { /* storage may be blocked */ } },
    reset: () => { setPolicyState(defaultPolicy); try { localStorage.removeItem(POLICY_KEY); } catch { /* ignore */ } },
    changed: !sameRules(policy, defaultPolicy),
  }), [policy]);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  // The drawer stays collapsed (its bar shows the latest call) until the chevron opens it.
  const [drawerOpenState, setDrawerOpen] = useState(false);
  const [phonePinned, setPhonePinned] = useState<boolean | null>(null);
  const last = useRef<number | null>(null);
  const [viewer, setViewer] = useState<{ checkpointId: string; index: number } | null>(null);
  const [pinnedProof, setPinnedProof] = useState<string | null>(null);
  const [board, setBoardState] = useState<Board>(emptyBoard);
  const [locked, setLockedState] = useState<PanelId[]>([]);
  const setBoard = (b: Board) => { setBoardState(b); save(BOARD_KEY, b); };
  const setLocked = (l: PanelId[]) => { setLockedState(l); save(LOCK_KEY, l); };
  const [drag, setDrag] = useState<{ id: PanelId; dx: number; dy: number; over: number | null } | null>(null);
  const [navOpen, setNavOpen] = useState(true);
  const actions = useMemo<WorkspaceActions>(() => ({
    openPhoto: (checkpointId, index) => { setPlaying(false); setViewer({ checkpointId, index }); },
    openProof: (id) => { setPinnedProof(id); },
  }), []);

  // ?scene=7 jumps to a scene; ?paused=1 holds it there; ?mode=light picks the theme; ?photo=dock:0 opens a photo.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("scene");
    const off = Number(q.get("at") ?? 0);
    queueMicrotask(() => {
      if (id !== null) setT(sceneStartMs(Number(id)) + off);
      if (q.get("paused") === "1") setPlaying(false);
      if (q.get("autoplay") === "1") setWaitForMe(false);
      if (q.get("mode") === "light") setMode("light");
      const photo = q.get("photo");
      if (photo && photo.split(":")[0] in CHECKPOINTS) setViewer({ checkpointId: photo.split(":")[0], index: Number(photo.split(":")[1] ?? 0) });
      try { setPolicyState(loadPolicy(localStorage.getItem(POLICY_KEY))); } catch { /* no saved rules */ }
      try {
        setBoardState(loadBoard(localStorage.getItem(BOARD_KEY), PANEL_ORDER));
        const l = JSON.parse(localStorage.getItem(LOCK_KEY) ?? "[]");
        if (Array.isArray(l)) setLockedState(l.filter((x): x is PanelId => PANEL_ORDER.includes(x)));
      } catch { /* nothing saved */ }
    });
  }, []);

  // Where the viewer's rules stop the PO, if they do (a full replay; cheap).
  const haltedAt = useMemo(() => stateAt(totalDurationMs, timeline, policy).halted?.atMs ?? null, [policy]);
  // What holds the clock: a human moment, the end of a scene (narrate, then Cmd+K), or a live step still running.
  const blocked = (b: Beat) => {
    if (waitForMe && b.ev.type === "scene" && b.scene > 0) return true;
    // Once the rules stop the PO, nothing after it asks you or runs live.
    if (haltedAt !== null && b.atMs > haltedAt) return false;
    if (waitForMe && b.gate) return true;
    if (!live.on || live.error) return false;
    const step = liveStepOf(b, HAOYUN);
    return !!step && !live.done.includes(step);
  };
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; });

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        const next = stepClockWith(x, Math.min(totalDurationMs, x + dt), (b) => blockedRef.current(b));
        if (next >= totalDurationMs) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const held = heldAt(t, blocked);
  const heldStep = held ? liveStepOf(held, HAOYUN) : null;
  const waiting = held?.gate ?? null;
  const sceneEnd = held && held.ev.type === "scene" ? held : null;
  /** Continue: answer the human moment, or go on to the next scene. A live step cannot be skipped. */
  const proceed = () => {
    if (held && (held.gate || held.ev.type === "scene")) { setT(held.atMs); setPhonePinned(null); setPlaying(true); return; }
    if (!held) { setT(sceneStartMs(Math.min(9, stateAt(t).scene + 1))); setPlaying(true); }
  };
  const proceedRef = useRef(proceed);
  useEffect(() => { proceedRef.current = proceed; });

  // Fire the live step the clock is holding at.
  const liveRun = live.run;
  useEffect(() => { if (heldStep && live.on && !live.pending && !live.error) void liveRun(heldStep); }, [heldStep, live.on, live.pending, live.error, liveRun]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || viewer || e.altKey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); proceedRef.current(); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      const cur = stateAt(t).scene;
      if (e.key === "ArrowRight") setT(sceneStartMs(Math.min(9, cur + 1)));
      if (e.key === "ArrowLeft") setT(sceneStartMs(Math.max(0, cur - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, viewer]);

  const base = useMemo(() => stateAt(t, timeline, policy), [t, policy]);
  // In live mode the real proofs replace the placeholders as they arrive.
  const st = useMemo(() => ({ ...base, proofs: base.proofs.map((p) => (live.byKey[p.id] ? { ...live.byKey[p.id], scene: p.scene } : p)) }), [base, live.byKey]);
  const lastProof = st.proofs.at(-1) ?? null;
  const pinned = pinnedProof ? st.proofs.find((p) => p.id === pinnedProof) ?? null : null;
  const placed = arrange(board, st.endCard ? [] : st.layout);
  const ownBoard = board.some(Boolean);
  const gridMode = ownBoard || drag !== null;
  const rows = drag ? 2 : rowsUsed(placed);
  // Only the columns that hold a card take width, so two cards share the whole row; dragging shows all three.
  const cols = drag ? COLS : Math.max(1, ...placed.map((p) => (p.spot % COLS) + 1));
  const boardCtx = {
    isMine: (id: PanelId) => board.includes(id),
    isLocked: (id: PanelId) => locked.includes(id),
    dragging: drag?.id ?? null,
    startDrag: (id: PanelId, e: React.PointerEvent) => {
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      const spotAt = (x: number, y: number) => {
        const el = document.elementsFromPoint(x, y).find((n) => n instanceof HTMLElement && n.dataset.spot !== undefined) as HTMLElement | undefined;
        return el ? Number(el.dataset.spot) : null;
      };
      setDrag({ id, dx: 0, dy: 0, over: null });
      const move = (ev: PointerEvent) => setDrag({ id, dx: ev.clientX - x0, dy: ev.clientY - y0, over: spotAt(ev.clientX, ev.clientY) });
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const spot = spotAt(ev.clientX, ev.clientY);
        setDrag(null);
        if (spot !== null) setBoard(placeCard(boardRef.current, lockedRef.current, id, spot, placedRef.current));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    step: (id: PanelId, dx: number, dy: number) => {
      const cur = placed.find((p) => p.id === id);
      if (!cur) return;
      const col = (cur.spot % COLS) + dx, row = Math.floor(cur.spot / COLS) + dy;
      if (col < 0 || col >= COLS || row < 0 || row * COLS + col >= SPOTS) return;
      setBoard(placeCard(board, locked, id, row * COLS + col, placed));
    },
    lock: (id: PanelId) => { const r = lockCard(board, locked, id, placed); setBoard(r.board); setLocked(r.locked); },
    close: (id: PanelId) => { setBoard(closeCard(board, id)); setLocked(locked.filter((x) => x !== id)); },
  };
  const boardRef = useRef(board), lockedRef = useRef(locked), placedRef = useRef(placed);
  useEffect(() => { boardRef.current = board; lockedRef.current = locked; placedRef.current = placed; });
  const drawerOpen = drawerOpenState || !!pinned;
  const answer = proceed;
  const scene = scenes.find((x) => x.id === st.scene)!;
  const stalled = st.stage === "low" && st.scene >= 1;
  const jump = (id: number) => { setT(sceneStartMs(id)); setPhonePinned(null); setPinnedProof(null); setViewer(null); };

  return (
    <PolicyContext.Provider value={policyCtx}>
    <ActionsContext.Provider value={actions}>
    <BoardContext.Provider value={boardCtx}>
    <div className={s.root} data-theme="clean" data-mode={mode} data-working={playing && st.stage !== "closed"}>
      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.wordmark} aria-label="everNEAR">ever<span className={s.wordmarkNear}>NEAR</span></span>
          <span className={s.faint}>for Astro Robotics</span>
        </div>
        <Rail stage={st.stage} stalled={stalled}
          onJump={(stage) => { setT(stageStartMs(stage)); setPinnedProof(null); setViewer(null); }}
          onPrev={() => jump(Math.max(0, st.scene - 1))} onNext={() => jump(Math.min(9, st.scene + 1))} />
      </header>

      <Sidebar open={navOpen} onToggle={() => setNavOpen((o) => !o)} pinned={board.filter((x): x is PanelId => !!x)}
        onPick={(id) => {
          if (board.includes(id)) { if (!locked.includes(id)) boardCtx.close(id); return; }
          const here = placed.find((p) => p.id === id);
          setBoard(here ? placeCard(board, locked, id, here.spot, placed) : openCard(board, id, placed));
        }}
        onClear={() => { setBoard(emptyBoard()); setLocked([]); }} />
      <StatsBar st={st} />
      <main className={s.stageArea}>
        {st.endCard ? (
          <div className={s.endCard} role="region" aria-label="End card">
            <p className={s.endLine}><span className={s.fig}>0</span> wires. <span className={s.fig}>0</span> days waiting. <span className={s.fig}>1</span> human decision.</p>
            <p className={s.mono}>github.com/devluca999/evernear</p>
          </div>
        ) : (
          <div className={s.panels} data-count={placed.length} data-grid={gridMode} style={gridMode ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
            {drag && Array.from({ length: SPOTS }, (_, spot) => (
              <div key={`spot-${spot}`} className={s.spot} data-spot={spot} data-over={drag.over === spot}
                style={{ gridColumn: (spot % COLS) + 1, gridRow: Math.floor(spot / COLS) + 1 }} aria-hidden="true" />
            ))}
            {placed.map(({ id, spot }) => {
              const P = PANELS[id];
              const moving = drag?.id === id;
              return (
                <div key={id} className={s.cardSlot} data-moving={moving}
                  style={gridMode ? { gridColumn: (spot % COLS) + 1, gridRow: Math.floor(spot / COLS) + 1, ...(moving ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : {}) } : undefined}>
                  <P st={st} pulse={st.pulse === id} />
                </div>
              );
            })}
          </div>
        )}
        {viewer && (
          <PhotoViewer checkpointId={viewer.checkpointId} index={viewer.index}
            onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)}
            onProof={(id) => { setPinnedProof(id); setViewer(null); }} />
        )}
      </main>

      <aside className={s.side}>
        <div className={s.sceneCard}>
          <span className={s.micro}>SCENE {st.scene}</span>
          <p className={s.sceneTitle}>{TIME_CARD[st.scene] ?? scene.title}</p>
          {SCENE_LINE[st.scene] && <p className={s.sceneLine}>{SCENE_LINE[st.scene]}</p>}
          {waiting && (
            <div className={s.waiting} role="group" aria-label="Waiting for you">
              <span className={s.micro}>WAITING FOR {waiting.who.toUpperCase()}</span>
              <p className={s.waitingPrompt}>{waiting.prompt}</p>
              <button type="button" className={s.btn} onClick={answer}>{waiting.action}</button>
            </div>
          )}
          {st.halted && (
            <div className={s.waiting} role="status" aria-label="Stopped by your rules">
              <span className={s.micro}>STOPPED BY YOUR RULES</span>
              <p className={s.waitingPrompt}>{st.halted.reason}</p>
              <button type="button" className={s.btnQuiet} onClick={policyCtx.reset}>Reset to Astro&apos;s rules</button>
            </div>
          )}
          {sceneEnd && (
            <div className={s.waiting} data-kind="scene" role="group" aria-label="End of scene">
              <span className={s.micro}>END OF SCENE {st.scene}</span>
              <button type="button" className={s.btn} onClick={proceed}>Next: {scenes.find((x) => x.id === sceneEnd.scene)?.title} <kbd className={s.kbd}>⌘K</kbd></button>
            </div>
          )}
          {live.on && (live.pending || live.error) && (
            <p className={s.liveStatus} role="status">{live.error ? `Live call failed (${live.error}). The replay carries on.` : `Live on Tidepool testnet: ${live.pending} running`}</p>
          )}
        </div>
        <div className={s.controls}>
          <button className={s.btn} onClick={() => { if (t >= totalDurationMs) setT(0); setPlaying((p) => !p); }}>{playing ? "Pause" : "Play"}</button>
          <button className={s.btnQuiet} aria-pressed={waitForMe} onClick={() => setWaitForMe((w) => !w)} title="When on, the demo stops at each human moment until you click">{waitForMe ? "Waits for me" : "Plays through"}</button>
          {live.available && <button className={s.btnQuiet} aria-pressed={live.on} onClick={() => live.setOn(!live.on)} title="Run the money steps for real on Tidepool testnet">{live.on ? "Live" : "Replay"}</button>}
          <button className={s.btnQuiet} onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>{mode === "dark" ? "Light" : "Dark"}</button>
        </div>
        <ol className={s.sceneList} aria-label="Scenes">
          {scenes.map((x) => (
            <li key={x.id}><button className={s.sceneBtn} data-current={x.id === st.scene} onClick={() => jump(x.id)}><span className={s.fig}>{x.id}</span>{x.title}</button></li>
          ))}
        </ol>
        {st.proofs.some((p) => p.synthetic) && <p className={s.syntheticNote}><Pill tone="idle">synthetic</Pill><span>Proofs are placeholders until real testnet recordings replace them.</span></p>}
      </aside>

      <div className={s.dock}>
        <Phone messages={st.messages} open={phonePinned ?? !!waiting} waiting={waiting} onAnswer={answer} onToggle={() => setPhonePinned(!(phonePinned ?? !!waiting))} />
        <Drawer proof={pinned ?? lastProof} lastProof={lastProof} open={drawerOpen}
          onToggle={() => { if (pinned) setPinnedProof(null); setDrawerOpen(!drawerOpen); }} />
      </div>

    </div>
    </BoardContext.Provider>
    </ActionsContext.Provider>
    </PolicyContext.Provider>
  );
}
