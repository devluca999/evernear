// The demo script: scenes from docs/BUILD.md section 4 as timed beats, in three scenarios:
// the happy path, a bad path (Haoyun holds at +8% and Evernear stops before any money moves),
// and the bad path with an adjustment (you raise the limit, two people sign, it goes through).
// Amounts are computed by the engine, never typed in. Layouts follow the V2 storyboard.
import type { Beat, Event, Gate, Message, PanelId } from "./types";
import type { Stage } from "./stages";
import { PO, routineReorder, suppliers } from "../seed/astro";
import { plainEngine } from "../engine/plain";
import { formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "../engine/money";

/** How a scene lays out its cards: CSS grid columns, rows and areas (card ids). */
export interface SceneGrid { cols: string; rows?: string; areas?: string[] }

export interface Scene {
  id: number; title: string; durationMs: number; layout: PanelId[];
  /** One line under the title in the demo rail. */
  line?: string;
  grid?: SceneGrid;
  /** The phone sits beside the cards in this scene. */
  phone?: boolean;
  /** The time on the phone's status bar. */
  clock?: string;
  /** The sidebar status line. */
  status?: string;
  /** The "Next" label when the story is about to enter this scene. */
  enter?: string;
  beats: ([number, Event] | [number, Event, Gate])[];
}

let n = 0;
const msg = (m: Omit<Message, "id">): Event => ({ type: "message", message: { id: `m${++n}`, ...m } });
const bot = (text: string, opts: { refersTo?: PanelId; card?: Message["card"]; chips?: string[]; to?: "Luca" | "Jordy" } = {}): Event =>
  msg({ channel: "telegram", direction: "out", from: "Stockbot", to: opts.to ?? "Luca", text, refersTo: opts.refersTo, card: opts.card, chips: opts.chips });
const buyer = (text: string, photo?: string): Event => msg({ channel: "telegram", direction: "in", from: "Luca", text, photo });
const stage = (to: Stage): Event => ({ type: "stage", to });
const routine = (to: Stage): Event => ({ type: "routine", to });
const proof = (key: string, label?: string): Event => ({ type: "proof", key, ...(label ? { label } : {}) });

const haoyunMail = "sales@haoyun-precision.example";

const RECEIVED = 1_800;
export const amounts = (unitCents: number) => {
  const m = plainEngine.matchReceipt({ orderedQty: PO.quantity, receivedQty: RECEIVED, unitCents });
  return { lockedCents: unitCents * PO.quantity, releaseCents: m.releaseCents, holdCents: m.holdCents };
};
const scaled = (c: number) => `${formatUsd(scaleTestnet(c))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(c)})`;
const routineCents = routineReorder.quantity * routineReorder.unitCents;

const releaseGate = (unitCents: number): Gate => {
  const a = amounts(unitCents);
  return {
    id: "approve_release", who: "Luca", panels: ["orders", "money"], status: "Short delivery, needs you",
    prompt: `Reply YES on Telegram to release ${formatUsdShort(a.releaseCents)} and hold ${formatUsdShort(a.holdCents)}.`,
    action: `YES, release ${formatUsdShort(a.releaseCents)}`,
  };
};

export const scenes: Scene[] = [
  { id: 0, title: "Onboarding", durationMs: 8000, layout: ["money", "rules"], grid: { cols: "480fr 392fr" },
    line: "Astro connects its own wallet and sets the spending rules.", status: "Stockbot ready", beats: [
    [800, { type: "wallet" }],
    [1200, proof("wallet_created")],
    [4500, proof("policy_set")],
  ] },
  { id: 1, title: "The bottleneck", durationMs: 13000, layout: ["stock", "orders", "inbox"], grid: { cols: "380fr 330fr 302fr" },
    line: "Ultra Motion is out for 6 weeks. 8 robots would miss their dates.", status: "Stockbot needs you", enter: "Run the stock check", beats: [
    [300, { type: "demand", ordered: 5, shippedOut: 1, motorsOnHand: 24 }],
    [900, { type: "demand", ordered: 10, shippedOut: 2, motorsOnHand: 24 }],
    [1500, { type: "demand", ordered: 14, shippedOut: 3, motorsOnHand: 24 }],
    [2000, routine("sourcing")],
    [2400, routine("approval")],
    [2800, routine("confirmed")],
    [3200, routine("funds_locked")],
    [3600, routine("shipped")],
    [4000, routine("dock")],
    [4400, routine("paid")],
    [4500, proof("payment_receipt", `Routine reorder paid · ${formatUsdShort(routineCents)} to ${routineReorder.supplier}`)],
    [4800, routine("closed")],
    [6500, msg({ channel: "email", direction: "in", from: "orders@ultra-motion.example", kind: "Re: PO 1037, AM17 actuator motors", subject: "Re: PO 1037, AM17 actuator motors", time: "08:14",
      text: "We are out of the AM17 for 6 weeks. Our next build ships 14 Dec.",
      reading: "No AM17 before 14 Dec. 8 robots miss their dates. Stockbot can source a replacement overseas." })],
    [8000, bot("Ultra Motion is out for 6 weeks. 14 robots ordered, motors for 6. Start sourcing?", { refersTo: "inbox" })],
    [10000, buyer("Start sourcing"), { id: "start_sourcing", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Tap Start sourcing in the Inbox panel.", action: "Start sourcing" }],
  ] },
  { id: 2, title: "Sourcing and fitment", durationMs: 12000, layout: ["products", "map", "orders"],
    grid: { cols: "440fr 588fr", rows: "380fr 288fr", areas: ['"products map"', '"products orders"'] },
    line: "Four alternatives checked against the 10MA specs. One fits.", status: "Checking 4 suppliers", enter: "Check 4 suppliers", beats: [
    [300, stage("sourcing")],
    [1000, proof("inference_attestation")],
    [4200, { type: "fitment", supplierId: "kansai" }],
    [5600, { type: "fitment", supplierId: "rheinwerk" }],
    [7000, { type: "fitment", supplierId: "huaxin" }],
    [8400, { type: "fitment", supplierId: "haoyun" }],
    [9600, bot("Haoyun Precision in Shenzhen fits every spec and passes policy. 3 others failed.", { refersTo: "products" })],
  ] },
  { id: 3, title: "Approval", durationMs: 10000, layout: ["rules", "orders"], grid: { cols: "416fr 296fr" }, phone: true, clock: "14:03",
    line: "A new overseas supplier over $10K needs two signatures.", status: "Waiting on approvals", enter: `Send PO ${PO.number} for approval`, beats: [
    [300, stage("approval")],
    [1200, bot(`PO ${PO.number}: 2,000 motors from Haoyun, a new supplier, over the $10K cap. 2 approvals needed.`, { refersTo: "rules", card: "approval" })],
    [3000, { type: "approval", by: "Luca", time: "14:02" }, { id: "approve_luca", who: "Luca", panels: ["rules"], status: "Waiting on Luca", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Luca" }],
    [3100, proof("approval_luca")],
    [5000, bot(`Jordy, PO ${PO.number} needs your signature. Luca signed at 14:02.`, { refersTo: "rules", card: "sign", to: "Jordy" })],
    [7500, { type: "approval", by: "Jordy", time: "14:04" }, { id: "approve_jordy", who: "Jordy", panels: ["rules"], status: "Waiting on Jordy", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Jordy" }],
    [7600, proof("approval_jordy")],
  ] },
  { id: 4, title: "Negotiation", durationMs: 15000, layout: ["inbox", "rules"], grid: { cols: "1fr", rows: "440fr 228fr" }, phone: true, clock: "14:33",
    line: "Haoyun asks for 8% more. Your limit is 3%.", status: "Negotiating with Haoyun", beats: [
    [300, stage("confirmed")],
    [600, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Order confirmation", subject: "PO 1042 confirmation", time: "14:31", attachment: "confirmation_1042.pdf",
      text: "Confirming PO 1042. Copper costs moved, so the unit price is $20.02, +8% over the PO.", reading: "8% over the PO. Your rule allows 3%. Asked you first." })],
    [700, { type: "price_quote", unitCents: 2002, from: "Haoyun Precision" }],
    [2000, bot("Haoyun quoted 8% over the PO. Accept?", { refersTo: "inbox", chips: ["Up to 3%", "Accept 8%", "Decline"] })],
    [3800, buyer("Up to 3%"), { id: "price_limit", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Haoyun asks +8%. Your limit is 3%.", action: "Up to 3%" }],
    [4400, bot("Countering at 2.5%, $19.00 a unit.")],
    [5200, { type: "refused", kind: "offlist_email", detail: "deals@unknown-broker.example is not on the recipient allowlist" }],
    [5300, proof("refused_email")],
    [8500, msg({ channel: "email", direction: "out", from: "Stockbot for Astro", to: haoyunMail, kind: "Counter offer · Gmail", subject: "Re: PO 1042 confirmation", time: "14:36",
      text: "Astro can accept $19.00 a unit, +2.5% over the PO, delivered to Chicago by 13 Nov.", reading: "Countered at 2.5%, inside your 3% limit." })],
    [8600, proof("connector_receipt")],
    [11500, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Revised confirmation", subject: "Re: PO 1042 confirmation", time: "14:52", attachment: "confirmation_1042_rev1.pdf",
      text: "Agreed. $19.00 a unit, 2,000 units, $38,000. Ships 3 Nov.", reading: "Matches the counter and the $38,000 ceiling." })],
    [11600, { type: "price_quote", unitCents: 1900, from: "Haoyun Precision" }],
  ] },
  { id: 5, title: "Funds committed and shipped", durationMs: 10000, layout: ["map", "money"], grid: { cols: "640fr 388fr" },
    line: `${formatUsdShort(PO.revisedTotalCents)} committed to PO ${PO.number}. The motors fly to Chicago.`, status: `Tracking shipment ${PO.number}`,
    enter: `Commit ${formatUsdShort(PO.revisedTotalCents)} to PO ${PO.number}`, beats: [
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
  { id: 6, title: "Day 9 · Chicago dock", durationMs: 13000, layout: ["orders", "money"], grid: { cols: "380fr 332fr" }, phone: true, clock: "08:41",
    line: "The packing slip says 1,800 of 2,000. Pay only for what arrived.", status: "At the Chicago dock", enter: "Land at Chicago dock", beats: [
    [200, { type: "shipment", progress: 0.98, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "working" }] }],
    [300, { type: "checkpoint", id: "arrived" }],
    [400, { type: "checkpoint", id: "customs" }],
    [500, stage("dock")],
    [600, { type: "shipment", progress: 1, docs: [{ name: "Confirmation", state: "done" }, { name: "Commercial invoice", state: "done" }, { name: "Packing list", state: "done" }] }],
    [900, bot("Truck at dock 3. Send a photo of the packing slip.", { refersTo: "orders" })],
    [1500, buyer("Packing slip", "packing_slip"), { id: "packing_slip", who: "Luca", panels: ["orders"], status: "At the dock, needs you", prompt: "The shipment is at the dock. Photograph the packing slip.", action: "Send packing slip photo" }],
    [1600, { type: "checkpoint", id: "dock" }],
    [4000, { type: "dock", receivedQty: RECEIVED }],
    [4100, proof("dock_attestation")],
    [6000, bot("1,800 of 2,000 arrived.", { refersTo: "money", card: "release" })],
    [9000, { type: "phone", open: true }, releaseGate(PO.revisedUnitCents)],
  ] },
  { id: 7, title: "Paid", durationMs: 12000, layout: ["money", "stock"], grid: { cols: "1fr 1fr" },
    line: "Haoyun is paid for what arrived. A payment to a lookalike address is refused.", status: `PO ${PO.number} settled`, beats: [
    [500, { type: "release", to: "0x000000000000000000000000000000000000dead" }],
    [600, proof("refused_release")],
    [3000, { type: "release", to: suppliers.find((s) => s.id === "haoyun")!.receiveAddress }],
    [3100, stage("paid")],
    [3200, proof("intents_payout")],
    [6000, { type: "end_card" }],
    [6200, stage("closed")],
    [10000, { type: "reclaim" }],
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

/** Scene 4 when Haoyun will not come down: it holds at +8% ($20.02). */
export const HOLD_UNIT = 2002;
const negotiationHold: Scene = {
  ...scenes[4], line: "Haoyun asks for 8% more and will not move. Your limit is 3%.",
  beats: [
    ...scenes[4].beats.filter(([at]) => at < 11500),
    [11500, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Revised confirmation", subject: "Re: PO 1042 confirmation", time: "14:52",
      text: `We confirm PO ${PO.number} and our price change stands at $20.02 a unit.`, reading: "Holds at +8%, over the 3% limit." })],
    [11600, { type: "price_quote", unitCents: HOLD_UNIT, from: "Haoyun Precision" }],
  ],
};

/** Bad path: the PO stops before any money moves, and says why. */
const onHold: Scene = {
  id: 0, title: "On hold", durationMs: 9000, layout: ["rules", "money"], grid: { cols: "400fr 312fr" }, phone: true, clock: "15:10",
  line: "Haoyun holds at +8%. Evernear stops before any money moves.", status: "On hold, needs you",
  beats: [
    [400, bot("Haoyun holds at $20.02, 8% over the PO. Your limit is 3%.", { refersTo: "rules" })],
    [1200, bot(`Nothing has been committed or paid. PO ${PO.number} is on hold.`, { chips: ["Raise limit to 8%", "End the order", "Keep waiting"] })],
    [2000, { type: "lock_funds" }],
    [4000, { type: "end_card" }, { id: "on_hold", who: "Luca", panels: ["rules"], status: "On hold, needs you", prompt: "Raise the limit with two approvals, or end the order.", action: "End the order" }],
  ],
};

/** Adjustment: you raise the limit and the motor cap for this PO; two people sign. */
const adjustment: Scene = {
  id: 0, title: "Adjustment", durationMs: 10000, layout: ["rules", "orders"], grid: { cols: "416fr 296fr" }, phone: true, clock: "15:16",
  line: `You raise the limit to 8% with two approvals. PO ${PO.number} reprices to $20.02.`, status: `Committing PO ${PO.number}`, enter: "Raise the limit to 8%",
  beats: [
    [600, bot(`Raise the price limit to 8% for PO ${PO.number}? Haoyun holds at $20.02. Two approvals.`, { refersTo: "rules" })],
    [2000, buyer("Raise limit to 8%")],
    [2500, { type: "approval", by: "Luca", time: "15:12", scope: "limit" }, { id: "raise_limit", who: "Luca", panels: ["rules"], status: "Waiting on Luca", prompt: `Raise the limit to 8% for PO ${PO.number}? Haoyun holds at $20.02.`, action: "Raise to 8%" }],
    [4500, bot("Jordy, please approve the higher limit.", { refersTo: "rules", to: "Jordy" })],
    [6500, { type: "approval", by: "Jordy", time: "15:13", scope: "limit" }, { id: "approve_raise", who: "Jordy", panels: ["rules"], status: "Waiting on Jordy", prompt: `Approve the 8% limit for PO ${PO.number}.`, action: "YES, approve as Jordy" }],
    [6600, { type: "rules", patch: { priceChangeLimitBps: 800, motorCapCents: 2010 } }],
    [7500, bot(`Raising the limit for PO ${PO.number} needs two approvals. Luca and Jordy signed.`, { refersTo: "rules", card: "commit" })],
  ],
};

/** The happy path's later scenes, with the amounts for another unit price. */
function atUnit(sc: Scene, unitCents: number): Scene {
  const a = amounts(unitCents);
  return {
    ...sc,
    ...(sc.enter?.startsWith("Commit") ? { enter: `Commit ${formatUsdShort(a.lockedCents)} to PO ${PO.number}`, line: `${formatUsdShort(a.lockedCents)} committed to PO ${PO.number}. The motors fly to Chicago.` } : {}),
    beats: sc.beats.map((b) => {
      const [at, ev] = b;
      if (b[2]?.id === "approve_release") return [at, ev, releaseGate(unitCents)] as typeof b;
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
    [...scenes.slice(0, 4), negotiationHold, onHold]),
  adjusted: scenario("adjusted", "Bad path, adjusted", "Same stand-off; you raise the limit to 8% with two approvals and it goes through at $20.02.",
    [...scenes.slice(0, 4), negotiationHold, adjustment, ...scenes.slice(5).map((sc) => atUnit(sc, HOLD_UNIT))]),
};

/** The adjusted scenario's Adjustment scene, where the bad path's "Raise limit to 8%" lands. */
export const ADJUSTMENT_SCENE = 5;

export const totalDurationMs = SCENARIOS.happy.totalMs;
export const timeline: Beat[] = SCENARIOS.happy.timeline;
