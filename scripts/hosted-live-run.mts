// A full live run on the hosted Convex deployment (NEXT_PUBLIC_CONVEX_URL from .env.local), through the
// public API only, the way the page drives it. This script never signs anything: it shows the commit
// refused with no approvals, then WAITS while the approvers sign the exact terms themselves
// (scripts/approve.mts or /approve), commits, pays the advance, WAITS for the dock clerk's signed count
// (scripts/dock-sign.mts or /dock) when DOCK_DEVICE_KEYS is set, then the balance, the off-list attempt
// and the return. Writes the run's proof rows to fixtures/recorded/<out>.json. Testnet only. Prints no secret.
//   npx tsx scripts/hosted-live-run.mts [out-name]
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { PO } from "../seed/astro";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]));
const url = env.NEXT_PUBLIC_CONVEX_URL;
if (!url || !/\.convex\.cloud/.test(url)) throw new Error("NEXT_PUBLIC_CONVEX_URL missing");
const out = process.argv[2] ?? "hosted-approval-run";
const c = new ConvexHttpClient(url);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const { runId, refused } = await c.mutation(api.live.start, {});
if (!runId) throw new Error(`start refused: ${refused}`);
log("run", runId);
const step = async (s: "commit" | "advance" | "pay" | "refuse" | "reclaim") => { const r = await c.action(api.live.runStep, { runId, step: s }); log(s, JSON.stringify(r)); return r; };

const { digest, terms } = await c.query(api.approvals.terms, { scenario: "happy" });
log("terms", terms.quantity, "x", terms.unitCents, "=", terms.totalCents, "to", terms.supplierAddress, "digest", digest.slice(0, 16));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await step("commit"); // no approvals: refused, recorded
log(`waiting for 2 signatures on digest ${digest} (npx tsx scripts/approve.mts ... or /approve)`);
for (let seen = -1; ;) {
  const t = await c.query(api.approvals.terms, { scenario: "happy" });
  if (t.signed.length !== seen) { seen = t.signed.length; log("signed so far:", t.signed.join(", ") || "nobody"); if (seen === 1) await step("commit"); }
  if (t.signed.length >= 2) break;
  await sleep(5_000);
}
const steps: Record<string, unknown> = {};
for (const s of ["commit", "advance", "pay", "refuse", "reclaim"] as const) {
  if (s === "pay" && (await c.query(api.dock.devices, {})).length) {
    let r = await step("pay");
    while (!r.ok && r.reason === "awaiting_dock_count") {
      log(`waiting for the dock clerk's signed count for PO ${PO.number} (npx tsx scripts/dock-sign.mts <count> or /dock)`);
      await sleep(10_000);
      r = await step("pay");
    }
    steps.pay = r;
    if (!r.ok) break;
    continue;
  }
  steps[s] = await step(s);
  if (!(steps[s] as { ok: boolean }).ok) break;
}
const run = await c.query(api.live.getRun, { runId });
const rows = (run?.proofs ?? []).map(({ _id, _creationTime, runId: _r, ...p }) => { void _id; void _creationTime; void _r; return p; });
const body = JSON.stringify({ _note: "A live run on the hosted Convex deployment through its public API, Nov 14: commits refused with 0 and 1 approvals, then Luca (NEAR testnet account evernear-luca.testnet, NEP-413) and Jordan (pinned ed25519 key) signed the exact terms; dock count signed by the pinned dock device. Read from the proofs table.", deployment: new URL(url).host.split(".")[0], runId, releasePath: run?.releasePath, done: run?.run.done, error: run?.run.error ?? null, rows }, null, 2);
if (/(naa_|ngt_|wk_|ed25519:[1-9A-HJ-NP-Za-km-z]{60,})/.test(body)) throw new Error("refusing to write: something that looks like a secret is in the rows");
writeFileSync(`fixtures/recorded/${out}.json`, body + "\n");
log("wrote", `fixtures/recorded/${out}.json`, "done", JSON.stringify(run?.run.done), "error", run?.run.error ?? null);
