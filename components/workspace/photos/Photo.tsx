// The photos along the route: credited stock photos (labelled "stock photo") and the shipment's
// documents drawn from the scenario's own numbers (labelled "sample document"). Neither is
// presented as Astro's or Haoyun's own photo. Sources: scenario/shipment.ts PHOTO_SOURCE.
import { PHOTO_SOURCE, type PhotoId } from "@/scenario/shipment";
import { PackingSlip } from "./PackingSlip";
import { AwbLabel } from "./AwbLabel";
import s from "./photos.module.css";

const DOCUMENTS: Partial<Record<PhotoId, (p: { label: string }) => React.ReactNode>> = { packing_slip: PackingSlip, awb_label: AwbLabel };

export function Photo({ id, label }: { id: PhotoId; label: string }) {
  const src = PHOTO_SOURCE[id];
  if (src.kind === "stock") {
    // eslint-disable-next-line @next/next/no-img-element -- a static file in public/, no optimisation needed
    return <img src={src.src} alt={label} className={`${s.photo} ${s.stock}`} loading="lazy" decoding="async" />;
  }
  const Doc = DOCUMENTS[id]!;
  return <Doc label={label} />;
}
