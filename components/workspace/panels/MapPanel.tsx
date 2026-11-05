"use client";
import { useState } from "react";
import type { WorkspaceState } from "@/scenario/types";
import { suppliers, offers, MOTOR_PART } from "@/seed/astro";
import { eta, isoDay, LANES } from "@/scenario/eta";
import { formatUsd } from "@/engine/money";
import { MAP } from "../map/generated";
import { cumulative, pointAt, polyline, type Pt } from "../map/route";
import { Panel } from "../Panel";
import { Led } from "../Led";
import { Tracking } from "../Tracking";
import s from "../workspace.module.css";

const ROUTE = MAP.route as readonly Pt[];
const CUM = cumulative(ROUTE);
const ROUTE_D = polyline(ROUTE);

const SUPPLIER_CITY: Record<string, keyof typeof MAP.pins> = { kansai: "Osaka", rheinwerk: "Stuttgart", huaxin: "Dongguan", haoyun: "Shenzhen", ultra: "Rockford" };
// Where each supplier's icon sits next to its headquarters dot (Shenzhen and Dongguan are neighbours).
const MARK_AT: Record<string, [number, number]> = { haoyun: [6, 4], huaxin: [-26, -18], kansai: [6, -16], rheinwerk: [6, -16], ultra: [-28, -18] };
type Lanes = Record<string, { place: string; segments: readonly (readonly Pt[])[]; km: number }>;
const LANE_GEO = MAP.lanes as unknown as Lanes;
// Where each document sits on the trip, as a share of the route.
const DOC_AT = [0.06, 0.24, 0.42];
const DOC_TONE = { done: s.docDone, working: s.docWorking, problem: s.docProblem };
const LABEL: Partial<Record<keyof typeof MAP.pins, { dx: number; dy: number; anchor?: "end" }>> = {
  Dongguan: { dx: -6, dy: -6, anchor: "end" }, Shenzhen: { dx: 6, dy: 12 }, Chicago: { dx: -6, dy: 14, anchor: "end" },
};
const TOTAL = CUM[CUM.length - 1];
const STOP_AT = Object.fromEntries(Object.entries(MAP.stops).map(([k, i]) => [k, CUM[i] / TOTAL])) as Record<keyof typeof MAP.stops, number>;

/** A small cargo plane pointing along the route. */
function Plane({ t }: { t: number }) {
  const [x, y] = pointAt(ROUTE, t, CUM);
  const [x2, y2] = pointAt(ROUTE, Math.min(1, t + 0.01), CUM);
  const [x0, y0] = pointAt(ROUTE, Math.max(0, t - 0.01), CUM);
  const deg = (Math.atan2(y2 - y0, x2 - x0) * 180) / Math.PI;
  return <path transform={`translate(${x} ${y}) rotate(${deg})`} d="M8 0 L2 1.2 L-2 6 L-4 6 L-1 1.2 L-5 1.2 L-7 3.2 L-8 3.2 L-6.5 0 L-8 -3.2 L-7 -3.2 L-5 -1.2 L-1 -1.2 L-4 -6 L-2 -6 L2 -1.2 Z" className={s.ship} />;
}

function Pin({ name, cls }: { name: keyof typeof MAP.pins; cls: string }) {
  const [x, y] = MAP.pins[name];
  const l = LABEL[name] ?? { dx: 6, dy: -6 };
  return (
    <g>
      <circle cx={x} cy={y} r="3.2" className={cls} />
      <text x={x + l.dx} y={y + l.dy} textAnchor={l.anchor ?? "start"} className={s.pinLabel}>{name}</text>
    </g>
  );
}

/** A small document glyph with a folded corner, coloured by its state. */
function Doc({ at, state }: { at: Pt; state: "done" | "working" | "problem" }) {
  const [x, y] = at;
  return <path transform={`translate(${x - 4.5} ${y - 16})`} d="M0 0h6l3 3v9H0z" className={`${s.docGlyph} ${DOC_TONE[state]}`} />;
}

/** A supplier's headquarters: a dot and its icon (a two-letter mark), coloured by fitment state. */
function Hq({ id, cls, selected, onPick }: { id: string; cls: string; selected: boolean; onPick: (id: string) => void }) {
  const [x, y] = MAP.pins[SUPPLIER_CITY[id]];
  const [dx, dy] = MARK_AT[id];
  const sup = suppliers.find((v) => v.id === id)!;
  return (
    <g className={s.hq} data-selected={selected} role="button" tabIndex={0} aria-label={`${sup.name}, ${sup.city}`} aria-pressed={selected}
      onClick={() => onPick(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(id); } }}>
      {(dx < 0 || dy < -10) && <line x1={x} y1={y} x2={x + dx + 10} y2={y + dy + 12} className={s.hqLeader} />}
      <circle cx={x} cy={y} r="3.2" className={cls} />
      <rect x={x + dx} y={y + dy} width="20" height="13" rx="3" className={s.hqBadge} />
      <text x={x + dx + 10} y={y + dy + 9.5} textAnchor="middle" className={s.hqMark}>{LANES[id].mark}</text>
    </g>
  );
}

