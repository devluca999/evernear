import type { WorkspaceState } from "@/scenario/types";
import { Panel } from "../Panel";
import s from "../workspace.module.css";

// Equirectangular projection, cut from 0 E eastward so Europe sits left, Asia centre and the Pacific runs to Chicago.
// x = degrees east of 0 E (0..360), y = degrees south of 75 N. View box 0..300 x 0..70.
const P = (lon: number, lat: number) => [((lon + 360) % 360) - 0, 75 - lat] as const;
const LABEL_DY: Record<string, number> = { Dongguan: 9, Shenzhen: -4 };
const LABEL_DX: Record<string, number> = { Dongguan: -30, Shenzhen: 4 };

const PLACES = {
  Chicago: P(-87.6, 41.9), Shenzhen: P(114.1, 22.5), Osaka: P(135.5, 34.7),
  Stuttgart: P(9.2, 48.8), Dongguan: P(113.8, 23.0),
};

const DOC_TONE = { done: s.docDone, working: s.docWorking, problem: s.docProblem };

export function MapPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const [sx, sy] = PLACES.Shenzhen, [cx, cy] = PLACES.Chicago;
  const mx = (sx + cx) / 2, my = Math.min(sy, cy) - 14;
  const t = st.shipment.progress;
  const bx = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * cx;
  const by = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * cy;
  const pins = st.fitment.length > 0 || st.stage === "sourcing" ? ["Osaka", "Stuttgart", "Dongguan", "Shenzhen"] : ["Shenzhen"];
  const failed = new Set(st.fitment.filter((f) => !f.pass).map((f) => ({ kansai: "Osaka", rheinwerk: "Stuttgart", huaxin: "Dongguan" } as Record<string, string>)[f.supplierId]));
  return (
    <Panel id="map" title="Shipment" pulse={pulse}>
      <svg className={s.map} viewBox="-10 0 300 70" role="img" aria-label="Route from Shenzhen to Chicago">
        {[15, 30, 45, 60].map((y) => <line key={y} x1="-10" x2="290" y1={y} y2={y} className={s.grat} />)}
        {[30, 60, 90, 120, 150, 180, 210, 240, 270].map((x) => <line key={x} y1="0" y2="70" x1={x} x2={x} className={s.grat} />)}
        <path d={`M${sx},${sy} Q${mx},${my} ${cx},${cy}`} className={s.route} fill="none" />
        {t > 0 && <path d={`M${sx},${sy} Q${mx},${my} ${cx},${cy}`} className={s.routeDone} fill="none" pathLength={1} strokeDasharray={`${t} 1`} />}
        {pins.map((p) => {
          const [x, y] = PLACES[p as keyof typeof PLACES];
          return <g key={p}><circle cx={x} cy={y} r="1.6" className={failed.has(p) ? s.pinFail : p === "Shenzhen" ? s.pinOk : s.pin} /><text x={x + (LABEL_DX[p] ?? 4)} y={y + (LABEL_DY[p] ?? -4)} className={s.pinLabel}>{p}</text></g>;
        })}
        <circle cx={cx} cy={cy} r="1.6" className={s.pinHome} /><text x={cx - 18} y={cy - 4} className={s.pinLabel}>Chicago</text>
        {t > 0 && <rect x={bx - 2} y={by - 2} width="4" height="4" rx="1" className={s.ship} />}
      </svg>
      {st.shipment.docs.length > 0 && (
        <ul className={s.docs}>
          {st.shipment.docs.map((d) => <li key={d.name}><span className={`${s.docIcon} ${DOC_TONE[d.state]}`} aria-hidden />{d.name}</li>)}
        </ul>
      )}
    </Panel>
  );
}
