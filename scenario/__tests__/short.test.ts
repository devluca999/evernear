// Short mode's run: 9 sections timed from one table, each holding until its speaking time is up and
// pausing before the next; the hook before section 1 and the outro after the end frame; ?pace= and
// ?gap=; every tap reachable by the cursor; the whole run replays the happy path to the end.
import { describe, expect, it } from "vitest";
import { buildShort, HOLD_TO_NEXT, SECTIONS, SHORT, SHORT_ASK_MS, SHORT_PLAN, sectionAt, settledMs, shortOptions, TIMING } from "../short";
import { stateAt } from "../runner";
import { LOOKAHEAD_MS } from "../cursor";
import { SCENARIOS } from "../scenes";

const TITLES = ["The company", "The gap", "Search", "Negotiation", "Approve and commit", "Ship and dock", "Paid", "On chain", "End frame"];
/** The run's length from the table, worked out by hand: hook + each max(animation, speaking) + pauses + outro. */
const expectedTotal = (pace: number = 1, gapMs: number = TIMING.gapMs) =>
  TIMING.hookMs * pace + SECTIONS.reduce((t, sc, i) => t + Math.max(settledMs(sc), TIMING.speakMs[i] * pace), 0) + gapMs * 8 + TIMING.outroMs * pace;

describe("Short mode run", () => {
  it("has the 9 sections in order, with the speaking times of the table", () => {
    expect(SECTIONS.map((s) => s.title)).toEqual(TITLES);
    expect(TIMING).toEqual({ hookMs: 8000, speakMs: [8000, 9000, 13000, 11000, 12000, 9000, 7000, 9000, 4000], gapMs: 2500, outroMs: 14000 });
  });

  it("totals the table: 8 s hook, each section's larger of animation and speaking time, 2.5 s pauses, 14 s outro", () => {
    expect(SHORT.totalMs).toBe(expectedTotal());
    // Every animation fits inside its speaking time, so the run is the talking time plus the pauses.
    for (let i = 0; i < SECTIONS.length; i++) expect(settledMs(SECTIONS[i]), TITLES[i]).toBeLessThanOrEqual(TIMING.speakMs[i]);
    expect(SHORT.totalMs).toBe(8000 + 82_000 + 8 * 2500 + 14_000);
  });

  it("lays the sections end to end: hook, then each section's animation, hold and pause", () => {
    expect(SHORT_PLAN[0].startMs).toBe(0);
    expect(SHORT_PLAN[0].playMs).toBe(TIMING.hookMs);
    for (let i = 0; i < SHORT_PLAN.length; i++) {
      const p = SHORT_PLAN[i], last = i === SHORT_PLAN.length - 1;
      expect(p.endMs - p.playMs, p.title).toBe(Math.max(p.animMs, p.speakMs) + (last ? TIMING.outroMs : TIMING.gapMs));
      if (i > 0) expect(p.startMs).toBe(SHORT_PLAN[i - 1].endMs);
      // Its scene in the timeline begins where the plan says.
      expect(SHORT.timeline.find((b) => b.ev.type === "scene" && b.scene === i)!.atMs).toBe(p.startMs);
    }
    expect(SHORT_PLAN.at(-1)!.endMs).toBe(SHORT.totalMs);
  });

  it("holds the starting view through the hook: nothing but the opening frame before section 1 plays", () => {
    const early = SHORT.timeline.filter((b) => b.atMs < TIMING.hookMs).map((b) => b.ev.type).sort();
    expect(early).toEqual(["scene", "wallet"]);
    expect(stateAt(TIMING.hookMs - 1, SHORT.timeline).proofs).toEqual([]);
  });

  it("scales the talking times with ?pace= and sets the pause with ?gap=", () => {
    expect(shortOptions(new URLSearchParams(""))).toEqual({ pace: 1, gapMs: 2500 });
    expect(shortOptions(new URLSearchParams("pace=1.5&gap=4"))).toEqual({ pace: 1.5, gapMs: 4000 });
    expect(shortOptions(new URLSearchParams("pace=-2&gap=abc"))).toEqual({ pace: 1, gapMs: 2500 });
    const slow = buildShort({ pace: 1.5, gapMs: 4000 });
    expect(slow.totalMs).toBe(expectedTotal(1.5, 4000));
    expect(slow.plan[0].playMs).toBe(12_000);
    const fast = buildShort({ pace: 0.5, gapMs: 0 });
    // At half pace some animations outlast their speaking time: the section waits for them.
    expect(fast.totalMs).toBe(expectedTotal(0.5, 0));
  });

  it("knows where the run is: the hook, then each section and the time left in it", () => {
    expect(sectionAt(SHORT_PLAN, 0)).toEqual({ index: -1, leftMs: 8000 });
    expect(sectionAt(SHORT_PLAN, SHORT_PLAN[2].playMs + 1000)).toEqual({ index: 2, leftMs: SHORT_PLAN[2].endMs - SHORT_PLAN[2].playMs - 1000 });
    expect(sectionAt(SHORT_PLAN, SHORT.totalMs)).toEqual({ index: 8, leftMs: 0 });
  });

  it("gives the cursor time for every tap, and shows each tap's button early enough", () => {
    expect(SHORT_ASK_MS).toBeGreaterThan(LOOKAHEAD_MS);
    const taps = SHORT.timeline.filter((b) => b.clickTarget);
    expect(taps.map((b) => b.gate?.id ?? b.clickTarget)).toEqual(["products.tab.10ma", "start_sourcing", "pick_supplier", "approve_luca", "approve_jordy", "packing_slip"]);
    for (const b of taps) expect(b.atMs - SHORT_PLAN[b.scene].playMs, b.clickTarget).toBeGreaterThanOrEqual(LOOKAHEAD_MS);
  });

  it("ends each zooming section on a zoom that holds into its pause", () => {
    for (const sc of SECTIONS) {
      const zooms = sc.beats.filter(([, , x]) => x && "focus" in x && x.focus);
      if (!zooms.length) continue;
      const lastZoom = zooms.at(-1)![2] as { focus: { holdMs?: number } };
      const endsZoomed = ["The company", "Search", "Approve and commit", "Ship and dock", "Paid", "On chain"].includes(sc.title);
      expect(lastZoom.focus.holdMs === HOLD_TO_NEXT, sc.title).toBe(endsZoomed);
    }
  });

  it("replays the happy path to the end: two approvals, $63,000 committed, 44 of 50 counted, a refused lookalike, closed", () => {
    const end = stateAt(SHORT.totalMs, SHORT.timeline);
    const happy = stateAt(SCENARIOS.happy.totalMs, SCENARIOS.happy.timeline);
    expect(end.halted).toBeNull();
    expect(end.stage).toBe("closed");
    expect(end.approvals.map((a) => a.by)).toEqual(["Luca", "Jordan"]);
    expect(end.escrow?.lockedCents).toBe(6_300_000);
    expect(end.escrow?.lifecycle).toBe(happy.escrow?.lifecycle);
    expect(end.dock?.receivedQty).toBe(44);
    expect(end.refused.some((r) => r.kind === "wrong_address_release")).toBe(true);
    expect(end.endCard).toBe(true);
    expect(end.pin).toBeNull();
  });

  it("holds the drawer on the commit during On chain", () => {
    expect(stateAt(SHORT_PLAN[7].playMs + 1000, SHORT.timeline).pin).toBe("escrow_wallet");
    expect(stateAt(SHORT_PLAN[8].playMs + 500, SHORT.timeline).pin).toBeNull();
  });
});
