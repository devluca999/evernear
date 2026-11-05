import type { FitmentResult } from "../engine/types";
import type { Escrow } from "../engine/escrow";
import type { Stage } from "./stages";
import type { Checkpoint } from "./shipment";

export type PanelId = "products" | "demand" | "map" | "inbox" | "bom" | "rules";

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
  card?: "approval";
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
}

export type Event =
  | { type: "scene"; id: number; layout: PanelId[] }
  | { type: "layout"; panels: PanelId[] }
  | { type: "stage"; to: Stage }
  | { type: "routine"; to: Stage }
  | { type: "message"; message: Message }
  | { type: "proof"; key: string }
  | { type: "demand"; ordered: number; shippedOut: number; motorsOnHand: number }
  | { type: "wallet" }
  | { type: "fitment"; supplierId: string }
  | { type: "approval"; by: string }
  | { type: "price_quote"; unitCents: number; from: string }
  | { type: "refused"; kind: string; detail: string }
  | { type: "lock_funds" }
  | { type: "shipment"; progress: number; docs: { name: string; state: "done" | "working" | "problem" }[] }
  | { type: "checkpoint"; id: string }
  | { type: "dock"; receivedQty: number }
  | { type: "release"; to: string }
  | { type: "reclaim" }
  | { type: "phone"; open: boolean }
  | { type: "end_card" };

/** A beat that waits for the viewer: the clock stops just before it until they click. */
export interface Gate { id: string; who: "Luca" | "Jordy"; prompt: string; action: string }

export interface Beat {
  atMs: number;
  scene: number;
  ev: Event;
  gate?: Gate;
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
  routine: { stage: Stage; approvals: number; totalCents: number };
  demand: { ordered: number; shippedOut: number; motorsOnHand: number; series: number[]; headline: string };
  messages: Message[];
  proofs: Proof[];
  fitment: FitmentResult[];
  requiredApprovals: number;
  approvals: { by: string; atMs: number }[];
  price: { originalCents: number; limitBps: number; history: { unitCents: number; bps: number; pass: boolean; from: string }[] };
  escrow: Escrow | null;
  shipment: { progress: number; docs: { name: string; state: "done" | "working" | "problem" }[]; checkpoints: Checkpoint[] };
  dock: { receivedQty: number; orderedQty: number; releaseCents: number; holdCents: number } | null;
  refused: { kind: string; detail: string; atMs: number }[];
  endCard: boolean;
}
