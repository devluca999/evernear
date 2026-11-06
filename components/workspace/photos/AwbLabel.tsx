// The forwarder's air waybill label on pallet 1 of 9, as scanned at the SZX cargo desk. A sample
// document drawn from the scenario's own numbers (scenario/shipment.ts handover checkpoint).
import { PO } from "@/seed/astro";
import s from "./photos.module.css";

const BARS = [2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1];
const BAR_X = BARS.map((_, i) => BARS.slice(0, i).reduce((a, w) => a + w * 3, 0));

export function AwbLabel({ label }: { label: string }) {
  const T = (x: number, y: number, t: string, cls = s.slipText, anchor?: "end" | "middle") => <text x={x} y={y} className={cls} textAnchor={anchor}>{t}</text>;
  return (
    <svg viewBox="0 0 960 720" className={s.photo} role="img" aria-label={label}>
      {/* Stretch film over cartons on the pallet, the label stuck on top. */}
      <rect width="960" height="720" className={s.kraft} />
      {[120, 300, 480, 660].map((x) => <rect key={x} x={x} y="0" width="8" height="720" className={s.kraftSeam} />)}
      <rect width="960" height="720" className={s.film} />
      <g transform="rotate(1.6 480 360)">
        <rect x="190" y="70" width="580" height="580" rx="4" className={s.slipShadow} transform="translate(8 12)" />
        <rect x="190" y="70" width="580" height="580" rx="4" className={s.slipPaper} />
        <rect x="190" y="70" width="580" height="92" rx="4" className={s.slipInkBand} />
        {T(214, 112, "AIR WAYBILL", s.labelInverseTitle)}
        {T(214, 144, "000-10420018", s.labelInverseMono)}
        {T(746, 112, "PIECE", s.labelInverseSmall, "end")}
        {T(746, 146, "1 / 9", s.labelInverseMono, "end")}
        {T(214, 210, "ORIGIN", s.slipLabel)}{T(490, 210, "DESTINATION", s.slipLabel)}
        {T(214, 290, "SZX", s.labelHuge)}{T(490, 290, "ORD", s.labelHuge)}
        {T(214, 318, "Shenzhen Bao'an")}{T(490, 318, "Chicago O'Hare")}
        <line x1="214" y1="342" x2="746" y2="342" className={s.slipRule} />
        {T(214, 372, "SHIPPER", s.slipLabel)}{T(214, 396, "Haoyun Precision Co., Ltd.")}
        {T(490, 372, "CONSIGNEE", s.slipLabel)}{T(490, 396, "Astro Robotics, Chicago")}
        {T(214, 436, "TOTAL PIECES", s.slipLabel)}{T(214, 462, "9", s.slipMonoBold)}
        {T(380, 436, "GROSS WEIGHT", s.slipLabel)}{T(380, 462, "1,180 kg", s.slipMonoBold)}
        {T(560, 436, "REFERENCE", s.slipLabel)}{T(560, 462, `PO ${PO.number}`, s.slipMonoBold)}
        <g>{BARS.map((w, i) => (i % 2 === 0 ? <rect key={i} x={214 + BAR_X[i]} y={494} width={w * 3} height={96} className={s.slipInk} /> : null))}</g>
        {T(214, 618, "00010420018001", s.slipMonoSmall)}
        {T(746, 618, "Handled with care", s.slipMonoSmall, "end")}
      </g>
    </svg>
  );
}
