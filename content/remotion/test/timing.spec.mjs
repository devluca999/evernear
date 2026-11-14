// Lengths of the newer compositions (src/timing.ts is import-free).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FPS, PARTIAL_FRAMES, JUDGE_DEMO_FRAMES, JUDGE_DEMO_SCENES } from "../src/timing.ts";

test("PartialShipment is 35-45 s", () => {
  const s = PARTIAL_FRAMES / FPS;
  assert.ok(s >= 35 && s <= 45, `${s} s`);
});

test("JudgeDemo is 3-5 min, near 210 s, in 8 acts", () => {
  const s = JUDGE_DEMO_FRAMES / FPS;
  assert.ok(s >= 180 && s <= 300, `${s} s`);
  assert.ok(Math.abs(s - 210) <= 15, `${s} s`);
  assert.ok(Object.keys(JUDGE_DEMO_SCENES).length >= 8);
});
