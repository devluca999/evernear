// The rehearsal: the scene steps in order, against OutLayer TESTNET, NEAR AI Cloud and the
// Tidepool Agent API testnet (the per-PO escrow), through the same adapters the app uses. With RECORD=1 every scene proof is written to
// fixtures/recorded/ by the recorder. Everything here takes an injected fetch and prompt
// so it is tested with mocks (tests/rehearse.test.ts); scripts/rehearse.ts wires the real ones.
import { Custody, policyHandoffUrl } from "../../convex/near/custody";
import { Approvals, approvalMessage } from "../../convex/near/approval";
import { EscrowAdapter, type ReleasePath, type SignalEvidence } from "../../convex/near/escrow";
import { releaseGateFromEnv } from "../../convex/near/releaseGate";
import { agentApiBase, ownerFromPkcs8, TIDEPOOL_BASE } from "../../convex/near/agentapi";
import { Gmail } from "../../convex/near/gmail";
import { Inference } from "../../convex/near/inference";
import { NEARAI_BASE, OUTLAYER_TESTNET, type Fetch, type ProofSink } from "../../convex/near/http";
import { createEscrow, RELEASE_RULES, type Escrow, type Stage } from "../../engine/escrow";
import { dockEvidence, evidenceFrom, simulatedTracking } from "../../scenarios/tracking";
import { PO, routineReorder } from "../../seed/astro";
import { quotes } from "../../scenarios/suppliers";
import { createRecorder, type ProofKey, type Recorder } from "./recorder";

export type Env = Record<string, string | undefined>;

/** Needed for any rehearsal. Each one is named when missing. */
export const REQUIRED_ENV = [
  "OUTLAYER_API_KEY", // Astro's testnet wk_ key (scripts/rehearse-testnet.mjs writes it)
  "OUTLAYER_NEAR_ACCOUNT", // Astro's testnet account: the escrow owner and refund address
  "OUTLAYER_PAYMENT_KEY", // connector payment key (trial key) for the Gmail connector
  "OUTLAYER_OWNER_ACCOUNT", // account that holds the Gmail connector credential
  "NEARAI_API_KEY", // NEAR AI Cloud private inference
  "REHEARSE_ULTRA_ACCOUNT", // a testnet account standing in for Ultra Motion (registered on usdc.fakes.testnet)
  "REHEARSE_HAOYUN_ACCOUNT", // a testnet account standing in for Haoyun (registered on usdc.fakes.testnet)
  "REHEARSE_HAOYUN_EMAIL", // a real mailbox on the demo domain standing in for Haoyun's sales address
  "AGENT_API_KEY", // Evernear's Tidepool key (naa_)
  "AGENT_OWNER_ACCOUNT_ID", // Astro's dedicated testnet owner (implicit account)
  "AGENT_OWNER_PUBLIC_KEY",
  "AGENT_OWNER_PRIVATE_KEY_PKCS8", // signs each PO account's policy
  "AGENT_TREASURY_ID", // Astro's treasury agent: funds each PO account, takes the held part back
  "HAOYUN_BASE_ADDRESS", // Haoyun's Base Sepolia address, the only payout destination
] as const;

/** Every value that must never be printed or written. */
export const SECRET_ENV = ["OUTLAYER_API_KEY", "OUTLAYER_PAYMENT_KEY", "NEARAI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "INBOUND_EMAIL_SECRET", "AGENT_API_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "HAOYUN_BASE_PRIVATE_KEY", "RELEASE_GATE_WALLET_KEY"];

const ALLOWED_HOSTS = [new URL(OUTLAYER_TESTNET).host, new URL(NEARAI_BASE).host, new URL(TIDEPOOL_BASE).host];

export class RehearsalRefused extends Error {}

export function missingEnv(env: Env): string[] {
  return REQUIRED_ENV.filter((k) => !env[k]?.trim());
}

