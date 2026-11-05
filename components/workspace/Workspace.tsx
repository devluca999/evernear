"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stateAt, sceneStartMs, stageStartMs } from "@/scenario/runner";
import { scenes, timeline, totalDurationMs } from "@/scenario/scenes";
import { products, suppliers } from "@/seed/astro";
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
import { Chip, Pill } from "./ui";
import { CHECKPOINTS } from "@/scenario/shipment";
import { composeLayout, movePanel, togglePin, PANEL_ORDER } from "@/scenario/layout";
import { heldAt, liveStepOf, stepClockWith } from "@/scenario/gates";
import { useLive } from "./useLive";
import { loadPolicy, PolicyContext, POLICY_KEY, sameRules } from "./rules";
import { policy as defaultPolicy } from "@/seed/astro";
import type { Policy } from "@/engine/types";
import { PinContext } from "./Panel";
import { Sidebar } from "./Sidebar";
import { StatsBar } from "./StatsBar";
import s from "./workspace.module.css";

const PANELS: Record<PanelId, (p: { st: WorkspaceState; pulse: boolean }) => React.ReactNode> = {
  products: ProductsPanel, demand: DemandPanel, map: MapPanel, inbox: InboxPanel, bom: BomPanel, rules: RulesPanel,
};

const PIN_KEY = "evernear.pinnedPanels";
const HAOYUN = suppliers.find((x) => x.id === "haoyun")!.receiveAddress;

const TIME_CARD: Record<number, string> = { 7: "Day 9 · Chicago dock" };

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
  const [pinnedPanels, setPinnedPanels] = useState<PanelId[]>([]);
  const [navOpen, setNavOpen] = useState(true);
  const savePins = (next: PanelId[]) => { try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ } return next; };
  const layoutRef = useRef<PanelId[]>([]);
  const pins = useMemo(() => ({
    pinned: pinnedPanels,
    toggle: (id: PanelId) => setPinnedPanels((cur) => savePins(togglePin(cur, id))),
    move: (id: PanelId, over: PanelId) => setPinnedPanels(() => savePins(movePanel(layoutRef.current, id, over))),
    nudge: (id: PanelId, by: -1 | 1) => setPinnedPanels(() => {
      const cur = layoutRef.current, i = cur.indexOf(id), j = i + by;
      return savePins(j < 0 || j >= cur.length ? [...cur] : movePanel(cur, id, cur[j]));
    }),
  }), [pinnedPanels]);
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
        const saved = JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]");
        if (Array.isArray(saved)) setPinnedPanels(saved.filter((x): x is PanelId => PANEL_ORDER.includes(x)));
      } catch { /* no saved pins */ }
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
  const layout = composeLayout(pinnedPanels, st.layout);
  useEffect(() => { layoutRef.current = layout; });
  const drawerOpen = drawerOpenState || !!pinned;
  const answer = proceed;
  const scene = scenes.find((x) => x.id === st.scene)!;
  const stalled = st.stage === "low" && st.scene >= 1;
  const jump = (id: number) => { setT(sceneStartMs(id)); setPhonePinned(null); setPinnedProof(null); setViewer(null); };

  return (
    <PolicyContext.Provider value={policyCtx}>
    <ActionsContext.Provider value={actions}>
    <PinContext.Provider value={pins}>
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

      <Sidebar open={navOpen} onToggle={() => setNavOpen((o) => !o)} pinned={pinnedPanels} onPick={pins.toggle}
        onClear={() => { setPinnedPanels([]); try { localStorage.removeItem(PIN_KEY); } catch { /* ignore */ } }} />
      <StatsBar st={st} />
      <main className={s.stageArea}>
        {st.endCard ? (
          <div className={s.endCard} role="region" aria-label="End card">
            <p className={s.endLine}><span className={s.fig}>0</span> wires. <span className={s.fig}>0</span> days waiting. <span className={s.fig}>1</span> human decision.</p>
            <p className={s.mono}>github.com/devluca999/evernear</p>
          </div>
        ) : (
          <div className={s.panels} data-count={layout.length}>
            {layout.map((id) => {
              const P = PANELS[id];
              return <P key={id} st={st} pulse={st.pulse === id} />;
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
        <div className={s.products} aria-label="Products">
          {products.map((p) => p.playable ? <Pill key={p.id} tone="idle">{p.name}</Pill> : <span key={p.id} title="Not played in this demo"><Chip>{p.name}</Chip></span>)}
        </div>
        {st.proofs.some((p) => p.synthetic) && <p className={s.syntheticNote}><Pill tone="idle">synthetic</Pill><span>Proofs are placeholders until real testnet recordings replace them.</span></p>}
      </aside>

      <div className={s.dock}>
        <Phone messages={st.messages} open={phonePinned ?? !!waiting} waiting={waiting} onAnswer={answer} onToggle={() => setPhonePinned(!(phonePinned ?? !!waiting))} />
        <Drawer proof={pinned ?? lastProof} lastProof={lastProof} open={drawerOpen}
          onToggle={() => { if (pinned) setPinnedProof(null); setDrawerOpen(!drawerOpen); }} />
      </div>

    </div>
    </PinContext.Provider>
    </ActionsContext.Provider>
    </PolicyContext.Provider>
  );
}
