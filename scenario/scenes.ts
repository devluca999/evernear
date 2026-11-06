// The demo script: scenes from docs/BUILD.md section 4 as timed beats, in three scenarios:
// the happy path, a bad path (Haoyun holds at +8% and Evernear stops before any money moves),
// and the bad path with an adjustment (you raise the limit, two people sign, it goes through).
// Amounts are computed by the engine, never typed in.
import type { Beat, Event, Gate, Message, PanelId } from "./types";
import type { Stage } from "./stages";
import { PO, suppliers } from "../seed/astro";
import { plainEngine } from "../engine/plain";
import { formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "../engine/money";

export interface Scene { id: number; title: string; durationMs: number; layout: PanelId[]; line?: string; timeCard?: string; beats: ([number, Event] | [number, Event, Gate])[] }

let n = 0;
const msg = (m: Omit<Message, "id">): Event => ({ type: "message", message: { id: `m${++n}`, ...m } });
const bot = (text: string, refersTo?: PanelId, card?: Message["card"]): Event => msg({ channel: "telegram", direction: "out", from: "Stockbot", text, refersTo, card });
const buyer = (text: string, photo?: string): Event => msg({ channel: "telegram", direction: "in", from: "Luca", text, photo });
const stage = (to: Stage): Event => ({ type: "stage", to });
const routine = (to: Stage): Event => ({ type: "routine", to });
const proof = (key: string, label?: string): Event => ({ type: "proof", key, ...(label ? { label } : {}) });

const haoyunMail = "sales@haoyun-precision.example";

const RECEIVED = 1_800;
const amounts = (unitCents: number) => {
  const m = plainEngine.matchReceipt({ orderedQty: PO.quantity, receivedQty: RECEIVED, unitCents });
  return { lockedCents: unitCents * PO.quantity, releaseCents: m.releaseCents, holdCents: m.holdCents };
};
const dockLine = (unitCents: number) => { const a = amounts(unitCents); return `1,800 of 2,000 arrived. Releasing ${formatUsdShort(a.releaseCents)} to Haoyun, holding ${formatUsdShort(a.holdCents)}.`; };
const scaled = (c: number) => `${formatUsd(scaleTestnet(c))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(c)})`;

export const scenes: Scene[] = [
  { id: 0, title: "Onboarding", durationMs: 8000, layout: ["rules"], line: "Astro sets up its own wallet and the rules the agent must follow.", beats: [
    [800, { type: "wallet" }],
    [1200, proof("wallet_created")],
    [4500, proof("policy_set")],
  ] },
  { id: 1, title: "Bottleneck", durationMs: 9000, layout: ["demand", "inbox"], line: "14 robots are ordered and there are motors for 6. The usual supplier is out.", beats: [
    [500, { type: "demand", ordered: 5, shippedOut: 1, motorsOnHand: 24 }],
    [1800, { type: "demand", ordered: 10, shippedOut: 2, motorsOnHand: 24 }],
    [3000, { type: "demand", ordered: 14, shippedOut: 3, motorsOnHand: 24 }],
    [4500, msg({ channel: "email", direction: "in", from: "orders@ultra-motion.example", subject: "Re: Actuator motor availability", text: "Our actuator motor line is down for retooling. Earliest restart is 6 weeks out.", reading: "Usual supplier unavailable for 6 weeks." })],
    [6000, bot("Ultra Motion is out for 6 weeks. 14 robots ordered, motors for 6. Start sourcing?", "demand")],
    [7500, buyer("Yes"), { id: "start_sourcing", who: "Luca", prompt: "Start sourcing a new motor supplier?", action: "Yes" }],
  ] },
  { id: 2, title: "Routine reorder", durationMs: 8000, layout: ["demand", "rules"], line: "A small reorder under the cap pays itself. No person needed.", beats: [
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
  { id: 3, title: "Sourcing and fitment", durationMs: 12000, layout: ["bom", "map"], line: "Four alternatives are checked against the 10MA's specs, privately.", beats: [
    [300, stage("sourcing")],
    [1000, proof("inference_attestation")],
    [4200, { type: "fitment", supplierId: "kansai" }],
    [5600, { type: "fitment", supplierId: "rheinwerk" }],
    [7000, { type: "fitment", supplierId: "huaxin" }],
    [8400, { type: "fitment", supplierId: "haoyun" }],
    [9600, bot("Haoyun Precision in Shenzhen fits every spec and passes policy. 3 others failed.", "bom")],
  ] },
  { id: 4, title: "Approval", durationMs: 10000, layout: ["rules"], line: "A new supplier over the cap needs two signatures.", beats: [
    [300, stage("approval")],
    [800, { type: "phone", open: true }],
    [1200, bot("PO 1042: 2,000 motors from Haoyun, a new supplier, over the $10K cap. 2 approvals needed.", "rules", "approval")],
    [3000, { type: "approval", by: "Luca" }, { id: "approve_luca", who: "Luca", prompt: "Approve PO 1042: $38,000 to Haoyun Precision?", action: "YES, approve as Luca" }],
    [3100, proof("approval_luca")],
    [6000, bot("Jordy, please sign PO 1042.", "rules")],
    [7500, { type: "approval", by: "Jordy" }, { id: "approve_jordy", who: "Jordy", prompt: "Second approval for PO 1042", action: "YES, approve as Jordy" }],
    [7600, proof("approval_jordy")],
  ] },
  { id: 5, title: "Negotiation", durationMs: 15000, layout: ["inbox", "rules"], line: "Haoyun asks for 8% more. Your limit is 3%.", beats: [
    [300, stage("confirmed")],
    [600, msg({ channel: "email", direction: "in", from: haoyunMail, subject: "PO 1042 confirmation", text: "We confirm PO 1042 for 2,000 units. Due to copper costs the unit price is now USD 20.02.", reading: "Price change: +8%, over the 3% limit." })],
    [700, { type: "price_quote", unitCents: 2002, from: "Haoyun Precision" }],
    [2000, bot("Haoyun quoted 8% over the PO. Accept?", "inbox")],
    [3800, buyer("Up to 3%"), { id: "price_limit", who: "Luca", prompt: "Haoyun asks +8%. Your limit is 3%.", action: "Up to 3%" }],
    [5200, { type: "refused", kind: "offlist_email", detail: "deals@unknown-broker.example is not on the recipient allowlist" }],
    [5300, proof("refused_email")],
    [8500, msg({ channel: "email", direction: "out", from: "Evernear for Astro", to: haoyunMail, subject: "Re: PO 1042 confirmation", text: "We can accept a change of up to 2.5%, USD 19.00 per unit, for 2,000 units." })],
    [8600, proof("connector_receipt")],
    [11500, msg({ channel: "email", direction: "in", from: haoyunMail, subject: "Re: PO 1042 confirmation", text: "Revised: we confirm PO 1042 at USD 19.00 per unit.", reading: "Confirmed at +2.5%, inside the limit." })],
    [11600, { type: "price_quote", unitCents: 1900, from: "Haoyun Precision" }],
    [12800, { type: "phone", open: false }],
  ] },
  { id: 6, title: "Funds committed", durationMs: 10000, layout: ["map", "rules"], line: "The PO total moves into its own account, which can only pay Haoyun or Astro.", beats: [
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
  { id: 7, title: "Dock", durationMs: 12000, layout: ["bom", "map"], line: "The shipment is counted at the dock: 1,800 of 2,000 arrived.", timeCard: "Day 9 · Chicago dock", beats: [
    [200, { type: "shipment", progress: 0.98, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
    [300, { type: "checkpoint", id: "arrived" }],
    [400, { type: "checkpoint", id: "customs" }],
    [500, stage("dock")],
    [600, { type: "shipment", progress: 1, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "done" }] }],
    [900, { type: "phone", open: true }],
    [1500, buyer("Packing slip", "packing_slip"), { id: "packing_slip", who: "Luca", prompt: "The shipment is at the dock. Photograph the packing slip.", action: "Send packing slip photo" }],
    [1600, { type: "checkpoint", id: "dock" }],
    [4000, { type: "dock", receivedQty: 1800 }],
    [4100, proof("dock_attestation")],
    [7500, bot(dockLine(PO.revisedUnitCents), "bom")],
    [10500, { type: "phone", open: false }],
  ] },
  { id: 8, title: "Paid", durationMs: 12000, layout: ["rules", "map"], line: "Haoyun is paid for what arrived. The rest goes back to Astro.", beats: [
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

/** Scenes to timed beats. Scene ids are their position, so every scenario numbers 0, 1, 2... */
export function buildTimeline(list: Scene[]): Beat[] {
  const out: Beat[] = [];
  let start = 0;
  for (const sc of list) {
    out.push({ atMs: start, scene: sc.id, ev: { type: "scene", id: sc.id, layout: sc.layout } });
    for (const [at, ev, gate] of sc.beats) {
      if (at >= sc.durationMs) throw new Error(`beat past end of scene ${sc.id}`);
      out.push({ atMs: start + at, scene: sc.id, ev, ...(gate ? { gate } : {}) });
    }
    start += sc.durationMs;
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
const renumber = (list: Scene[]): Scene[] => list.map((sc, id) => ({ ...sc, id }));

/** Scene 5 when Haoyun will not come down: it holds at +8% ($20.02). */
const HOLD_UNIT = 2002;
const negotiationHold: Scene = {
  ...scenes[5], line: "Haoyun asks for 8% more and will not move. Your limit is 3%.",
  beats: [
    ...scenes[5].beats.filter(([at]) => at < 11500),
    [11500, msg({ channel: "email", direction: "in", from: haoyunMail, subject: "Re: PO 1042 confirmation", text: `We confirm PO ${PO.number} and our price change stands at USD 20.02 per unit.`, reading: "Holds at +8%, over the 3% limit." })],
    [11600, { type: "price_quote", unitCents: HOLD_UNIT, from: "Haoyun Precision" }],
    [12600, bot("Haoyun holds at +8%. That is over your 3% limit, so nothing will be committed.", "rules")],
    [14000, { type: "phone", open: false }],
  ],
};

const endCard = (line: string): Scene => ({ ...scenes[9], line });

/** Bad path: the PO stops before any money moves, and says why. */
const onHold: Scene = {
  id: 0, title: "On hold", durationMs: 9000, layout: ["rules", "inbox"],
  line: "Nothing is committed. The PO waits for a person to decide.",
  beats: [
    [400, bot(`PO ${PO.number} is on hold: Haoyun's +8% is over your 3% limit. Nothing was committed. Raise the limit or choose another supplier.`, "rules")],
    [2000, { type: "lock_funds" }],
  ],
};

/** Adjustment: you raise the limit and the motor cap for this PO; two people sign. */
const adjustment: Scene = {
  id: 0, title: "Adjustment", durationMs: 10000, layout: ["rules", "inbox"],
  line: "You raise the limit for this PO to 8%. Two people sign.",
  beats: [
    [300, { type: "phone", open: true }],
    [600, bot(`Raise the price limit to 8% and the motor cap to $20.10 for PO ${PO.number}? Haoyun holds at $20.02. Two approvals.`, "rules")],
    [2500, buyer("Raise to 8%"), { id: "raise_limit", who: "Luca", prompt: `Raise the limit to 8% for PO ${PO.number}? Haoyun holds at $20.02.`, action: "Raise to 8%" }],
    [5000, bot("Jordy, please approve the higher limit.", "rules")],
    [6500, { type: "rules", patch: { priceChangeLimitBps: 800, motorCapCents: 2010 } }, { id: "approve_raise", who: "Jordy", prompt: "Approve the 8% limit for PO 1042", action: "YES, approve as Jordy" }],
    [7500, bot(`Limit raised to 8% for PO ${PO.number}. Accepting Haoyun at $20.02.`, "rules")],
    [9000, { type: "phone", open: false }],
  ],
};

/** The happy path's later scenes, with the amounts for another unit price. */
function atUnit(sc: Scene, unitCents: number): Scene {
  const a = amounts(unitCents);
  return {
    ...sc,
    beats: sc.beats.map((b) => {
      const [at, ev] = b;
      if (ev.type === "message" && ev.message.text.startsWith("1,800 of 2,000 arrived.")) return [at, bot(dockLine(unitCents), "bom")] as typeof b;
      if (ev.type === "proof" && ev.key === "escrow_wallet") return [at, proof("escrow_wallet", `Committed for PO ${PO.number}: ${scaled(a.lockedCents)}`)] as typeof b;
      if (ev.type === "proof" && ev.key === "intents_payout") return [at, proof("intents_payout", `Paid supplier on Base Sepolia for PO ${PO.number}: ${scaled(a.releaseCents)}`)] as typeof b;
      return b;
    }),
  };
}

export type ScenarioId = "happy" | "standoff" | "adjusted";
export interface Scenario { id: ScenarioId; title: string; blurb: string; scenes: Scene[]; timeline: Beat[]; totalMs: number }
function scenario(id: ScenarioId, title: string, blurb: string, list: Scene[]): Scenario {
  const sc = renumber(list);
  return { id, title, blurb, scenes: sc, timeline: buildTimeline(sc), totalMs: sc.reduce((a, x) => a + x.durationMs, 0) };
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  happy: scenario("happy", "Happy path", "Haoyun comes down to +2.5%; paid for the 1,800 that arrived.", scenes),
  standoff: scenario("standoff", "Bad path", "Haoyun holds at +8%, over your limit. Evernear stops before any money moves.",
    [...scenes.slice(0, 5), negotiationHold, onHold, endCard("No money moved. The decision is yours.")]),
  adjusted: scenario("adjusted", "Bad path, adjusted", "Same stand-off; you raise the limit to 8% with two approvals and it goes through at $20.02.",
    [...scenes.slice(0, 5), negotiationHold, adjustment, ...scenes.slice(6, 9).map((sc) => atUnit(sc, HOLD_UNIT)), scenes[9]]),
};

export const totalDurationMs = SCENARIOS.happy.totalMs;
export const timeline: Beat[] = SCENARIOS.happy.timeline;
