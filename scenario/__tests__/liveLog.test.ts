import { describe, expect, it } from "vitest";
import recorded from "../../fixtures/recorded/live-run.json";
import { explorerOf, liveEntries, mergeHistory, pendingEntry, type LiveRow } from "../liveLog";
import { SCENARIOS } from "../scenes";
import { stateAt } from "../runner";
import { suppliers } from "../../seed/astro";
import type { Proof } from "../types";

const HAOYUN = suppliers.find((s) => s.id === "haoyun")!.receiveAddress;
const TL = SCENARIOS.happy.timeline;
const rows = recorded.rows as LiveRow[];
const entries = liveEntries(rows, TL, { replay: true, supplier: HAOYUN });
const BASE = "0x0fcba0506d7873c2fa9065d74309f703d349df3beb37c299c63a8e8536cd6045";
const NEAR = "366nhBeJvx6Ch7kpx2ZR8ZchQvBDrxVhtPFe8J62ynC1";
const p = (o: Partial<Proof>) => ({ id: "x", kind: "payout", hash: "", synthetic: false, network: "testnet" as const, ...o });

describe("explorer buttons", () => {
  it("opens Basescan for a Base Sepolia hash and NearBlocks for a NEAR testnet hash, with the entry's own hash", () => {
    expect(explorerOf(p({ hash: BASE }))).toEqual({ kind: "button", label: "View on Basescan", href: `https://sepolia.basescan.org/tx/${BASE}`, network: "Base Sepolia", short: "0x0fcba0…cd6045" });
    expect(explorerOf(p({ kind: "escrow", hash: NEAR }))).toEqual({ kind: "button", label: "View on NearBlocks", href: `https://testnet.nearblocks.io/txns/${NEAR}`, network: "NEAR testnet", short: "366nhBeJ…J62ynC1".slice(0, 8) + "…" + NEAR.slice(-6) });
  });
  it("never shows a button on a synthetic or refused entry, even with a hash", () => {
    expect(explorerOf(p({ synthetic: true, hash: BASE }))).toEqual({ kind: "text", text: "Synthetic placeholder, nothing sent" });
    expect(explorerOf(p({ kind: "refusal", hash: BASE }))).toEqual({ kind: "text", text: "Refused, nothing sent" });
    expect(explorerOf(p({ id: "refused_release", kind: "payout", hash: "none" }))).toEqual({ kind: "text", text: "Refused, nothing sent" });
  });
  it("says Confirming, never links, while a payout's hash is not known", () => {
    expect(explorerOf(p({ hash: "" }))).toEqual({ kind: "confirming", network: "Base Sepolia" });
    expect(explorerOf(p({ hash: "none" }))).toEqual({ kind: "confirming", network: "Base Sepolia" });
    expect(explorerOf(pendingEntry("pay", TL, HAOYUN)!).kind).toBe("confirming");
  });
  it("says there is no public explorer for Tidepool's own ids, and no transaction for the simulated feed", () => {
    expect(explorerOf(p({ kind: "policy", hash: "intent_d928c19645dd2164be722dab" }))).toEqual({ kind: "text", text: "Tidepool testnet, no public explorer" });
    expect(explorerOf(p({ kind: "signal", hash: "sim-bol" }))).toEqual({ kind: "text", text: "Simulated feed, no transaction" });
  });
});

describe("the recorded live run (fixtures/recorded/live-run.json)", () => {
  it("is a finished run through the release gate, read from Convex", () => {
    expect(recorded.releasePath).toBe("gate");
    expect(recorded.done).toEqual(expect.arrayContaining(["commit", "advance", "refuse", "pay", "reclaim"]));
    expect(JSON.stringify(recorded)).not.toMatch(/naa_[A-Za-z0-9]|ngt_[A-Za-z0-9]|wk_[A-Za-z0-9]/);
  });
  it("gives every entry with a real transaction a button to its own hash on the right explorer, and nothing else a button", () => {
    let buttons = 0;
    for (const e of entries) {
      const v = explorerOf(e);
      if (v.kind !== "button") continue;
      buttons++;
      expect(v.href.endsWith(e.hash)).toBe(true);
      if (e.kind === "payout") expect(v.href).toBe(`https://sepolia.basescan.org/tx/${e.hash}`);
      else expect(v.href).toBe(`https://testnet.nearblocks.io/txns/${e.hash}`);
    }
    // enroll, swap, commit, two gate runs, two payouts, the return to Astro
    expect(buttons).toBe(8);
    expect(entries.filter((e) => e.kind === "payout").map((e) => explorerOf(e).kind)).toEqual(["button", "button"]);
    expect(entries.filter((e) => e.kind === "refusal").map((e) => explorerOf(e))).toEqual([{ kind: "text", text: "Refused, nothing sent" }, { kind: "text", text: "Refused, nothing sent" }]);
  });
  it("gives each release gate run an entry of its own, just before the payout it sent", () => {
    const i = entries.findIndex((e) => e.kind === "payout");
    expect(entries[i - 1].label).toBe("Release gate run in OutLayer's enclave: advance");
    expect(explorerOf(entries[i - 1])).toMatchObject({ label: "View on NearBlocks" });
  });
  it("keeps every row of the run in the history, in story order, with its chapter and story day", () => {
    const st = stateAt(SCENARIOS.happy.totalMs, TL);
    const history = mergeHistory(st.proofs, entries);
    const real = history.filter((h) => h.id.startsWith("live:"));
    expect(real.length).toBe(rows.length + 2);
    expect(new Set(real.map((h) => h.id)).size).toBe(real.length);
    // Story order: commit, advance, balance, the wrong address, back to Astro.
    const at = (f: (h: Proof) => boolean) => history.findIndex(f);
    const commit = at((h) => h.key === "escrow_wallet"), advance = at((h) => h.key === "advance_payout"), balance = at((h) => h.key === "intents_payout");
    const refused = at((h) => h.key === "refused_release"), back = at((h) => h.kind === "reclaim"), closed = at((h) => h.key === "wallet_closed");
    expect([commit, advance, balance, refused, back, closed]).toEqual([...[commit, advance, balance, refused, back, closed]].sort((x, y) => x - y));
    expect(history.slice(1).every((h, i) => (h.atMs ?? 0) >= (history[i].atMs ?? 0))).toBe(true);
    expect(history[advance]).toMatchObject({ day: "5 Nov", scene: 6 });
    expect(history[balance]).toMatchObject({ day: "11 Nov", scene: 6 });
    expect(history[back]).toMatchObject({ day: "11 Dec", scene: 7 });
    // The story's placeholders for those steps step aside.
    expect(history.some((h) => h.id === "escrow_wallet" || h.id === "intents_payout")).toBe(false);
  });
});
