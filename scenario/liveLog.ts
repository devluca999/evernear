// The developer drawer as a live transaction log. Real proof rows (from a live run on Convex, or the
// recorded run in fixtures/recorded/live-run.json for replay) become history entries in story order,
// each with its chapter and story day; every release gate run gets an entry of its own. What an entry
// may link to is decided from its hash alone: a Base Sepolia hash opens Basescan, a NEAR testnet hash
// opens NearBlocks, Tidepool's own ids have no public explorer, and a synthetic or refused entry
// never gets a button.
import { story } from "../seed/astro";
import { liveStepOf, type LiveStep } from "./gates";
import type { Beat, Proof } from "./types";

/** A proof row as Convex stores it. */
export interface LiveRow {
  _id: string; at: number; kind: string; label: string; call: string; codePath: string;
  network: Proof["network"]; hash: string; explorerUrl?: string | null; response: unknown; scene: number;
}

const SIGNAL_KEYS = new Set(["bill_of_lading", "export_cleared", "import_cleared"]);

/** Which scene proof a real row stands in for. The advance and the balance are told apart by the stage. */
export function liveKeyOf(p: { codePath: string; kind: string; response?: unknown }): string | null {
  const r = (p.response ?? {}) as { stage?: unknown; event?: unknown };
  if (p.codePath.endsWith("escrow.ts#lock") && p.kind === "escrow") return "escrow_wallet";
  if (p.codePath.endsWith("escrow.ts#policyRefusal") && p.kind === "refusal") return "refused_release";
  if (p.codePath.endsWith("escrow.ts#release") && p.kind === "payout") return r.stage === "advance" ? "advance_payout" : "intents_payout";
  if (p.codePath.endsWith("escrow.ts#close") && p.kind === "wallet") return "wallet_closed";
  if (p.codePath.endsWith("tracking.ts#signal") && p.kind === "signal" && typeof r.event === "string" && SIGNAL_KEYS.has(r.event)) return `signal_${r.event}`;
  return null;
}

