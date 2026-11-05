// The demo script: scenes from docs/BUILD.md section 4 as timed beats.
// Amounts are not written here: the runner computes them through the engine.
import type { Beat, Event, Message, PanelId } from "./types";
import type { Stage } from "./stages";
import { suppliers } from "../seed/astro";

interface Scene { id: number; title: string; durationMs: number; layout: PanelId[]; beats: [number, Event][] }

let n = 0;
const msg = (m: Omit<Message, "id">): Event => ({ type: "message", message: { id: `m${++n}`, ...m } });
const bot = (text: string, refersTo?: PanelId, card?: Message["card"]): Event => msg({ channel: "telegram", direction: "out", from: "Stockbot", text, refersTo, card });
const buyer = (text: string, photo?: string): Event => msg({ channel: "telegram", direction: "in", from: "Luca", text, photo });
const stage = (to: Stage): Event => ({ type: "stage", to });
const routine = (to: Stage): Event => ({ type: "routine", to });
const proof = (key: string): Event => ({ type: "proof", key });

const haoyunMail = "sales@haoyun-precision.example";

export const scenes: Scene[] = [
  { id: 0, title: "Onboarding", durationMs: 8000, layout: ["rules"], beats: [
    [800, { type: "wallet" }],
    [1200, proof("wallet_created")],
    [4500, proof("policy_set")],
  ] },
  { id: 1, title: "Bottleneck", durationMs: 9000, layout: ["demand", "inbox"], beats: [
    [500, { type: "demand", ordered: 5, shippedOut: 1, motorsOnHand: 24 }],
    [1800, { type: "demand", ordered: 10, shippedOut: 2, motorsOnHand: 24 }],
    [3000, { type: "demand", ordered: 14, shippedOut: 3, motorsOnHand: 24 }],
    [4500, msg({ channel: "email", direction: "in", from: "orders@ultra-motion.example", subject: "Re: Actuator motor availability", text: "Our actuator motor line is down for retooling. Earliest restart is 6 weeks out.", reading: "Usual supplier unavailable for 6 weeks." })],
    [6000, bot("Ultra Motion is out for 6 weeks. 14 robots ordered, motors for 6. Start sourcing?", "demand")],
    [7500, buyer("Yes")],
  ] },
  { id: 2, title: "Routine reorder", durationMs: 8000, layout: ["demand", "rules"], beats: [
    [400, routine("sourcing")],
    [1300, routine("approval")],
    [2200, routine("confirmed")],
    [3100, routine("funds_locked")],
    [4000, routine("shipped")],
    [4900, routine("dock")],
    [5800, routine("paid")],
    [5900, proof("payment_receipt")],
    [6800, routine("closed")],
  ] },
  { id: 3, title: "Sourcing and fitment", durationMs: 12000, layout: ["bom", "map"], beats: [
    [300, stage("sourcing")],
    [1000, proof("inference_attestation")],
    [4200, { type: "fitment", supplierId: "kansai" }],
    [5600, { type: "fitment", supplierId: "rheinwerk" }],
    [7000, { type: "fitment", supplierId: "huaxin" }],
    [8400, { type: "fitment", supplierId: "haoyun" }],
    [9600, bot("Haoyun Precision in Shenzhen fits every spec and passes policy. 3 others failed.", "bom")],
  ] },
  { id: 4, title: "Approval", durationMs: 10000, layout: ["rules"], beats: [
    [300, stage("approval")],
    [800, { type: "phone", open: true }],
    [1200, bot("PO 1042: 2,000 motors from Haoyun, a new supplier, over the $10K cap. 2 approvals needed.", "rules", "approval")],
    [3000, { type: "approval", by: "Luca" }],
    [3100, proof("approval_luca")],
    [6000, bot("Jordy, please sign PO 1042.", "rules")],
    [7500, { type: "approval", by: "Jordy" }],
    [7600, proof("approval_jordy")],
  ] },
  { id: 5, title: "Negotiation", durationMs: 15000, layout: ["inbox", "rules"], beats: [
    [300, stage("confirmed")],
    [600, msg({ channel: "email", direction: "in", from: haoyunMail, subject: "PO 1042 confirmation", text: "We confirm PO 1042 for 2,000 units. Due to copper costs the unit price is now USD 20.02.", reading: "Price change: +8%, over the 3% limit." })],
    [700, { type: "price_quote", unitCents: 2002, from: "Haoyun Precision" }],
    [2000, bot("Haoyun quoted 8% over the PO. Accept?", "inbox")],
    [3800, buyer("Up to 3%")],
    [5200, { type: "refused", kind: "offlist_email", detail: "deals@unknown-broker.example is not on the recipient allowlist" }],
    [5300, proof("refused_email")],
    [8500, msg({ channel: "email", direction: "out", from: "Evernear for Astro", to: haoyunMail, subject: "Re: PO 1042 confirmation", text: "We can accept a change of up to 2.5%, USD 19.00 per unit, for 2,000 units." })],
    [8600, proof("connector_receipt")],
    [11500, msg({ channel: "email", direction: "in", from: haoyunMail, subject: "Re: PO 1042 confirmation", text: "Revised: we confirm PO 1042 at USD 19.00 per unit.", reading: "Confirmed at +2.5%, inside the limit." })],
    [11600, { type: "price_quote", unitCents: 1900, from: "Haoyun Precision" }],
    [12800, { type: "phone", open: false }],
  ] },
  { id: 6, title: "Funds locked", durationMs: 10000, layout: ["map", "rules"], beats: [
    [400, { type: "lock_funds" }],
    [500, stage("funds_locked")],
    [600, proof("escrow_wallet")],
    [2600, { type: "shipment", progress: 0, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
    [2700, { type: "checkpoint", id: "packed" }],
    [4000, stage("shipped")],
    [4200, { type: "checkpoint", id: "handover" }],
    [5400, { type: "checkpoint", id: "departed" }],
    [5500, { type: "shipment", progress: 0.2, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
    [7500, { type: "shipment", progress: 0.7, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
  ] },
  { id: 7, title: "Dock", durationMs: 12000, layout: ["bom", "map"], beats: [
    [200, { type: "shipment", progress: 0.98, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
    [300, { type: "checkpoint", id: "arrived" }],
    [400, { type: "checkpoint", id: "customs" }],
    [500, stage("dock")],
    [600, { type: "shipment", progress: 1, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "done" }] }],
    [900, { type: "phone", open: true }],
    [1500, buyer("Packing slip", "packing_slip")],
    [1600, { type: "checkpoint", id: "dock" }],
    [4000, { type: "dock", receivedQty: 1800 }],
    [4100, proof("dock_attestation")],
    [7500, bot("1,800 of 2,000 arrived. Releasing $34,200 to Haoyun, holding $3,800.", "bom")],
    [10500, { type: "phone", open: false }],
  ] },
  { id: 8, title: "Paid", durationMs: 12000, layout: ["rules", "map"], beats: [
    [500, { type: "release", to: "0x000000000000000000000000000000000000dead" }],
    [600, proof("refused_release")],
    [4000, { type: "release", to: suppliers.find((s) => s.id === "haoyun")!.receiveAddress }],
    [4100, stage("paid")],
    [4200, proof("intents_payout")],
    [8000, { type: "reclaim" }],
  ] },
  { id: 9, title: "End card", durationMs: 6000, layout: [], beats: [
    [200, stage("closed")],
    [300, { type: "end_card" }],
  ] },
];

export const totalDurationMs = scenes.reduce((a, s) => a + s.durationMs, 0);

export const timeline: Beat[] = (() => {
  const out: Beat[] = [];
  let start = 0;
  for (const sc of scenes) {
    out.push({ atMs: start, scene: sc.id, ev: { type: "scene", id: sc.id, layout: sc.layout } });
    for (const [at, ev] of sc.beats) {
      if (at >= sc.durationMs) throw new Error(`beat past end of scene ${sc.id}`);
      out.push({ atMs: start + at, scene: sc.id, ev });
    }
    start += sc.durationMs;
  }
  return out.sort((a, b) => a.atMs - b.atMs);
})();
