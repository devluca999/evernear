// @vitest-environment jsdom
// The presenter cursor: every step that clicks has its element on screen, inside the camera, when
// the step comes up; the three waits are answered from Cmd+K by a tap; it never clicks the demo's
// own controls.
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { SCENARIOS, type ScenarioId } from "@/scenario/scenes";
import { clickTargetOf } from "@/scenario/cursor";

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const tick = () => new Promise((r) => setTimeout(r, 0));
const ghost = () => document.querySelector<HTMLElement>("[data-camera] [data-press]");

describe("presenter cursor targets", () => {
  for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
    const clicks = SCENARIOS[id].timeline.filter((b) => clickTargetOf(b));
    it(`${SCENARIOS[id].title}: every click target exists in the DOM, inside the camera, just before its step (${clicks.length})`, async () => {
      for (const b of clicks) {
        window.history.replaceState(null, "", `/?scenario=${id}`);
        const { unmount } = render(<Workspace initialMs={b.atMs - 1} autoplay={false} />);
        await tick();
        const el = document.querySelector(`[data-camera] [data-focus="${clickTargetOf(b)}"]`);
        expect(el, `${id} chapter ${b.scene + 1} ${b.gate?.id ?? b.ev.type}: no [data-focus="${clickTargetOf(b)}"]`).not.toBeNull();
        expect(el!.closest('[aria-label="Demo mode"]')).toBeNull();
        expect((el as HTMLButtonElement).disabled ?? false).toBe(false);
        unmount();
      }
    });
  }
  it("never targets the Live button, Restart or the scenario controls: they sit outside the camera and carry no target", () => {
    render(<Workspace initialMs={0} autoplay={false} />);
    const rail = screen.getByRole("complementary", { name: "Demo mode" });
    for (const name of [/^Live (on|off)$/, /^Restart$/]) {
      const b = within(rail).getByRole("button", { name });
      expect(b.closest("[data-camera]")).toBeNull();
      expect(b.hasAttribute("data-focus")).toBe(false);
    }
    expect(rail.querySelector("[data-focus]")).toBeNull();
  });
});

describe("the three waits from Cmd+K", () => {
  for (const gateId of ["pick_supplier", "approve_luca", "packing_slip"]) {
    it(`${gateId}: Cmd+K glides to the phone button, taps it, then the moment is answered`, async () => {
      const g = SCENARIOS.happy.timeline.find((b) => b.gate?.id === gateId)!;
      render(<Workspace initialMs={g.atMs - 1} autoplay={false} />);
      await tick();
      const waiting = () => screen.queryByRole("group", { name: "Waiting for you" });
      expect(waiting()).not.toBeNull();
      expect(ghost()?.dataset.press).toBe("0");
      act(() => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
      // The click comes first: pressed, and the moment still waits for it.
      await waitFor(() => expect(ghost()?.dataset.press).toBe("1"), { timeout: 2000 });
      expect(waiting()).not.toBeNull();
      // Then the change happens.
      await waitFor(() => expect(waiting()).toBeNull(), { timeout: 2000 });
    });
  }
  it("the right arrow answers too, and clicking the phone button yourself still works at once", async () => {
    const g = SCENARIOS.happy.timeline.find((b) => b.gate?.id === "approve_jordy")!;
    const { unmount } = render(<Workspace initialMs={g.atMs - 1} autoplay={false} />);
    await tick();
    act(() => { fireEvent.keyDown(window, { key: "ArrowRight" }); });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull(), { timeout: 2000 });
    unmount();
    const p = SCENARIOS.happy.timeline.find((b) => b.gate?.id === "approve_luca")!;
    render(<Workspace initialMs={p.atMs - 1} autoplay={false} />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "YES, approve as Luca" }));
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
  });
  it("C turns it off: the arrow goes and Cmd+K answers at once", async () => {
    const g = SCENARIOS.happy.timeline.find((b) => b.gate?.id === "approve_luca")!;
    render(<Workspace initialMs={g.atMs - 1} autoplay={false} />);
    await tick();
    expect(screen.getByRole("button", { name: /Cursor on/ })).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: "c" }); });
    expect(ghost()).toBeNull();
    expect(screen.getByRole("button", { name: /Cursor off/ })).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
  });
  it("is off in Autoplay", async () => {
    render(<Workspace initialMs={0} autoplay={false} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Autoplay" }));
    expect(screen.getByRole("button", { name: /Cursor off/ })).toBeTruthy();
    expect(ghost()).toBeNull();
  });
});
