// Short mode: the happy path as 9 sections for a short video that plays by itself. One press starts
// the run: the starting view holds for the hook, then each section plays its animation (its taps
// done by the presenter cursor), holds on its final frame until its speaking time is up, pauses, and
// the next one starts on its own. The end frame holds for the outro, then the run stops. The times
// are in one table (TIMING); ?pace= scales the talking times and ?gap= sets the pause.
// The messages, gates and proofs are the happy path's own (scenes.ts), looked up by chapter and time,
// so their words live in one place. Live is always off in Short mode; the replay uses the recorded
// testnet run (fixtures/recorded/live-run.json).
import type { Event, Focus, Gate } from "./types";
import { gateOf, scenario, scenes, step, tab, type Entry, type Extra, type Scene } from "./scenes";
import { MOTOR_PART } from "../seed/astro";
import { IN_MS } from "./camera";

/** A zoom that stays until the next section starts (the section's last one). */
export const HOLD_TO_NEXT = 10 * 60_000;
/** How far ahead of a tap its button shows as waiting, so the cursor can glide to it. */
export const SHORT_ASK_MS = 1600;

/**
 * A happy-path beat by its chapter (0-based), time and, where two beats share the time, event type.
 * A script change there fails loudly here instead of picking the wrong beat.
 */
function happy(chapter: number, atMs: number, type?: Event["type"]): Entry {
  const all = scenes[chapter].beats.filter((b) => b[0] === atMs && (!type || b[1].type === type));
  if (all.length !== 1) throw new Error(`short.ts: ${all.length} happy-path beats at chapter ${chapter + 1}, ${atMs} ms${type ? ` (${type})` : ""}`);
  return all[0];
}
const ev = (chapter: number, atMs: number, type?: Event["type"]): Event => happy(chapter, atMs, type)[1];
const gate = (chapter: number, atMs: number): Gate => {
  const g = gateOf(happy(chapter, atMs));
  if (!g) throw new Error(`short.ts: no gate at chapter ${chapter + 1}, ${atMs} ms`);
  return g;
};
/** A happy-path step's zoom, held for `holdMs` here. */
function zoom(chapter: number, atMs: number, holdMs: number, type?: Event["type"]): Extra {
  const x = happy(chapter, atMs, type)[2] as Extra | undefined;
  if (!x?.focus) throw new Error(`short.ts: no zoom at chapter ${chapter + 1}, ${atMs} ms`);
  return { ...x, focus: { ...x.focus, holdMs } satisfies Focus };
}
const fitment = (supplierId: string): Event => ({ type: "fitment", supplierId });

