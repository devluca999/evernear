"use client";
import { useState } from "react";
import type { Checkpoint } from "@/scenario/shipment";
import { PHOTO_CAPTION, stamp } from "@/scenario/shipment";
import { useActions } from "./actions";
import { Led } from "./Led";
import { Photo } from "./photos/Photo";
import s from "./workspace.module.css";

/** Checkpoints along the route: the latest one shown, the earlier ones one click away. Each with who acknowledged it and its evidence. */
export function Tracking({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const { openPhoto } = useActions();
  const [all, setAll] = useState(false);
  if (checkpoints.length === 0) return null;
  const earlier = checkpoints.length - 1;
  const last = checkpoints[checkpoints.length - 1];
  return (
    <section className={s.tracking} aria-label="Tracking">
      <header className={s.trackHead}>
        <span className={s.micro}>TRACKING · PO 1042</span>
        <span className={s.trackLast}>Last acknowledged <span className={s.fig}>{stamp(last)}</span> by {last.ackBy}</span>
      </header>
      <ol className={s.trackList}>
        {[...checkpoints].reverse().slice(0, all ? undefined : 1).map((c, i) => (
          <li key={c.id} className={s.trackItem} data-latest={i === 0}>
            <Led tone={c.state === "attention" ? "attention" : "success"} />
            <div className={s.trackMain}>
              <div className={s.trackRow}>
                <span className={s.trackTitle}>{c.title}</span>
                <span className={`${s.fig} ${s.trackTime}`}>{stamp(c)}</span>
              </div>
              <p className={s.trackMeta}>{c.place} · {c.ackBy} · {c.source}</p>
              <p className={s.trackDetail}>{c.detail}</p>
              {c.photos.length > 0 && (
                <div className={s.thumbs}>
                  {c.photos.map((p, n) => (
                    <button key={p} className={s.thumb} onClick={() => openPhoto(c.id, n)} aria-label={`Open photo: ${PHOTO_CAPTION[p]}`}>
                      <Photo id={p} label={PHOTO_CAPTION[p]} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {earlier > 0 && (
        <button type="button" className={s.pinClear} aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? "Show only the latest" : `Show ${earlier} earlier ${earlier === 1 ? "checkpoint" : "checkpoints"}`}
        </button>
      )}
    </section>
  );
}
