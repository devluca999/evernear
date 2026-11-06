// The tracking adapter: shipment events from the carrier and customs, the signals the order
// wallet's two-stage release waits for (policy/astro.json). In the demo the feed is simulated and
// labelled so on screen; the interface is shaped for real carrier and customs data later (a bill of
// lading from the carrier, clearance events from export and import customs).
import type { SignalId } from "../engine/escrow";
import type { Evidence } from "../engine/releaseGate";

export type TrackingEventKind = "booked" | "bill_of_lading" | "export_cleared" | "departed" | "arrived" | "import_cleared";

export interface TrackingEvent {
  id: string;
  po: string;
  kind: TrackingEventKind;
  /** ISO time the event happened. */
  at: string;
  /** Who reported it: a carrier, a customs authority, or "simulated". */
  source: string;
  /** The document or reference behind it (bill of lading number, customs entry). */
  ref?: string;
}

export interface TrackingAdapter {
  /** Every event for the PO so far, oldest first. */
  events(po: string): Promise<TrackingEvent[]>;
}

/** Tracking events that are release signals. The dock count comes from the attested check, not tracking. */
export const SIGNAL_OF: Partial<Record<TrackingEventKind, SignalId>> = {
  bill_of_lading: "bill_of_lading", export_cleared: "export_cleared", import_cleared: "import_cleared",
};

/** The signals a set of events provides. */
export const signalsFrom = (events: TrackingEvent[]): SignalId[] =>
  [...new Set(events.map((e) => SIGNAL_OF[e.kind]).filter((s): s is SignalId => !!s))];

/** The demo's simulated feed for PO 1042: Shenzhen to Chicago by air, as the story plays it. */
export const SIMULATED_EVENTS: Omit<TrackingEvent, "po">[] = [
  { id: "sim-booked", kind: "booked", at: "2026-11-04T09:00:00Z", source: "simulated" },
  { id: "sim-bol", kind: "bill_of_lading", at: "2026-11-05T13:40:00Z", source: "simulated", ref: "AWB 784-SIMULATED" },
  { id: "sim-export", kind: "export_cleared", at: "2026-11-05T20:15:00Z", source: "simulated", ref: "CN export entry, simulated" },
  { id: "sim-departed", kind: "departed", at: "2026-11-05T22:10:00Z", source: "simulated" },
  { id: "sim-arrived", kind: "arrived", at: "2026-11-10T19:30:00Z", source: "simulated" },
  { id: "sim-import", kind: "import_cleared", at: "2026-11-11T06:50:00Z", source: "simulated", ref: "US CBP entry, simulated" },
];

/** A simulated adapter: returns the feed up to `now` (all of it by default). */
export function simulatedTracking(now?: string): TrackingAdapter {
  return {
    async events(po) {
      return SIMULATED_EVENTS.filter((e) => !now || e.at <= now).map((e) => ({ ...e, po }));
    },
  };
}

/** The evidence a release stage is decided on, from tracking events: id, time, source and reference of each signal's latest event. */
export function evidenceFrom(events: TrackingEvent[]): Partial<Record<SignalId, Evidence>> {
  const out: Partial<Record<SignalId, Evidence>> = {};
  for (const e of events) {
    const s = SIGNAL_OF[e.kind];
    if (s) out[s] = { id: e.id, at: e.at, source: e.source, ...(e.ref ? { ref: e.ref } : {}) };
  }
  return out;
}

/** The dock count as release evidence: the attested count of what arrived. `source` says whether it was attested or simulated. */
export const dockEvidence = (po: string, count: number, at: string, source = "simulated"): Evidence => ({ id: `dock-${po}`, at, count, source });
