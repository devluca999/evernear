// The presenter's rail on the right: where the story is, what happens next (or who it waits for),
// Present or Autoplay, the scenario, and the scene list. Hide tucks it to the edge.
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Gate } from "@/scenario/types";
import type { Scenario, ScenarioId } from "@/scenario/scenes";
import { Badge, Dot } from "./Panel";
import s from "./shell.module.css";

export interface RailProps {
  scenario: Scenario; scenarios: Scenario[]; scene: number; title: string; line?: string;
  waiting: Gate | null; onHold: boolean; halted: string | null; rulesChanged: boolean; onResetRules: () => void;
  next: { label: string; key: string } | null; onNext: () => void;
  present: boolean; setPresent: (p: boolean) => void; playing: boolean; onPlayPause: () => void; finished: boolean;
  pick: (id: ScenarioId) => void; jump: (id: number) => void; restart: () => void;
  live: { available: boolean; on: boolean; toggle: () => void; status: string | null };
  mode: "dark" | "light"; toggleMode: () => void;
  synthetic: boolean; hide: () => void;
  /** Which proofs are real: all of them, the money steps (a live or recorded testnet run), or none yet. */
  proofsReal?: "all" | "money" | "none";
  /** Short mode: the section on screen (0 before the first press) and the one the next press plays. */
  short?: { section: number; sections: number; title: string | null; next: string | null; playing: boolean } | null;
  setShort?: () => void;
  camera?: { on: boolean; follow: boolean; toggle: () => void; toggleFollow: () => void; focus: string | null; next: string | null; cursor?: boolean; toggleCursor?: () => void };
}

