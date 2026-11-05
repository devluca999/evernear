// Placeholder until the Anatomy figure lands (batch 7).
import s from "../workspace.module.css";

export function ExplodedView({ highlight }: { highlight: string }) {
  return (
    <svg className={s.figSvg} viewBox="0 0 200 160" role="img" aria-label={`10MA exploded view, ${highlight} highlighted`}>
      <rect x="70" y="10" width="60" height="34" rx="10" className={s.figPart} />
      <rect x="62" y="56" width="76" height="56" rx="6" className={s.figPart} />
      <rect x="20" y="62" width="30" height="12" rx="3" className={s.figHot} />
      <rect x="150" y="62" width="30" height="12" rx="3" className={s.figHot} />
      <circle cx="80" cy="134" r="14" className={s.figPart} />
      <circle cx="120" cy="134" r="14" className={s.figPart} />
    </svg>
  );
}
