"use client";
import { useState } from "react";
import type { Checkpoint } from "@/scenario/shipment";
import { PHOTO_CAPTION, stamp } from "@/scenario/shipment";
import { useActions } from "./actions";
import { Dot, N } from "./Panel";
import { Photo } from "./photos/Photo";
import w from "./workspace.module.css";
import s from "./shell.module.css";

/** Checkpoints along the route: the latest one shown, the earlier ones one click away. Each with who acknowledged it and its evidence. */
export function Tracking({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const { openPhoto } = useActions();
  const [all, setAll] = useState(false);
  if (checkpoints.length === 0) return null;
  const earlier = checkpoints.length - 1;
  const last = checkpoints[checkpoints.length - 1];
  return (
    <section className={s.well} aria-label="Tracking" style={{ alignSelf: "start", gap: 8 }}>
      <header className={s.headRow}>
        <Dot tone={last.state === "attention" ? "attention" : "active"} pulse={last.state !== "attention"} />
        <span className="es-micro">Latest checkpoint</span>
        <N className={`${s.push} ${s.faint}`}><span style={{ fontSize: 10.5 }}>AWB 784 2210 1042</span></N>
      </header>
      <ol className={s.lines} style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }}>
        {[...checkpoints].reverse().slice(0, all ? undefined : 1).map((c) => (
          <li key={c.id} className={s.field} style={{ gap: 4 }}>
            <span className={s.headRow} style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</span>
              <N className={`${s.push} ${s.faint}`}><span style={{ fontSize: 11 }}>{stamp(c)}</span></N>
            </span>
            <span className={s.note} style={{ fontSize: 12 }}>{c.place} · {c.ackBy} · {c.source}</span>
            <p className={s.sub} style={{ fontSize: 12.5 }}>{c.detail}</p>
            {c.photos.length > 0 && (
              <div className={w.thumbs}>
                {c.photos.map((p, n) => (
                  <button key={p} className={w.thumb} onClick={() => openPhoto(c.id, n)} aria-label={`Open photo: ${PHOTO_CAPTION[p]}`}>
                    <Photo id={p} label={PHOTO_CAPTION[p]} />
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <span className={s.note}>Last acknowledged <N>{stamp(last)}</N> by {last.ackBy}</span>
      {earlier > 0 && (
        <button type="button" className={s.linkBtn} aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? "Show only the latest" : `Show ${earlier} earlier ${earlier === 1 ? "checkpoint" : "checkpoints"}`}
        </button>
      )}
    </section>
  );
}
