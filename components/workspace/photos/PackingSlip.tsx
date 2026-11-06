// Haoyun's packing slip for PO 1042 as it arrives: a printed form taped to the top of a carton,
// with the receiver's count and stamp. A sample document drawn from the scenario's own numbers
// (seed/astro.ts PO, scenario/shipment.ts), so what it says matches what the dock check reads.
import { PO } from "@/seed/astro";
import { formatInt } from "@/engine/money";
import s from "./photos.module.css";

const SHIPPED = 1_800;
const PALLETS = 9;
const BARS = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3];

/** Bar offsets, computed once: each bar starts where the previous bars and gaps end. */
const BAR_X = BARS.map((_, i) => BARS.slice(0, i).reduce((a, w) => a + w * 2.2, 0));

function Barcode({ x, y, h }: { x: number; y: number; h: number }) {
  return <g>{BARS.map((w, i) => (i % 2 === 0 ? <rect key={i} x={x + BAR_X[i]} y={y} width={w * 2.2} height={h} className={s.slipInk} /> : null))}</g>;
}

export function PackingSlip({ label }: { label: string }) {
  const T = (x: number, y: number, t: string, cls = s.slipText, anchor?: "end" | "middle") => <text x={x} y={y} className={cls} textAnchor={anchor}>{t}</text>;
  return (
    <svg viewBox="0 0 960 720" className={s.photo} role="img" aria-label={label}>
      {/* Carton top, its seam and the tape that holds the slip. */}
      <rect width="960" height="720" className={s.kraft} />
      <rect x="0" y="352" width="960" height="16" className={s.kraftSeam} />
      <g transform="rotate(-2.2 480 360)">
        <rect x="150" y="54" width="660" height="620" rx="3" className={s.slipShadow} transform="translate(10 14)" />
        <rect x="150" y="54" width="660" height="620" rx="3" className={s.slipPaper} />
        {/* Letterhead */}
        {T(186, 104, "HAOYUN PRECISION CO., LTD.", s.slipHead)}
        {T(186, 126, "Bao'an District, Shenzhen, Guangdong, China")}
        {T(774, 104, "PACKING SLIP", s.slipTitle, "end")}
        {T(774, 126, `No. HY-PS-${PO.number}-01`, s.slipMono, "end")}
        <line x1="186" y1="144" x2="774" y2="144" className={s.slipRule} />
        {/* Parties and references */}
        {T(186, 172, "SHIP TO", s.slipLabel)}
        {T(186, 194, "Astro Robotics")}
        {T(186, 214, "Receiving, dock door 4")}
        {T(186, 234, "Chicago, IL, USA")}
        {T(500, 172, "PO", s.slipLabel)}{T(600, 172, PO.number, s.slipMono)}
        {T(500, 194, "SHIP VIA", s.slipLabel)}{T(600, 194, "Air, SZX to ORD")}
        {T(500, 216, "AIR WAYBILL", s.slipLabel)}{T(600, 216, "000-10420018", s.slipMono)}
        {T(500, 238, "PACKAGES", s.slipLabel)}{T(600, 238, `${PALLETS} pallets, 1,180 kg`, s.slipMono)}
        {/* Line items */}
        <rect x="186" y="262" width="588" height="30" className={s.slipBand} />
        {T(196, 282, "PART NO.", s.slipLabel)}{T(330, 282, "DESCRIPTION", s.slipLabel)}
        {T(612, 282, "ORDERED", s.slipLabel, "end")}{T(694, 282, "SHIPPED", s.slipLabel, "end")}{T(766, 282, "B/O", s.slipLabel, "end")}
        {T(196, 318, "HY-AM-N17-48", s.slipMono)}
        {T(330, 318, "Actuator motor, NEMA 17")}
        {T(330, 338, "48 V, 6 mm shaft, Molex encoder")}
        {T(612, 318, formatInt(PO.quantity), s.slipMono, "end")}
        {T(694, 318, formatInt(SHIPPED), s.slipMonoBold, "end")}
        {T(766, 318, formatInt(PO.quantity - SHIPPED), s.slipMono, "end")}
        <line x1="186" y1="356" x2="774" y2="356" className={s.slipRule} />
        {T(186, 382, `${PALLETS} pallets of 200 units. Balance of ${formatInt(PO.quantity - SHIPPED)} to follow on a later shipment.`)}
        {/* Barcode and signatures */}
        <Barcode x={186} y={414} h={56} />
        {T(186, 490, `PO${PO.number}-HYPS-01`, s.slipMonoSmall)}
        <line x1="500" y1="470" x2="774" y2="470" className={s.slipRule} />
        {T(500, 490, "Packed by (Haoyun)", s.slipLabel)}
        <path d="M512 462c14-18 22-6 30-14s10-10 18 2 14-4 24-6" className={s.slipPen} />
        <line x1="500" y1="562" x2="774" y2="562" className={s.slipRule} />
        {T(500, 582, "Received by (Astro)", s.slipLabel)}
        <path d="M514 552c8-20 16-20 18-4s6 8 14-6 10 2 16 4 12-10 22-2" className={s.slipPen} />
        {/* The receiver's count, written by hand and ringed */}
        {T(186, 552, "Counted at dock:", s.slipHand)}
        {T(186, 596, formatInt(SHIPPED), s.slipHandBig)}
        <ellipse cx="248" cy="582" rx="78" ry="30" className={s.slipPen} />
        {/* Receiving stamp */}
        <g transform="rotate(-9 660 640)">
          <rect x="560" y="606" width="200" height="64" rx="6" className={s.slipStamp} />
          {T(660, 632, "RECEIVED", s.slipStampText, "middle")}
          {T(660, 656, "DAY 9 · 08:42 · DOOR 4", s.slipStampSmall, "middle")}
        </g>
      </g>
      <rect x="400" y="30" width="160" height="58" className={s.tape} transform="rotate(-4 480 59)" />
    </svg>
  );
}
