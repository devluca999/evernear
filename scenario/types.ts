import type { FitmentResult, Policy } from "../engine/types";
import type { Escrow } from "../engine/escrow";
import type { Stage } from "./stages";
import type { Checkpoint } from "./shipment";

export type PanelId = "products" | "stock" | "orders" | "inbox" | "map" | "rules" | "money";

export interface Message {
  id: string;
  channel: "telegram" | "email";
  direction: "in" | "out";
  from: string;
  to?: string;
  subject?: string;
  text: string;
  photo?: string;
  /** The agent's reading of an inbound email. */
  reading?: string;
  refersTo?: PanelId;
  /** A chat card returned with the message. */
  card?: "approval" | "sign" | "release" | "commit";
  /** Quick replies shown under a bot message. */
  chips?: string[];
  /** A file attached to an email. */
  attachment?: string;
  /** Clock time shown on an email (story time). */
  time?: string;
  /** Short subject line for an email row. */
  kind?: string;
  /** When it arrived in the story (ms from the start), set by the replay. */
  atMs?: number;
}

export interface Proof {
  id: string;
  scene: number;
  kind: string;
  label: string;
  call: string;
  codePath: string;
  network: "testnet" | "mainnet" | "offchain";
  hash: string;
  explorerUrl: string | null;
  response: unknown;
  replay: boolean;
  synthetic: boolean;
  /** When the step happens in the demo, ms from the start (replay). */
  atMs?: number;
  /** When a live step really ran, wall-clock ms (live mode). */
  wallMs?: number;
  /** A real row: the scene proof it stands in for (escrow_wallet, intents_payout...). */
  key?: string;
  /** The story date the step happens on (3 Nov, 5 Nov, 11 Nov, 11 Dec). */
  day?: string;
  /** A money step under way whose transaction has not landed yet. */
  pending?: boolean;
}

export type Event =
  | { type: "scene"; id: number; layout: PanelId[] }
  | { type: "layout"; panels: PanelId[] }
  | { type: "stage"; to: Stage }
  | { type: "routine"; to: Stage }
  | { type: "message"; message: Message }
  | { type: "proof"; key: string; label?: string }
  /** The rules change mid-story (an adjustment two people approved). */
  | { type: "rules"; patch: { priceChangeLimitBps?: number; motorCapCents?: number } }
  | { type: "demand"; ordered: number; shippedOut: number; motorsOnHand: number }
  | { type: "wallet" }
  | { type: "fitment"; supplierId: string }
  | { type: "approval"; by: string; time: string; scope?: "po" | "limit" }
  | { type: "price_quote"; unitCents: number; from: string }
  | { type: "refused"; kind: string; detail: string }
  | { type: "lock_funds" }
  | { type: "shipment"; progress: number; docs: { name: string; state: "done" | "working" | "problem" }[] }
  | { type: "checkpoint"; id: string }
  | { type: "dock"; receivedQty: number }
  /** A release from the order wallet: a stage of the two-stage release (amount computed by the engine). */
  | { type: "release"; to: string; stage: import("../engine/escrow").Stage }
  /** A shipment signal arrives (bill of lading, export or import clearance, the attested dock count). */
  | { type: "signal"; id: import("../engine/escrow").SignalId }
  /** Money card: show what the two-stage escrow protected. */
  | { type: "reveal"; what: "protected" }
  | { type: "reclaim" }
  | { type: "phone"; open: boolean }
  | { type: "end_card" }
  /** Products: which product the card shows, and the part it highlights. */
  | { type: "product"; id: string }
  | { type: "highlight"; part: string }
  /** Map: the search Stockbot types to find a replacement part. */
  | { type: "search"; query: string }
  /** Negotiation: a supplier's offer, shown side by side with the others. */
  | { type: "offer"; supplierId: string; unitCents: number; note: string; tone: "success" | "attention" | "alert" }
  /** An explainer moment opens (an id) or ends (null): the drawer shows what it means. */
  | { type: "explain"; id: import("./explain").ExplainerId | null }
  /** The order's wallet is frozen, the agent's grant revoked; it stays as the receipt. */
  | { type: "close_wallet" };

