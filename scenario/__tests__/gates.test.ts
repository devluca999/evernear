import { describe, expect, it } from "vitest";
import { nextGate, stepClock, waitingAt } from "../gates";
import { timeline } from "../scenes";
import { stateAt } from "../runner";

const gates = timeline.filter((b) => b.gate);
const gate = (id: string) => gates.find((g) => g.gate!.id === id)!;

describe("gates", () => {
  it("waits at every human moment, in story order, with the approvals after the negotiation", () => {
    expect(gates.map((g) => g.gate!.id)).toEqual(["start_sourcing", "pick_supplier", "approve_luca", "approve_jordy", "packing_slip"]);
  });
  it("stops the clock 1 ms before a gate and asks", () => {
    const g = gates[0];
    const t = stepClock(g.atMs - 500, g.atMs + 5000, true);
    expect(t).toBe(g.atMs - 1);
    expect(waitingAt(t, true)?.gate?.id).toBe("start_sourcing");
    // Nothing the gate does has happened yet.
    expect(stateAt(t).messages.some((m) => m.text === "Start sourcing" && m.direction === "in")).toBe(false);
  });
  it("answering moves the clock onto the gate, which then fires, and play continues to the next gate", () => {
    const [a, b] = [gate("approve_luca"), gate("approve_jordy")];
    expect(stateAt(a.atMs).approvals.map((x) => x.by)).toEqual(["Luca"]);
    expect(stepClock(a.atMs, a.atMs + 60_000, true)).toBe(b.atMs - 1);
  });
  it("funds are never committed before both approvals are clicked", () => {
    const lock = timeline.find((x) => x.ev.type === "lock_funds")!;
    expect(stepClock(0, lock.atMs + 1, true)).toBeLessThan(gate("approve_jordy").atMs);
  });
  it("plays straight through when waiting is off (recording)", () => {
    expect(stepClock(0, 50_000, false)).toBe(50_000);
    expect(waitingAt(gates[0].atMs - 1, false)).toBeNull();
  });
  it("a gate behind the clock is passed, so a jump past it never asks again", () => {
    expect(nextGate(gates.at(-1)!.atMs)).toBeNull();
  });
});

describe("live holds", () => {
  it("names the five money steps in story order", async () => {
    const { liveStepOf } = await import("../gates");
    const { suppliers } = await import("@/seed/astro");
    const addr = suppliers.find((x) => x.id === "haoyun")!.receiveAddress;
    expect(timeline.map((b) => liveStepOf(b, addr)).filter(Boolean)).toEqual(["commit", "advance", "pay", "refuse", "reclaim"]);
  });
  it("holds the clock before a live step until it is done, then lets it pass", async () => {
    const { stepClockWith, heldAt, liveStepOf } = await import("../gates");
    const commit = timeline.find((b) => b.ev.type === "lock_funds")!;
    const done = new Set<string>();
    const blocked = (b: (typeof timeline)[number]) => liveStepOf(b, "x") === "commit" && !done.has("commit");
    const t = stepClockWith(commit.atMs - 100, commit.atMs + 100, blocked);
    expect(t).toBe(commit.atMs - 1);
    expect(heldAt(t, blocked)?.ev.type).toBe("lock_funds");
    done.add("commit");
    expect(stepClockWith(t, commit.atMs + 100, blocked)).toBe(commit.atMs + 100);
  });
});

describe("present mode stops", () => {
  it("stops at every narratable beat and every camera focus, and describes it plainly", async () => {
    const { isStop, describeStop } = await import("../gates");
    const { scenes } = await import("../scenes");
    const stops = timeline.filter(isStop);
    const say = (b: (typeof timeline)[number]) => describeStop(b, (id) => scenes[id].enter ?? scenes[id].title, "0x2003975a521c6fa45238dbc402c9e4adcb8863e0");
    expect(stops.length).toBeGreaterThan(25);
    expect(stops.map(say)).toEqual(expect.arrayContaining([
      "Switch to the 10MA", "Highlight the actuator motor", "Search for a replacement motor", "Check every match against the 10MA BOM",
      "Lay the offers side by side", "Deliver Haoyun's reply", "Choose Haoyun", "Send PO 1042 for approval", "YES, approve as Luca", "YES, approve as Jordan",
      "Commit the PO total", "Explain what just happened", "Ship from Shenzhen", "Release the advance as the motors leave", "Send packing slip photo",
      "Count the delivery at the dock", "Pay Haoyun the balance for what arrived", "Try a payment to a wrong address", "Show what this protected",
      "At the deadline, return the rest to Astro",
    ]));
    // The negotiation comes before the approvals.
    const said = stops.map(say);
    expect(said.indexOf("Choose Haoyun")).toBeLessThan(said.indexOf("YES, approve as Luca"));
    // The advance goes before the dock count, the balance after it; no YES releases money.
    expect(said.indexOf("Release the advance as the motors leave")).toBeLessThan(said.indexOf("Count the delivery at the dock"));
    expect(said.indexOf("Count the delivery at the dock")).toBeLessThan(said.indexOf("Pay Haoyun the balance for what arrived"));
    expect(said.some((x) => x.startsWith("YES, release"))).toBe(false);
    // Only the first fitment check stops (it carries the "Pins resolve" focus); the rest animate.
    const fits = timeline.filter((b) => b.ev.type === "fitment");
    expect(fits.filter(isStop)).toEqual([fits[0]]);
    expect(fits[0].step).toBe("Pins resolve");
    // Shipment progress and checkpoints only animate between stops.
    expect(timeline.filter((b) => b.ev.type === "shipment" || b.ev.type === "checkpoint").some(isStop)).toBe(false);
  });
});
