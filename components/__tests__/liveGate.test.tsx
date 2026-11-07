// @vitest-environment jsdom
// Live on: Cmd+K never skips a money step that has not run, and does nothing while one confirms.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { timeline } from "@/scenario/scenes";
import { stateAt } from "@/scenario/runner";

const live = { on: true, available: true, done: [] as string[], pending: null as string | null, error: null, rows: [], byKey: {}, preflight: { ok: true, walletsLeft: 20, walletLimit: 25, treasuryUsd: 107.73, needUsd: 63, message: "" }, releasePath: null,
  run: vi.fn(async () => {}), reset: vi.fn(), setOn: vi.fn(), check: vi.fn() };
vi.mock("../workspace/useLive", () => ({ useLive: () => live }));
const { Workspace } = await import("../workspace/Workspace");

afterEach(() => { cleanup(); live.pending = null; live.done = []; live.run.mockClear(); });
const lock = timeline.find((b) => b.ev.type === "lock_funds")!;
const committed = () => screen.getByRole("group", { name: "Scenario numbers" }).textContent!.includes("$63,000");

describe("live money steps hold the presenter", () => {
  it("a press while the clock runs toward the commit stops at it, never past it", async () => {
    render(<Workspace initialMs={lock.atMs - 600} autoplay={false} />);
    await act(async () => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    expect(committed()).toBe(false);
    expect(live.run).toHaveBeenCalledWith("commit", "happy");
  });
  it("while the commit confirms, Cmd+K does nothing and Money says what is happening", async () => {
    live.pending = "commit";
    render(<Workspace initialMs={lock.atMs - 1} autoplay={false} />);
    await act(async () => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    await act(async () => { fireEvent.keyDown(window, { key: "ArrowRight" }); });
    expect(committed()).toBe(false);
    expect(screen.getByText("Committing $63.00 on Tidepool testnet")).toBeTruthy();
    expect(stateAt(lock.atMs - 1).escrow).toBeNull();
  });
  it("once confirmed, the next press commits", async () => {
    live.done = ["commit"];
    render(<Workspace initialMs={lock.atMs - 1} autoplay={false} />);
    await act(async () => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    expect(committed()).toBe(true);
  });
});
