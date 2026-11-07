// Stock: how many robots the motors on hand cover, the on-hand line against the reorder point,
// and the build plan's parts. After the dock count the line jumps with the motors that arrived.
import type { WorkspaceState } from "@/scenario/types";
import { buildPlan, demand, MOTOR_PART, motorHistory, partStock } from "@/seed/astro";
import { formatInt } from "@/engine/money";
import { Dot, N, Panel } from "../Panel";
import s from "../shell.module.css";

const mono = { fontFamily: "var(--font-mono)" } as const;

/** The on-hand line from 14 Sep to 2 Nov, ending on today's count. */
function ShortChart({ onHand }: { onHand: number }) {
  const u = [...motorHistory.units.slice(0, -1), onHand];
  const top = Math.max(...u), x0 = 40, x1 = 490, y0 = 180, y1 = 38;
  const y = (v: number) => y0 - (v / top) * (y0 - y1);
  const pts = u.map((v, i) => `${x0 + (i * (x1 - x0)) / (u.length - 1)},${y(v).toFixed(1)}`).join(" ");
  const ry = y(motorHistory.reorderPoint);
  return (
    <div className={s.chartBox}>
      <div className={s.chartHead}><span>AM-17 actuator motor, on hand</span><N className={`${s.push} ${s.faint}`}>{motorHistory.from} to {motorHistory.to}</N></div>
      <svg viewBox="0 0 520 196" className={s.chart} role="img" aria-label={`Actuator motors on hand fell from ${top} to ${onHand}, below the reorder point of ${motorHistory.reorderPoint}`}>
        <line x1={x0} y1={y0} x2="510" y2={y0} stroke="var(--line-strong)" />
        <line x1={x0} y1={y1} x2="510" y2={y1} stroke="var(--line-hairline)" />
        <line x1={x0} y1={ry} x2="510" y2={ry} stroke="var(--text-muted)" strokeDasharray="4 4" />
        <text x="34" y={y1 + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)" style={mono}>{top}</text>
        <text x="34" y={ry + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)" style={mono}>{motorHistory.reorderPoint}</text>
        <text x="34" y={y0 + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)" style={mono}>0</text>
        <text x="46" y={ry - 7} fontSize="11" fill="var(--text-muted)">Reorder point</text>
        <polyline points={pts} fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={`${x1},${y(onHand).toFixed(1)} 512,${y0}`} fill="none" stroke="var(--state-attention)" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx={x1} cy={y(onHand)} r="5" fill="var(--state-attention)" stroke="var(--bg-page)" strokeWidth="2" />
        <text x={x1 - 10} y={y(onHand) - 13} textAnchor="end" fontSize="12" fill="var(--text-primary)" style={mono}>{onHand}</text>
      </svg>
    </div>
  );
}

