// @vitest-environment jsdom
// Every camera focus in the story resolves: at the moment its step runs, the element it names is
// on screen in that chapter, in every scenario.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { SCENARIOS, type ScenarioId } from "@/scenario/scenes";

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, "", "/"); });

describe("camera focus resolution", () => {
  for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
    const steps = SCENARIOS[id].timeline.filter((b) => b.focus);
    it(`${SCENARIOS[id].title}: every focus id exists in the DOM for its chapter (${steps.length} steps)`, async () => {
      expect(steps.length).toBeGreaterThan(0);
      for (const b of steps) {
        window.history.replaceState(null, "", `/?scenario=${id}`);
        const { unmount } = render(<Workspace initialMs={b.atMs} autoplay={false} />);
        // The scenario comes from the URL a tick after mount.
        await new Promise((r) => setTimeout(r, 0));
        const el = document.querySelector(`[data-camera] [data-focus="${b.focus!.id}"]`);
        expect(el, `${id} chapter ${b.scene + 1} "${b.step}": no [data-focus="${b.focus!.id}"]`).not.toBeNull();
        unmount();
      }
    });
  }
});
