"use client";
// The presenter remote: open /present in a second window beside the workspace (same browser). It
// shows the chapter, what the next press does and where the camera points, and it can play the
// next step, preview or skip the next zoom, return to the full view, and switch the camera.
import { useEffect, useRef, useState } from "react";
import { openChannel, type RemoteCommand, type RemoteState } from "./presentChannel";
import s from "./shell.module.css";

export function Remote() {
  const [state, setState] = useState<RemoteState | null>(null);
  const ch = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const c = openChannel();
    ch.current = c;
    if (!c) return;
    c.onmessage = (e: MessageEvent<RemoteState>) => { if (e.data?.type === "state") setState(e.data); };
    c.postMessage({ type: "cmd", cmd: "hello" } satisfies RemoteCommand);
    return () => { c.close(); ch.current = null; };
  }, []);
  const send = (cmd: RemoteCommand["cmd"]) => ch.current?.postMessage({ type: "cmd", cmd } satisfies RemoteCommand);
  const cam = state?.camera;

  return (
    <div className={s.remote} data-theme="clean" data-mode="dark">
      <header className={s.remoteHead}>
        <span className={s.railTitle}>Presenter remote</span>
        <span className="es-tag">{state ? state.scenario : "Not connected"}</span>
      </header>
      {!state ? (
        <p className={s.note}>Open the workspace in another tab or window of this browser. This remote connects to it by itself.</p>
      ) : (
        <>
          {state.short ? (
            <section className={s.remoteCard} aria-label="Section">
              <span className="es-micro">{state.short.section > 0
                ? <>Section <span className="es-num">{state.short.section}</span> of <span className="es-num">{state.short.sections}</span>{state.short.playing ? " · playing" : ""}</>
                : <>Short · <span className="es-num">{state.short.sections}</span> sections</>}</span>
              <h1 className={s.remoteTitle}>{state.short.title ?? "Ready"}</h1>
              <span className={s.note}>{state.short.next ? <>Next: {state.short.next}</> : "Last section played"}</span>
              <button type="button" className={`es-btn es-btn-primary ${s.remoteNext}`} onClick={() => send("next")} disabled={!state.short.next || state.short.playing}>
                {state.short.playing ? "Playing" : state.short.next ? `Play ${state.short.next}` : "Done"}<span className={s.kbd}>→</span>
              </button>
            </section>
          ) : (
          <section className={s.remoteCard} aria-label="Chapter">
              <span className="es-micro">Chapter <span className="es-num">{state.chapter}</span> of <span className="es-num">{state.chapters}</span></span>
              <h1 className={s.remoteTitle}>{state.chapterTitle}</h1>
              <button type="button" className={`es-btn es-btn-primary ${s.remoteNext}`} onClick={() => send("next")} disabled={!state.next}>
                {state.next ?? "Waiting"}<span className={s.kbd}>→</span>
              </button>
            </section>
          )}
          <section className={s.remoteCard} aria-label="Camera">
            <div className={s.headRow}>
              <span className="es-micro">Camera</span>
              <span className={`${s.note} ${s.push}`}>{cam!.on ? (cam!.focusId ? <>On <span className="es-num">{cam!.focusId}</span> at <span className="es-num">{cam!.zoom.toFixed(1)}x</span></> : "Full view") : "Off"}</span>
            </div>
            <div className={s.remoteRow}>
              <span className="es-micro">Next zoom</span>
              <span>{state.upcoming ? <>{state.upcoming.step} · <span className="es-num">{state.upcoming.id}</span> · <span className="es-num">{state.upcoming.zoom}x</span>{state.upcoming.skipped ? " · skipped" : ""}</> : "None left in this run"}</span>
            </div>
            <div className={s.remoteBtns}>
              <button type="button" className="es-btn es-btn-secondary es-btn-sm" onClick={() => send("preview")} disabled={!cam!.on || !state.upcoming}>Preview zoom</button>
              <button type="button" className="es-btn es-btn-secondary es-btn-sm" onClick={() => send("skip")} disabled={!cam!.on || (!state.upcoming && cam!.mode === "full")}>Skip zoom</button>
              <button type="button" className="es-btn es-btn-secondary es-btn-sm" onClick={() => send("full")} disabled={!cam!.on}>Full view<span className={s.kbd}>0</span></button>
              <button type="button" className="es-btn es-btn-secondary es-btn-sm" aria-pressed={cam!.on} onClick={() => send("camera")}>{cam!.on ? "Camera on" : "Camera off"}<span className={s.kbd}>F</span></button>
              <button type="button" className="es-btn es-btn-secondary es-btn-sm" aria-pressed={cam!.follow} onClick={() => send("follow")} disabled={!cam!.on}>Follow clicks<span className={s.kbd}>Z</span></button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
