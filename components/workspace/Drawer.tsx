import type { Proof } from "@/scenario/types";
import { Chip, Pill } from "./ui";
import s from "./workspace.module.css";

export function Drawer({ proof, open, onToggle, lastProof }: { proof: Proof | null; open: boolean; onToggle: () => void; lastProof: Proof | null }) {
  const p = proof ?? lastProof;
  const shown = open && p;
  return (
    <section className={`${s.drawer} ${shown ? s.drawerOpen : ""}`} aria-label="Developer drawer">
      <button className={s.drawerTab} onClick={onToggle} aria-expanded={!!shown} aria-label={shown ? "Collapse developer drawer" : "Expand developer drawer"}>
        <span>Developer{p ? <span className={s.faint}> · {p.label}</span> : null}</span>
        <svg className={s.chevron} data-open={!!shown} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {p && (
        <div className={s.drawerBody}>
          <div className={s.drawerRow}>
            <span className={s.micro}>CALL</span><code className={s.mono}>{p.call}</code>
            {p.synthetic ? <Pill tone="idle">synthetic</Pill> : p.replay ? <Pill tone="success" led>replay</Pill> : null}
            <Chip>{p.network}</Chip>
          </div>
          <div className={s.drawerRow}><span className={s.micro}>CODE PATH</span><code className={s.mono}>{p.codePath}</code></div>
          <div className={s.drawerRow}><span className={s.micro}>HASH</span><code className={s.mono}>{p.hash}</code>
            {p.explorerUrl ? <a className={s.link} href={p.explorerUrl} target="_blank" rel="noreferrer">Explorer</a> : <span className={s.faint}>No explorer link: synthetic placeholder</span>}
          </div>
          <pre className={s.json}>{JSON.stringify(p.response, null, 2)}</pre>
          <p className={s.drawerLabel}>{p.label}</p>
        </div>
      )}
    </section>
  );
}
