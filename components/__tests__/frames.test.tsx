// @vitest-environment jsdom
// Every zoom shows its card in full. Each step with a camera focus declares what its frame must show
// (scenes.ts `shows`); at the moment the step runs, in every scenario, the focused element holds all
// of it, nothing in it is cut with an ellipsis (a hash or an address shortened on purpose carries
// `data-abbr`), and the camera's frame fits the whole element with room around it.
// The same check in a real browser at 1920x1080, with layout, is scripts/check-frames.mjs.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { showsAll } from "../workspace/Camera";
import { SCENARIOS, type ScenarioId } from "@/scenario/scenes";
import { cameraTarget, PAD, ZOOM_MAX, type Rect } from "@/scenario/camera";

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, "", "/"); });

/** Text in the element that is cut short: an ellipsis anywhere but inside a deliberate abbreviation. */
function cutText(el: Element): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? "";
    if (/…|\.\.\./.test(text) && !n.parentElement?.closest("[data-abbr]")) out.push(text.trim());
  }
  return out;
}

describe("every zoom shows its card in full", () => {
  for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
    const steps = SCENARIOS[id].timeline.filter((b) => b.focus);
    it(`${SCENARIOS[id].title}: each of ${steps.length} zooms declares what it shows, and shows all of it uncut`, async () => {
      for (const b of steps) {
        const where = `${id} chapter ${b.scene + 1} "${b.step}"`;
        expect(b.focus!.shows.length, `${where} declares nothing to show`).toBeGreaterThan(0);
        window.history.replaceState(null, "", `/?scenario=${id}`);
        const { unmount } = render(<Workspace initialMs={b.atMs} autoplay={false} />);
        await new Promise((r) => setTimeout(r, 0));
        const el = document.querySelector<HTMLElement>(`[data-camera] [data-focus="${b.focus!.id}"]`);
        expect(el, `${where}: no [data-focus="${b.focus!.id}"]`).not.toBeNull();
        expect(showsAll(el!, b.focus!.shows), `${where}: "${el!.textContent}" lacks one of ${JSON.stringify(b.focus!.shows)}`).toBe(true);
        expect(cutText(el!), `${where}: text cut short`).toEqual([]);
        unmount();
      }
    }, 30_000); // one full workspace render per zoom: slow on a loaded machine
  }
});

describe("the camera frames the whole element", () => {
  const vp = { w: 1620, h: 1080 };
  it("puts any element that fits the viewport fully inside it, with padding, at any asked zoom", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const w = 10 + rnd() * (vp.w - 2 * PAD - 10), h = 10 + rnd() * (vp.h - 2 * PAD - 10);
      const r: Rect = { x: rnd() * (vp.w - w), y: rnd() * (vp.h - h), w, h };
      const v = cameraTarget(r, vp, 1 + rnd() * (ZOOM_MAX - 1));
      const left = v.x + r.x * v.k, top = v.y + r.y * v.k;
      expect(left).toBeGreaterThanOrEqual(-0.01);
      expect(top).toBeGreaterThanOrEqual(-0.01);
      expect(left + r.w * v.k).toBeLessThanOrEqual(vp.w + 0.01);
      expect(top + r.h * v.k).toBeLessThanOrEqual(vp.h + 0.01);
      // Room around it: never zoomed so far that the element meets both edges.
      expect(r.w * v.k <= vp.w - 2 * PAD + 0.01 || v.k === 1).toBe(true);
      expect(r.h * v.k <= vp.h - 2 * PAD + 0.01 || v.k === 1).toBe(true);
    }
  });
});
