// @vitest-environment jsdom
// Live can never be on in Short mode: entering Short turns it off, the Live button is disabled and
// a click on it does nothing, no money step runs on testnet, and the drawer shows the recorded run.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SHORT } from "@/scenario/short";
import { sceneStartMs } from "@/scenario/runner";

const live = { on: false, available: true, done: [] as string[], pending: null as string | null, error: null, rows: [], byKey: {}, preflight: null, releasePath: null,
  run: vi.fn(async () => {}), reset: vi.fn(), setOn: vi.fn((v: boolean) => { live.on = v; }), check: vi.fn() };
vi.mock("../workspace/useLive", () => ({ useLive: () => live }));
const { Workspace } = await import("../workspace/Workspace");

afterEach(() => { cleanup(); live.on = false; live.setOn.mockClear(); live.run.mockClear(); window.history.replaceState(null, "", "/"); });
const liveButton = () => within(screen.getByRole("complementary", { name: "Demo mode" })).getByRole("button", { name: /^Live (on|off)$/ });

describe("Live in Short mode", () => {
  it("is available outside Short mode, so the lock below is Short's doing", () => {
    render(<Workspace initialMs={0} autoplay={false} />);
    expect((liveButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("cannot be turned on: the button is disabled and a click does nothing", async () => {
    window.history.replaceState(null, "", "/?mode=short");
    render(<Workspace initialMs={0} autoplay={false} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const b = liveButton() as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain("Live off");
    fireEvent.click(b);
    expect(live.setOn).not.toHaveBeenCalledWith(true);
    expect(screen.getByRole("complementary", { name: "Demo mode" }).textContent).toContain("Live is off in Short mode");
  });

  it("is turned off when you switch to Short with it on, and no money step runs while sections play", async () => {
    live.on = true;
    render(<Workspace initialMs={0} autoplay={false} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Short" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(live.setOn).toHaveBeenCalledWith(false);
    expect(live.on).toBe(false);
    cleanup();
    // Even if Live were still on, Short never fires a live step: the commit section plays through.
    live.on = true;
    window.history.replaceState(null, "", "/?mode=short");
    render(<Workspace initialMs={sceneStartMs(4, SHORT.scenes) + 9500} autoplay={false} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(live.run).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Scenario numbers" }).textContent).toContain("$63,000");
  });
});