/** The 9 sections' animations. Their `durationMs` is set by buildShort from TIMING. */
export const SECTIONS: Scene[] = [
  { id: 0, title: "The company", durationMs: 0, layout: scenes[0].layout, grid: scenes[0].grid, status: "Stockbot ready",
    line: "Astro Robotics and its 10MA: the bill of materials, and the actuator motor in it.", enter: "Play the company", beats: [
    [0, ev(0, 0)],
    [1000, ev(0, 5200), step("Switch to the 10MA", "products.figure", 1.4, ["10MA"], { clickTarget: tab("10ma"), holdMs: 2000 })],
    [1300, ev(0, 1000)],
    [3400, ev(0, 2200), step("Bill of materials", "products.bom", 1.6, [MOTOR_PART], { holdMs: 2200 })],
    [6300, ev(0, 8000), step("Actuator motor", "products.motor", 2.2, ["48 V"], { holdMs: HOLD_TO_NEXT })],
  ] },
  { id: 1, title: "The gap", durationMs: 0, layout: scenes[1].layout, grid: scenes[1].grid, status: "Checking stock",
    line: "Orders climb to 500 robots against motors for 450. Ultra Motion is out for 6 weeks.", enter: "Play the gap", beats: [
    [300, ev(1, 300)],
    [700, ev(1, 900)],
    [1100, ev(1, 1500), zoom(1, 1500, 2300)],
    [3700, { type: "layout", panels: scenes[2].layout }],
    [3900, ev(2, 500), zoom(2, 500, 2200)],
    [5800, ev(2, 3500)],
    [7600, ev(2, 6000), gate(2, 6000)],
  ] },
  { id: 2, title: "Search", durationMs: 0, layout: scenes[3].layout, grid: scenes[3].grid, status: scenes[3].status,
    line: "Stockbot compares 5 suppliers in a private enclave. 2 fit, 1 is late, 2 fail.", enter: "Play the search", beats: [
    [200, ev(3, 300)],
    [500, ev(3, 700), zoom(3, 700, 1900)],
    [1000, ev(3, 1200)],
    // The explainer: the camera frames the whole Explained column (the drawer shows only that column
    // and its diagram while the proof beside it would be a synthetic placeholder).
    [2900, ev(3, 2800), step("Private inference", "developer.attestation", 1.3, ["Private inference in an enclave", "What happened"], { holdMs: 2300 })],
    [5600, { type: "explain", id: null }],
    [6000, fitment("haoyun"), step("Pins resolve", "map.results", 1.3, ["Comparing suppliers", "Haoyun Precision"], { holdMs: HOLD_TO_NEXT })],
    [7000, fitment("quickship")],
    [8000, fitment("kansai")],
    [9000, fitment("rheinwerk")],
    [10000, fitment("huaxin")],
    [10600, ev(3, 11000)],
  ] },
  { id: 3, title: "Negotiation", durationMs: 0, layout: ["inbox", "rules"], grid: { cols: "640fr 360fr" }, phone: true, clock: scenes[4].clock, status: scenes[4].status,
    line: "Both ask +10% against a 5% ceiling. Stockbot counters; Haoyun agrees at $1,260.", enter: "Play the negotiation", beats: [
    [200, ev(4, 300)],
    [250, ev(4, 350)],
    [300, ev(4, 400)],
    [400, ev(4, 500)],
    [500, ev(4, 600), zoom(4, 600, 1700)],
    [3000, ev(4, 3400), step("The 5% ceiling", "rules.ceiling", 1.9, ["Price change up to", "Limit 5%"], { holdMs: 1600 })],
    [4400, ev(4, 4400)],
    [4500, ev(4, 4500)],
    [4900, ev(4, 5000)],
    [5800, ev(4, 7500)],
    [5900, ev(4, 7600)],
    [6000, ev(4, 7700), zoom(4, 7700, 1500)],
    [7000, ev(4, 9500)],
    [7100, ev(4, 9600)],
    [7600, ev(4, 11000)],
    [9400, ev(4, 13500), gate(4, 13500)],
    [10000, ev(4, 14500)],
  ] },
  { id: 4, title: "Approve and commit", durationMs: 0, layout: scenes[5].layout, grid: scenes[5].grid, phone: true, clock: scenes[5].clock, status: scenes[5].status,
    line: scenes[5].line, enter: "Play approve and commit", beats: [
    [200, ev(5, 300)],
    [600, ev(5, 1000), step("Two approvals over $10K", "rules.order", 1.3, ["Auto approve under", "$10K", "Approval slots"], { holdMs: 1500 })],
    [4400, ev(5, 2800), gate(5, 2800)],
    [4500, ev(5, 2900)],
    [5000, ev(5, 4400)],
    [6600, ev(5, 6200), gate(5, 6200)],
    [6700, ev(5, 6300)],
    [6900, ev(5, 6600)],
    [7600, ev(5, 8000), zoom(5, 8000, 1700)],
    [7700, ev(5, 8100)],
    [9300, ev(5, 9500), step("Two exits", "money.exits", 1.8, ["Order wallet can pay", "Haoyun Precision", "Astro Robotics", "Refused"], { holdMs: HOLD_TO_NEXT })],
  ] },
  { id: 5, title: "Ship and dock", durationMs: 0, layout: scenes[6].layout, grid: scenes[6].grid, phone: true, clock: scenes[6].clock, status: scenes[6].status,
    line: scenes[6].line, enter: "Play ship and dock", beats: [
    [200, ev(6, 300)],
    [250, ev(6, 400)],
    [500, ev(6, 1000)],
    [550, ev(6, 1100)],
    [800, ev(6, 2200)],
    [850, ev(6, 2300)],
    [900, ev(6, 2400)],
    [1100, ev(6, 3000), zoom(6, 3000, 1800)],
    [1200, ev(6, 3100)],
    [1500, ev(6, 4600)],
    [1600, ev(6, 4800)],
    [1700, ev(6, 5000)],
    [2000, ev(6, 5200)],
    [2600, ev(6, 6200)],
    [3200, ev(6, 7200)],
    [3300, ev(6, 7300)],
    [3400, ev(6, 7600)],
    [3450, ev(6, 7700)],
    [3500, ev(6, 7800)],
    [3600, ev(6, 8000)],
    [3700, ev(6, 8100)],
    [3900, ev(6, 8200)],
    [4100, ev(6, 8600)],
    [5600, ev(6, 9200), gate(6, 9200)],
    [5700, ev(6, 9300)],
    [6200, ev(6, 11000), zoom(6, 11000, 1500)],
    [6300, ev(6, 11100)],
    [6400, ev(6, 11200)],
    [7800, ev(6, 14800, "release"), zoom(6, 14800, HOLD_TO_NEXT, "release")],
    [7900, ev(6, 14900)],
    [8000, ev(6, 15000)],
    [8600, ev(6, 17000)],
  ] },
  { id: 6, title: "Paid", durationMs: 0, layout: scenes[7].layout, grid: scenes[7].grid, status: scenes[7].status,
    line: "A payment to a lookalike address is refused. What the two-stage escrow protected.", enter: "Play paid", beats: [
    [300, ev(7, 500), zoom(7, 500, 3800)],
    [400, ev(7, 600)],
    [4800, ev(7, 3000), zoom(7, 3000, HOLD_TO_NEXT)],
  ] },
  { id: 7, title: "On chain", durationMs: 0, layout: scenes[7].layout, grid: scenes[7].grid, status: scenes[7].status,
    line: "The commit's real NEAR testnet transaction, one click from NearBlocks.", enter: "Play on chain", beats: [
    [300, { type: "pin", key: "escrow_wallet" }, step("On chain", "developer.chain", 2.0, ["Hash", "View on NearBlocks"], { holdMs: HOLD_TO_NEXT })],
  ] },
  { id: 8, title: "End frame", durationMs: 0, layout: scenes[7].layout, grid: scenes[7].grid, status: scenes[7].status,
    line: "0 wires. 0 days waiting. 1 human decision.", enter: "Play the end frame", beats: [
    [100, { type: "pin", key: null }],
    [200, ev(7, 8500, "end_card")],
    [300, ev(7, 8700)],
    [400, ev(7, 11500)],
    [500, ev(7, 12000)],
    [600, ev(7, 12100)],
  ] },
];

