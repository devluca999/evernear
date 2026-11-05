import { RAIL, railState, type Stage } from "@/scenario/stages";
import s from "./workspace.module.css";

export function Rail({ stage, stalled }: { stage: Stage; stalled: boolean }) {
  return (
    <ol className={s.rail} aria-label="Restock progress">
      {RAIL.map((step) => {
        const st = railState(stage, step.stage);
        const tone = st === "done" ? "done" : st === "active" ? (stalled ? "stalled" : "active") : "waiting";
        return (
          <li key={step.stage} className={`${s.railStep} ${s[`rail_${tone}`]}`} data-state={tone}>
            <span className={s.railBar} />
            <span className={s.railLabel}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
