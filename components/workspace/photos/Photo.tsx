// The photos along the route: drawn stand-ins (labelled synthetic) or a credited stock photo
// (labelled stock photo). Neither is presented as Astro's own photo.
import { PHOTO_SOURCE, type PhotoId } from "@/scenario/shipment";
import s from "./photos.module.css";

function Pallet({ x, y, w = 70, rows = 3 }: { x: number; y: number; w?: number; rows?: number }) {
  const bh = 16;
  return (
    <g>
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <rect x={x} y={y - (r + 1) * bh} width={w / 2} height={bh} className={s.box} />
          <rect x={x + w / 2} y={y - (r + 1) * bh} width={w / 2} height={bh} className={s.box} />
        </g>
      ))}
      <rect x={x - 3} y={y} width={w + 6} height={7} className={s.pallet} />
      <rect x={x + 4} y={y + 7} width={8} height={4} className={s.pallet} />
      <rect x={x + w / 2 - 4} y={y + 7} width={8} height={4} className={s.pallet} />
      <rect x={x + w - 12} y={y + 7} width={8} height={4} className={s.pallet} />
      <rect x={x + w / 2 - 12} y={y - rows * bh + 6} width={24} height={14} className={s.tag} />
    </g>
  );
}

function Barcode({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const bars = [2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2];
  let cx = x;
  const out = [];
  for (let i = 0; i < bars.length && cx < x + w; i++) {
    if (i % 2 === 0) out.push(<rect key={i} x={cx} y={y} width={bars[i]} height={h} className={s.ink} />);
    cx += bars[i] * 1.6;
  }
  return <g>{out}</g>;
}

const SCENES: Record<PhotoId, () => React.ReactNode> = {
  pallets_origin: () => (
    <>
      <rect width="320" height="240" className={s.wall} />
      <rect y="150" width="320" height="90" className={s.floor} />
      <line x1="0" y1="150" x2="320" y2="150" className={s.edge} />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <Pallet key={`${r}${c}`} x={22 + c * 98 - r * 8} y={176 + r * 22} w={64} rows={2} />))}
      <text x="16" y="24" className={s.stencil}>HAOYUN PRECISION · BAY 3</text>
    </>
  ),
  awb_label: () => (
    <>
      <rect width="320" height="240" className={s.box} />
      <rect x="40" y="26" width="240" height="190" rx="3" className={s.paper} />
      <text x="54" y="50" className={s.labelHead}>AIR WAYBILL</text>
      <text x="54" y="68" className={s.mono}>AWB EVN 4417 2086</text>
      <line x1="54" y1="78" x2="266" y2="78" className={s.rule} />
      <text x="54" y="104" className={s.big}>SZX</text>
      <text x="152" y="104" className={s.big}>to</text>
      <text x="196" y="104" className={s.big}>ORD</text>
      <text x="54" y="128" className={s.mono}>PCS 1 / 9    1,180 KG TOTAL</text>
      <text x="54" y="144" className={s.mono}>REF PO 1042</text>
      <Barcode x={54} y={160} w={212} h={40} />
    </>
  ),
  packing_slip: () => (
    <>
      <rect width="320" height="240" className={s.floor} />
      <g transform="rotate(-3 160 120)">
        <rect x="48" y="16" width="224" height="212" rx="2" className={s.paper} />
        <text x="62" y="40" className={s.labelHead}>PACKING SLIP</text>
        <text x="62" y="56" className={s.mono}>Haoyun Precision, Shenzhen</text>
        <line x1="62" y1="66" x2="258" y2="66" className={s.rule} />
        <text x="62" y="88" className={s.mono}>PO: 1042</text>
        <text x="62" y="106" className={s.mono}>Item: Actuator motor, NEMA 17</text>
        <text x="62" y="124" className={s.mono}>Ordered: 2,000</text>
        <text x="62" y="152" className={s.qty}>Quantity shipped: 1,800</text>
        <rect x="56" y="134" width="196" height="26" rx="3" className={s.mark} />
        <text x="62" y="182" className={s.mono}>Pallets: 9</text>
        {[196, 206].map((y) => <line key={y} x1="62" y1={y} x2={y === 196 ? 230 : 180} y2={y} className={s.rule} />)}
      </g>
    </>
  ),
  pallets_dock: () => (
    <>
      <rect width="320" height="240" className={s.wall} />
      <rect x="70" y="18" width="180" height="120" className={s.door} />
      {[38, 58, 78, 98, 118].map((y) => <line key={y} x1="70" y1={y} x2="250" y2={y} className={s.rule} />)}
      <text x="160" y="14" textAnchor="middle" className={s.stencil}>DOOR 4</text>
      <rect y="150" width="320" height="90" className={s.floor} />
      <line x1="0" y1="150" x2="320" y2="150" className={s.edge} />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <Pallet key={`${r}${c}`} x={22 + c * 98 - r * 8} y={176 + r * 22} w={64} rows={2} />))}
    </>
  ),
};

export function Photo({ id, label }: { id: PhotoId; label: string }) {
  const src = PHOTO_SOURCE[id];
  if (src.kind === "stock") {
    // eslint-disable-next-line @next/next/no-img-element -- a static file in public/, no optimisation needed
    return <img src={src.src} alt={label} className={`${s.photo} ${s.stock}`} loading="lazy" decoding="async" />;
  }
  return (
    <svg viewBox="0 0 320 240" className={s.photo} role="img" aria-label={label}>
      {SCENES[id]()}
    </svg>
  );
}
