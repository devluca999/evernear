// @vitest-environment jsdom
// The camera component: a focus zooms the stage in one transform and comes back after the hold;
// with reduced motion the same moves are cuts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { Camera } from "../workspace/Camera";
import { DEFAULT_HOLD_MS, IN_MS, OUT_MS } from "@/scenario/camera";

const mockMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes("reduce"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};
afterEach(() => { cleanup(); vi.useRealTimers(); });

const stage = () => document.querySelector<HTMLElement>("[data-camera] > div")!;
const view = (request: { seq: number; focus: { id: string; zoom: number } } | null, holdNext = false) => (
  <Camera on follow={false} request={request} fullSeq={0} holdNext={holdNext}>
    <div data-focus="money.escrow">$63,000</div>
  </Camera>
);

async function zoomTo(reduce: boolean, holdNext = false) {
  mockMotion(reduce);
  vi.useFakeTimers();
  const r = render(view(null, holdNext));
  await act(async () => { await Promise.resolve(); }); // the reduced-motion setting arrives
  r.rerender(view({ seq: 1, focus: { id: "money.escrow", zoom: 2 } }, holdNext));
  return r;
}

describe("presenter camera", () => {
  it("zooms to the focus with a 700 ms spring, holds, then eases back out in 500 ms", async () => {
    await zoomTo(false);
    expect(stage().style.transform).toContain("scale(2)");
    expect(stage().style.transition).toContain(`transform ${IN_MS}ms linear(`);
    expect(document.querySelector("[data-camera]")!.getAttribute("data-focus-on")).toBe("money.escrow");
    await act(async () => { vi.advanceTimersByTime(IN_MS + DEFAULT_HOLD_MS + 10); });
    expect(stage().style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(stage().style.transition).toContain(`transform ${OUT_MS}ms`);
  });
  it("cuts instead of animating when the viewer asks for reduced motion", async () => {
    await zoomTo(true);
    expect(stage().style.transform).toContain("scale(2)");
    expect(stage().style.transition).toBe("none");
    await act(async () => { vi.advanceTimersByTime(DEFAULT_HOLD_MS + 10); });
    expect(stage().style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(stage().style.transition).toBe("none");
  });
  it("stays zoomed after the hold when the next step has its own focus", async () => {
    await zoomTo(false, true);
    await act(async () => { vi.advanceTimersByTime(IN_MS + DEFAULT_HOLD_MS + 10); });
    expect(stage().style.transform).toContain("scale(2)");
  });
});