export function DemoRail(p: RailProps) {
  const LIST = p.scenario.scenes;
  const sh = p.short ?? null;
  return (
    <aside className={s.rail} aria-label="Demo mode">
      <div className={s.railHead}>
        <span className={s.railTitle}>Demo mode</span>
        <span className="es-tag">Presenter</span>
        <button type="button" className={s.railHide} onClick={p.hide}>Hide<ChevronRight size={13} strokeWidth={2} aria-hidden="true" /></button>
      </div>
      <div className={s.sceneHead}>
        <span className={s.sceneLabel}>{sh ? (sh.section > 0 ? `Short · Section ${sh.section} of ${sh.sections}` : "Short · Ready") : `${p.scenario.title} · Chapter ${p.scene + 1}`}</span>
        <h2 className={s.sceneTitle}>{p.title}</h2>
        {p.line && <p className={s.sceneLine}>{p.line}</p>}
      </div>

      {sh ? (
        <div className={s.nextBox} role="group" aria-label="Next step">
          <span className="es-micro">{sh.playing ? "Playing" : sh.next ? "Next section" : "Finished"}</span>
          <button type="button" className={`es-btn es-btn-primary es-btn-sm ${s.nextBtn}`} onClick={p.onNext} disabled={sh.playing || !sh.next}
            title={sh.playing ? "A press does nothing while a section plays" : undefined}>
            <span className={s.nextLabel}>{sh.playing ? `Section ${sh.section} playing` : sh.next ? `Play ${sh.next}` : "All sections played"}</span><span className={s.kbd}>⌘K</span>
          </button>
        </div>
      ) : p.waiting ? (
        <div className={s.waitBox} role="group" aria-label="Waiting for you">
          <div className={s.headRow}>
            <Dot tone="attention" /><span className={s.waitWho}>Waiting for {p.waiting.who}</span>
            {p.onHold && <span className={s.push}><Badge tone="attention">On hold</Badge></span>}
          </div>
          <span className={s.waitWhat}>{p.waiting.prompt}</span>
        </div>
      ) : p.halted ? (
        <div className={s.waitBox} role="status" aria-label="Stopped by your rules">
          <div className={s.headRow}><Dot tone="attention" /><span className={s.waitWho}>Stopped by your rules</span></div>
          <span className={s.waitWhat}>{p.halted}</span>
          {p.rulesChanged && <button type="button" className={s.linkBtn} onClick={p.onResetRules}>Reset to Astro&apos;s rules</button>}
        </div>
      ) : (p.present && p.next) || !p.present ? (
        <div className={s.nextBox} role="group" aria-label="Next step">
          <span className="es-micro">{p.present ? "Next" : p.finished ? "Finished" : p.playing ? "Playing" : "Paused"}</span>
          {p.present && p.next ? (
            <button type="button" className={`es-btn es-btn-primary es-btn-sm ${s.nextBtn}`} onClick={p.onNext} title={p.next.label}><span className={s.nextLabel}>{p.next.label}</span><span className={s.kbd}>{p.next.key}</span></button>
          ) : (
            <button type="button" className={`es-btn es-btn-primary es-btn-sm ${s.nextBtn}`} onClick={p.onPlayPause}>{p.finished ? "Play again" : p.playing ? "Pause" : "Play"}<span className={s.kbd}>Space</span></button>
          )}
        </div>
      ) : null}
      {p.live.status && <p className={s.liveNote} role="status">{p.live.status}</p>}

      <div className={s.modeSeg} role="group" aria-label="Mode">
        <button type="button" aria-pressed={p.present} onClick={() => p.setPresent(true)} title="Nothing moves until you act">Present</button>
        <button type="button" aria-pressed={!p.present && !sh} onClick={() => p.setPresent(false)} title="Plays the scenario start to finish">Autoplay</button>
        {p.setShort && <button type="button" aria-pressed={!!sh} onClick={p.setShort} title="The happy path in 9 sections for a short video: each press plays one section">Short</button>}
      </div>

      {!sh && <div className={s.scenarios} role="radiogroup" aria-label="Scenario">
        <span className="es-micro">Scenario</span>
        {p.scenarios.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === p.scenario.id} className={s.scenario} onClick={() => { if (x.id !== "short") p.pick(x.id); }}>
            <span className={s.radio} aria-hidden="true" />
            <span><span className={s.scName}>{x.title}</span><span className={s.scDesc}>{x.blurb}</span></span>
          </button>
        ))}
      </div>}

      <div className={s.railBtns}>
        <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} onClick={p.restart}>Restart</button>
        <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} aria-pressed={p.live.on} disabled={!p.live.available}
          onClick={p.live.toggle} title={sh ? "Live is always off in Short mode" : p.live.available ? "Run the money steps for real on Tidepool testnet" : "Live mode is not configured here"}>
          <Dot tone={p.live.on ? "success" : undefined} />{p.live.on ? "Live on" : "Live off"}
        </button>
        <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} onClick={p.toggleMode}>{p.mode === "dark" ? "Light" : "Dark"}</button>
      </div>

      {p.camera && (
        <div className={s.camRow} role="group" aria-label="Camera">
          <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} aria-pressed={p.camera.on} onClick={p.camera.toggle} title="Zoom to each step's focus (F)">
            <Dot tone={p.camera.on ? "active" : undefined} />{p.camera.on ? "Camera on" : "Camera off"}<span className={s.kbd}>F</span>
          </button>
          <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} aria-pressed={p.camera.follow} onClick={p.camera.toggleFollow} disabled={!p.camera.on} title="Zoom gently toward each click (Z)">
            Follow clicks<span className={s.kbd}>Z</span>
          </button>
          {p.camera.toggleCursor && (
            <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.railBtn}`} aria-pressed={!!p.camera.cursor} onClick={p.camera.toggleCursor}
              title="An on-screen cursor clicks each step's tab, button or phone tap (C)">
              <Dot tone={p.camera.cursor ? "active" : undefined} />{p.camera.cursor ? "Cursor on" : "Cursor off"}<span className={s.kbd}>C</span>
            </button>
          )}
          {p.camera.on && (p.camera.focus || p.camera.next) && (
            <span className={s.camNote}>{p.camera.focus ? <>On <span className="es-num">{p.camera.focus}</span></> : <>Next zoom: {p.camera.next}</>}</span>
          )}
        </div>
      )}

      <span className="es-micro">{sh ? "Sections" : "Chapters"}</span>
      <ol className={s.sceneList} aria-label={sh ? "Sections" : "Chapters"}>
        {LIST.map((x) => {
          const state = x.id < p.scene ? "done" : x.id === p.scene ? "current" : "pending";
          return (
            <li key={x.id}>
              <button type="button" className={s.sceneBtn} data-state={state} aria-current={state === "current" ? "step" : undefined} onClick={() => p.jump(x.id)}>
                <span className={s.sceneNo}>{String(x.id + 1).padStart(2, "0")}</span>
                <Dot tone={state === "done" ? "success" : state === "current" ? (p.waiting ? "attention" : "active") : undefined} pulse={state === "current"} />
                <span>{x.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={s.railFoot}>
        <span className="es-tag es-tag-mono">{p.proofsReal === "all" ? "testnet" : p.proofsReal === "money" ? "testnet + synthetic" : "synthetic"}</span>
        <span className={s.railFootText}>{p.proofsReal === "all" ? "Proofs on screen are real testnet transactions."
          : p.proofsReal === "money" ? "The money steps are a real testnet run through the release gate; the steps before them are placeholders."
          : "Proofs on screen are placeholders until real testnet recordings replace them."}</span>
      </div>
    </aside>
  );
}

export const RailShow = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className={s.railShow} onClick={onClick} aria-label="Show demo mode"><ChevronLeft size={13} strokeWidth={2} aria-hidden="true" />Demo</button>
);