/** A beat that waits for the viewer: the clock stops just before it until they click. */
export interface Gate {
  id: string; who: "Luca" | "Jordan"; prompt: string; action: string;
  /** The cards that show a "needs you" count while this gate waits. */
  panels?: PanelId[];
  /** The sidebar status line while it waits. */
  status?: string;
  /** The button the presenter cursor taps to answer it (a data-focus id); the phone's button when unset. */
  tap?: string;
}

/**
 * Where the presenter camera looks when a step runs: an element by its `data-focus` id, how far to
 * zoom (1.0 to 2.5), how long to hold, and whether to dim everything else for the hold.
 */
export interface Focus {
  id: string; zoom: number; holdMs?: number; spotlight?: boolean;
  /**
   * What the frame must show, in full, when the camera arrives: text that has to be on the focused
   * element (the camera waits for it before it zooms, and the frame test checks none of it is cut).
   */
  shows: string[];
}

export interface Beat {
  atMs: number;
  scene: number;
  ev: Event;
  gate?: Gate;
  /** The step's name in the focus plan, e.g. "Pins resolve". */
  step?: string;
  focus?: Focus;
  /**
   * The element the presenter cursor clicks before this step's change happens (a data-focus id),
   * when the step is a click in the app: a tab, a button, a tap on the phone. Unset: no click.
   */
  clickTarget?: string;
  /**
   * A step close behind its chapter's start: it plays with the press that enters the chapter, so
   * that press never lands on a card with nothing new on it.
   */
  rides?: boolean;
}

export interface WorkspaceState {
  t: number;
  scene: number;
  stage: Stage;
  layout: PanelId[];
  phoneOpen: boolean;
  drawer: Proof | null;
  pulse: PanelId | null;
  wallet: { owner: string; agentKeyCapCents: number } | null;
  routine: { stage: Stage; approvals: number; totalCents: number; held?: string };
  demand: { ordered: number; shippedOut: number; motorsOnHand: number; series: number[]; headline: string };
  messages: Message[];
  proofs: Proof[];
  fitment: FitmentResult[];
  requiredApprovals: number;
  approvals: { by: string; atMs: number; time: string }[];
  /** Signatures for a rules change on this PO (the adjustment). */
  limitApprovals: { by: string; atMs: number; time: string }[];
  price: { originalCents: number; limitBps: number; history: { unitCents: number; bps: number; pass: boolean; from: string }[] };
  escrow: Escrow | null;
  shipment: { progress: number; docs: { name: string; state: "done" | "working" | "problem" }[]; checkpoints: Checkpoint[] };
  dock: { receivedQty: number; orderedQty: number; releaseCents: number; holdCents: number } | null;
  refused: { kind: string; detail: string; atMs: number }[];
  endCard: boolean;
  /** The rules this replay runs on (seed/astro.ts policy unless the viewer changed them). */
  policy: Policy;
  /** Set when the viewer's rules stop PO 1042: the story freezes there and says why. */
  halted: { atMs: number; scene: number; reason: string } | null;
  /** Products card: the product the story shows, and the part it highlights. */
  product: string | null;
  highlight: string | null;
  /** Map card: the search Stockbot typed. */
  search: string | null;
  /** Offers in hand, one per supplier, latest first replaced. */
  offers: { supplierId: string; unitCents: number; note: string; tone: "success" | "attention" | "alert" }[];
  /** The explainer the drawer is showing, if any. */
  explain: import("./explain").ExplainerId | null;
  /** Shipment signals received so far, each also a proof. */
  signals: import("../engine/escrow").SignalId[];
  /** The Money card shows what the two-stage escrow protected. */
  protectedShown: boolean;
}