/** Refuses a mainnet configuration before anything runs. */
export function assertTestnet(env: Env) {
  for (const [k, v] of Object.entries(env)) {
    if (!v || !/^https?:\/\//.test(v)) continue;
    let host: string;
    try { host = new URL(v).host; } catch { continue; }
    if (host === "api.outlayer.ai" || host === "api.agentsonintents.com" || host.includes("mainnet")) throw new RehearsalRefused(`${k} points at a mainnet host (${host}). The rehearsal only talks to testnet hosts.`);
  }
}

/** Every request goes through this: only the OutLayer testnet host and NEAR AI Cloud. */
export function guardFetch(inner: Fetch): Fetch {
  return (url, init) => {
    const host = new URL(url).host;
    if (!ALLOWED_HOSTS.includes(host)) return Promise.reject(new RehearsalRefused(`refused request to ${host}: the rehearsal only talks to ${ALLOWED_HOSTS.join(" and ")}`));
    return inner(url, init);
  };
}

/** Answers a prompt. Null means nobody is there to answer (no TTY): the step is skipped. */
export type Ask = (question: string) => Promise<string | null>;

export interface Ctx {
  env: Env;
  fetch: Fetch;
  ask: Ask;
  log: (s: string) => void;
  rec: Recorder;
  /** Divides every amount, so a wallet with little fake USDC can rehearse. Default 1. */
  scale: number;
  now: () => number;
  state: {
    escrowAccount?: string; escrowApiKey?: string; lockRequestId?: string; approved?: boolean;
    po?: { agentId: string; account: string; ref: string; treasury: string; grantId?: string; path: ReleasePath; gatePublicKey?: string; escrow: Escrow; settled?: Escrow };
  };
  /** Values the recorder must scrub. A derived key is added the moment it exists. */
  secrets: string[];
}

export type StepResult = { status: "done" } | { status: "skipped"; reason: string };
export interface Step { keys: ProofKey[]; title: string; run(c: Ctx): Promise<StepResult> }

const done = (): StepResult => ({ status: "done" });
const skipped = (reason: string): StepResult => ({ status: "skipped", reason });
const amount = (c: Ctx, cents: number) => Math.max(1, Math.round(cents / c.scale));
const custody = (c: Ctx, sink: ProofSink = c.rec.sink, apiKey = c.env.OUTLAYER_API_KEY) => new Custody({ fetch: c.fetch, apiKey, sink });
const allowlist = (c: Ctx) => [c.env.REHEARSE_HAOYUN_EMAIL!];
/**
 * The per-PO escrow on the Tidepool Agent API, with Astro's owner key, and the release gate when
 * RELEASE_GATE_* is set (otherwise the server sends each stage, and every release proof says so).
 * Amounts are story cents; it runs them at 1:1,000.
 */
const escrow = (c: Ctx, sink: ProofSink = c.rec.sink) => new EscrowAdapter({
  fetch: c.fetch, apiKey: c.env.AGENT_API_KEY, baseUrl: agentApiBase(c.env.AGENT_API_BASE_URL), sink, treasuryId: c.env.AGENT_TREASURY_ID,
  owner: ownerFromPkcs8({ accountId: c.env.AGENT_OWNER_ACCOUNT_ID!, publicKey: c.env.AGENT_OWNER_PUBLIC_KEY!, pkcs8Base64: c.env.AGENT_OWNER_PRIVATE_KEY_PKCS8! }),
  gate: releaseGateFromEnv(c.env, c.fetch), gatePublicKey: c.env.RELEASE_GATE_PUBLIC_KEY?.trim() || undefined,
});
const OFF_LIST = "0x000000000000000000000000000000000000dead";

/** A stage's evidence: the simulated tracking feed, and for the balance the dock count (simulated until the dock check runs). */
async function evidenceFor(stage: Stage): Promise<SignalEvidence> {
  const all = evidenceFrom(await simulatedTracking().events(PO.number));
  const ev: SignalEvidence = {};
  for (const s of RELEASE_RULES.requires[stage]) if (all[s]) ev[s] = all[s];
  if (stage === "balance") ev.dock_count = dockEvidence(PO.number, PO.receivedQty, "2026-11-11T08:40:00Z");
  return ev;
}

/** Runs one stage for the committed PO and keeps the new escrow state. */
async function stage(c: Ctx, st: Stage) {
  const po = c.state.po!;
  const to = c.env.HAOYUN_BASE_ADDRESS!.toLowerCase();
  const r = await escrow(c).releaseStage({
    escrow: po.escrow, agentId: po.agentId, stage: st, to, evidence: await evidenceFor(st), unitCents: PO.revisedUnitCents,
    po: PO.number, ref: po.ref, nowMs: c.now(), path: po.path, gatePublicKey: po.gatePublicKey, payee: "Haoyun",
  });
  if (r.ok) po.escrow = r.escrow;
  return r;
}

async function waitFor(c: Ctx, instructions: string[]): Promise<boolean> {
  for (const l of instructions) c.log(l);
  const a = await c.ask("Press Enter when done, or type skip: ");
  return a !== null && a.trim().toLowerCase() !== "skip";
}

async function poll(c: Ctx, id: string, apiKey: string) {
  for (let i = 0; i < 30; i++) {
    const r = await custody(c, () => {}, apiKey).request(id);
    if (r.status !== "processing" && r.status !== "pending" && r.status !== "pending_approval") return r;
    await new Promise((res) => setTimeout(res, Number(c.env.REHEARSE_POLL_MS ?? 2000)));
  }
  return null;
}

export const steps: Step[] = [
  {
    keys: ["wallet_created"], title: "Scene 0: register a wallet on OutLayer custody",
    run: async (c) => {
      // A fresh registration, so the proof is a real POST /register. Its key is redacted and discarded;
      // Astro's working wallet stays the one in OUTLAYER_API_KEY.
      await custody(c).register();
      return done();
    },
  },
  {
    keys: ["policy_set"], title: "Scene 0: owner policy, set by Astro on the OutLayer dashboard",
    run: async (c) => {
      const ok = await waitFor(c, [
        "Astro (the owner) sets the policy, not Evernear. On a device you control:",
        `  open ${policyHandoffUrl("<OUTLAYER_API_KEY from .env.local>")} with the testnet toggle on`,
        `  whitelist ${c.env.REHEARSE_ULTRA_ACCOUNT}, ${c.env.REHEARSE_HAOYUN_ACCOUNT} and ${c.env.OUTLAYER_NEAR_ACCOUNT}; token usdc.fakes.testnet;`,
        "  per transaction limit 10000 USDC; approvals: 2 signers (Luca, Jordan); sign and store the policy.",
      ]);
      if (!ok) return skipped("owner policy not confirmed");
      await custody(c).policy();
      return done();
    },
  },
  {
    keys: ["payment_receipt"], title: "Scene 2: routine reorder under the cap, no human step",
    run: async (c) => {
      const r = await custody(c).payUsdc({
        to: c.env.REHEARSE_ULTRA_ACCOUNT!, cents: amount(c, routineReorder.quantity * routineReorder.unitCents),
        memo: "Routine reorder actuator motors", label: "Routine reorder paid", kind: "payment_receipt",
      });
      if (r.status === "pending_approval") return skipped("the routine payment asked for approval: the policy cap is lower than the order");
      return done();
    },
  },
  {
    keys: ["inference_attestation"], title: "Scene 3: read an offer through NEAR AI Cloud private inference",
    run: async (c) => {
      await new Inference({ fetch: c.fetch, apiKey: c.env.NEARAI_API_KEY, sink: c.rec.sink, model: c.env.NEARAI_MODEL || undefined })
        .read({ kind: "offer", text: quotes.haoyun.text, fields: ["unit price", "shaftDiameter", "mountingFlange", "voltage", "encoderConnector"], label: "Offers read privately in an attested enclave" });
      return done();
    },
  },
  {
    keys: ["approval_luca", "approval_jordy"], title: "Scene 4: the PO needs 2 approvals before any money is committed",
    run: async (c) => {
      // The approval gate stays on OutLayer custody: an approval exists only for a pending request, so
      // Astro's wallet raises one for the PO total and the two approvers sign it on their phones.
      // Only after both approvals does the commit step below move money on the Agent API.
      const parentKey = c.env.OUTLAYER_API_KEY!;
      const sub = await custody(c, () => {}).createSubWallet(`po-${PO.number}`);
      c.state.escrowAccount = sub.near_account_id;
      c.state.escrowApiKey = sub.apiKey;
      c.secrets.push(sub.apiKey);
      await custody(c, () => {}).registerStorage(sub.near_account_id);
      const lock = await custody(c, () => {}).payUsdc({ to: sub.near_account_id, cents: amount(c, PO.revisedTotalCents), memo: `PO ${PO.number} approval`, label: `Approval request for PO ${PO.number}`, kind: "approval_request" });
      c.state.lockRequestId = lock.request_id;
      if (lock.status !== "pending_approval") return skipped(`the request did not ask for approval (status ${lock.status}); check the policy's approval threshold`);

      const approvals = new Approvals({ fetch: c.fetch, apiKey: parentKey, sink: c.rec.sink });
      const pending = (await approvals.pending())[0];
      if (!pending) return skipped("no pending approval found for the request");
      const pub = c.env.OUTLAYER_WALLET_PUBKEY ?? "<wallet public key from GET /wallet/v1/address>";
      for (const who of ["Luca", "Jordan"]) {
        c.log(`${who}: on your own phone, sign this NEP-413 message with your approver full access key (recipient: the wallet contract id):`);
        c.log(`  ${approvalMessage(pending.approval_id, pub, pending.request_hash)}`);
        const a = await c.ask(`Paste ${who}'s {"signature","public_key","account_id","nonce"} JSON, or Enter to skip: `);
        if (!a?.trim()) return skipped(`${who}'s approval not given`);
        let vote: { signature: string; public_key: string; account_id: string; nonce: string };
        try { vote = JSON.parse(a); } catch { return skipped(`${who}'s approval was not JSON`); }
        await approvals.submit({ approvalId: pending.approval_id, approver: who, ...vote });
      }
      const r = await poll(c, c.state.lockRequestId, parentKey);
      if (!r || r.status !== "success") return skipped(`approval request ended as ${r?.status ?? "still pending"}`);
      c.state.approved = true;
      return done();
    },
  },
  {
    keys: ["escrow_wallet"], title: "Scene 6: commit the PO total into its own Agent API account (Tidepool testnet, 1:1,000)",
    run: async (c) => {
      if (!c.state.approved) return skipped("no approvals: nothing is committed before both approvals");
      const e = escrow(c, () => {});
      const treasury = await e.treasuryAccount();
      const acct = await escrow(c).open({ po: PO.number, supplier: c.env.HAOYUN_BASE_ADDRESS!.toLowerCase(), lockedCents: PO.revisedTotalCents });
      const f = await escrow(c).fund({ cents: PO.revisedTotalCents });
      if (!f.ok) return skipped(`treasury could not be funded (${f.reason}); the faucet allows one drip per hour`);
      const ref = `rehearse-${PO.number}-${c.now()}`;
      const r = await escrow(c).lock({ po: PO.number, ref, agentId: acct.agentId, account: acct.account, cents: PO.revisedTotalCents });
      if (!r.ok) return skipped(`commit refused (${r.code})`);
      const start = createEscrow({ supplier: c.env.HAOYUN_BASE_ADDRESS!.toLowerCase(), owner: treasury, lockedCents: PO.revisedTotalCents, deadlineMs: c.now() + 86_400_000 });
      c.state.po = { agentId: acct.agentId, account: acct.account, ref, treasury, grantId: acct.grantId, path: acct.releasePath, gatePublicKey: acct.gatePublicKey, escrow: start };
      return done();
    },
  },
  {
    keys: ["signal_bill_of_lading", "signal_export_cleared", "advance_payout"],
    title: "Scene 7: the motors leave: bill of lading and export clearance in, pay Haoyun the 30% advance, $18.90 on Base Sepolia (1:1,000)",
    run: async (c) => {
      if (!c.state.po) return skipped("nothing committed (the commit step was skipped)");
      const r = await stage(c, "advance");
      return r.ok ? done() : skipped(`advance refused (${r.reason})`);
    },
  },
  {
    keys: ["refused_email"], title: "Scene 5: email to an off list address is refused before the connector",
    run: async (c) => {
      await new Gmail({ fetch: c.fetch, paymentKey: c.env.OUTLAYER_PAYMENT_KEY, ownerAccount: c.env.OUTLAYER_OWNER_ACCOUNT, allowlist: allowlist(c), sink: c.rec.sink })
        .send({ to: "deals@unknown-broker.example", subject: `PO ${PO.number}`, body: "Counter offer" });
      return done();
    },
  },
  {
    keys: ["connector_receipt"], title: "Scene 5: counter offer through the Gmail connector",
    run: async (c) => {
      const ok = await waitFor(c, [
        "The Gmail connector needs a connected account. On a device you control:",
        "  open https://app.outlayer.ai/secrets?project=connectors.outlayer.testnet/gmail and connect the demo mailbox,",
        `  and set the connector recipients policy to ${c.env.REHEARSE_HAOYUN_EMAIL} only.`,
      ]);
      if (!ok) return skipped("Gmail connection not confirmed");
      await new Gmail({ fetch: c.fetch, paymentKey: c.env.OUTLAYER_PAYMENT_KEY, ownerAccount: c.env.OUTLAYER_OWNER_ACCOUNT, allowlist: allowlist(c), sink: c.rec.sink })
        .send({ to: c.env.REHEARSE_HAOYUN_EMAIL!, subject: `PO ${PO.number} counter offer`, body: `We can accept up to USD ${(PO.revisedUnitCents / 100).toFixed(2)} per unit for ${PO.quantity} units.` });
      return done();
    },
  },
  {
    keys: ["dock_attestation"], title: "Scene 7: attested dock check",
    run: async () => skipped("the dock check worker is not deployed yet (worker/dock-check); record it once it runs on OutLayer testnet"),
  },
  {
    keys: ["refused_release"], title: "Scene 8: a withdraw to a wrong address is refused, in code and then by the PO account, live",
    run: async (c) => {
      const po = c.state.po;
      if (!po) return skipped("nothing committed (the commit step was skipped)");
      const wrong = await escrow(c, () => {}).releaseStage({
        escrow: po.escrow, agentId: po.agentId, stage: "balance", to: OFF_LIST, evidence: await evidenceFor("balance"), unitCents: PO.revisedUnitCents,
        po: PO.number, ref: po.ref, nowMs: c.now(), path: po.path, gatePublicKey: po.gatePublicKey,
      });
      if (wrong.ok) throw new Error("the engine released to an off-list address");
      const due = PO.receivedQty * PO.revisedUnitCents - po.escrow.releasedCents;
      const r = await escrow(c).policyRefusal({ agentId: po.agentId, to: OFF_LIST, cents: due, po: PO.number, ref: po.ref, path: po.path });
      if (r.ok) throw new Error("the PO account paid an off-list address: its policy is wrong");
      return done();
    },
  },
  {
    keys: ["signal_import_cleared", "intents_payout"],
    title: "Scene 8: customs cleared and 44 of 50 counted: pay Haoyun the balance, $36.54, and return the held $7.56 to Astro (1:1,000)",
    run: async (c) => {
      const po = c.state.po;
      if (!po) return skipped("nothing committed (the commit step was skipped)");
      if (po.escrow.releasedCents === 0) return skipped("no advance was paid (the advance step was skipped)");
      const paid = await stage(c, "balance");
      if (!paid.ok) return skipped(`balance refused (${paid.reason})`);
      const back = await escrow(c, () => {}).reclaim({ escrow: po.escrow, agentId: po.agentId, po: PO.number, ref: po.ref, nowMs: c.now(), path: po.path });
      if (!back.ok) return skipped(`held part not returned (${back.reason})`);
      po.settled = back.escrow;
      return done();
    },
  },
  {
    keys: ["wallet_closed"], title: "Scene 8: close the order's wallet: grant revoked, frozen, kept as the order's receipt",
    run: async (c) => {
      const po = c.state.po;
      if (!po?.settled) return skipped("nothing settled (the payout step was skipped)");
      const r = await escrow(c).close({ escrow: po.settled, agentId: po.agentId, grantId: po.grantId, po: PO.number });
      if (!r.ok) return skipped(`wallet not closed (${r.reason})`);
      return done();
    },
  },
];

export interface RunOpts { env: Env; fetch: Fetch; ask: Ask; log: (s: string) => void; dir: string; now?: () => number }

/** Runs every step in order. Throws RehearsalRefused, naming each missing variable, before any call. */
export async function rehearse(o: RunOpts) {
  const missing = missingEnv(o.env);
  if (missing.length) throw new RehearsalRefused(`missing in .env.local: ${missing.join(", ")}`);
  assertTestnet(o.env);
  const secrets = SECRET_ENV.map((k) => o.env[k]).filter((v): v is string => !!v);
  const rec = createRecorder({ dir: o.dir, enabled: o.env.RECORD === "1", secrets, log: o.log });
  const scale = Math.max(1, Number(o.env.REHEARSE_SCALE ?? 1) || 1);
  const c: Ctx = { env: o.env, fetch: guardFetch(o.fetch), ask: o.ask, log: o.log, rec, scale, now: o.now ?? Date.now, state: {}, secrets };
  const results: { title: string; result: StepResult }[] = [];
  for (const s of steps) {
    o.log(`\n${s.title}`);
    let result: StepResult;
    try { result = await s.run(c); } catch (e) {
      if (e instanceof RehearsalRefused) throw e;
      result = skipped(`failed: ${(e as Error).message}`);
    }
    o.log(result.status === "done" ? "  done" : `  skipped: ${result.reason}`);
    results.push({ title: s.title, result });
  }
  return { results, written: rec.written };
}
