"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stateAt, sceneStartMs, stageStartMs } from "@/scenario/runner";
import { scenes, totalDurationMs } from "@/scenario/scenes";
import { products } from "@/seed/astro";
import type { PanelId, WorkspaceState } from "@/scenario/types";
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
import { composeLayout, togglePin, PANEL_ORDER } from "@/scenario/layout";
import { stepClock, waitingAt } from "@/scenario/gates";
import { PinContext } from "./Panel";
import { Sidebar } from "./Sidebar";
import { StatsBar } from "./StatsBar";
import s from "./workspace.module.css";

const PANELS: Record<PanelId, (p: { st: WorkspaceState; pulse: boolean }) => React.ReactNode> = {
  products: ProductsPanel, demand: DemandPanel, map: MapPanel, inbox: InboxPanel, bom: BomPanel, rules: RulesPanel,
};

const PIN_KEY = "evernear.pinnedPanels";

const TIME_CARD: Record<number, string> = { 7: "Day 9 · Chicago dock" };

export function Workspace({ initialMs = 0, autoplay = true }: { initialMs?: number; autoplay?: boolean }) {
  const [t, setT] = useState(initialMs);
  const [playing, setPlaying] = useState(autoplay);
  // Waits at each human moment for a click; ?autoplay=1 plays straight through (recording).
  const [waitForMe, setWaitForMe] = useState(true);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  // null: the drawer follows the proofs (opens for a moment at each); true or false: the chevron decided.
  const [drawerOverride, setDrawerOverride] = useState<boolean | null>(null);
  const [phonePinned, setPhonePinned] = useState<boolean | null>(null);
  const last = useRef<number | null>(null);
  const [viewer, setViewer] = useState<{ checkpointId: string; index: number } | null>(null);
  const [pinnedProof, setPinnedProof] = useState<string | null>(null);
  const [pinnedPanels, setPinnedPanels] = useState<PanelId[]>([]);
  const [navOpen, setNavOpen] = useState(true);
  const pins = useMemo(() => ({
    pinned: pinnedPanels,
    toggle: (id: PanelId) => setPinnedPanels((cur) => {
      const next = togglePin(cur, id);
      try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
      return next;
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
      try {
        const saved = JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]");
        if (Array.isArray(saved)) setPinnedPanels(saved.filter((x): x is PanelId => PANEL_ORDER.includes(x)));
      } catch { /* no saved pins */ }
    });
  }, []);

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        const next = stepClock(x, Math.min(totalDurationMs, x + dt), waitForMe);
        if (next >= totalDurationMs) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, waitForMe]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || viewer) return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      const cur = stateAt(t).scene;
      if (e.key === "ArrowRight") setT(sceneStartMs(Math.min(9, cur + 1)));
      if (e.key === "ArrowLeft") setT(sceneStartMs(Math.max(0, cur - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, viewer]);

  const st = useMemo(() => stateAt(t), [t]);
  const lastProof = st.proofs.at(-1) ?? null;
  const pinned = pinnedProof ? st.proofs.find((p) => p.id === pinnedProof) ?? null : null;
  const layout = composeLayout(pinnedPanels, st.layout);
  const drawerOpen = drawerOverride ?? (!!pinned || !!st.drawer);
  const waiting = waitingAt(t, waitForMe)?.gate ?? null;
  const answer = () => { const g = waitingAt(t, waitForMe); if (g) { setT(g.atMs); setPlaying(true); } };
  const scene = scenes.find((x) => x.id === st.scene)!;
  const stalled = st.stage === "low" && st.scene >= 1;
  const jump = (id: number) => { setT(sceneStartMs(id)); setPhonePinned(null); setDrawerOverride(null); setPinnedProof(null); setViewer(null); };

  return (
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
        <div className={s.panels} data-count={layout.length}>
          {layout.map((id) => {
            const P = PANELS[id];
            return <P key={id} st={st} pulse={st.pulse === id} />;
          })}
        </div>
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
        </div>
        <div className={s.controls}>
          <button className={s.btn} onClick={() => { if (t >= totalDurationMs) setT(0); setPlaying((p) => !p); }}>{playing ? "Pause" : "Play"}</button>
          <button className={s.btnQuiet} aria-pressed={waitForMe} onClick={() => setWaitForMe((w) => !w)} title="When on, the demo stops at each human moment until you click">{waitForMe ? "Waits for me" : "Plays through"}</button>
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
        <Phone messages={st.messages} open={phonePinned ?? (st.phoneOpen || !!waiting)} waiting={waiting} onAnswer={answer} onToggle={() => setPhonePinned(!(phonePinned ?? (st.phoneOpen || !!waiting)))} />
        <Drawer proof={pinned ?? st.drawer} lastProof={lastProof} open={drawerOpen}
          onToggle={() => { if (pinned) setPinnedProof(null); setDrawerOverride(!drawerOpen); }} />
      </div>

      {st.endCard && (
        <div className={s.endCard} role="dialog" aria-label="End card">
          <p className={s.endLine}><span className={s.fig}>0</span> wires. <span className={s.fig}>0</span> days waiting. <span className={s.fig}>1</span> human decision.</p>
          <p className={s.mono}>github.com/devluca999/evernear</p>
        </div>
      )}
    </div>
    </PinContext.Provider>
    </ActionsContext.Provider>
  );
}
