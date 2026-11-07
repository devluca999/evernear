// Record mode. A ProofSink that writes each real proof from a rehearsal to
// fixtures/recorded/<key>.json, keyed like fixtures/synthetic/proofs.json, and regenerates
// fixtures/recorded/index.ts so the client can import recordings statically.
// Secrets never reach disk: every proof is redacted again here (the adapters do not all
// redact), scrubbed of anything shaped like an OutLayer key, scrubbed of every known
// secret value, and the final bytes are checked once more before the write.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProofInput, ProofSink } from "../../convex/near/http";

/** The scene proof keys, in scene order. Same keys as fixtures/synthetic/proofs.json. */
export const PROOF_KEYS = [
  "wallet_created", "policy_set", "payment_receipt", "inference_attestation", "approval_luca", "approval_jordy",
  "connector_receipt", "refused_email", "escrow_wallet", "signal_bill_of_lading", "signal_export_cleared", "advance_payout",
  "signal_import_cleared", "dock_attestation", "intents_payout", "refused_release", "wallet_closed",
] as const;

/** The release signals that are scene proofs. The dock count is recorded as `dock_attestation` by the dock check. */
const SIGNAL_PROOFS: Record<string, ProofKey> = { bill_of_lading: "signal_bill_of_lading", export_cleared: "signal_export_cleared", import_cleared: "signal_import_cleared" };
export type ProofKey = (typeof PROOF_KEYS)[number];

/** Which scene proof an adapter call produces. Null for calls that are not a scene proof. */
export function keyFor(p: ProofInput): ProofKey | null {
  const [file, fn] = p.codePath.split("#");
  const r = (p.response ?? {}) as { stage?: unknown; event?: unknown };
  switch (`${file.replace(/^.*\//, "")}#${fn}`) {
    case "custody.ts#register": return "wallet_created";
    case "custody.ts#policy": return "policy_set";
    case "custody.ts#payUsdc": return p.kind === "payment_receipt" ? "payment_receipt" : null;
    case "inference.ts#read": return "inference_attestation";
    case "approval.ts#submit":
      if (/luca/i.test(p.label)) return "approval_luca";
      if (/jordan/i.test(p.label)) return "approval_jordy";
      return null;
    case "gmail.ts#send": return p.kind === "refusal" ? "refused_email" : p.kind === "connector_receipt" ? "connector_receipt" : null;
    case "escrow.ts#lock": return p.kind === "escrow" ? "escrow_wallet" : null;
    case "escrow.ts#policyRefusal": return p.kind === "refusal" ? "refused_release" : null;
    // The advance and the balance, told apart by the stage the adapter writes into the response.
    // The engine's own refusal (a missing signal, a wrong address) is not a scene proof.
    case "escrow.ts#release": return p.kind === "payout" ? (r.stage === "advance" ? "advance_payout" : "intents_payout") : null;
    case "tracking.ts#signal": return p.kind === "signal" && typeof r.event === "string" ? SIGNAL_PROOFS[r.event] ?? null : null;
    case "escrow.ts#close": return p.kind === "wallet" ? "wallet_closed" : null; // not the revoke and freeze rows before it
    case "dockcheck.ts#verify": return "dock_attestation";
    default: return null;
  }
}

/** Wider than http.ts `redact`: also camelCase names and auth headers. */
const SECRET_FIELD = /(api_?key|check_?key|payment_?key|secret|bot_?token|authorization|private_?key|signing_?key|seed_?phrase)$/i;
/** An OutLayer wallet key, or a payment key `owner:nonce:secret`. */
const SECRET_SHAPES = [/wk_[0-9a-f]{16,}/gi, /\b(naa|ngt)_[A-Za-z0-9_-]{16,}/g, /\b[\w.-]+:\d+:[A-Za-z0-9_-]{16,}/g];

export function scrub<T>(v: T, secrets: string[]): T {
  const known = secrets.filter((s) => s && s.length >= 6);
  const clean = (s: string) => {
    let out = s;
    for (const k of known) out = out.split(k).join("redacted");
    for (const re of SECRET_SHAPES) out = out.replace(re, "redacted");
    return out;
  };
  return JSON.parse(JSON.stringify(v, (k, val) => {
    if (SECRET_FIELD.test(k) && val !== null && typeof val !== "object") return "redacted";
    return typeof val === "string" ? clean(val) : val;
  }));
}

export interface RecordedProof {
  kind: string; label: string; call: string; codePath: string; network: ProofInput["network"];
  hash: string; explorerUrl: string | null; response: unknown; replay: true; synthetic: false; recordedAt: string;
}

export function toRecorded(p: ProofInput, secrets: string[], now = new Date()): RecordedProof {
  const r: RecordedProof = {
    kind: p.kind, label: p.label, call: p.call, codePath: p.codePath, network: p.network,
    hash: p.hash, explorerUrl: p.explorerUrl ?? null, response: p.response, replay: true, synthetic: false, recordedAt: now.toISOString(),
  };
  const out = scrub(r, secrets);
  const text = JSON.stringify(out);
  for (const s of secrets) if (s && s.length >= 6 && text.includes(s)) throw new Error("refusing to record: a secret survived redaction");
  return out;
}

export function indexSource(keys: string[]): string {
  const sorted = [...new Set(keys)].filter((k) => (PROOF_KEYS as readonly string[]).includes(k)).sort();
  const lines = [
    "// Generated by scripts/rehearse/recorder.ts during `RECORD=1 npm run rehearse`. Do not edit by hand.",
    "// Real testnet recordings, shown on screen as \"replay\". Keys match fixtures/synthetic/proofs.json.",
    ...sorted.map((k) => `import ${k} from "./${k}.json";`),
    "",
    sorted.length ? `export const recorded: Record<string, unknown> = { ${sorted.join(", ")} };` : "export const recorded: Record<string, unknown> = {};",
    "",
  ];
  return lines.join("\n");
}

export interface Recorder {
  sink: ProofSink;
  /** Records under an explicit key, for proofs that no adapter call maps to. */
  as(key: ProofKey): ProofSink;
  written: ProofKey[];
  skipped: ProofInput[];
}

/** With enabled false (RECORD unset) the sink only keeps what it saw and writes nothing. */
export function createRecorder(o: { dir: string; enabled: boolean; secrets: string[]; log?: (s: string) => void }): Recorder {
  const written: ProofKey[] = [];
  const skipped: ProofInput[] = [];
  const write = (key: ProofKey, p: ProofInput) => {
    if (p.synthetic) throw new Error(`refusing to record a synthetic proof as ${key}`);
    if (p.network === "mainnet") throw new Error(`refusing to record a mainnet proof during a testnet rehearsal (${key})`);
    const rec = toRecorded(p, o.secrets);
    if (!o.enabled) { o.log?.(`seen ${key} (RECORD is not 1, nothing written)`); return; }
    mkdirSync(o.dir, { recursive: true });
    writeFileSync(join(o.dir, `${key}.json`), JSON.stringify(rec, null, 2) + "\n");
    const keys = readdirSync(o.dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    writeFileSync(join(o.dir, "index.ts"), indexSource(keys));
    written.push(key);
    o.log?.(`recorded ${key}`);
  };
  const sink: ProofSink = (p) => {
    const key = keyFor(p);
    if (!key) { skipped.push(p); return; }
    write(key, p);
  };
  return { sink, as: (key) => (p) => write(key, p), written, skipped };
}
