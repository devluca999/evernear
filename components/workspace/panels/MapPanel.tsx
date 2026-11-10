"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LocateFixed, Maximize2, Minimize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import { clampView, fullView, panBy, zoomAt, zoomOf, type View } from "../map/view";
import type { WorkspaceState } from "@/scenario/types";
import { bomFor, suppliers, offers, MOTOR_PART } from "@/seed/astro";
import { matchKind, matchReason, pinReason, searchSummary } from "../format";
import { eta, isoDay, LANES } from "@/scenario/eta";
import { formatUsd } from "@/engine/money";
import { MAP } from "../map/generated";
import { cumulative, pointAt, polyline, type Pt } from "../map/route";
import { Dot, N, Panel } from "../Panel";
import sh from "../shell.module.css";
import { Tracking } from "../Tracking";
import { estimateLabel, labelWhy, pinAt, pinFrac, placeLabels, SUPPLIER_CITY, type Box } from "../map/labels";
import s from "../workspace.module.css";

const ROUTE = MAP.route as readonly Pt[];
const CUM = cumulative(ROUTE);
const ROUTE_D = polyline(ROUTE);

// Where each supplier's icon sits next to its headquarters dot (Shenzhen and Dongguan are neighbours).
const MARK_AT: Record<string, [number, number]> = { haoyun: [6, 4], huaxin: [-26, -18], kansai: [6, -4], quickship: [-26, -20], rheinwerk: [6, -16], ultra: [-28, -18] };
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
/** Keeps a marker the same size on screen at any zoom. */
const steady = (x: number, y: number, k: number) => `translate(${x} ${y}) scale(${1 / k}) translate(${-x} ${-y})`;

function Plane({ t, k }: { t: number; k: number }) {
  const [x, y] = pointAt(ROUTE, t, CUM);
  const [x2, y2] = pointAt(ROUTE, Math.min(1, t + 0.01), CUM);
  const [x0, y0] = pointAt(ROUTE, Math.max(0, t - 0.01), CUM);
  const deg = (Math.atan2(y2 - y0, x2 - x0) * 180) / Math.PI;
  return <path transform={`translate(${x} ${y}) scale(${1 / k}) rotate(${deg})`} d="M8 0 L2 1.2 L-2 6 L-4 6 L-1 1.2 L-5 1.2 L-7 3.2 L-8 3.2 L-6.5 0 L-8 -3.2 L-7 -3.2 L-5 -1.2 L-1 -1.2 L-4 -6 L-2 -6 L2 -1.2 Z" className={s.ship} />;
}

const DISPLAY: Partial<Record<keyof typeof MAP.pins, string>> = { Chicago: "Astro Robotics HQ, Chicago" };

function Pin({ name, cls, k = 1 }: { name: keyof typeof MAP.pins; cls: string; k?: number }) {
  const [x, y] = MAP.pins[name];
  const l = LABEL[name] ?? { dx: 6, dy: -6 };
  return (
    <g transform={steady(x, y, k)}>
      <circle cx={x} cy={y} r="3.2" className={cls} />
      <text x={x + l.dx} y={y + l.dy} textAnchor={l.anchor ?? "start"} className={s.pinLabel}>{DISPLAY[name] ?? name}</text>
    </g>
  );
}

/** A small document glyph with a folded corner, coloured by its state. */
function Doc({ at, state, k }: { at: Pt; state: "done" | "working" | "problem"; k: number }) {
  const [x, y] = at;
  return <path transform={`translate(${x} ${y}) scale(${1 / k}) translate(-4.5 -16)`} d="M0 0h6l3 3v9H0z" className={`${s.docGlyph} ${DOC_TONE[state]}`} />;
}