const ORDER: LiveStep[] = ["commit", "advance", "pay", "refuse", "reclaim"];
/** The step a row clearly belongs to, or null when it could be part of more than one (a grant, a signal). */
function stepHint(r: LiveRow): LiveStep | null {
  const stage = ((r.response ?? {}) as { stage?: unknown }).stage;
  const ev = ((r.response ?? {}) as { event?: unknown }).event;
  if (/#(open|enroll|fund|lock)$/.test(r.codePath)) return "commit";
  if (r.kind === "payout") return stage === "advance" ? "advance" : "pay";
  if (r.kind === "signal") return ev === "bill_of_lading" || ev === "export_cleared" ? "advance" : "pay";
  if (r.kind === "refusal" && r.codePath.endsWith("#policyRefusal")) return "refuse";
  if (r.kind === "refusal" && stage === "balance") return "refuse";
  if (/#(ownerOnly|reclaim|close)$/.test(r.codePath)) return "reclaim";
  return null;
}

/**
 * Each row's step, in the order the rows landed: a row that names its step keeps it; one that could
 * belong to more than one (a grant, a policy) belongs to the step of the row before it.
 */
export function stepsOf(rows: LiveRow[]): LiveStep[] {
  let cur: LiveStep = ORDER[0];
  return rows.map((r) => (cur = stepHint(r) ?? cur));
}

/** The story date a step happens on, for the drawer: commit, departure, the dock, the deadline. */
const day = (s: string) => s.split(" ").slice(0, 2).join(" ");
export const STORY_DAY: Record<LiveStep, string> = {
  commit: day(story.committedAt), advance: day(story.departedAt), pay: day(story.paidAt), refuse: day(story.paidAt), reclaim: story.deadline,
};

/**
 * Real rows as history entries, in landing order. Each step's entries sit at that step's beat in the
 * timeline (so they merge into the story history in place) and carry its chapter and story day. A
 * payout the release gate sent is preceded by an entry for the gate's own run (its NEAR transaction).
 */
export function liveEntries(rows: LiveRow[], timeline: Beat[], o: { replay: boolean; supplier: string }): Proof[] {
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const steps = stepsOf(sorted);
  const beatOf = (s: LiveStep) => timeline.find((b) => liveStepOf(b, o.supplier) === s);
  const out: Proof[] = [];
  sorted.forEach((r, i) => {
    // A signal sits at its own beat (bill of lading, customs, the dock count); every other row at its step's.
    const ev = (r.response as { event?: unknown } | null)?.event;
    const own = r.kind === "signal" ? timeline.find((x) => x.ev.type === "signal" && x.ev.id === ev) : undefined;
    const b = own ?? beatOf(steps[i]);
    const base = { scene: b?.scene ?? r.scene, atMs: b?.atMs ?? 0, wallMs: r.at, day: STORY_DAY[steps[i]], replay: o.replay, synthetic: false, network: r.network };
    const resp = (r.response ?? {}) as { gate_tx?: unknown; stage?: unknown };
    if (r.kind === "payout" && typeof resp.gate_tx === "string") {
      out.push({ ...base, id: `live:gate:${resp.gate_tx}`, kind: "enclave", label: `Release gate run in OutLayer's enclave: ${resp.stage === "advance" ? "advance" : "balance"}`,
        call: "request_execution on outlayer.testnet", codePath: "worker/release-gate/src/lib.rs", network: "testnet", hash: resp.gate_tx, explorerUrl: null, response: { gate_tx: resp.gate_tx, stage: resp.stage } });
    }
    out.push({ ...base, id: `live:${r._id}`, key: liveKeyOf(r) ?? undefined, kind: r.kind, label: r.label, call: r.call, codePath: r.codePath, hash: r.hash, explorerUrl: r.explorerUrl ?? null, response: r.response });
  });
  return out;
}

/**
 * The drawer's history: the story's proofs up to now, with the ones the real run stands in for left
 * out, and the real entries slotted in at their step's beat. Stable: equal times keep story first.
 */
export function mergeHistory(storyProofs: Proof[], real: Proof[]): Proof[] {
  const covered = new Set(real.map((p) => p.key).filter((k): k is string => !!k));
  const kept = storyProofs.filter((p) => !covered.has(p.id));
  const all = [...kept.map((p, i) => ({ p, k: 0, i })), ...real.map((p, i) => ({ p, k: 1, i }))];
  return all.sort((a, b) => (a.p.atMs ?? 0) - (b.p.atMs ?? 0) || a.k - b.k || a.i - b.i).map((x) => x.p);
}

/** What an entry offers under its title. */
export type ExplorerView =
  | { kind: "button"; label: "View on Basescan" | "View on NearBlocks"; href: string; network: string; short: string }
  | { kind: "confirming"; network: string }
  | { kind: "text"; text: string };

const BASE_TX = /^0x[0-9a-f]{64}$/i;
const NEAR_TX = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
export const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

/** From the hash alone: never a link without a real transaction hash. */
export function explorerOf(p: Pick<Proof, "kind" | "id" | "hash" | "synthetic" | "network"> & { pending?: boolean }): ExplorerView {
  if (p.synthetic) return { kind: "text", text: "Synthetic placeholder, nothing sent" };
  if (p.kind === "refusal" || p.id.startsWith("refused")) return { kind: "text", text: "Refused, nothing sent" };
  if (p.pending) return { kind: "confirming", network: p.kind === "payout" ? "Base Sepolia" : "NEAR testnet" };
  if (BASE_TX.test(p.hash)) return { kind: "button", label: "View on Basescan", href: `https://sepolia.basescan.org/tx/${p.hash}`, network: "Base Sepolia", short: shortHash(p.hash) };
  if (NEAR_TX.test(p.hash)) return { kind: "button", label: "View on NearBlocks", href: `https://testnet.nearblocks.io/txns/${p.hash}`, network: "NEAR testnet", short: shortHash(p.hash) };
  if (p.kind === "payout") return { kind: "confirming", network: "Base Sepolia" };
  if (p.kind === "signal") return { kind: "text", text: "Simulated feed, no transaction" };
  return { kind: "text", text: "Tidepool testnet, no public explorer" };
}

/** An entry for a money step that is running and has not landed yet: the drawer shows it as confirming. */
export function pendingEntry(step: LiveStep, timeline: Beat[], supplier: string): Proof | null {
  if (step === "refuse") return null;
  const b = timeline.find((x) => liveStepOf(x, supplier) === step);
  const label = { commit: "Committing to the order wallet", advance: "Advance: the release gate is sending it", pay: "Balance: the release gate is sending it", reclaim: "Returning the held part to Astro" }[step];
  return { id: `live:pending:${step}`, kind: step === "advance" || step === "pay" ? "payout" : "escrow", label, call: "", codePath: "", network: "testnet", hash: "",
    explorerUrl: null, response: null, replay: false, synthetic: false, scene: b?.scene ?? 0, atMs: (b?.atMs ?? 0) + 1, day: STORY_DAY[step], pending: true };
}
