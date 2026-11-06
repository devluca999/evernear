"use client";
import { useEffect, useRef } from "react";
import { CHECKPOINTS, PHOTO_CAPTION, PHOTO_SOURCE, photoTag, stamp } from "@/scenario/shipment";
import { Photo } from "./photos/Photo";
import { Pill } from "./ui";
import s from "./workspace.module.css";

export function PhotoViewer({ checkpointId, index, onIndex, onClose, onProof }: {
  checkpointId: string; index: number; onIndex: (i: number) => void; onClose: () => void; onProof: (id: string) => void;
}) {
  const c = CHECKPOINTS[checkpointId];
  const close = useRef<HTMLButtonElement>(null);
  const n = c.photos.length;
  const id = c.photos[Math.min(index, n - 1)];

  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowRight" && n > 1) { e.stopPropagation(); onIndex((index + 1) % n); }
      if (e.key === "ArrowLeft" && n > 1) { e.stopPropagation(); onIndex((index + n - 1) % n); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, n, onClose, onIndex]);

  return (
    <div className={s.viewerScrim} onClick={onClose}>
      <div className={s.viewer} role="dialog" aria-modal="true" aria-label={`${c.title}: ${PHOTO_CAPTION[id]}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.viewerPhoto}>
          <Photo id={id} label={PHOTO_CAPTION[id]} />
          <span className={s.viewerTag}><Pill tone="idle">{photoTag(id)}</Pill></span>
        </div>
        <aside className={s.viewerSide}>
          <span className={s.micro}>{c.source.toUpperCase()}</span>
          <h3 className={s.viewerTitle}>{c.title}</h3>
          <p className={s.sub}>{PHOTO_CAPTION[id]}</p>
          {(() => { const src = PHOTO_SOURCE[id]; return src.kind === "stock" ? <p className={s.faint}>Stock photo from <a className={s.link} href={src.url} target="_blank" rel="noreferrer">{src.credit}</a>, not the actual shipment.</p> : null; })()}
          <dl className={s.viewerMeta}>
            <div><dt>ACKNOWLEDGED</dt><dd className={s.fig}>{stamp(c)}</dd></div>
            <div><dt>BY</dt><dd>{c.ackBy}</dd></div>
            <div><dt>PLACE</dt><dd>{c.place}</dd></div>
            <div><dt>NOTE</dt><dd>{c.detail}</dd></div>
          </dl>
          <div className={s.viewerActions}>
            {n > 1 && <button className={s.btnQuiet} onClick={() => onIndex((index + n - 1) % n)} aria-label="Previous photo">Previous</button>}
            {n > 1 && <span className={`${s.fig} ${s.faint}`}>{index + 1} of {n}</span>}
            {n > 1 && <button className={s.btnQuiet} onClick={() => onIndex((index + 1) % n)} aria-label="Next photo">Next</button>}
          </div>
          <div className={s.viewerActions}>
            {c.proofId && <button className={s.btnQuiet} onClick={() => onProof(c.proofId!)}>Open proof</button>}
            <button ref={close} className={s.btn} onClick={onClose}>Close</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