/** A supplier's headquarters: a dot and its icon (a two-letter mark), coloured by fitment state. */
function Hq({ id, cls, selected, onPick, k, bare = false }: { id: string; cls: string; selected: boolean; onPick: (id: string) => void; k: number; bare?: boolean }) {
  const [x, y] = pinAt(id, bare);
  const [dx, dy] = MARK_AT[id];
  const sup = suppliers.find((v) => v.id === id)!;
  return (
    <g transform={steady(x, y, k)} className={s.hq} data-selected={selected} role="button" tabIndex={0} aria-label={`${sup.name}, ${sup.city}`} aria-pressed={selected}
      onClick={() => onPick(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(id); } }}>
      {!bare && (dx < 0 || dy < -10) && <line x1={x} y1={y} x2={x + dx + 10} y2={y + dy + 12} className={s.hqLeader} />}
      <circle cx={x} cy={y} r="3.2" className={cls} />
      {/* In the search the supplier's label names it; elsewhere a two-letter mark does. */}
      {!bare && <rect x={x + dx} y={y + dy} width="20" height="13" rx="3" className={s.hqBadge} />}
      {!bare && <text x={x + dx + 10} y={y + dy + 9.5} textAnchor="middle" className={s.hqMark}>{LANES[id].mark}</text>}
    </g>
  );
}

/** The fine map (scripts/build-map.mjs, public/map/world-detail.json), fetched once after first paint. */
type Detail = { land: string; borders: string };
let detailCache: Promise<Detail | null> | null = null;
const loadDetail = () => (detailCache ??= fetch("/map/world-detail.json")
  .then((r) => (r.ok ? (r.json() as Promise<Detail>) : null))
  .catch(() => null)
  .then((d) => { if (!d) detailCache = null; return d; })); // only a successful load is kept; a failure retries next time

/** The search Stockbot types, a character at a time (all at once with reduced motion). */
function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { queueMicrotask(() => setN(text.length)); return; }
    queueMicrotask(() => setN(0));
    const id = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(id); return x; } return x + 1; }), 1400 / Math.max(1, text.length));
    return () => clearInterval(id);
  }, [text]);
  return <><span aria-hidden="true">{text.slice(0, n)}</span><span className="sr-only">{text}</span></>;
}

const MATCH_ORDER = ["haoyun", "quickship", "kansai", "rheinwerk", "huaxin"];

const lanePath = (id: string) => LANE_GEO[id].segments.map((seg) => polyline(seg)).join(" ");


/** Where each supplier's label sits beside its pin, in screen pixels, and which corner it hangs from. */
const LABEL_AT: Record<string, { dx: number; dy: number; x: "left" | "right"; y: "top" | "middle" | "bottom" }> = {
  haoyun: { dx: 16, dy: 16, x: "left", y: "top" },
  huaxin: { dx: -16, dy: 16, x: "right", y: "top" },
  quickship: { dx: -16, dy: -14, x: "right", y: "bottom" },
  kansai: { dx: 18, dy: -4, x: "left", y: "middle" },
  rheinwerk: { dx: 16, dy: 12, x: "left", y: "top" },
};


/**
 * A checked supplier's label on the map: its name and one line of why, in its state colour. `pos` is
 * where map/labels.ts placed it (px in the map box); before the box is measured it hangs from a fixed
 * corner of its pin.
 */
function PinLabel({ f, view, pos, measure, mapW = Infinity }: { f: WorkspaceState["fitment"][number]; view: View; pos?: { x: number; y: number }; measure?: (el: HTMLDivElement | null) => void; mapW?: number }) {
  const sup = suppliers.find((v) => v.id === f.supplierId)!;
  const at = LABEL_AT[f.supplierId];
  const why = pinReason(f, bomFor["10ma"].length);
  const full = matchReason(f, bomFor["10ma"].length);
  const [fx, fy] = pinFrac(f.supplierId, view);
  const left = fx * 100, top = fy * 100;
  if (left < 0 || left > 100 || top < 0 || top > 100) return null;
  const tx = at.x === "right" ? "-100%" : "0", ty = at.y === "bottom" ? "-100%" : at.y === "middle" ? "-50%" : "0";
  return (
    <div ref={measure} className={sh.pinTag} data-tone={why.tone} data-tag={why.tag} data-label={f.supplierId} title={full} aria-label={`${sup.name}: ${full}`}
      data-focus={why.tag === "late" ? "map.results.partial" : undefined}
      style={pos ? { left: pos.x, top: pos.y } : { left: `${left}%`, top: `${top}%`, transform: `translate(${at.dx}px, ${at.dy}px) translate(${tx}, ${ty})` }}>
      <span className={sh.pinTagName}><Dot tone={why.tone} />{sup.name}</span>
      <span className={sh.pinTagWhy}>{labelWhy(why.text, f.pass, mapW)}</span>
    </div>
  );
}

