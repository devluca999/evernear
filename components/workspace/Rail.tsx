import { RAIL, STAGES, type Stage } from "@/scenario/stages";
import { Led, type Tone } from "./Led";
import p from "./premium.module.css";

type StepState = "done" | "active" | "stalled" | "waiting";
const TONE: Record<StepState, Tone> = { done: "success", active: "active", stalled: "attention", waiting: "idle" };

/** The journey as a row of LED dots. Dots are the navigation; arrows step scene by scene. */
export function Rail({ stage, stalled, onJump, onPrev, onNext }: {
  stage: Stage; stalled: boolean; onJump?: (s: Stage) => void; onPrev?: () => void; onNext?: () => void;
}) {
  const cur = STAGES.indexOf(stage);
  const stateOf = (s: Stage): StepState => {
    const i = STAGES.indexOf(s);
    if (stage === "closed" || i < cur) return "done";
    if (i === cur) return stalled ? "stalled" : "active";
    return "waiting";
  };
  return (
    <nav className={p.journey} aria-label="Restock progress">
      <button className={p.journeyArrow} onClick={onPrev} aria-label="Previous scene">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ol className={p.steps}>
        {RAIL.map((step) => {
          const st = stateOf(step.stage);
          return (
            <li key={step.stage} className={p.step} data-state={st}>
              <button className={p.stepBtn} onClick={() => onJump?.(step.stage)} aria-current={st === "active" || st === "stalled" ? "step" : undefined} aria-label={`${step.label}: ${st}`}>
                <span className={p.stepDot}><Led tone={TONE[st]} /></span>
                <span className={p.stepLabel}>{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button className={p.journeyArrow} onClick={onNext} aria-label="Next scene">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </nav>
  );
}
