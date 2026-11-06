// Simulated: the shipment's checkpoints for PO 1042, air freight Shenzhen to Chicago.
// Day 0 is the day funds were locked. Each checkpoint records who acknowledged it and how.
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
  packed: { id: "packed", day: 2, time: "16:20", zone: "Shenzhen", title: "Packed and sealed", place: "Haoyun Precision, Shenzhen", stop: "origin", ackBy: "Haoyun dock team", source: "Supplier photo", detail: "9 pallets, 1,800 units. Packing list says 1,800 of 2,000.", photos: ["pallets_origin"], proofId: "inference_attestation", state: "attention" },
  handover: { id: "handover", day: 4, time: "09:05", zone: "Shenzhen", title: "Handed to forwarder", place: "Shenzhen Bao'an Airport, SZX", stop: "szx", ackBy: "Forwarder cargo desk", source: "Forwarder scan", detail: "Air waybill issued, 9 pieces, 1,180 kg.", photos: ["awb_label"], state: "done" },
  departed: { id: "departed", day: 5, time: "01:40", zone: "Shenzhen", title: "Departed SZX", place: "Shenzhen Bao'an Airport, SZX", stop: "szx", ackBy: "Carrier", source: "Carrier tracking", detail: "Cargo flight to Chicago O'Hare.", photos: [], state: "done" },
  arrived: { id: "arrived", day: 5, time: "04:55", zone: "Chicago", title: "Arrived ORD", place: "Chicago O'Hare, ORD", stop: "ord", ackBy: "Carrier", source: "Carrier tracking", detail: "9 pieces received at the cargo terminal.", photos: [], state: "done" },
  customs: { id: "customs", day: 7, time: "14:30", zone: "Chicago", title: "Cleared customs", place: "Chicago O'Hare, ORD", stop: "ord", ackBy: "US Customs broker", source: "Customs", detail: "Entry released. Duty paid by Astro.", photos: [], state: "done" },
  dock: { id: "dock", day: 9, time: "08:42", zone: "Chicago", title: "Received at dock", place: "Astro Robotics, Chicago", stop: "dock", ackBy: "Astro receiving (Luca)", source: "Dock photo", detail: "1,800 of 2,000 counted. Release $34,200, hold $3,800.", photos: ["packing_slip", "pallets_dock"], proofId: "dock_attestation", state: "attention" },
};

/** Where each photo comes from: drawn stand-ins, or a credited stock photo. Never presented as Astro's own. */
export type PhotoSource = { kind: "synthetic" } | { kind: "stock"; src: string; credit: string; url: string };
export const PHOTO_SOURCE: Record<PhotoId, PhotoSource> = {
  pallets_origin: { kind: "synthetic" },
  awb_label: { kind: "synthetic" },
  packing_slip: { kind: "synthetic" },
  pallets_dock: { kind: "stock", src: "/photos/dock-pallets.jpg", credit: "Pexels", url: "https://www.pexels.com/photo/cartons-near-warehouse-gates-12585837/" },
};
export const photoTag = (id: PhotoId) => (PHOTO_SOURCE[id].kind === "stock" ? "stock photo" : "synthetic photo");

export const PHOTO_CAPTION: Record<PhotoId, string> = {
  pallets_origin: "Pallets at Haoyun before sealing",
  awb_label: "Air waybill label on pallet 1 of 9",
  packing_slip: "Packing slip at the Chicago dock",
  pallets_dock: "Delivery at the Chicago dock",
};

/** Local time where it happened: Shenzhen is UTC+8, Chicago UTC-5 in this season. */
export const stamp = (c: Pick<Checkpoint, "day" | "time" | "zone">) => `Day ${c.day}, ${c.time} ${c.zone} time`;