const lanePath = (id: string) => LANE_GEO[id].segments.map((seg) => polyline(seg)).join(" ");

export function MapPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const [today] = useState(() => isoDay(Date.now()));
  const [shipDay, setShipDay] = useState<string | undefined>(undefined);
  const plan = pick ? eta(pick, today, shipDay) : null;
  const offer = pick ? offers.find((o) => o.supplierId === pick && o.part === MOTOR_PART) : undefined;
  const choose = (id: string) => { setPick((cur) => (cur === id ? null : id)); setShipDay(undefined); };
  const t = st.shipment.progress;
  const shipping = st.escrow !== null;
  const failed = new Set(st.fitment.filter((f) => !f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const passed = new Set(st.fitment.filter((f) => f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const pinCls = (c: keyof typeof MAP.pins) => (failed.has(c) ? s.pinFail : passed.has(c) || (shipping && c === "Shenzhen") ? s.pinOk : s.pin);

  return (
    <Panel id="map" title="Suppliers" pulse={pulse}>
      <svg className={s.map} viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img"
        aria-label={shipping ? `Air freight from Shenzhen to Chicago O'Hare, ${Math.round(t * 100)} percent of the way` : "Supplier locations and Astro in Chicago"}>
        <rect width={MAP.width} height={MAP.height} className={s.ocean} />
        <path d={MAP.graticule} className={s.grat} />
        <path d={MAP.land} className={s.land} />
        <path d={MAP.borders} className={s.border} />
        {shipping && (
          <>
            <path d={ROUTE_D} className={s.route} fill="none" />
            {t > 0 && <path d={ROUTE_D} className={s.routeDone} fill="none" pathLength={1} strokeDasharray={`${t} 1`} />}
            {(["szx", "ord"] as const).map((k) => { const [x, y] = pointAt(ROUTE, STOP_AT[k], CUM); return <circle key={k} cx={x} cy={y} r="2.4" className={s.pinWay} />; })}
            {st.shipment.docs.map((d, i) => <Doc key={d.name} at={pointAt(ROUTE, DOC_AT[i] ?? 0.5, CUM)} state={d.state} />)}
          </>
        )}
        {pick && <path d={lanePath(pick)} className={s.lane} fill="none" />}
        {suppliers.map((v) => <Hq key={v.id} id={v.id} cls={pinCls(SUPPLIER_CITY[v.id])} selected={pick === v.id} onPick={choose} />)}
        <Pin name="Chicago" cls={s.pinHome} />
        {shipping && t > 0 && t < 1 && <Plane t={t} />}
      </svg>
      <div className={s.plan} role="group" aria-label="Plan an order">
        <span className={s.micro}>PLAN AN ORDER · {MOTOR_PART.toUpperCase()}</span>
        <div className={s.planChips}>
          {suppliers.map((v) => (
            <button key={v.id} type="button" className={s.planChip} aria-pressed={pick === v.id} onClick={() => choose(v.id)}>
              <span className={s.planMark}>{LANES[v.id].mark}</span>{v.name}
            </button>
          ))}
        </div>
        {plan && pick && (
          <div className={s.planResult}>
            <label className={s.planDate}>Ships
              <input type="date" value={plan.ship} min={eta(pick, today).ship} onChange={(e) => setShipDay(e.target.value || undefined)} aria-label="Ship date" />
            </label>
            <p className={s.planEta} aria-live="polite">
              Arrives Chicago <span className={s.fig}>{plan.arrive}</span>, <span className={s.fig}>{plan.totalDays}</span> days from today
              ({plan.mode === "air" ? "air" : "road"}, <span className={s.fig}>{LANE_GEO[pick].km.toLocaleString("en-US")}</span> km, <span className={s.fig}>{plan.transitDays}</span> days in transit).
              {offer && <> Quoted <span className={s.fig}>{formatUsd(offer.unitCents)}</span> each.</>}
              {plan.movedUp && <> Earliest it can ship is <span className={s.fig}>{plan.ship}</span>.</>}
            </p>
            <p className={s.faint}>Sample lead and transit times, not a quote.</p>
          </div>
        )}
      </div>
      {st.shipment.docs.length > 0 && (
        <ul className={s.docs}>
          {st.shipment.docs.map((d) => <li key={d.name}><Led tone={d.state === "done" ? "success" : d.state === "working" ? "attention" : "alert"} />{d.name}</li>)}
          <li className={s.faint}><span className={s.fig}>{MAP.airKm.toLocaleString("en-US")}</span> km by air, SZX to ORD</li>
        </ul>
      )}
      <Tracking checkpoints={st.shipment.checkpoints} />
    </Panel>
  );
}
