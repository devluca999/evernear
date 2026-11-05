// The 10MA exploded view and the actuator motor close-up, drawn with the Anatomy kit
// (vendor/anatomy, MIT) by scripts/build-figures.mjs. Static SVG, no geometry shipped.
import { EXPLODED_10MA_SVG, MOTOR_SVG } from "./generated";
import s from "../workspace.module.css";

export function ExplodedView({ highlight }: { highlight: string }) {
  return (
    <div className={`iso ${s.isoFig}`} data-highlight={highlight === "Actuator motor" ? "motor" : undefined}
      aria-label={`10MA exploded view, ${highlight} highlighted`} role="img"
      dangerouslySetInnerHTML={{ __html: EXPLODED_10MA_SVG }} />
  );
}

export function MotorCloseUp() {
  return <div className={`iso ${s.isoFig} ${s.isoMotor}`} data-highlight="motor" role="img" aria-label="Actuator motor: 6 mm shaft, NEMA 17 flange, 48 V, Molex encoder connector" dangerouslySetInnerHTML={{ __html: MOTOR_SVG }} />;
}
