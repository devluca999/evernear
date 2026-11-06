// Simulated: the shipment's checkpoints for PO 1042, air freight Shenzhen to Chicago.
// Day 0 is the day funds were locked. Each checkpoint records who acknowledged it and how.
import { PO } from "../seed/astro";
import { formatInt, formatUsdShort } from "../engine/money";
import { RELEASE_RULES } from "../engine/escrow";

const unit = PO.revisedUnitCents;
const advance = (PO.quantity * unit * RELEASE_RULES.advancePercent) / 100;
const balance = PO.receivedQty * unit - advance;
const held = (PO.quantity - PO.receivedQty) * unit;
export type PhotoId = "pallets_origin" | "awb_label" | "packing_slip" | "pallets_dock";
export type Stop = "origin" | "szx" | "ord" | "dock";

export interface Checkpoint {
  id: string;
  day: number;
  time: string;
  zone: "Shenzhen" | "Chicago";
  title: string;
  place: string;
  stop: Stop;
  ackBy: string;
  source: "Supplier photo" | "Forwarder scan" | "Carrier tracking" | "Customs" | "Dock photo";
  detail: string;
  photos: PhotoId[];
  proofId?: string;
  state: "done" | "attention";
}

export const CHECKPOINTS: Record<string, Checkpoint> = {
  packed: { id: "packed", day: 2, time: "16:20", zone: "Shenzhen", title: "Packed and sealed", place: "Haoyun Precision, Shenzhen", stop: "origin", ackBy: "Haoyun dock team", source: "Supplier photo", detail: `5 cartons, ${formatInt(PO.receivedQty)} units. Packing list says ${formatInt(PO.receivedQty)} of ${formatInt(PO.quantity)}.`, photos: ["pallets_origin"], proofId: "inference_attestation", state: "attention" },
  handover: { id: "handover", day: 4, time: "09:05", zone: "Shenzhen", title: "Handed to forwarder", place: "Shenzhen Bao'an Airport, SZX", stop: "szx", ackBy: "Forwarder cargo desk", source: "Forwarder scan", detail: "Air waybill issued, 5 pieces, 1,180 kg.", photos: ["awb_label"], state: "done" },
  departed: { id: "departed", day: 5, time: "01:40", zone: "Shenzhen", title: "Departed SZX", place: "Shenzhen Bao'an Airport, SZX", stop: "szx", ackBy: "Carrier", source: "Carrier tracking", detail: "Cargo flight to Chicago O'Hare.", photos: [], state: "done" },
  arrived: { id: "arrived", day: 5, time: "04:55", zone: "Chicago", title: "Arrived ORD", place: "Chicago O'Hare, ORD", stop: "ord", ackBy: "Carrier", source: "Carrier tracking", detail: "5 pieces received at the cargo terminal.", photos: [], state: "done" },
  customs: { id: "customs", day: 7, time: "14:30", zone: "Chicago", title: "Cleared customs", place: "Chicago O'Hare, ORD", stop: "ord", ackBy: "US Customs broker", source: "Customs", detail: "Entry released. Duty paid by Astro.", photos: [], state: "done" },
  dock: { id: "dock", day: 9, time: "08:42", zone: "Chicago", title: "Received at dock", place: "Astro Robotics, Chicago", stop: "dock", ackBy: "Astro receiving (Luca)", source: "Dock photo", detail: `${formatInt(PO.receivedQty)} of ${formatInt(PO.quantity)} counted. Balance ${formatUsdShort(balance)} after the ${formatUsdShort(advance)} advance, hold ${formatUsdShort(held)}.`, photos: ["packing_slip", "pallets_dock"], proofId: "dock_attestation", state: "attention" },
};

/** Where each photo comes from: a credited stock photo, or a document drawn from the scenario. Never presented as Astro's own. */
export type PhotoSource = { kind: "document" } | { kind: "stock"; src: string; credit: string; url: string };
export const PHOTO_SOURCE: Record<PhotoId, PhotoSource> = {
  pallets_origin: { kind: "stock", src: "/photos/origin-pallets.jpg", credit: "Pexels", url: "https://www.pexels.com/photo/photo-of-warehouse-4481326/" },
  awb_label: { kind: "document" },
  packing_slip: { kind: "document" },
  pallets_dock: { kind: "stock", src: "/photos/dock-pallets.jpg", credit: "Pexels", url: "https://www.pexels.com/photo/cartons-near-warehouse-gates-12585837/" },
};
export const photoTag = (id: PhotoId) => (PHOTO_SOURCE[id].kind === "stock" ? "stock photo" : "sample document");

export const PHOTO_CAPTION: Record<PhotoId, string> = {
  pallets_origin: "Packed pallets at Haoyun, Shenzhen",
  awb_label: "Air waybill label on pallet 1 of 9",
  packing_slip: "Packing slip at the Chicago dock",
  pallets_dock: "Delivery at the Chicago dock",
};

/** Local time where it happened: Shenzhen is UTC+8, Chicago UTC-5 in this season. */
export const stamp = (c: Pick<Checkpoint, "day" | "time" | "zone">) => `Day ${c.day}, ${c.time} ${c.zone} time`;
