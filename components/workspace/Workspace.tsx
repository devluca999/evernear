"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stateAt, sceneStartMs, stageStartMs } from "@/scenario/runner";
import { SCENARIOS, type ScenarioId } from "@/scenario/scenes";
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
import { describeStop, heldAt, isStop, liveStepOf, stepClockWith } from "@/scenario/gates";
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


export function Workspace({ initialMs = 0, autoplay = true }: { initialMs?: number; autoplay?: boolean }) {
  const [t, setT] = useState(initialMs);
  const [playing, setPlaying] = useState(autoplay);
  // Present: nothing moves until you act, one narratable step at a time. Autoplay: the scenario plays itself.
  const [playMode, setPlayMode] = useState<"present" | "autoplay">("present");
  const present = playMode === "present";
  const [scenarioId, setScenarioId] = useState<ScenarioId>("happy");
  const SC = SCENARIOS[scenarioId];
  const TL = SC.timeline, TOTAL = SC.totalMs, LIST = SC.scenes, LAST = LIST.length - 1;
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
      const sc = q.get("scenario");
      const scList = sc && sc in SCENARIOS ? SCENARIOS[sc as ScenarioId].scenes : SCENARIOS.happy.scenes;
      if (sc && sc in SCENARIOS) setScenarioId(sc as ScenarioId);
      if (id !== null) setT(sceneStartMs(Number(id), scList) + off);
      if (q.get("paused") === "1") setPlaying(false);
      if (q.get("autoplay") === "1" || q.get("play") === "autoplay") setPlayMode("autoplay");
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
  const haltedAt = useMemo(() => stateAt(TOTAL, TL, policy).halted?.atMs ?? null, [policy, TL, TOTAL]);
  // What holds the clock: a human moment, the end of a scene (narrate, then Cmd+K), or a live step still running.
  const blocked = (b: Beat) => {
    const afterHalt = haltedAt !== null && b.atMs > haltedAt;
    // A live money step holds the clock until the real call finished, in both modes.
    const step = liveStepOf(b, HAOYUN);
    if (!afterHalt && live.on && !live.error && step && !live.done.includes(step)) return true;
    if (!present) return false;
    // Once the rules stop the PO, only scene changes and the end still wait for you.
    if (afterHalt) return b.ev.type === "scene" || b.ev.type === "end_card";
    return isStop(b);
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
        const next = stepClockWith(x, Math.min(TOTAL, x + dt), (b) => blockedRef.current(b), TL);
        if (next >= TOTAL) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, TL, TOTAL]);

  const held = heldAt(t, blocked, TL);
  const heldStep = held ? liveStepOf(held, HAOYUN) : null;
  const waiting = held?.gate ?? null;
  const liveBusy = !!heldStep && live.on && !live.error && !live.done.includes(heldStep);
  const nextLabel = held && !liveBusy ? describeStop(held, (id) => LIST[id]?.title ?? "", HAOYUN) : null;
  /** Next: play the step the clock is held at (or answer the moment). A live step finishes first. */
  const proceed = () => {
    if (held && !liveBusy) { setT(held.atMs); setPhonePinned(null); setPlaying(true); return; }
    if (!held && t >= TOTAL) return;
    if (!held && !present) setPlaying(true);
  };
  const proceedRef = useRef(proceed);
  useEffect(() => { proceedRef.current = proceed; });

  // Fire the live step the clock is holding at.
  const liveRun = live.run;
  const liveScenario = scenarioId === "adjusted" ? "adjusted" : "happy";
  useEffect(() => { if (heldStep && live.on && !live.pending && !live.error) void liveRun(heldStep, liveScenario); }, [heldStep, live.on, live.pending, live.error, liveRun, liveScenario]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || viewer || e.altKey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); proceedRef.current(); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      const cur = stateAt(t, TL).scene;
      if (e.key === "ArrowRight") setT(sceneStartMs(Math.min(LAST, cur + 1), LIST));
      if (e.key === "ArrowLeft") setT(sceneStartMs(Math.max(0, cur - 1), LIST));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, viewer, TL, LIST, LAST]);

  const base = useMemo(() => stateAt(t, TL, policy), [t, TL, policy]);
  // In live mode the real proofs replace the placeholders as they arrive.
  const st = useMemo(() => ({ ...base, proofs: base.proofs.map((p) => (live.byKey[p.id] ? { ...live.byKey[p.id], scene: p.scene, atMs: p.atMs } : p)) }), [base, live.byKey]);
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
  // Present: the phone comes up only when it waits for you. Autoplay: it follows the script.
  const phoneOpen = phonePinned ?? (present ? !!waiting : st.phoneOpen || !!waiting);
  const scene = LIST.find((x) => x.id === st.scene) ?? LIST[0];
  const stalled = st.stage === "low" && st.scene >= 1;
  const jump = (id: number) => { setT(sceneStartMs(id, LIST)); setPhonePinned(null); setPinnedProof(null); setViewer(null); };
  const restart = () => { setT(0); setPhonePinned(null); setPinnedProof(null); setViewer(null); live.reset(); setPlaying(true); };
  const pickScenario = (id: ScenarioId) => { setScenarioId(id); setT(0); setPhonePinned(null); setPinnedProof(null); setViewer(null); live.reset(); setPlaying(true); };

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
          onJump={(stage) => { setT(stageStartMs(stage, TL)); setPinnedProof(null); setViewer(null); }}
          onPrev={() => jump(Math.max(0, st.scene - 1))} onNext={() => jump(Math.min(LAST, st.scene + 1))} />
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
          <span className={s.micro}>{SC.title.toUpperCase()} · SCENE {st.scene}</span>
          <p className={s.sceneTitle}>{scene.timeCard ?? scene.title}</p>
          {scene.line && <p className={s.sceneLine}>{scene.line}</p>}
          {waiting && (
            <div className={s.waiting} role="group" aria-label="Waiting for you">
              <span className={s.micro}>WAITING FOR {waiting.who.toUpperCase()}</span>
              <p className={s.waitingPrompt}>{waiting.prompt}</p>
              <button type="button" className={s.btn} onClick={answer}>{waiting.action} <kbd className={s.kbd}>⌘K</kbd></button>
            </div>
          )}
          {st.halted && (
            <div className={s.waiting} role="status" aria-label="Stopped by your rules">
              <span className={s.micro}>STOPPED BY THE RULES</span>
              <p className={s.waitingPrompt}>{st.halted.reason}</p>
              {policyCtx.changed && <button type="button" className={s.btnQuiet} onClick={policyCtx.reset}>Reset to Astro&apos;s rules</button>}
            </div>
          )}
          {present && !waiting && nextLabel && (
            <div className={s.waiting} data-kind="scene" role="group" aria-label="Next step">
              <span className={s.micro}>NEXT</span>
              <button type="button" className={s.btn} onClick={proceed}>{nextLabel} <kbd className={s.kbd}>⌘K</kbd></button>
            </div>
          )}
          {present && !held && t < TOTAL && <p className={s.liveStatus} role="status">Playing this step</p>}
          {t >= TOTAL && <p className={s.liveStatus}>Finished. <button type="button" className={s.pinClear} onClick={restart}>Restart</button></p>}
          {live.on && (liveBusy || live.error) && (
            <p className={s.liveStatus} role="status">{live.error ? `Live call failed (${live.error}). The replay carries on.` : `Live on Tidepool testnet: ${heldStep} running`}</p>
          )}
        </div>
        <div className={s.runBar}>
          <div className={s.segmented} role="group" aria-label="Mode">
            <button type="button" aria-pressed={present} onClick={() => setPlayMode("present")} title="Nothing moves until you act">Present</button>
            <button type="button" aria-pressed={!present} onClick={() => { setPlayMode("autoplay"); setPlaying(true); }} title="Plays the scenario start to finish">Autoplay</button>
          </div>
          <label className={s.scenarioPick}>
            <span className={s.micro}>SCENARIO</span>
            <select value={scenarioId} onChange={(e) => pickScenario(e.target.value as ScenarioId)} aria-label="Scenario">
              {Object.values(SCENARIOS).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <span className={s.faint}>{SC.blurb}</span>
          </label>
          <div className={s.controls}>
            {!present && <button className={s.btn} onClick={() => { if (t >= TOTAL) setT(0); setPlaying((p) => !p); }}>{playing && t < TOTAL ? "Pause" : "Play"}</button>}
            <button className={s.btnQuiet} onClick={restart}>Restart</button>
            {live.available && <button className={s.btnQuiet} aria-pressed={live.on} onClick={() => live.setOn(!live.on)} title="Run the money steps for real on Tidepool testnet">{live.on ? "Live: on" : "Live: off"}</button>}
            <button className={s.btnQuiet} onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>{mode === "dark" ? "Light" : "Dark"}</button>
          </div>
        </div>
        <ol className={s.sceneList} aria-label="Scenes">
          {LIST.map((x) => (
            <li key={x.id}><button className={s.sceneBtn} data-current={x.id === st.scene} onClick={() => jump(x.id)}><span className={s.fig}>{x.id}</span>{x.title}</button></li>
          ))}
        </ol>
        {st.proofs.some((p) => p.synthetic) && <p className={s.syntheticNote}><Pill tone="idle">synthetic</Pill><span>Proofs are placeholders until real testnet recordings replace them.</span></p>}
      </aside>

      <div className={s.dock}>
        <Phone messages={st.messages} open={phoneOpen} waiting={waiting} onAnswer={answer} onToggle={() => setPhonePinned(!phoneOpen)} />
        <Drawer proof={pinned ?? lastProof} lastProof={lastProof} history={st.proofs} open={drawerOpen}
          onToggle={() => { if (pinned) setPinnedProof(null); setDrawerOpen(!drawerOpen); }} />
      </div>

    </div>
    </BoardContext.Provider>
    </ActionsContext.Provider>
    </PolicyContext.Provider>
  );
}
