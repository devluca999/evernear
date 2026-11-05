import { describe, expect, it } from "vitest";
import { nextGate, stepClock, waitingAt } from "../gates";
import { timeline } from "../scenes";
import { stateAt } from "../runner";

const gates = timeline.filter((b) => b.gate);

describe("gates", () => {
  it("waits at every human moment, in story order", () => {
    expect(gates.map((g) => g.gate!.id)).toEqual(["start_sourcing", "approve_luca", "approve_jordy", "price_limit", "packing_slip"]);
  });
  it("stops the clock 1 ms before a gate and asks", () => {
    const g = gates[0];
    const t = stepClock(g.atMs - 500, g.atMs + 5000, true);
    expect(t).toBe(g.atMs - 1);
    expect(waitingAt(t, true)?.gate?.id).toBe("start_sourcing");
    // Nothing the gate does has happened yet.
    expect(stateAt(t).messages.some((m) => m.text === "Yes" && m.direction === "in")).toBe(false);
  });
  it("answering moves the clock onto the gate, which then fires, and play continues to the next gate", () => {
    const [a, b] = [gates[1], gates[2]];
    expect(stateAt(a.atMs).approvals.map((x) => x.by)).toEqual(["Luca"]);
    expect(stepClock(a.atMs, a.atMs + 60_000, true)).toBe(b.atMs - 1);
  });
  it("funds are never committed before both approvals are clicked", () => {
    const lock = timeline.find((x) => x.ev.type === "lock_funds")!;
    expect(stepClock(0, lock.atMs + 1, true)).toBeLessThan(gates[2].atMs);
  });
  it("plays straight through when waiting is off (recording)", () => {
    expect(stepClock(0, 50_000, false)).toBe(50_000);
    expect(waitingAt(gates[0].atMs - 1, false)).toBeNull();
  });
  it("a gate behind the clock is passed, so a jump past it never asks again", () => {
    expect(nextGate(gates[4].atMs)).toBeNull();
  });
});
