// Evernear explains its own architecture on screen: five moments, each a step with a camera focus,
// the developer drawer open on the matching proof, three plain lines and a small diagram.
// Figures come from the workspace state (the engine), never typed in, so the text follows the deal.
import { formatInt, formatUsdShort } from "../engine/money";
import { PO } from "../seed/astro";
import type { Proof, WorkspaceState } from "./types";

export type ExplainerId = "enclave" | "attestation" | "wallet" | "signed" | "payout";
export type DiagramId = "enclave" | "attestation" | "wallet" | "signed" | "lifecycle";

export interface Explainer {
  id: ExplainerId;
  /** The proof the drawer opens on. */
  proof: string;
  title: string;
  happened: (st: WorkspaceState) => string;
  matters: (st: WorkspaceState) => string;
  whyNear: string;
  diagram: DiagramId;
  /** Facts shown under the lines, read from the state and the proof. */
  facts?: (st: WorkspaceState, p: Proof | null) => { k: string; v: string; tone?: "success" }[];
}

const short = (h: string) => (h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);
const field = (p: Proof | null, key: string): string | null => {
  const walk = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === key && (typeof v === "string" || typeof v === "number")) return String(v);
      const d = walk(v);
      if (d) return d;
    }
    return null;
  };
  return walk(p?.response);
};

export const EXPLAINERS: Record<ExplainerId, Explainer> = {
  enclave: {
    id: "enclave", proof: "inference_attestation", title: "Private inference in an enclave", diagram: "enclave",
    happened: () => "Astro's bill of materials, supplier list and prices were read inside a sealed enclave.",
    matters: () => "The agent searched without exposing who Astro buys from or what it pays.",
    whyNear: "NEAR AI runs models inside enclaves as a standard service.",
  },
  attestation: {
    id: "attestation", proof: "inference_attestation", title: "The attestation", diagram: "attestation",
    happened: () => "The chip signed a note proving the enclave is genuine and naming the exact code inside it.",
    matters: () => "Change one line of code and the fingerprint changes, so the proof covers exactly what touched the data.",
    whyNear: "The attestation is returned with every call and can be checked by anyone.",
    facts: (_st, p) => [
      { k: "Signer", v: field(p, "signer") ?? "Chip maker" },
      { k: "Code fingerprint", v: short(field(p, "fingerprint") ?? "") },
      { k: "Status", v: field(p, "status") ?? "verified", tone: "success" },
    ],
  },
  wallet: {
    id: "wallet", proof: "escrow_wallet", title: "The order's own wallet", diagram: "wallet",
    happened: (st) => `A wallet was created for PO ${PO.number} only, and ${formatUsdShort(st.escrow?.lockedCents ?? 0)} moved into it.`,
    matters: () => "It can pay Haoyun or return to Astro, nothing else. Haoyun sees the money before shipping.",
    whyNear: "Accounts are cheap and instant with built-in limited keys, so one wallet per order is practical.",
    facts: (_st, p) => [
      { k: "Account", v: field(p, "account") ?? `po-${PO.number}` },
      { k: "Can pay", v: "Haoyun Precision, or back to Astro" },
      { k: "Agent key", v: `Capped at ${formatUsdShort(_st.escrow?.lockedCents ?? 0)}, this order only` },
      { k: "Owner", v: "Astro" },
    ],
  },
  signed: {
    id: "signed", proof: "dock_attestation", title: "The signed result", diagram: "signed",
    happened: (st) => st.dock
      ? `The dock check compared the slip to the order in its own enclave and signed it: ${formatInt(st.dock.receivedQty)} of ${formatInt(st.dock.orderedQty)}, release ${formatUsdShort(st.dock.releaseCents)}.`
      : "The dock check compared the slip to the order in its own enclave and signed the result.",
    matters: () => "Only this exact code holds the key that releases the money, so Evernear cannot release without it.",
    whyNear: "The release key is derived inside the enclave from the code's fingerprint.",
    facts: (st, p) => [
      { k: "Order", v: `PO ${PO.number}` },
      { k: "Count", v: st.dock ? `${formatInt(st.dock.receivedQty)} of ${formatInt(st.dock.orderedQty)}` : "" },
      { k: "Release", v: st.dock ? formatUsdShort(st.dock.releaseCents) : "" },
      { k: "Signature", v: short(field(p, "signature") ?? "") },
      { k: "Fingerprint", v: short(field(p, "fingerprint") ?? "") },
    ],
  },
  payout: {
    id: "payout", proof: "intents_payout", title: "Paid on their chain, then the wallet closes", diagram: "lifecycle",
    happened: (st) => {
      const held = st.escrow ? st.escrow.lockedCents - st.escrow.releasedCents - st.escrow.reclaimedCents : 0;
      const missing = st.dock ? st.dock.orderedQty - st.dock.receivedQty : 0;
      return `Haoyun was paid in USDC on its own network; ${formatUsdShort(held)} waits for the last ${formatInt(missing)} motors.`;
    },
    matters: () => "The supplier needs nothing new to get paid, and every dollar is accounted for.",
    whyNear: "NEAR Intents delivers the payment on any chain from one request.",
  },
};

/** The small honest note under the signed result. */
export const SIGNED_NOTE = "Proves the rules ran as written on the evidence given.";

/** Each step in the drawer's timeline gets an icon for its kind. */
export type StepKind = "enclave" | "attestation" | "wallet" | "policy" | "payment" | "refusal";
const KIND_BY_ID: Record<string, StepKind> = {
  wallet_created: "wallet", policy_set: "policy", payment_receipt: "payment", inference_attestation: "enclave",
  approval_luca: "policy", approval_jordy: "policy", refused_email: "refusal", connector_receipt: "payment",
  escrow_wallet: "wallet", dock_attestation: "attestation", intents_payout: "payment", refused_release: "refusal", wallet_closed: "wallet",
};
export function stepKind(p: Pick<Proof, "id" | "kind">): StepKind {
  if (p.kind === "refusal" || p.id.startsWith("refused")) return "refusal";
  return KIND_BY_ID[p.id] ?? (p.kind === "attestation" ? "attestation" : p.kind === "escrow" ? "wallet" : "policy");
}

/** The two or three JSON fields that matter in each proof; the drawer dims the rest. */
const HIGHLIGHT_BY_ID: Record<string, string[]> = {
  inference_attestation: ["signer", "fingerprint", "status"],
  escrow_wallet: ["amount", "account", "address"],
  dock_attestation: ["received", "releaseCents", "signature", "fingerprint"],
  intents_payout: ["amount", "chain", "recipient"],
  refused_release: ["recipient", "code"],
  wallet_closed: ["frozen", "grant", "lifecycle"],
};
const DEFAULT_HIGHLIGHT = ["amount", "address", "to", "destination", "fingerprint"];
export const highlightFor = (id: string) => HIGHLIGHT_BY_ID[id] ?? DEFAULT_HIGHLIGHT;