/** After the delivery: flat near the reorder point, then the jump. */
function RestockChart({ before, after }: { before: number; after: number }) {
  const top = Math.ceil(after / 1000) * 1000, y0 = 196, y1 = 20;
  const y = (v: number) => y0 - (v / top) * (y0 - y1);
  const flat = [motorHistory.units[motorHistory.units.length - 3], motorHistory.units[motorHistory.units.length - 2], before, before, before];
  const pts = flat.map((v, i) => `${40 + i * 120},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 660 220" className={s.chart} role="img" aria-label={`Actuator motors on hand rose from ${before} to ${formatInt(after)} on 11 Nov`}>
      <line x1="40" y1={y0} x2="650" y2={y0} stroke="var(--line-strong)" />
      <line x1="40" y1={y1} x2="650" y2={y1} stroke="var(--line-hairline)" />
      <line x1="40" y1={y(motorHistory.reorderPoint)} x2="650" y2={y(motorHistory.reorderPoint)} stroke="var(--text-muted)" strokeDasharray="4 4" />
      <text x="34" y={y1 + 4} textAnchor="end" fontSize="12" fill="var(--text-faint)" style={mono}>{formatInt(top)}</text>
      <text x="34" y={y(motorHistory.reorderPoint) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)" style={mono}>{motorHistory.reorderPoint}</text>
      <text x="46" y={y(motorHistory.reorderPoint) - 7} fontSize="12" fill="var(--text-muted)">Reorder point</text>
      <polyline points={pts} fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinejoin="round" />
      <polyline points={`520,${y(before).toFixed(1)} 596,${y(before).toFixed(1)} 610,${y(after).toFixed(1)}`} fill="none" stroke="var(--state-success)" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="610" cy={y(after)} r="5.5" fill="var(--state-success)" stroke="var(--bg-raised)" strokeWidth="2" />
      <text x="598" y={y(after) - 3} textAnchor="end" fontSize="13" fill="var(--text-primary)" style={mono}>{formatInt(after)}</text>
      <text x="40" y="214" fontSize="11" fill="var(--text-faint)" style={mono}>5 Oct</text>
      <text x="520" y="214" textAnchor="middle" fontSize="11" fill="var(--text-faint)" style={mono}>{motorHistory.to}</text>
      <text x="612" y="214" textAnchor="middle" fontSize="11" fill="var(--text-faint)" style={mono}>11 Nov</text>
    </svg>
  );
}

export function StockPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const base = st.demand.motorsOnHand;
  const onHand = base + (st.dock?.receivedQty ?? 0);
  const ordered = st.demand.ordered || demand.robotsOrdered;
  const motorsFor = Math.floor(onHand / demand.motorsPerRobot);
  const needed = ordered * demand.motorsPerRobot;
  const short = onHand < needed;
  const stockOf = (part: string) => (part === MOTOR_PART ? onHand : partStock[part] ?? 0);

  if (st.dock) {
    return (
      <Panel id="stock" title="Stock" pulse={pulse}>
        <div className={s.pad} style={{ padding: "14px 16px", gap: 8 }}>
          <div className={s.headRow} style={{ gap: 10 }}>
            <Dot tone={short ? "attention" : "success"} />
            <p className={s.big} style={{ fontSize: 22 }}>Motors for <N>{formatInt(Math.min(motorsFor, ordered))}</N> of <N>{formatInt(ordered)}</N> robots</p>
            <N className={`${s.push} ${s.muted}`}>{formatInt(onHand)} AM-17 on hand</N>
          </div>
          {short && <p className={s.sub} style={{ fontSize: 13 }}><N>{formatInt(needed - onHand)}</N> robots wait for the replacement motors.</p>}
          <RestockChart before={base} after={onHand} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel id="stock" title="Stock" pulse={pulse}>
      <div className={s.pad} style={{ padding: 18, gap: 14 }}>
        <div className={s.headRow}>
          <Dot tone={short ? "attention" : "success"} />
          <span className={short ? s.attnInk : s.successInk} style={{ fontSize: 12 }}>{short ? "Short" : "Covered"}</span>
          <span className={s.note} style={{ fontSize: 12 }}>10MA build plan</span>
        </div>
        {/* The camera frames the headline and the chart together. */}
        <div className={s.lines} data-focus="stock.shortfall" style={{ gap: 14 }}>
          <div className={s.lines} style={{ gap: 6 }}>
            <p className={s.big} style={{ fontSize: 34, lineHeight: 1.08 }}><N>{formatInt(ordered)}</N> robots ordered, motors for <N>{formatInt(motorsFor)}</N></p>
            <p className={s.sub}>Each 10MA takes {demand.motorsPerRobot === 1 ? "one actuator motor" : `${demand.motorsPerRobot} actuator motors`}. <N>{formatInt(onHand)}</N> on hand, <N>{formatInt(needed)}</N> needed.</p>
          </div>
          <ShortChart onHand={onHand} />
        </div>
        <div className={s.rows} role="table" aria-label="10MA build plan parts">
          <div className={s.row} role="row" style={{ gridTemplateColumns: "18px 1fr 62px 56px", minHeight: 24 }}>
            <span /><span className="es-micro" role="columnheader">Part</span><span className="es-micro" role="columnheader" style={{ textAlign: "right" }}>On hand</span><span className="es-micro" role="columnheader" style={{ textAlign: "right" }}>Needed</span>
          </div>
          {buildPlan.map((l) => {
            const have = stockOf(l.part), need = ordered * l.perRobot, lack = have < need;
            return (
              <div key={l.code} className={s.row} role="row" style={{ gridTemplateColumns: "18px 1fr 62px 56px", ...(lack ? { background: "var(--state-attention-tint)", margin: "0 -8px", padding: "0 8px", borderRadius: 6 } : {}) }}>
                <Dot tone={lack ? "attention" : "success"} />
                <span>{l.part} <N className={s.muted}>{l.code}</N></span>
                <N className={s.rowEnd} >{formatInt(have)}</N>
                <N className={s.rowEnd}>{formatInt(need)}</N>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
