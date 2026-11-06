// The demo script: eight chapters as timed beats, in three scenarios:
// the happy path, a bad path (Haoyun holds at +8% and Evernear stops before any money moves),
// and the bad path with an adjustment (you raise the limit, two people sign, it goes through).
// Amounts are computed by the engine, never typed in. Layouts follow the V2 storyboard.
import type { Beat, Event, Focus, Gate, Message, PanelId } from "./types";
import type { Stage } from "./stages";
import { MOTOR_PART, offers, PO, policy, routineReorder, suppliers } from "../seed/astro";
import { plainEngine } from "../engine/plain";
import { formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "../engine/money";

/** How a scene lays out its cards: CSS grid columns, rows and areas (card ids). */
export interface SceneGrid { cols: string; rows?: string; areas?: string[] }

/** What a beat can carry besides its event: a human moment, a named step, a camera focus. */
export interface Extra { gate?: Gate; step?: string; focus?: Focus }
type Entry = [number, Event] | [number, Event, Gate] | [number, Event, Extra];

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
  beats: Entry[];
}

const isGate = (x: Gate | Extra | undefined): x is Gate => !!x && "who" in x;
/** The human moment a beat waits for, if any. */
export const gateOf = (e: Entry): Gate | undefined => (isGate(e[2]) ? e[2] : e[2]?.gate);
/** A named step with a camera focus: `step("Pins resolve", "map.results", 1.4)`. */
const step = (name: string, id: string, zoom: number, more: Omit<Focus, "id" | "zoom"> & { gate?: Gate } = {}): Extra => {
  const { gate, ...rest } = more;
  return { step: name, focus: { id, zoom, ...rest }, ...(gate ? { gate } : {}) };
};

let n = 0;
const msg = (m: Omit<Message, "id">): Event => ({ type: "message", message: { id: `m${++n}`, ...m } });
const bot = (text: string, opts: { refersTo?: PanelId; card?: Message["card"]; chips?: string[]; to?: "Luca" | "Jordy" } = {}): Event =>
  msg({ channel: "telegram", direction: "out", from: "Stockbot", to: opts.to ?? "Luca", text, refersTo: opts.refersTo, card: opts.card, chips: opts.chips });
const buyer = (text: string, photo?: string): Event => msg({ channel: "telegram", direction: "in", from: "Luca", text, photo });
const stage = (to: Stage): Event => ({ type: "stage", to });
const routine = (to: Stage): Event => ({ type: "routine", to });
const proof = (key: string, label?: string): Event => ({ type: "proof", key, ...(label ? { label } : {}) });
const quoteOf = (id: string) => offers.find((o) => o.supplierId === id && o.part === MOTOR_PART)!.unitCents;
const offer = (supplierId: string, unitCents: number, note: string, tone: "success" | "attention" | "alert"): Event => ({ type: "offer", supplierId, unitCents, note, tone });

const haoyunMail = "sales@haoyun-precision.example";

const RECEIVED = 1_800;
export const amounts = (unitCents: number) => {
  const m = plainEngine.matchReceipt({ orderedQty: PO.quantity, receivedQty: RECEIVED, unitCents });
  return { lockedCents: unitCents * PO.quantity, releaseCents: m.releaseCents, holdCents: m.holdCents };
};
const scaled = (c: number) => `${formatUsd(scaleTestnet(c))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(c)})`;
const routineCents = routineReorder.quantity * routineReorder.unitCents;
const capMultiple = (quoteOf("rheinwerk") / policy.priceCaps[MOTOR_PART]!).toFixed(1);

const releaseGate = (unitCents: number): Gate => {
  const a = amounts(unitCents);
  return {
    id: "approve_release", who: "Luca", panels: ["orders", "money"], status: "Short delivery, needs you",
    prompt: `Reply YES on Telegram to release ${formatUsdShort(a.releaseCents)} and hold ${formatUsdShort(a.holdCents)}.`,
    action: `YES, release ${formatUsdShort(a.releaseCents)}`,
  };
};

const docs = (packing: "done" | "working") => [{ name: "Confirmation", state: "done" as const }, { name: "Commercial invoice", state: "done" as const }, { name: "Packing list", state: packing }];