export function MapPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { let on = true; void loadDetail().then((d) => { if (on && d) setDetail(d); }); return () => { on = false; }; }, []);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setExpanded(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);
  const [today] = useState(() => isoDay(Date.now()));
  const [shipDay, setShipDay] = useState<string | undefined>(undefined);
  const plan = pick ? eta(pick, today, shipDay) : null;
  const offer = pick ? offers.find((o) => o.supplierId === pick && o.part === MOTOR_PART) : undefined;
  const choose = (id: string) => { if (moved.current) return; setPlanOpen(true); setPick((cur) => (cur === id ? null : id)); setShipDay(undefined); };
  // Drag to pan; Ctrl or pinch and the wheel to zoom; buttons to zoom and reset.
  const W = MAP.width, H = MAP.height;
  const [view, setView] = useState<View>(() => fullView(W, H));
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const k = zoomOf(view, W);
  const zoom = k;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain scrolling still scrolls the page
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => zoomAt(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, W, H));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, H]);
  const t = st.shipment.progress;
  const shipping = st.escrow !== null;
  const failed = new Set(st.fitment.filter((f) => !f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const passed = new Set(st.fitment.filter((f) => f.pass).map((f) => SUPPLIER_CITY[f.supplierId]));
  const partial = new Set(st.fitment.filter((f) => matchKind(f) === "partial").map((f) => SUPPLIER_CITY[f.supplierId]));
  const pinCls = (c: keyof typeof MAP.pins) => (partial.has(c) ? s.pinPartial : failed.has(c) ? s.pinFail : passed.has(c) || (shipping && c === "Shenzhen") ? s.pinOk : s.pin);
  const searching = !!st.search && !shipping;
  const matches = MATCH_ORDER.map((id) => st.fitment.find((f) => f.supplierId === id)).filter((f) => f !== undefined);
  const checked = new Set(st.fitment.map((f) => f.supplierId));
  const done = searching && matches.length === MATCH_ORDER.length;
  // In the story's search a supplier's pin appears when Stockbot has checked it, none before. A map
  // you pin in another chapter shows them all.
  const pinShown = (id: string) => shipping || checked.has(id) || !st.layout.includes("map");

  // The search's labels: placed so none overlaps another, a pin, the search bar or Astro's HQ name,
  // the suppliers that fit first. Sizes are measured once drawn (estimated before that).
  const boxRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number; top: Box | null } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const t = topRef.current;
      const top = t ? { x: t.offsetLeft - el.offsetLeft, y: t.offsetTop - el.offsetTop, w: t.offsetWidth, h: t.offsetHeight } : null;
      setBox((b) => (b && b.w === el.offsetWidth && b.h === el.offsetHeight && JSON.stringify(b.top) === JSON.stringify(top) ? b : { w: el.offsetWidth, h: el.offsetHeight, top }));
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (topRef.current) ro.observe(topRef.current);
    read();
    return () => ro.disconnect();
  }, [searching, expanded]);
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const measure = (id: string) => (el: HTMLDivElement | null) => {
    if (!el || !el.offsetWidth) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (sizes[id]?.w !== w || sizes[id]?.h !== h) queueMicrotask(() => setSizes((x) => (x[id]?.w === w && x[id]?.h === h ? x : { ...x, [id]: { w, h } })));
  };
  const placed = (() => {
    if (!searching || !box || !box.w) return null;
    const labels = matches.map((f) => {
      const sup = suppliers.find((v) => v.id === f.supplierId)!;
      const [fx, fy] = pinFrac(f.supplierId, view);
      const size = sizes[f.supplierId] ?? estimateLabel(sup.name, labelWhy(pinReason(f, bomFor["10ma"].length).text, f.pass, box.w));
      return { id: f.supplierId, px: fx * box.w, py: fy * box.h, ...size, first: f.pass };
    });
    const [hx, hy] = (() => { const [x, y] = MAP.pins.Chicago; return [((x - view.x) / view.w) * box.w, ((y - view.y) / view.h) * box.h]; })();
    // Astro's HQ name is drawn to the left of its pin.
    const avoid: Box[] = [{ x: hx - 340, y: hy - 22, w: 350, h: 40 }, ...(box.top ? [box.top] : [])];
    return Object.fromEntries(placeLabels(labels, { x: 0, y: 0, w: box.w, h: box.h }, avoid).map((p) => [p.id, p]));
  })();

  return (
    <Panel id="map" title="Map" pulse={pulse} meta={shipping ? <>Shipment <N>1042</N></> : "Suppliers"}>
      <div className={s.mapPanel} data-search={searching}>
      {(() => {
        const map = (
          <>
      {expanded && <div className={s.mapScrim} onClick={() => setExpanded(false)} aria-hidden="true" />}
          <div className={s.mapWrap} data-expanded={expanded} role={expanded ? "dialog" : undefined} aria-label={expanded ? "Suppliers map, expanded" : undefined} data-focus={searching ? "map.results" : undefined}>
          {searching && (
            <div ref={topRef} className={sh.mapTop} data-focus="map.search">
              <div className={sh.mapSearch} role="search" aria-label="Supplier search">
                <Search size={14} strokeWidth={2} aria-hidden="true" />
                <span className="es-num"><Typed text={st.search!} /></span>
                {!done && <span className={sh.caret} aria-hidden="true" />}
              </div>
              <div className={sh.mapStatus} role="status" data-done={done}>
                {done
                  ? <><Dot tone="success" />{searchSummary(matches)}</>
                  : <><Dot tone="active" pulse />Comparing suppliers: <N>{matches.length}</N> of <N>{MATCH_ORDER.length}</N></>}
              </div>
            </div>
          )}
          <div ref={boxRef} className={s.mapBox}>
          <svg ref={svgRef} className={s.map} data-dragging={dragging} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img"
            onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; moved.current = false; }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !svgRef.current) return;
              const dx = e.clientX - d.x, dy = e.clientY - d.y;
              if (!moved.current && Math.hypot(dx, dy) < 4) return;
              if (!moved.current) { moved.current = true; setDragging(true); svgRef.current.setPointerCapture(e.pointerId); }
              drag.current = { x: e.clientX, y: e.clientY };
              setView((v) => panBy(v, dx, dy, svgRef.current!.getBoundingClientRect().width, W, H));
            }}
            onPointerUp={() => { drag.current = null; setDragging(false); setTimeout(() => { moved.current = false; }, 0); }}
            onPointerCancel={() => { drag.current = null; moved.current = false; setDragging(false); }}
            aria-label={shipping ? `Air freight from Shenzhen to Chicago O'Hare, ${Math.round(t * 100)} percent of the way` : "Supplier locations and Astro in Chicago"}>
            <rect width={MAP.width} height={MAP.height} className={s.ocean} />
            <path d={MAP.graticule} className={s.grat} />
            <path d={detail?.land ?? MAP.land} className={s.land} />
            <path d={detail?.borders ?? MAP.borders} className={s.border} />
            {shipping && (
              <>
                <path d={ROUTE_D} className={s.route} fill="none" />
                {t > 0 && <path d={ROUTE_D} className={s.routeDone} fill="none" pathLength={1} strokeDasharray={`${t} 1`} />}
                {(["szx", "ord"] as const).map((k) => { const [x, y] = pointAt(ROUTE, STOP_AT[k], CUM); return <circle key={k} cx={x} cy={y} r={2.4 / zoom} className={s.pinWay} />; })}
                {st.shipment.docs.map((d, i) => <Doc key={d.name} at={pointAt(ROUTE, DOC_AT[i] ?? 0.5, CUM)} state={d.state} k={zoom} />)}
              </>
            )}
            {pick && <path d={lanePath(pick)} className={s.lane} fill="none" />}
            {suppliers.filter((v) => pinShown(v.id)).map((v) => <Hq key={v.id} id={v.id} cls={pinCls(SUPPLIER_CITY[v.id])} selected={pick === v.id} onPick={choose} k={k} bare={searching} />)}
            <Pin name="Chicago" cls={s.pinHome} k={k} />
            {shipping && t > 0 && t < 1 && <Plane t={t} k={zoom} />}
          </svg>
          {searching && matches.map((f) => <PinLabel key={f.supplierId} f={f} view={view} pos={placed?.[f.supplierId]} measure={measure(f.supplierId)} mapW={box?.w} />)}
          </div>
            <div className={s.mapControls} role="group" aria-label="Map zoom">
              <button type="button" className={s.mapBtn} aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, 1.5, 0.5, 0.5, W, H))}><ZoomIn size={14} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={s.mapBtn} aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, 1 / 1.5, 0.5, 0.5, W, H))}><ZoomOut size={14} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={s.mapBtn} aria-label="Show the whole map" onClick={() => setView(clampView(fullView(W, H), W, H))}><LocateFixed size={14} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={s.mapBtn} aria-label={expanded ? "Shrink the map" : "Expand the map"} onClick={(e) => { setPortalRoot(e.currentTarget.closest<HTMLElement>("[data-theme]")); setExpanded((x) => !x); }}>
                {expanded ? <Minimize2 size={14} strokeWidth={2} aria-hidden="true" /> : <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
            </div>
          </div>
              </>
        );
        // Expanded, the map renders at the top of the page so no card can sit above it.
        // The workspace root carries the theme, so the map stays themed there.
        return expanded && portalRoot ? createPortal(map, portalRoot) : map;
      })()}
      {!planOpen && !shipping && !searching && (
        <div className={sh.mapFoot}>
          <span className={sh.note} style={{ fontSize: 12 }}><N>{suppliers.length}</N> suppliers in <N>{new Set(suppliers.map((v) => v.country)).size}</N> countries{st.fitment.length ? <> · <N>{st.fitment.filter((f) => f.pass).length}</N> fits</> : null}</span>
          <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${sh.push}`} onClick={() => setPlanOpen(true)}>Plan an order</button>
        </div>
      )}
      {planOpen && (
      <div className={s.plan} role="group" aria-label="Plan an order">
        <div className={s.planHead}>
          <span className={s.micro}>PLAN AN ORDER · {MOTOR_PART.toUpperCase()}</span>
          <button type="button" className={s.pinClear} onClick={() => { setPlanOpen(false); setPick(null); }}>Close</button>
        </div>
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
      )}
      {shipping && (
        <div className={sh.mapShip}>
          <div className={sh.lines}>
            <span className="es-micro">Documents</span>
            <div className={sh.rows}>
              {st.shipment.docs.map((d) => (
                <div key={d.name} className={sh.row} style={{ minHeight: 30 }}>
                  <Dot tone={d.state === "done" ? "success" : d.state === "working" ? "attention" : "alert"} /><span>{d.name}</span>
                  <span className={`${sh.rowEnd} ${d.state === "working" ? sh.attnInk : ""}`}>{d.state === "done" ? (d.name === "Commercial invoice" ? <N>{formatUsd(st.escrow!.lockedCents)}</N> : "Matches PO") : d.state === "working" ? "Not yet sent" : "Problem"}</span>
                </div>
              ))}
            </div>
            <span className={sh.note} style={{ fontSize: 12.5, paddingTop: 6 }}><N>{MAP.airKm.toLocaleString("en-US")} km</N> by air, <N>SZX</N> to <N>ORD</N></span>
            {!planOpen && <button type="button" className="es-btn es-btn-secondary es-btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => setPlanOpen(true)}>Plan an order</button>}
          </div>
          <Tracking checkpoints={st.shipment.checkpoints} />
        </div>
      )}
      </div>
    </Panel>
  );
}
