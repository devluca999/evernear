import type { WorkspaceState } from "@/scenario/types";
import { MAP } from "../map/generated";
import { cumulative, pointAt, polyline, type Pt } from "../map/route";
import { Panel } from "../Panel";
import s from "../workspace.module.css";

const ROUTE = MAP.route as readonly Pt[];
const CUM = cumulative(ROUTE);
const ROUTE_D = polyline(ROUTE);

const SUPPLIER_CITY: Record<string, keyof typeof MAP.pins> = { kansai: "Osaka", rheinwerk: "Stuttgart", huaxin: "Dongguan", haoyun: "Shenzhen" };
// Where each document sits on the trip, as a share of the route.
const DOC_AT = [0.06, 0.24, 0.42];
const DOC_TONE = { done: s.docDone, working: s.docWorking, problem: s.docProblem };
const LABEL: Partial<Record<keyof typeof MAP.pins, { dx: number; dy: number; anchor?: "end" }>> = {
  Dongguan: { dx: -6, dy: -6, anchor: "end" }, Shenzhen: { dx: 6, dy: 12 }, Chicago: { dx: -6, dy: -7, anchor: "end" },
  "Long Beach": { dx: -6, dy: 13, anchor: "end" },
};

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

export function MapPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const t = st.shipment.progress;
  const shipping = st.escrow !== null;
  const failed = new Set(st.fitment.filter((f) => !f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const passed = new Set(st.fitment.filter((f) => f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const scanned = st.fitment.length > 0 || st.stage === "sourcing";
  const candidates = (scanned ? ["Stuttgart", "Osaka", "Dongguan", "Shenzhen"] : ["Shenzhen"]) as (keyof typeof MAP.pins)[];
  const ship = pointAt(ROUTE, t, CUM);
  const pinCls = (c: keyof typeof MAP.pins) => (failed.has(c) ? s.pinFail : passed.has(c) || shipping ? s.pinOk : s.pin);

  return (
    <Panel id="map" title="Shipment" pulse={pulse}>
      <svg className={s.map} viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img"
        aria-label={shipping ? `Route Shenzhen to Long Beach by sea, then rail to Chicago, ${Math.round(t * 100)} percent of the way` : "Supplier locations and Astro in Chicago"}>
        <rect width={MAP.width} height={MAP.height} className={s.ocean} />
        <path d={MAP.graticule} className={s.grat} />
        <path d={MAP.land} className={s.land} />
        <path d={MAP.borders} className={s.border} />
        {shipping && (
          <>
            <path d={ROUTE_D} className={s.route} fill="none" />
            {t > 0 && <path d={ROUTE_D} className={s.routeDone} fill="none" pathLength={1} strokeDasharray={`${t} 1`} />}
            <Pin name="Long Beach" cls={s.pinWay} />
            {st.shipment.docs.map((d, i) => <Doc key={d.name} at={pointAt(ROUTE, DOC_AT[i] ?? 0.5, CUM)} state={d.state} />)}
          </>
        )}
        {candidates.map((c) => <Pin key={c} name={c} cls={pinCls(c)} />)}
        <Pin name="Chicago" cls={s.pinHome} />
        {shipping && t > 0 && <rect x={ship[0] - 3.5} y={ship[1] - 3.5} width="7" height="7" rx="1.5" className={s.ship} />}
      </svg>
      {st.shipment.docs.length > 0 && (
        <ul className={s.docs}>
          {st.shipment.docs.map((d) => <li key={d.name}><span className={`${s.docIcon} ${DOC_TONE[d.state]}`} aria-hidden />{d.name}</li>)}
          <li className={s.faint}><span className={s.fig}>{MAP.seaKm.toLocaleString("en-US")}</span> km by sea, <span className={s.fig}>{MAP.railKm.toLocaleString("en-US")}</span> km by rail</li>
        </ul>
      )}
    </Panel>
  );
}
