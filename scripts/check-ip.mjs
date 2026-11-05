#!/usr/bin/env node
// Fails if any repo file contains an Everstock-internal name.
// Scans every tracked or untracked, non-ignored file.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Built from parts so this file does not match itself.
const words = ["restock" + "-chain", "compo" + "sio", "ever" + "bot"];
const rules = [
  { name: "ticket id", re: new RegExp("EN" + "G-") },
  { name: "spec id", re: /\bS[5-9][0-9]\b/ },
  ...words.map((w) => ({ name: `word "${w}"`, re: new RegExp(w, "i") })),
];

// CLAUDE.md states the rule itself, so it names the blocked terms on purpose.
const exempt = new Set(["CLAUDE.md", "scripts/check-ip.mjs"]);
const binary = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip|wasm)$/i;

export function scan(files, read = (f) => readFileSync(f, "utf8")) {
  const hits = [];
  for (const file of files) {
    if (exempt.has(file) || binary.test(file)) continue;
    let text;
    try { text = read(file); } catch { continue; }
    text.split("\n").forEach((line, i) => {
      for (const r of rules) if (r.re.test(line)) hits.push(`${file}:${i + 1} ${r.name}`);
    });
  }
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
    .split("\n").filter(Boolean);
  const hits = scan(files);
  if (hits.length) {
    console.error("check:ip failed:\n" + hits.join("\n"));
    process.exit(1);
  }
  console.log(`check:ip passed (${files.length} files)`);
}
