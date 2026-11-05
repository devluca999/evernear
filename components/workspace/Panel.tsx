import type { ReactNode } from "react";
import s from "./workspace.module.css";

export function Panel({ id, title, pulse, children, meta }: { id: string; title: string; pulse: boolean; children: ReactNode; meta?: ReactNode }) {
  return (
    <section className={`${s.panel} ${pulse ? s.pulse : ""}`} data-panel={id} aria-label={title}>
      <header className={s.panelHead}>
        <h2 className={s.panelTitle}>{title}</h2>
        {meta}
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
