import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../scenes";
import { stateAt } from "../runner";
import { EXPLAINERS, highlightFor, stepKind, type ExplainerId } from "../explain";
import { closeWallet, createEscrow, release, reclaimHeld } from "../../engine/escrow";
import { formatInt, formatUsdShort } from "../../engine/money";
import { amounts } from "../scenes";
import { PO } from "../../seed/astro";

const happy = SCENARIOS.happy;
const moments = happy.timeline.filter((b) => b.ev.type === "explain" && b.ev.id);
const words = (t: string) => t.trim().split(/\s+/).length;

describe("the five explainer moments", () => {
  it("come in story order, each a named step with a camera focus", () => {
    expect(moments.map((b) => [b.scene + 1, (b.ev as { id: ExplainerId }).id, b.step, b.focus?.id])).toEqual([
      [4, "enclave", "Private inference", "developer.attestation"],
      [4, "attestation", "Attestation", "developer.attestation"],
      [6, "wallet", "Order wallet", "developer.policy"],
      [7, "signed", "Signed result", "developer.signed"],
      [8, "payout", "Wallet lifecycle", "money.lifecycle"],
    ]);
  });
  it("each follows the panel focus the brief names, in the same chapter", () => {
    const before = (i: number) => happy.timeline.filter((b) => b.focus && b.atMs < moments[i].atMs && b.scene === moments[i].scene).at(-1)?.focus?.id;
    expect(before(0)).toBe("map.search");
    expect(before(2)).toBe("money.escrow");
    expect(before(3)).toBe("dock.count");
    expect(before(4)).toBe("money.protected");
  });
  it("open the drawer on a proof the story already has, and say it in three lines of under 25 words", () => {
    for (const b of moments) {
      const st = stateAt(b.atMs, happy.timeline);
      const ex = EXPLAINERS[st.explain!];
      expect(st.proofs.some((p) => p.id === ex.proof), `${ex.id}: proof ${ex.proof}`).toBe(true);
      for (const line of [ex.happened(st), ex.matters(st), ex.whyNear]) {
        expect(words(line), `${ex.id}: ${line}`).toBeLessThan(25);
        expect(line).not.toMatch(/[!–—]/);
      }
    }
  });
  it("take their figures from the engine", () => {
    const at = (id: ExplainerId) => stateAt(moments.find((b) => (b.ev as { id: string }).id === id)!.atMs, happy.timeline);
    const a = amounts(PO.revisedUnitCents);
    expect(EXPLAINERS.wallet.happened(at("wallet"))).toBe(`A wallet was created for PO 1042 only, and ${formatUsdShort(a.lockedCents)} moved into it.`);
    expect(EXPLAINERS.signed.happened(at("signed"))).toContain(`${formatInt(PO.receivedQty)} of ${formatInt(PO.quantity)}, balance ${formatUsdShort(a.balanceCents)}`);
    expect(EXPLAINERS.payout.happened(at("payout"))).toContain(`${formatUsdShort(a.holdCents)} waits for the last ${PO.quantity - PO.receivedQty} motors`);
    // The story's own numbers, as Luca set them.
    expect(EXPLAINERS.signed.happened(at("signed"))).toContain("44 of 50, balance $36,540");
    expect(EXPLAINERS.payout.happened(at("payout"))).toContain("$7,560 waits for the last 6 motors");
  });
  it("end when the chapter ends", () => {
    for (const b of moments) {
      const next = happy.scenes[b.scene + 1];
      if (!next) continue;
      let start = 0;
      for (const sc of happy.scenes) { if (sc.id === next.id) break; start += sc.durationMs; }
      expect(stateAt(start, happy.timeline).explain).toBeNull();
    }
  });
});

describe("drawer steps", () => {
  it("give every proof an icon kind and two or three fields to light", () => {
    const st = stateAt(happy.totalMs, happy.timeline);
    expect(st.proofs.map((p) => stepKind(p))).toContain("refusal");
    expect(stepKind({ id: "inference_attestation", kind: "attestation" })).toBe("enclave");
    expect(stepKind({ id: "dock_attestation", kind: "attestation" })).toBe("attestation");
    expect(highlightFor("escrow_wallet").length).toBeLessThanOrEqual(3);
  });
});

describe("the order wallet's lifecycle", () => {
  it("goes created or funded, partly released, settled, closed, and the happy path ends closed", () => {
    const e0 = createEscrow({ supplier: "haoyun", owner: "astro", lockedCents: 0, deadlineMs: 10 });
    expect(e0.lifecycle).toBe("created");
    const e1 = createEscrow({ supplier: "haoyun", owner: "astro", lockedCents: 3_800_000, deadlineMs: 10 });
    expect(e1.lifecycle).toBe("funded");
    const r = release(e1, { to: "haoyun", amountCents: 3_420_000, nowMs: 1 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.escrow.lifecycle).toBe("advance_released");
    const back = reclaimHeld(r.escrow, { to: "astro", nowMs: 2 });
    if (!back.ok) throw new Error(back.reason);
    expect(back.escrow.lifecycle).toBe("settled");
    const shut = closeWallet(back.escrow);
    if (!shut.ok) throw new Error(shut.reason);
    expect(shut.escrow.lifecycle).toBe("closed");
    expect(stateAt(happy.totalMs, happy.timeline).escrow?.lifecycle).toBe("closed");
    expect(stateAt(happy.totalMs, happy.timeline).proofs.at(-1)?.id).toBe("wallet_closed");
  });
  it("refuses to close while money is left, and a closed wallet refuses every move", () => {
    const e = createEscrow({ supplier: "haoyun", owner: "astro", lockedCents: 100, deadlineMs: 10 });
    expect(closeWallet(e)).toEqual({ ok: false, reason: "not_settled" });
    const r = release(e, { to: "haoyun", amountCents: 100, nowMs: 1 });
    if (!r.ok) throw new Error(r.reason);
    const shut = closeWallet(r.escrow);
    if (!shut.ok) throw new Error(shut.reason);
    expect(release(shut.escrow, { to: "haoyun", amountCents: 1, nowMs: 2 })).toMatchObject({ ok: false, reason: "closed" });
    expect(reclaimHeld(shut.escrow, { to: "astro", nowMs: 2 })).toMatchObject({ ok: false, reason: "closed" });
    expect(closeWallet(shut.escrow)).toEqual({ ok: false, reason: "closed" });
  });
});