/**
 * When a section has finished moving, ms after it starts: its last step, plus the camera's move in
 * when that step zooms. The section then holds on this frame.
 */
export function settledMs(sc: Scene): number {
  return Math.max(0, ...sc.beats.map(([at, , x]) => at + (x && "focus" in x && x.focus ? IN_MS : 1)));
}

/**
 * The run's timing, in one table. Each section's total is the larger of its animation and its
 * speaking time, plus the pause; the last one holds for the outro instead of a pause.
 */
export const TIMING = {
  /** The starting view, before section 1: the hook. */
  hookMs: 8000,
  /** Speaking time per section, in order. */
  speakMs: [8000, 9000, 13000, 11000, 12000, 9000, 7000, 9000, 4000],
  /** The pause after each section but the last. */
  gapMs: 2500,
  /** How long the end frame holds after its speaking time, for the outro. Then the run stops. */
  outroMs: 14000,
} as const;

export interface ShortOptions {
  /** Multiplies the talking times (hook, speaking, outro); default 1. */
  pace?: number;
  /** The pause between sections, ms; default TIMING.gapMs. */
  gapMs?: number;
}

/** One section of the run, in ms from the start of the run. */
export interface SectionPlan {
  title: string;
  /** When its scene begins (section 1: the start of the run, the hook included). */
  startMs: number;
  /** When its animation starts: where a skip lands. */
  playMs: number;
  animMs: number;
  speakMs: number;
  /** When it ends and the next one starts. */
  endMs: number;
}

/** Reads ?pace= and ?gap= (seconds): out-of-range or missing values fall back to the defaults. */
export function shortOptions(q: URLSearchParams): ShortOptions {
  const pace = Number(q.get("pace")), gap = Number(q.get("gap"));
  return {
    pace: q.has("pace") && pace > 0 && pace <= 10 ? pace : 1,
    gapMs: q.has("gap") && gap >= 0 && gap <= 60 ? Math.round(gap * 1000) : TIMING.gapMs,
  };
}

/** The run: the 9 sections timed from TIMING, as a scenario, with each section's plan. */
export function buildShort(o: ShortOptions = {}) {
  const pace = o.pace ?? 1, gapMs = o.gapMs ?? TIMING.gapMs;
  const hookMs = Math.round(TIMING.hookMs * pace);
  const plan: SectionPlan[] = [];
  let at = 0;
  const list: Scene[] = SECTIONS.map((sc, i) => {
    const last = i === SECTIONS.length - 1;
    const animMs = settledMs(sc), speakMs = Math.round(TIMING.speakMs[i] * pace);
    const lead = i === 0 ? hookMs : 0;
    const durationMs = lead + Math.max(animMs, speakMs) + (last ? Math.round(TIMING.outroMs * pace) : gapMs);
    plan.push({ title: sc.title, startMs: at, playMs: at + lead, animMs, speakMs, endMs: at + durationMs });
    at += durationMs;
    // Section 1 waits out the hook on the starting view: its steps move back by the hook (the
    // opening frame at 0 stays where it is).
    const beats = lead ? sc.beats.map((b) => (b[0] === 0 ? b : ([b[0] + lead, ...b.slice(1)] as typeof b))) : sc.beats;
    return { ...sc, durationMs, beats };
  });
  return { scenario: scenario("short", "Short", "The happy path as 9 sections that play by themselves, with time to talk.", list), plan, totalMs: at, hookMs };
}

/** The run at the default pace and pause. */
export const SHORT = buildShort().scenario;
export const SHORT_PLAN = buildShort().plan;

/** Where the run is at `t`: the section on screen (-1 during the hook), and the time left in it. */
export function sectionAt(plan: SectionPlan[], t: number): { index: number; leftMs: number } {
  if (t < plan[0].playMs) return { index: -1, leftMs: plan[0].playMs - t };
  const i = plan.findIndex((p) => t < p.endMs);
  const index = i < 0 ? plan.length - 1 : i;
  return { index, leftMs: Math.max(0, plan[index].endMs - t) };
}
