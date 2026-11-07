#!/usr/bin/env node
// Records a live run for replay: reads the JSON that `npx convex run live:getRun '{"runId":"..."}'`
// prints (the proof rows stored on the Convex deployment, nothing typed by hand) and writes the run's
// rows to fixtures/recorded/live-run.json, which the drawer replays as the same history with the
// same explorer buttons. Keeps only the proof fields, and scrubs anything shaped like a key.
// Usage: node scripts/record-live-run.mjs <getRun.json> [--deployment cheerful-rabbit-364]
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, ...rest] = process.argv;
if (!input) { console.error("usage: node scripts/record-live-run.mjs <getRun.json> [--deployment <name>]"); process.exit(1); }
const deployment = rest[rest.indexOf("--deployment") + 1] ?? null;
const raw = readFileSync(input, "utf8");
const run = JSON.parse(raw.slice(raw.indexOf("{")));
if (!run?.run || !Array.isArray(run.proofs)) throw new Error("not a live:getRun answer");
if (run.run.error) throw new Error(`refusing to record a run that failed: ${run.run.error}`);
const steps = ["commit", "advance", "pay", "refuse", "reclaim"];
for (const s of steps) if (!run.run.done.includes(s)) throw new Error(`refusing to record an unfinished run: no ${s}`);

const scrub = (v) => JSON.parse(JSON.stringify(v).replace(/(naa_|ngt_|wk_)[A-Za-z0-9_-]+/g, "$1REDACTED"));
const rows = run.proofs
  .map((p) => scrub({ _id: p._id, at: p.at, kind: p.kind, label: p.label, call: p.call, codePath: p.codePath, network: p.network, hash: p.hash, explorerUrl: p.explorerUrl ?? null, response: p.response ?? null, scene: p.scene }))
  .sort((a, b) => a.at - b.at);
if (rows.some((r) => /naa_[A-Za-z0-9]|ngt_[A-Za-z0-9]|wk_[A-Za-z0-9]/.test(JSON.stringify(r)))) throw new Error("a key survived scrubbing");

const out = {
  _note: "A real live run on Tidepool testnet through the release gate, read from the Convex proofs table. Replayed by the drawer as its history; nothing here was typed by hand.",
  runId: run.run._id, deployment, releasePath: run.releasePath, startedAt: run.run.startedAt, done: run.run.done, rows,
};
writeFileSync("fixtures/recorded/live-run.json", JSON.stringify(out, null, 2) + "\n");
console.log(`recorded ${rows.length} rows of run ${out.runId} (${out.releasePath}) to fixtures/recorded/live-run.json`);
