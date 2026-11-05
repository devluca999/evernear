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
import { ActionsContext, type WorkspaceActions } from "./actions";
import { PhotoViewer } from "./PhotoViewer";
import { Chip, Pill } from "./ui";
import { CHECKPOINTS } from "@/scenario/shipment";
import s from "./workspace.module.css";

const PANELS: Record<PanelId, (p: { st: WorkspaceState; pulse: boolean }) => React.ReactNode> = {
  demand: DemandPanel, map: MapPanel, inbox: InboxPanel, bom: BomPanel, rules: RulesPanel,
};

const TIME_CARD: Record<number, string> = { 7: "Day 9 · Chicago dock" };

export function Workspace({ initialMs = 0, autoplay = true }: { initialMs?: number; autoplay?: boolean }) {
  const [t, setT] = useState(initialMs);
  const [playing, setPlaying] = useState(autoplay);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [drawerPinned, setDrawerPinned] = useState(false);
  const [phonePinned, setPhonePinned] = useState<boolean | null>(null);
  const last = useRef<number | null>(null);
  const [viewer, setViewer] = useState<{ checkpointId: string; index: number } | null>(null);
  const [pinnedProof, setPinnedProof] = useState<string | null>(null);
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
      if (q.get("mode") === "light") setMode("light");
      const photo = q.get("photo");
      if (photo && photo.split(":")[0] in CHECKPOINTS) setViewer({ checkpointId: photo.split(":")[0], index: Number(photo.split(":")[1] ?? 0) });
    });
  }, []);

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        const next = Math.min(totalDurationMs, x + dt);
        if (next >= totalDurationMs) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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
  const scene = scenes.find((x) => x.id === st.scene)!;
  const stalled = st.stage === "low" && st.scene >= 1;
  const jump = (id: number) => { setT(sceneStartMs(id)); setPhonePinned(null); setPinnedProof(null); setViewer(null); };

  return (
    <ActionsContext.Provider value={actions}>
    <div className={s.root} data-theme="clean" data-mode={mode} data-working={playing && st.stage !== "closed"}>
      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.wordmark}>Evernear</span>
          <span className={s.faint}>for Astro Robotics</span>
        </div>
        <Rail stage={st.stage} stalled={stalled}
          onJump={(stage) => { setT(stageStartMs(stage)); setPinnedProof(null); setViewer(null); }}
          onPrev={() => jump(Math.max(0, st.scene - 1))} onNext={() => jump(Math.min(9, st.scene + 1))} />
      </header>

      <main className={s.stageArea}>
        <div className={s.panels} data-count={st.layout.length}>
          {st.layout.map((id) => {
            const P = PANELS[id];
            return <P key={id} st={st} pulse={st.pulse === id} />;
          })}
        </div>
        <Drawer proof={pinned ?? st.drawer} lastProof={lastProof} open={!!pinned || !!st.drawer || drawerPinned}
          onToggle={() => { if (pinned) setPinnedProof(null); else setDrawerPinned((x) => !x); }} />
        {viewer && (
          <PhotoViewer checkpointId={viewer.checkpointId} index={viewer.index}
            onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)}
            onProof={(id) => { setPinnedProof(id); setViewer(null); }} />
        )}
        <Phone messages={st.messages} open={phonePinned ?? st.phoneOpen} onToggle={() => setPhonePinned(!(phonePinned ?? st.phoneOpen))} />
      </main>

      <aside className={s.side}>
        <div className={s.sceneCard}>
          <span className={s.micro}>SCENE {st.scene}</span>
          <p className={s.sceneTitle}>{TIME_CARD[st.scene] ?? scene.title}</p>
        </div>
        <div className={s.controls}>
          <button className={s.btn} onClick={() => { if (t >= totalDurationMs) setT(0); setPlaying((p) => !p); }}>{playing ? "Pause" : "Play"}</button>
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
        <div className={s.camera} aria-label="Presenter camera">CAMERA</div>
      </aside>

      {st.endCard && (
        <div className={s.endCard} role="dialog" aria-label="End card">
          <p className={s.endLine}><span className={s.fig}>0</span> wires. <span className={s.fig}>0</span> days waiting. <span className={s.fig}>1</span> human decision.</p>
          <p className={s.mono}>github.com/Everstock-Inc/evernear</p>
        </div>
      )}
    </div>
    </ActionsContext.Provider>
  );
}
