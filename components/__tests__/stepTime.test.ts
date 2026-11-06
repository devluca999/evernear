import { describe, expect, it } from "vitest";
import { stepTime } from "../workspace/Drawer";
import type { Proof } from "@/scenario/types";

const proof = (x: Partial<Proof>): Proof => ({ id: "x", scene: 0, kind: "k", label: "l", call: "c", codePath: "p", network: "testnet", hash: "h", explorerUrl: null, response: {}, replay: true, synthetic: true, ...x });

describe("step timestamps", () => {
  it("a replayed step shows when it happens in the demo", () => {
    expect(stepTime(proof({ atMs: 83_400 }))).toBe("1:23 in the demo");
    expect(stepTime(proof({ atMs: 5_000 }))).toBe("0:05 in the demo");
  });
  it("a live step shows the clock time it really ran", () => {
    expect(stepTime(proof({ atMs: 5_000, wallMs: Date.UTC(2026, 10, 5, 21, 10, 6) }))).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
