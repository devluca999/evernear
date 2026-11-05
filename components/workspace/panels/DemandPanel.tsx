import type { WorkspaceState } from "@/scenario/types";
import { demand as seed } from "@/seed/astro";
import { Panel } from "../Panel";
import { Led } from "../Led";
import s from "../workspace.module.css";

export function DemandPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const d = st.demand;
  const need = d.ordered * seed.motorsPerRobot;
  const short = need > d.motorsOnHand;
  const max = Math.max(need, d.motorsOnHand, 1);
  const pts = [d.motorsOnHand, ...[1, 2, 3, 4, 5].map((i) => Math.max(0, d.motorsOnHand - (need * i) / 5))];
  const w = 280, h = 64;
  const poly = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  const reorderY = h - ((seed.motorsPerRobot * 6) / max) * h;
  return (
    <Panel id="demand" title="Demand" pulse={pulse} meta={short ? <span className={s.metaAttention}><Led tone="attention" />Short</span> : null}>
      <p className={s.headline}>{d.ordered > 0 ? d.headline : "Waiting for orders"}</p>
      <dl className={s.stats}>
        <div><dt>ORDERS IN</dt><dd className={s.fig}>{d.ordered}</dd></div>
        <div><dt>SHIPPED OUT</dt><dd className={s.fig}>{d.shippedOut}</dd></div>
        <div><dt>MOTORS ON HAND</dt><dd className={s.fig}>{d.motorsOnHand}</dd></div>
        <div><dt>MOTORS NEEDED</dt><dd className={s.fig}>{need}</dd></div>
      </dl>
      <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Motor stock projection falling toward zero">
        <line x1="0" x2={w} y1={reorderY} y2={reorderY} className={s.sparkRef} />
        <polyline points={poly} className={short ? s.sparkAttention : s.sparkLine} fill="none" />
      </svg>
      <ul className={s.list}>
        {seed.customers.map((c, i) => (
          <li key={c}><Led tone={i < Math.ceil(d.ordered / 5) ? "active" : "idle"} />{c}</li>
        ))}
      </ul>
    </Panel>
  );
}