/** The happy path, in eight chapters. Each named step can carry a camera focus (scenario/camera.ts). */
export const scenes: Scene[] = [
  { id: 0, title: "The 10MA", durationMs: 11000, layout: ["products", "money", "rules"], grid: { cols: "460fr 330fr 330fr" },
    line: "Astro makes three robots. The 10MA needs four actuator motors.", status: "Stockbot ready", beats: [
    [600, { type: "wallet" }],
    [1000, proof("wallet_created")],
    [2200, proof("policy_set")],
    [3400, { type: "product", id: "kip" }],
    [4200, { type: "product", id: "porter" }],
    [5200, { type: "product", id: "10ma" }, step("Product switch", "products.figure", 1.5)],
    [8000, { type: "highlight", part: MOTOR_PART }, step("Motor highlight", "products.motor", 2.2)],
  ] },
  { id: 1, title: "The gap", durationMs: 10000, layout: ["stock", "orders"], grid: { cols: "560fr 440fr" },
    line: "14 robots ordered, motors for 6.", status: "Checking stock", enter: "Check stock against orders", beats: [
    [300, { type: "demand", ordered: 5, shippedOut: 1, motorsOnHand: 24 }],
    [900, { type: "demand", ordered: 10, shippedOut: 2, motorsOnHand: 24 }],
    [1500, { type: "demand", ordered: 14, shippedOut: 3, motorsOnHand: 24 }, step("The gap", "stock.shortfall", 1.8)],
    [4500, routine("sourcing")],
    [4800, routine("approval")],
    [5100, routine("confirmed")],
    [5400, routine("funds_locked")],
    [5700, routine("shipped")],
    [6000, routine("dock")],
    [6300, routine("paid")],
    [6400, proof("payment_receipt", `Routine reorder paid · ${formatUsdShort(routineCents)} to ${routineReorder.supplier}`)],
    [6700, routine("closed")],
  ] },
  { id: 2, title: "Ultra's reply", durationMs: 9000, layout: ["inbox", "stock"], grid: { cols: "560fr 440fr" },
    line: "Ultra Motion is out for 6 weeks. 8 robots would miss their dates.", status: "Stockbot needs you", enter: "Ask Ultra Motion for motors", beats: [
    [500, msg({ channel: "email", direction: "in", from: "orders@ultra-motion.example", kind: "Re: PO 1037, AM17 actuator motors", subject: "Re: PO 1037, AM17 actuator motors", time: "08:14",
      text: "We are out of the AM17 for 6 weeks. Our next build ships 14 Dec.",
      reading: "No AM17 before 14 Dec. 8 robots miss their dates. Stockbot can source a replacement overseas." }), step("Ultra's reply", "inbox.reply", 1.7)],
    [3500, bot("Ultra Motion is out for 6 weeks. 14 robots ordered, motors for 6. Start sourcing?", { refersTo: "inbox" })],
    [6000, buyer("Start sourcing"), { id: "start_sourcing", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Tap Start sourcing in the Inbox panel.", action: "Start sourcing" }],
  ] },
  { id: 3, title: "Search", durationMs: 12000, layout: ["map", "products"], grid: { cols: "620fr 400fr" },
    line: "Stockbot searches for a motor that fits the 10MA. One fits, two are close.", status: "Searching 4 suppliers", enter: "Search for a replacement motor", beats: [
    [300, stage("sourcing")],
    [700, { type: "search", query: "AM17 actuator motor · NEMA 17 · 6 mm shaft · 48 V" }, step("Search typed", "map.search", 1.8, { holdMs: 2600 })],
    [1200, proof("inference_attestation")],
    [4000, { type: "fitment", supplierId: "kansai" }, step("Pins resolve", "map.results", 1.4, { holdMs: 2600 })],
    [4500, { type: "fitment", supplierId: "rheinwerk" }],
    [5000, { type: "fitment", supplierId: "huaxin" }],
    [5500, { type: "fitment", supplierId: "haoyun" }],
    [8000, bot(`Haoyun Precision fits every spec. Rheinwerk fits but is ${capMultiple}x the price cap and not approved; Huaxin misses 3 BOM lines.`, { refersTo: "map" }),
      step("Orange reasons", "map.results.partial", 2.0, { spotlight: true })],
  ] },
  { id: 4, title: "Negotiation", durationMs: 15000, layout: ["inbox", "rules"], grid: { cols: "1fr", rows: "440fr 228fr" }, phone: true, clock: "14:33",
    line: "Three offers side by side. Haoyun asks for 8% more; your limit is 3%.", status: "Negotiating with Haoyun", enter: "Ask the matches for offers", beats: [
    [400, offer("rheinwerk", quoteOf("rheinwerk"), `${capMultiple}x the motor price cap, and not an approved supplier`, "alert")],
    [500, offer("huaxin", quoteOf("huaxin"), "Motor flange NEMA 23 and 2 other BOM lines fail", "alert")],
    [600, offer("haoyun", PO.confirmedUnitCents, "8% over the PO price", "attention"), step("Offers side by side", "negotiation.threads", 1.3)],
    [2600, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Quote", subject: "PO 1042 quote", time: "14:31", attachment: "quote_1042.pdf",
      text: "For PO 1042: copper costs moved, so the unit price is $20.02, +8% over the PO.", reading: "8% over the PO. Your rule allows 3%. Asked you first." }),
      step("Haoyun's offer", "negotiation.haoyun", 1.9)],
    [2700, { type: "price_quote", unitCents: PO.confirmedUnitCents, from: "Haoyun Precision" }],
    [4000, bot("Haoyun quoted 8% over the PO. Accept?", { refersTo: "inbox", chips: ["Up to 3%", "Accept 8%", "Decline"] })],
    [5800, buyer("Up to 3%"), { id: "price_limit", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Haoyun asks +8%. Your limit is 3%.", action: "Up to 3%" }],
    [6400, bot("Countering at 2.5%, $19.00 a unit.")],
    [7200, { type: "refused", kind: "offlist_email", detail: "deals@unknown-broker.example is not on the recipient allowlist" }],
    [7300, proof("refused_email")],
    [9500, msg({ channel: "email", direction: "out", from: "Stockbot for Astro", to: haoyunMail, kind: "Counter offer · Gmail", subject: "Re: PO 1042 quote", time: "14:36",
      text: "Astro can accept $19.00 a unit, +2.5% over the PO, delivered to Chicago by 13 Nov.", reading: "Countered at 2.5%, inside your 3% limit." })],
    [9600, proof("connector_receipt")],
    [12000, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Revised quote", subject: "Re: PO 1042 quote", time: "14:52", attachment: "quote_1042_rev1.pdf",
      text: "Agreed. $19.00 a unit, 2,000 units, $38,000. Ships 3 Nov.", reading: "Matches the counter. Inside your 3% limit." })],
    [12100, { type: "price_quote", unitCents: PO.revisedUnitCents, from: "Haoyun Precision" }],
    [12200, offer("haoyun", PO.revisedUnitCents, "+2.5%, inside your 3% limit", "success")],
  ] },
  { id: 5, title: "Approve and commit", durationMs: 13000, layout: ["rules", "money"], grid: { cols: "416fr 388fr" }, phone: true, clock: "14:58",
    line: `Two people sign, then ${formatUsdShort(PO.revisedTotalCents)} is committed to PO ${PO.number}.`, status: "Waiting on approvals", enter: `Send PO ${PO.number} for approval`, beats: [
    [300, stage("approval")],
    [1000, bot(`PO ${PO.number}: 2,000 motors from Haoyun at $19.00, a new supplier, over the $10K cap. 2 approvals needed.`, { refersTo: "rules", card: "approval" }),
      step("Approvals", "rules.approvals", 1.8, { holdMs: 2400 })],
    [2800, { type: "approval", by: "Luca", time: "14:56" }, { id: "approve_luca", who: "Luca", panels: ["rules"], status: "Waiting on Luca", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Luca" }],
    [2900, proof("approval_luca")],
    [4400, bot(`Jordy, PO ${PO.number} needs your signature. Luca signed at 14:56.`, { refersTo: "rules", card: "sign", to: "Jordy" })],
    [6200, { type: "approval", by: "Jordy", time: "14:58" }, { id: "approve_jordy", who: "Jordy", panels: ["rules"], status: "Waiting on Jordy", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Jordy" }],
    [6300, proof("approval_jordy")],
    [6600, stage("confirmed")],
    [8000, { type: "lock_funds" }, step("Funds move", "money.escrow", 2.0)],
    [8100, stage("funds_locked")],
    [10500, proof("escrow_wallet"), step("Proof", "developer.hash", 2.2)],
  ] },
  { id: 6, title: "Day 9 · Chicago dock", durationMs: 16000, layout: ["map", "orders"], grid: { cols: "560fr 440fr" }, phone: true, clock: "08:41",
    line: "The motors fly to Chicago. The packing slip says 1,800 of 2,000.", status: `Tracking shipment ${PO.number}`, enter: "Ship to Chicago", beats: [
    [300, { type: "shipment", progress: 0, docs: docs("working") }],
    [400, { type: "checkpoint", id: "packed" }],
    [1200, stage("shipped")],
    [1300, { type: "checkpoint", id: "handover" }],
    [1800, { type: "checkpoint", id: "departed" }],
    [2000, { type: "shipment", progress: 0.3, docs: docs("working") }],
    [3200, { type: "shipment", progress: 0.7, docs: docs("working") }],
    [4400, { type: "shipment", progress: 0.98, docs: docs("working") }],
    [4500, { type: "checkpoint", id: "arrived" }],
    [4600, { type: "checkpoint", id: "customs" }],
    [4800, stage("dock")],
    [4900, { type: "shipment", progress: 1, docs: docs("done") }],
    [5000, { type: "layout", panels: ["orders", "money"] }],
    [5400, bot("Truck at dock 3. Send a photo of the packing slip.", { refersTo: "orders" })],
    [6000, buyer("Packing slip", "packing_slip"), { id: "packing_slip", who: "Luca", panels: ["orders"], status: "At the dock, needs you", prompt: "The shipment is at the dock. Photograph the packing slip.", action: "Send packing slip photo" }],
    [6100, { type: "checkpoint", id: "dock" }],
    [8500, { type: "dock", receivedQty: RECEIVED }, step("Dock count", "dock.count", 2.0)],
    [8600, proof("dock_attestation")],
    [10500, bot("1,800 of 2,000 arrived.", { refersTo: "money", card: "release" })],
    [13500, { type: "phone", open: true }, releaseGate(PO.revisedUnitCents)],
  ] },
  { id: 7, title: "Paid", durationMs: 12000, layout: ["money", "stock"], grid: { cols: "1fr 1fr" },
    line: "Haoyun is paid for what arrived. A payment to a lookalike address is refused.", status: `PO ${PO.number} settled`, beats: [
    [500, { type: "release", to: "0x000000000000000000000000000000000000dead" }],
    [600, proof("refused_release")],
    [3000, { type: "release", to: suppliers.find((s) => s.id === "haoyun")!.receiveAddress }, step("Paid and refused", "money.payout", 1.8)],
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
    for (const e of sc.beats) {
      const [at, ev, x] = e;
      if (at >= sc.durationMs) throw new Error(`beat past end of scene ${sc.id}`);
      const gate = gateOf(e);
      const extra = x && !isGate(x) ? x : undefined;
      out.push({ atMs: start + at, scene: sc.id, ev, ...(gate ? { gate } : {}), ...(extra?.step ? { step: extra.step } : {}), ...(extra?.focus ? { focus: extra.focus } : {}) });
    }
    start += sc.durationMs;
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
const renumber = (list: Scene[]): Scene[] => list.map((sc, id) => ({ ...sc, id }));

/** Chapter 5 when Haoyun will not come down: it holds at +8% ($20.02). */
export const HOLD_UNIT = 2002;
const NEGOTIATION = 4;
const negotiationHold: Scene = {
  ...scenes[NEGOTIATION], line: "Three offers side by side. Haoyun asks for 8% more and will not move. Your limit is 3%.",
  beats: [
    ...scenes[NEGOTIATION].beats.filter(([at]) => at < 12000),
    [12000, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Revised quote", subject: "Re: PO 1042 quote", time: "14:52",
      text: `For PO ${PO.number} our price change stands at $20.02 a unit.`, reading: "Holds at +8%, over the 3% limit." })],
    [12100, { type: "price_quote", unitCents: HOLD_UNIT, from: "Haoyun Precision" }],
    [12200, offer("haoyun", HOLD_UNIT, "Holds at +8%, over your 3% limit", "attention")],
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
    ...(sc.title === "Approve and commit" ? { line: `Two people sign, then ${formatUsdShort(a.lockedCents)} is committed to PO ${PO.number}.` } : {}),
    beats: sc.beats.map((b) => {
      const [at, ev] = b;
      if (gateOf(b)?.id === "approve_release") return [at, ev, releaseGate(unitCents)] as typeof b;
      if (ev.type === "proof" && ev.key === "escrow_wallet") return [at, proof("escrow_wallet", `Committed for PO ${PO.number}: ${scaled(a.lockedCents)}`), ...b.slice(2)] as typeof b;
      if (ev.type === "message" && ev.message.card === "approval") return [at, bot(`PO ${PO.number}: 2,000 motors from Haoyun at ${formatUsd(unitCents)}, a new supplier, over the $10K cap. 2 approvals needed.`, { refersTo: "rules", card: "approval" }), ...b.slice(2)] as typeof b;
      if (ev.type === "proof" && ev.key === "intents_payout") return [at, proof("intents_payout", `Paid supplier on Base Sepolia for PO ${PO.number}: ${scaled(a.releaseCents)}`), ...b.slice(2)] as typeof b;
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
    [...scenes.slice(0, NEGOTIATION), negotiationHold, onHold]),
  adjusted: scenario("adjusted", "Bad path, adjusted", "Same stand-off; you raise the limit to 8% with two approvals and it goes through at $20.02.",
    [...scenes.slice(0, NEGOTIATION), negotiationHold, adjustment, ...scenes.slice(NEGOTIATION + 1).map((sc) => atUnit(sc, HOLD_UNIT))]),
};

/** The adjusted scenario's Adjustment chapter, where the bad path's "Raise limit to 8%" lands. */
export const ADJUSTMENT_SCENE = 5;

export const totalDurationMs = SCENARIOS.happy.totalMs;
export const timeline: Beat[] = SCENARIOS.happy.timeline;
