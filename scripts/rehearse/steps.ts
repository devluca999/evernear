// The rehearsal: the scene steps in order, against OutLayer TESTNET and NEAR AI Cloud,
// through the same adapters the app uses. With RECORD=1 every scene proof is written to
// fixtures/recorded/ by the recorder. Everything here takes an injected fetch and prompt
// so it is tested with mocks (tests/rehearse.test.ts); scripts/rehearse.ts wires the real ones.
import { Custody, policyHandoffUrl } from "../../convex/near/custody";
import { Approvals, approvalMessage } from "../../convex/near/approval";
import { EscrowAdapter } from "../../convex/near/escrow";
import { Gmail } from "../../convex/near/gmail";
import { Inference } from "../../convex/near/inference";
import { httpJson, NEARAI_BASE, OUTLAYER_TESTNET, TESTNET_EXPLORER, type Fetch, type ProofSink } from "../../convex/near/http";
import { createEscrow } from "../../engine/escrow";
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
] as const;

/** Every value that must never be printed or written. */
export const SECRET_ENV = ["OUTLAYER_API_KEY", "OUTLAYER_PAYMENT_KEY", "NEARAI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "INBOUND_EMAIL_SECRET"];

const ALLOWED_HOSTS = [new URL(OUTLAYER_TESTNET).host, new URL(NEARAI_BASE).host];

export class RehearsalRefused extends Error {}

export function missingEnv(env: Env): string[] {
  return REQUIRED_ENV.filter((k) => !env[k]?.trim());
}

/** Refuses a mainnet configuration before anything runs. */
export function assertTestnet(env: Env) {
  if (env.FINALE_ENABLED === "1") throw new RehearsalRefused("FINALE_ENABLED=1 is set. The rehearsal is testnet only; unset it first.");
  for (const [k, v] of Object.entries(env)) {
    if (!v || !/^https?:\/\//.test(v)) continue;
    let host: string;
    try { host = new URL(v).host; } catch { continue; }
    if (host === "api.outlayer.ai" || host.includes("mainnet")) throw new RehearsalRefused(`${k} points at a mainnet host (${host}). The rehearsal only talks to ${OUTLAYER_TESTNET}.`);
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
  state: { escrowAccount?: string; escrowApiKey?: string; lockRequestId?: string };
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
        "  per transaction limit 10000 USDC; approvals: 2 signers (Luca, Jordy); sign and store the policy.",
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
    keys: ["approval_luca", "approval_jordy"], title: "Scene 4 and 6: lock the PO total, which needs 2 approvals",
    run: async (c) => {
      // The lock request goes first: an OutLayer approval exists only for a pending request.
      const parentKey = c.env.OUTLAYER_API_KEY!;
      const esc = new EscrowAdapter({ fetch: c.fetch, parentApiKey: parentKey, sink: () => {} });
      const sub = await esc.open(PO.number);
      c.state.escrowAccount = sub.near_account_id;
      c.state.escrowApiKey = sub.apiKey;
      c.secrets.push(sub.apiKey);
      await httpJson({ fetch: c.fetch, base: OUTLAYER_TESTNET, method: "POST", path: "/wallet/v1/storage-deposit", headers: { Authorization: `Bearer ${parentKey}` }, body: { token: "usdc.fakes.testnet", account_id: sub.near_account_id } });
      const lockSink: ProofSink[] = [];
      const lock = await new EscrowAdapter({ fetch: c.fetch, parentApiKey: parentKey, sink: (p) => { lockSink.forEach((s) => s(p)); } })
        .lock({ po: PO.number, escrowAccount: sub.near_account_id, cents: amount(c, PO.revisedTotalCents) });
      c.state.lockRequestId = lock.request_id;
      if (lock.status !== "pending_approval") return skipped(`the lock did not ask for approval (status ${lock.status}); check the policy's approval threshold`);

      const approvals = new Approvals({ fetch: c.fetch, apiKey: parentKey, sink: c.rec.sink });
      const pending = (await approvals.pending())[0];
      if (!pending) return skipped("no pending approval found for the lock");
      const pub = c.env.OUTLAYER_WALLET_PUBKEY ?? "<wallet public key from GET /wallet/v1/address>";
      for (const who of ["Luca", "Jordy"]) {
        c.log(`${who}: on your own phone, sign this NEP-413 message with your approver full access key (recipient: the wallet contract id):`);
        c.log(`  ${approvalMessage(pending.approval_id, pub, pending.request_hash)}`);
        const a = await c.ask(`Paste ${who}'s {"signature","public_key","account_id","nonce"} JSON, or Enter to skip: `);
        if (!a?.trim()) return skipped(`${who}'s approval not given`);
        let vote: { signature: string; public_key: string; account_id: string; nonce: string };
        try { vote = JSON.parse(a); } catch { return skipped(`${who}'s approval was not JSON`); }
        await approvals.submit({ approvalId: pending.approval_id, approver: who, ...vote });
      }
      return done();
    },
  },
  {
    keys: ["escrow_wallet"], title: "Scene 6: funds locked in the PO wallet",
    run: async (c) => {
      if (!c.state.lockRequestId) return skipped("no lock request (the approval step was skipped)");
      const r = await poll(c, c.state.lockRequestId, c.env.OUTLAYER_API_KEY!);
      if (!r || r.status !== "success") return skipped(`lock request ended as ${r?.status ?? "still pending"}`);
      await c.rec.as("escrow_wallet")({
        kind: "escrow", label: `Locked for PO ${PO.number}`, call: "POST /wallet/v1/call ft_transfer", codePath: "convex/near/escrow.ts#lock", network: "testnet",
        hash: r.tx_hash ?? "none", explorerUrl: r.tx_hash ? TESTNET_EXPLORER + r.tx_hash : undefined,
        response: { ...r, wallet: c.state.escrowAccount, exits: [c.env.REHEARSE_HAOYUN_ACCOUNT, c.env.OUTLAYER_NEAR_ACCOUNT] }, replay: false, synthetic: false,
      });
      return done();
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
    keys: ["refused_release"], title: "Scene 8: release to a wrong address is refused",
    run: async (c) => {
      const e = createEscrow({ supplier: c.env.REHEARSE_HAOYUN_ACCOUNT!, owner: c.env.OUTLAYER_NEAR_ACCOUNT!, lockedCents: amount(c, PO.revisedTotalCents), deadlineMs: c.now() + 86_400_000 });
      await new EscrowAdapter({ fetch: c.fetch, parentApiKey: c.env.OUTLAYER_API_KEY, sink: c.rec.sink })
        .release({ escrow: e, escrowApiKey: c.state.escrowApiKey ?? "unused", to: "mallory.testnet", cents: amount(c, 3_420_000), po: PO.number, nowMs: c.now() });
      return done();
    },
  },
  {
    keys: ["intents_payout"], title: "Scene 8: final payout through NEAR Intents (mainnet)",
    run: async () => skipped("mainnet: needs FINALE_ENABLED=1 and Luca's explicit yes in the session. Never run from the rehearsal."),
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
