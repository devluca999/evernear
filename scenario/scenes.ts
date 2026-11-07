// The demo script: eight chapters as timed beats, in three scenarios: the happy path, a bad path
// (Haoyun also holds at +10%, both contenders over the 5% ceiling, nothing moves) and the bad path
// with an adjustment (you raise the ceiling to 10% with two approvals and Haoyun's all-50 offer goes
// through). The deal follows Luca's numbers of Nov 6 (seed/astro.ts, policy/astro.json). Amounts
// are computed by the engine, never typed in. The order wallet releases in two stages, each waiting
// for two signals (engine/escrow.ts releaseStage).
import type { Beat, Event, Focus, Gate, Message, PanelId } from "./types";
import type { Stage } from "./stages";
import type { ExplainerId } from "./explain";
import type { SignalId } from "../engine/escrow";
import { RELEASE_RULES } from "../engine/escrow";
import { demand, MOTOR_BASE_CENTS, MOTOR_PART, NEED_BY, offers, PO, policy, products, quickshipOffer, routineReorder, suppliers } from "../seed/astro";
import { formatInt, formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "../engine/money";

/** How a scene lays out its cards: CSS grid columns, rows and areas (card ids). */
export interface SceneGrid { cols: string; rows?: string; areas?: string[] }

/** What a beat can carry besides its event: a human moment, a named step, a camera focus. */
export interface Extra { gate?: Gate; step?: string; focus?: Focus; clickTarget?: string }
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
const step = (name: string, id: string, zoom: number, more: Omit<Focus, "id" | "zoom"> & { gate?: Gate; clickTarget?: string } = {}): Extra => {
  const { gate, clickTarget, ...rest } = more;
  return { step: name, focus: { id, zoom, ...rest }, ...(gate ? { gate } : {}), ...(clickTarget ? { clickTarget } : {}) };
};
/** The products card's tab for a product: the presenter cursor clicks it before the switch. */
const tab = (id: string) => `products.tab.${id}`;
/** The phone's live answer button (a YES, a chip, or the button under the chat). */
export const PHONE_TAP = "phone.tap";

let n = 0;
const msg = (m: Omit<Message, "id">): Event => ({ type: "message", message: { id: `m${++n}`, ...m } });
const bot = (text: string, opts: { refersTo?: PanelId; card?: Message["card"]; chips?: string[]; to?: "Luca" | "Jordan" } = {}): Event =>
  msg({ channel: "telegram", direction: "out", from: "Stockbot", to: opts.to ?? "Luca", text, refersTo: opts.refersTo, card: opts.card, chips: opts.chips });
const buyer = (text: string, photo?: string): Event => msg({ channel: "telegram", direction: "in", from: "Luca", text, photo });
const stage = (to: Stage): Event => ({ type: "stage", to });
const routine = (to: Stage): Event => ({ type: "routine", to });
const proof = (key: string, label?: string): Event => ({ type: "proof", key, ...(label ? { label } : {}) });
const explain = (id: ExplainerId | null): Event => ({ type: "explain", id });
const signal = (id: SignalId): Event => ({ type: "signal", id });
const quoteOf = (id: string) => offers.find((o) => o.supplierId === id && o.part === MOTOR_PART)!.unitCents;
const offer = (supplierId: string, unitCents: number, note: string, tone: "success" | "attention" | "alert"): Event => ({ type: "offer", supplierId, unitCents, note, tone });
const pctOver = (unitCents: number) => `+${Math.round(((unitCents - MOTOR_BASE_CENTS) / MOTOR_BASE_CENTS) * 100)}%`;

const haoyunMail = "sales@haoyun-precision.example";
const quickshipMail = "orders@quickship-motion.example";
const HAOYUN = suppliers.find((s) => s.id === "haoyun")!.receiveAddress;
const WRONG = "0x000000000000000000000000000000000000dead";

const RECEIVED = PO.receivedQty;
/** The two-stage release for a unit price: committed, advance, balance and what stays held. */
export const amounts = (unitCents: number) => {
  const lockedCents = unitCents * PO.quantity;
  const advanceCents = (lockedCents * RELEASE_RULES.advancePercent) / 100;
  const balanceCents = RECEIVED * unitCents - advanceCents;
  return { lockedCents, advanceCents, balanceCents, releaseCents: advanceCents + balanceCents, holdCents: lockedCents - advanceCents - balanceCents };
};
const scaled = (c: number) => `${formatUsd(scaleTestnet(c))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(c)})`;
const routineCents = routineReorder.quantity * routineReorder.unitCents;
const capMultiple = (quoteOf("rheinwerk") / policy.priceCaps[MOTOR_PART]!).toFixed(1);
const needBy = new Date(`${NEED_BY}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const robotPrice = products.find((p) => p.id === "10ma")!.priceCents;
/** Stockbot's comparison: QuickShip's discount against the robots it would make late. */
export const comparison = {
  discountCents: (MOTOR_BASE_CENTS * PO.quantity * quickshipOffer.nextOrderDiscountPercent) / 100,
  baseOrderCents: MOTOR_BASE_CENTS * PO.quantity,
  lateRobots: quickshipOffer.laterQty / demand.motorsPerRobot,
  atRiskCents: (quickshipOffer.laterQty / demand.motorsPerRobot) * robotPrice,
};
const recommendation = `QuickShip's discount is worth about ${formatUsdShort(comparison.discountCents)} on a ${formatUsdShort(comparison.baseOrderCents)} order. But ${comparison.lateRobots} late robots put ${formatUsdShort(comparison.atRiskCents)} of orders at risk, and their price is over our ceiling. Haoyun ships everything on time within our rules.`;

const docs = (bol: "done" | "working") => [{ name: "Confirmation", state: "done" as const }, { name: "Commercial invoice", state: "done" as const }, { name: "Bill of lading", state: bol }];
const a = amounts(PO.revisedUnitCents);

/** The happy path, in eight chapters. Each named step can carry a camera focus (scenario/camera.ts). */
export const scenes: Scene[] = [
  { id: 0, title: "The 10MA", durationMs: 11000, layout: ["products", "money", "rules"], grid: { cols: "460fr 330fr 330fr" },
    line: "Astro makes three robots. The 10MA needs one AM-17 actuator motor.", status: "Stockbot ready", beats: [
    [600, { type: "wallet" }],
    [1000, proof("wallet_created")],
    [2200, proof("policy_set")],
    [3400, { type: "product", id: "kip" }, { clickTarget: tab("kip") }],
    [4200, { type: "product", id: "porter" }, { clickTarget: tab("porter") }],
    [5200, { type: "product", id: "10ma" }, step("Product switch", "products.figure", 1.5, { clickTarget: tab("10ma") })],
    [8000, { type: "highlight", part: MOTOR_PART }, step("Motor highlight", "products.motor", 2.2)],
  ] },
  { id: 1, title: "The gap", durationMs: 10000, layout: ["stock", "orders"], grid: { cols: "560fr 440fr" },
    line: `${formatInt(demand.robotsOrdered)} robots ordered for ${needBy}, motors for ${formatInt(demand.motorsOnHand)}.`, status: "Checking stock", enter: "Check stock against orders", beats: [
    [300, { type: "demand", ordered: 200, shippedOut: 0, motorsOnHand: demand.motorsOnHand }],
    [900, { type: "demand", ordered: 380, shippedOut: 0, motorsOnHand: demand.motorsOnHand }],
    [1500, { type: "demand", ordered: demand.robotsOrdered, shippedOut: 0, motorsOnHand: demand.motorsOnHand }, step("The gap", "stock.shortfall", 1.8)],
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
    line: `Ultra Motion is out for 6 weeks. ${PO.quantity} robots would miss ${needBy}.`, status: "Stockbot needs you", enter: "Ask Ultra Motion for motors", beats: [
    [500, msg({ channel: "email", direction: "in", from: "orders@ultra-motion.example", kind: "Re: PO 1037, AM-17 actuator motors", subject: "Re: PO 1037, AM-17 actuator motors", time: "08:14",
      text: "We are out of the AM-17 for 6 weeks. Our next build ships 15 Dec.",
      reading: `No AM-17 before 15 Dec, a day after the ${needBy} ship date. ${PO.quantity} robots would miss it. Stockbot can source a replacement.` }), step("Ultra's reply", "inbox.reply", 1.7)],
    [3500, bot(`Ultra Motion is out for 6 weeks. ${formatInt(demand.robotsOrdered)} robots ordered, motors for ${formatInt(demand.motorsOnHand)}. Start sourcing ${PO.quantity} AM-17s?`, { refersTo: "inbox" })],
    [6000, buyer("Start sourcing"), { id: "start_sourcing", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Tap Start sourcing in the Inbox panel.", action: "Start sourcing", tap: "inbox.start" }],
  ] },
  { id: 3, title: "Search", durationMs: 16000, layout: ["map", "products"], grid: { cols: "620fr 400fr" },
    line: `Stockbot searches for an AM-17 that fits the 10MA and arrives by ${needBy}. Two fit.`, status: "Searching 5 suppliers", enter: "Search for a replacement motor", beats: [
    [300, stage("sourcing")],
    [700, { type: "search", query: `AM-17 actuator motor · NEMA 17 · 6 mm shaft · 48 V · ${PO.quantity} by ${needBy}` }, step("Search typed", "map.search", 1.8, { holdMs: 2600 })],
    [1200, proof("inference_attestation")],
    [2800, explain("enclave"), step("Private inference", "developer.attestation", 1.5)],
    [4800, explain("attestation"), step("Attestation", "developer.attestation", 1.8)],
    [6800, explain(null)],
    [7200, { type: "fitment", supplierId: "haoyun" }, step("Pins resolve", "map.results", 1.4, { holdMs: 2600 })],
    [7500, { type: "fitment", supplierId: "quickship" }],
    [7800, { type: "fitment", supplierId: "kansai" }],
    [8100, { type: "fitment", supplierId: "rheinwerk" }],
    [8400, { type: "fitment", supplierId: "huaxin" }],
    [11000, bot(`Haoyun Precision and QuickShip Motion fit every spec and deliver before ${needBy}. Kansai fits but delivers on 22 Dec. Rheinwerk is ${capMultiple}x the ceiling; Huaxin misses 3 BOM lines.`, { refersTo: "map" }),
      step("Orange reasons", "map.results.partial", 2.0, { spotlight: true })],
  ] },
  { id: 4, title: "Negotiation", durationMs: 17000, layout: ["inbox", "rules"], grid: { cols: "1fr", rows: "460fr 208fr" }, phone: true, clock: "14:33",
    line: "Haoyun and QuickShip both ask +10%. Your ceiling is 5%.", status: "Negotiating with two suppliers", enter: "Ask both for offers", beats: [
    [300, offer("haoyun", PO.confirmedUnitCents, "+10% urgent fee", "attention")],
    [400, offer("quickship", PO.confirmedUnitCents, "+10% urgent fee", "attention"), step("Offers side by side", "negotiation.threads", 1.3)],
    [1500, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Quote", subject: "PO 1042 quote", time: "14:21", attachment: "quote_1042.pdf",
      text: `All ${PO.quantity} AM-17 by ${needBy}. With the urgent fee the unit price is ${formatUsd(PO.confirmedUnitCents)}, ${pctOver(PO.confirmedUnitCents)}.`, reading: `${pctOver(PO.confirmedUnitCents)} over base. Your ceiling is 5%.` })],
    [1600, { type: "price_quote", unitCents: PO.confirmedUnitCents, from: "Haoyun Precision" }],
    [2400, msg({ channel: "email", direction: "in", from: quickshipMail, kind: "Quote", subject: "AM-17 quote", time: "14:24",
      text: `We can ship fast. ${formatUsd(quickshipOffer.unitCents)} a motor, ${pctOver(quickshipOffer.unitCents)} for urgent delivery.`, reading: `${pctOver(quickshipOffer.unitCents)} over base. Your ceiling is 5%.` })],
    [3400, bot(`Haoyun and QuickShip both ask ${pctOver(PO.confirmedUnitCents)}. Your ceiling is 5%, so I am countering both at ${formatUsd(PO.revisedUnitCents)}.`, { refersTo: "inbox" })],
    [4400, msg({ channel: "email", direction: "out", from: "Stockbot for Astro", to: haoyunMail, kind: "Counter offer · Gmail", subject: "Re: PO 1042 quote", time: "14:31",
      text: `Astro can accept ${formatUsd(PO.revisedUnitCents)} a unit, ${pctOver(PO.revisedUnitCents)}, for all ${PO.quantity} delivered by ${needBy}.`, reading: "Countered inside the 5% ceiling." })],
    [4500, proof("connector_receipt")],
    [5000, msg({ channel: "email", direction: "out", from: "Stockbot for Astro", to: quickshipMail, kind: "Counter offer · Gmail", subject: "Re: AM-17 quote", time: "14:32",
      text: `Astro can accept ${formatUsd(PO.revisedUnitCents)} a unit, ${pctOver(PO.revisedUnitCents)}, for all ${PO.quantity} delivered by ${needBy}.`, reading: "Countered inside the 5% ceiling." })],
    [5600, { type: "refused", kind: "offlist_email", detail: "deals@unknown-broker.example is not on the recipient allowlist" }],
    [5700, proof("refused_email")],
    [7500, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Final offer", subject: "Re: PO 1042 quote", time: "14:52", attachment: "quote_1042_final.pdf",
      text: `Agreed. ${formatUsd(PO.revisedUnitCents)} a unit, all ${PO.quantity} by ${needBy}, ${formatUsdShort(a.lockedCents)}. No discount.`, reading: "Exactly at the 5% ceiling. Everything on time." })],
    [7600, { type: "price_quote", unitCents: PO.revisedUnitCents, from: "Haoyun Precision" }],
    [7700, offer("haoyun", PO.revisedUnitCents, `All ${PO.quantity} by ${needBy} at ${pctOver(PO.revisedUnitCents)}, ${formatUsdShort(a.lockedCents)}`, "success"), step("Haoyun's offer", "negotiation.haoyun", 1.9)],
    [9500, msg({ channel: "email", direction: "in", from: quickshipMail, kind: "Final offer", subject: "Re: AM-17 quote", time: "14:55",
      text: `We can send ${quickshipOffer.nowQty} now at ${formatUsd(quickshipOffer.unitCents)} and the other ${quickshipOffer.laterQty} after ${needBy}, with ${quickshipOffer.nextOrderDiscountPercent}% off your next order.`,
      reading: `${pctOver(quickshipOffer.unitCents)}, over the ceiling. ${quickshipOffer.laterQty} motors late.` })],
    [9600, offer("quickship", quickshipOffer.unitCents, `${quickshipOffer.nowQty} now at ${pctOver(quickshipOffer.unitCents)}, ${quickshipOffer.laterQty} after ${needBy}, over the ceiling`, "alert")],
    [11000, bot(recommendation, { refersTo: "inbox", chips: ["Choose Haoyun", "Choose QuickShip"] }), step("Recommendation", "negotiation.compare", 1.6)],
    [13500, buyer("Choose Haoyun"), { id: "pick_supplier", who: "Luca", panels: ["inbox"], status: "Stockbot needs you", prompt: "Haoyun ships all 50 on time within the ceiling. QuickShip is over it and late on 12.", action: "Choose Haoyun" }],
    [14500, bot(`Haoyun it is. Sending PO ${PO.number} for two approvals.`)],
  ] },
  { id: 5, title: "Approve and commit", durationMs: 14000, layout: ["rules", "money"], grid: { cols: "416fr 388fr" }, phone: true, clock: "14:58",
    line: `Two people sign, then ${formatUsdShort(a.lockedCents)} is committed to PO ${PO.number}.`, status: "Waiting on approvals", enter: `Send PO ${PO.number} for approval`, beats: [
    [300, stage("approval")],
    [1000, bot(`PO ${PO.number}: ${PO.quantity} motors from Haoyun at ${formatUsd(PO.revisedUnitCents)}, a new supplier, over the $10K cap. 2 approvals needed.`, { refersTo: "rules", card: "approval" }),
      step("Approvals", "rules.approvals", 1.8, { holdMs: 2400 })],
    [2800, { type: "approval", by: "Luca", time: "14:56" }, { id: "approve_luca", who: "Luca", panels: ["rules"], status: "Waiting on Luca", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Luca" }],
    [2900, proof("approval_luca")],
    [4400, bot(`Jordan, PO ${PO.number} needs your signature. Luca signed at 14:56.`, { refersTo: "rules", card: "sign", to: "Jordan" })],
    [6200, { type: "approval", by: "Jordan", time: "14:58" }, { id: "approve_jordy", who: "Jordan", panels: ["rules"], status: "Waiting on Jordan", prompt: `Reply YES on Telegram to sign PO ${PO.number}.`, action: "YES, approve as Jordan" }],
    [6300, proof("approval_jordy")],
    [6600, stage("confirmed")],
    [8000, { type: "lock_funds" }, step("Funds move", "money.escrow", 2.0)],
    [8100, stage("funds_locked")],
    [9500, proof("escrow_wallet", `Committed for PO ${PO.number}: ${scaled(a.lockedCents)}`)],
    [10500, explain("wallet"), step("Order wallet", "developer.policy", 1.6)],
  ] },
  { id: 6, title: "Shenzhen to the Chicago dock", durationMs: 21000, layout: ["map", "money"], grid: { cols: "560fr 440fr" }, phone: true, clock: "08:41",
    line: `The advance goes as the motors leave Shenzhen. At the dock, ${RECEIVED} of ${PO.quantity}: the balance pays for what arrived.`, status: `Tracking shipment ${PO.number}`, enter: "Ship from Shenzhen", beats: [
    [300, { type: "shipment", progress: 0, docs: docs("working") }],
    [400, { type: "checkpoint", id: "packed" }],
    [1000, signal("bill_of_lading")],
    [1100, proof("signal_bill_of_lading")],
    [2200, signal("export_cleared")],
    [2300, proof("signal_export_cleared")],
    [2400, { type: "shipment", progress: 0, docs: docs("done") }],
    [3000, { type: "release", stage: "advance", to: HAOYUN }, step("Advance released", "money.advance", 1.8)],
    [3100, proof("advance_payout", `Advance paid to Haoyun on Base Sepolia for PO ${PO.number}: ${scaled(a.advanceCents)}`)],
    [4600, { type: "checkpoint", id: "handover" }],
    [4800, stage("shipped")],
    [5000, { type: "checkpoint", id: "departed" }],
    [5200, { type: "shipment", progress: 0.3, docs: docs("done") }],
    [6200, { type: "shipment", progress: 0.7, docs: docs("done") }],
    [7200, { type: "shipment", progress: 0.98, docs: docs("done") }],
    [7300, { type: "checkpoint", id: "arrived" }],
    [7600, signal("import_cleared")],
    [7700, proof("signal_import_cleared")],
    [7800, { type: "checkpoint", id: "customs" }],
    [8000, stage("dock")],
    [8100, { type: "shipment", progress: 1, docs: docs("done") }],
    [8200, { type: "layout", panels: ["orders", "money"] }],
    [8600, bot("Truck at dock 3. Send a photo of the packing slip.", { refersTo: "orders" })],
    [9200, buyer("Packing slip", "packing_slip"), { id: "packing_slip", who: "Luca", panels: ["orders"], status: "At the dock, needs you", prompt: "The shipment is at the dock. Photograph the packing slip.", action: "Send packing slip photo" }],
    [9300, { type: "checkpoint", id: "dock" }],
    [11000, { type: "dock", receivedQty: RECEIVED }, step("Dock count", "dock.count", 2.0)],
    [11100, signal("dock_count")],
    [11200, proof("dock_attestation", `Attested dock count: ${RECEIVED} of ${PO.quantity}, balance ${formatUsdShort(a.balanceCents)}`)],
    [12200, explain("signed"), step("Signed result", "developer.signed", 1.7)],
    [14200, explain(null)],
    [14800, { type: "release", stage: "balance", to: HAOYUN }, step("Balance released", "money.payout", 1.8)],
    [14900, stage("paid")],
    [15000, proof("intents_payout", `Balance paid to Haoyun on Base Sepolia for PO ${PO.number}: ${scaled(a.balanceCents)}`)],
    [17000, bot(`${RECEIVED} of ${PO.quantity} arrived. ${formatUsdShort(a.balanceCents)} paid to Haoyun; ${formatUsdShort(a.holdCents)} held for the last ${PO.quantity - RECEIVED}.`, { refersTo: "money" })],
  ] },
  { id: 7, title: "Paid", durationMs: 14000, layout: ["money", "stock"], grid: { cols: "1fr 1fr" },
    line: "Haoyun is paid for what arrived. A payment to a lookalike address is refused.", status: `PO ${PO.number} settled`, beats: [
    [500, { type: "release", stage: "balance", to: WRONG }, step("Paid and refused", "money.payout", 1.8)],
    [600, proof("refused_release")],
    [3000, { type: "reveal", what: "protected" }, step("What this protected", "money.protected", 1.5)],
    [5500, explain("payout"), step("Wallet lifecycle", "money.lifecycle", 1.6)],
    [8000, explain(null)],
    [8500, { type: "end_card" }],
    [8700, stage("closed")],
    [11500, { type: "reclaim" }],
    [12000, { type: "close_wallet" }],
    [12100, proof("wallet_closed")],
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
      // A human moment is a tap: on its own button, else on the phone's.
      const clickTarget = extra?.clickTarget ?? (gate ? gate.tap ?? PHONE_TAP : undefined);
      out.push({ atMs: start + at, scene: sc.id, ev, ...(gate ? { gate } : {}), ...(extra?.step ? { step: extra.step } : {}), ...(extra?.focus ? { focus: extra.focus } : {}), ...(clickTarget ? { clickTarget } : {}) });
    }
    start += sc.durationMs;
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
const renumber = (list: Scene[]): Scene[] => list.map((sc, id) => ({ ...sc, id }));

/** Chapter 5 when Haoyun will not come down either: it holds at +10%, like QuickShip. */
export const HOLD_UNIT = PO.confirmedUnitCents;
const NEGOTIATION = 4;
const negotiationHold: Scene = {
  ...scenes[NEGOTIATION], line: "Haoyun and QuickShip both hold at +10%. Your ceiling is 5%.",
  beats: [
    ...scenes[NEGOTIATION].beats.filter(([at]) => at < 7500),
    [7500, msg({ channel: "email", direction: "in", from: haoyunMail, kind: "Final offer", subject: "Re: PO 1042 quote", time: "14:52",
      text: `All ${PO.quantity} by ${needBy}, but our urgent fee stands: ${formatUsd(HOLD_UNIT)} a unit.`, reading: `Holds at ${pctOver(HOLD_UNIT)}, over the 5% ceiling.` })],
    [7600, { type: "price_quote", unitCents: HOLD_UNIT, from: "Haoyun Precision" }],
    [7700, offer("haoyun", HOLD_UNIT, `Holds at ${pctOver(HOLD_UNIT)}, over your 5% ceiling`, "attention"), step("Haoyun's offer", "negotiation.haoyun", 1.9)],
    ...scenes[NEGOTIATION].beats.filter(([at]) => at >= 9500 && at < 11000),
    [11000, bot(`Both hold at ${pctOver(HOLD_UNIT)}, over your 5% ceiling. Nothing has been committed.`, { refersTo: "inbox" })],
  ],
};

/** Bad path: the PO stops before any money moves, and says why. */
const onHold: Scene = {
  id: 0, title: "On hold", durationMs: 9000, layout: ["rules", "money"], grid: { cols: "400fr 312fr" }, phone: true, clock: "15:10",
  line: "Both contenders hold at +10%. Evernear stops before any money moves.", status: "On hold, needs you",
  beats: [
    [400, bot(`Haoyun holds at ${formatUsd(HOLD_UNIT)}, ${pctOver(HOLD_UNIT)} over base. QuickShip is late and over too. Your ceiling is 5%.`, { refersTo: "rules" })],
    [1200, bot(`Nothing has been committed or paid. PO ${PO.number} is on hold.`, { chips: ["Raise ceiling to 10%", "End the order", "Keep waiting"] })],
    [2000, { type: "lock_funds" }],
    [4000, { type: "end_card" }, { id: "on_hold", who: "Luca", panels: ["rules"], status: "On hold, needs you", prompt: "Raise the ceiling with two approvals, or end the order.", action: "End the order" }],
  ],
};

/** Adjustment: you raise the ceiling and the motor cap for this PO; two people sign. */
const adjustment: Scene = {
  id: 0, title: "Adjustment", durationMs: 10000, layout: ["rules", "orders"], grid: { cols: "416fr 296fr" }, phone: true, clock: "15:16",
  line: `You raise the ceiling to 10% with two approvals. Haoyun's all-${PO.quantity} offer goes through at ${formatUsd(HOLD_UNIT)}.`, status: `Raising the ceiling for PO ${PO.number}`, enter: "Raise the ceiling to 10%",
  beats: [
    [600, bot(`Raise the ceiling to 10% for PO ${PO.number}? Haoyun holds at ${formatUsd(HOLD_UNIT)} for all ${PO.quantity} on time. Two approvals.`, { refersTo: "rules" })],
    [2000, buyer("Raise ceiling to 10%")],
    [2500, { type: "approval", by: "Luca", time: "15:12", scope: "limit" }, { id: "raise_limit", who: "Luca", panels: ["rules"], status: "Waiting on Luca", prompt: `Raise the ceiling to 10% for PO ${PO.number}? Haoyun holds at ${formatUsd(HOLD_UNIT)}.`, action: "Raise to 10%" }],
    [4500, bot("Jordan, please approve the higher ceiling.", { refersTo: "rules", to: "Jordan" })],
    [6500, { type: "approval", by: "Jordan", time: "15:13", scope: "limit" }, { id: "approve_raise", who: "Jordan", panels: ["rules"], status: "Waiting on Jordan", prompt: `Approve the 10% ceiling for PO ${PO.number}.`, action: "YES, approve as Jordan" }],
    [6600, { type: "rules", patch: { priceChangeLimitBps: 1000, motorCapCents: HOLD_UNIT } }],
    [7500, bot(`Ceiling raised to 10% for PO ${PO.number}. Luca and Jordan signed.`, { refersTo: "rules", card: "commit" })],
  ],
};

/** The happy path's later chapters, with the amounts for another unit price. */
function atUnit(sc: Scene, unitCents: number): Scene {
  const x = amounts(unitCents);
  return {
    ...sc,
    ...(sc.title === "Approve and commit" ? { line: `Two people sign, then ${formatUsdShort(x.lockedCents)} is committed to PO ${PO.number}.` } : {}),
    beats: sc.beats.map((b) => {
      const [at, ev] = b;
      if (ev.type === "proof" && ev.key === "escrow_wallet") return [at, proof("escrow_wallet", `Committed for PO ${PO.number}: ${scaled(x.lockedCents)}`), ...b.slice(2)] as typeof b;
      if (ev.type === "proof" && ev.key === "advance_payout") return [at, proof("advance_payout", `Advance paid to Haoyun on Base Sepolia for PO ${PO.number}: ${scaled(x.advanceCents)}`), ...b.slice(2)] as typeof b;
      if (ev.type === "proof" && ev.key === "dock_attestation") return [at, proof("dock_attestation", `Attested dock count: ${RECEIVED} of ${PO.quantity}, balance ${formatUsdShort(x.balanceCents)}`), ...b.slice(2)] as typeof b;
      if (ev.type === "proof" && ev.key === "intents_payout") return [at, proof("intents_payout", `Balance paid to Haoyun on Base Sepolia for PO ${PO.number}: ${scaled(x.balanceCents)}`), ...b.slice(2)] as typeof b;
      if (ev.type === "message" && ev.message.card === "approval") return [at, bot(`PO ${PO.number}: ${PO.quantity} motors from Haoyun at ${formatUsd(unitCents)}, a new supplier, over the $10K cap. 2 approvals needed.`, { refersTo: "rules", card: "approval" }), ...b.slice(2)] as typeof b;
      if (ev.type === "message" && ev.message.text.startsWith(`${RECEIVED} of`)) return [at, bot(`${RECEIVED} of ${PO.quantity} arrived. ${formatUsdShort(x.balanceCents)} paid to Haoyun; ${formatUsdShort(x.holdCents)} held for the last ${PO.quantity - RECEIVED}.`, { refersTo: "money" }), ...b.slice(2)] as typeof b;
      return b;
    }),
  };
}

export type ScenarioId = "happy" | "standoff" | "adjusted";
export interface Scenario { id: ScenarioId; title: string; blurb: string; scenes: Scene[]; timeline: Beat[]; totalMs: number }
function scenario(id: ScenarioId, title: string, blurb: string, list: Scene[]): Scenario {
  const sc = renumber(list);
  return { id, title, blurb, scenes: sc, timeline: buildTimeline(sc), totalMs: sc.reduce((t, x) => t + x.durationMs, 0) };
}

const adj = amounts(HOLD_UNIT);
export const SCENARIOS: Record<ScenarioId, Scenario> = {
  happy: scenario("happy", "Happy path", `Haoyun ships all ${PO.quantity} at +5%; an advance on departure, the balance for the ${RECEIVED} that arrived.`, scenes),
  standoff: scenario("standoff", "Bad path", "Both contenders hold at +10%, over your 5% ceiling. Evernear stops before any money moves.",
    [...scenes.slice(0, NEGOTIATION), negotiationHold, onHold]),
  adjusted: scenario("adjusted", "Bad path, adjusted", `Same stand-off; you raise the ceiling to 10% with two approvals and Haoyun's all-${PO.quantity} offer goes through at ${formatUsdShort(adj.lockedCents)}.`,
    [...scenes.slice(0, NEGOTIATION), negotiationHold, adjustment, ...scenes.slice(NEGOTIATION + 1).map((sc) => atUnit(sc, HOLD_UNIT))]),
};

/** The adjusted scenario's Adjustment chapter, where the bad path's "Raise ceiling to 10%" lands. */
export const ADJUSTMENT_SCENE = 5;

export const totalDurationMs = SCENARIOS.happy.totalMs;
export const timeline: Beat[] = SCENARIOS.happy.timeline;
