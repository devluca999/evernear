// @vitest-environment jsdom
// Short mode in the workspace: nothing plays until a press; each press plays one whole section and
// holds; a press while a section plays does nothing; the taps inside a section happen by themselves
// with the presenter cursor; every zoom target exists and shows what it declares; the remote names
// the section and the next one.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { Remote } from "../workspace/Remote";
import { showsAll } from "../workspace/Camera";
import { SHORT } from "@/scenario/short";
import { sceneStartMs } from "@/scenario/runner";
import { clickTargetOf } from "@/scenario/cursor";

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });

const tick = () => new Promise((r) => setTimeout(r, 0));
const rail = () => screen.getByRole("complementary", { name: "Demo mode" });
const label = () => within(rail()).getByText(/^Short · /).textContent;
const nextBtn = () => within(within(rail()).getByRole("group", { name: "Next step" })).getByRole("button");
const press = () => act(() => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Real-time-like: the clock in 100 ms slices, each rendered, as frames would be in a browser. */
const play = (ms: number) => { for (let x = 0; x < ms; x += 100) wait(100); };
const ghostPresses = () => Number(document.querySelector<HTMLElement>("[data-camera] [data-press]")?.dataset.press ?? 0);
/** Opens the workspace in Short mode with a fake clock, the way the page loads it. */
async function openShort(query = "") {
  vi.useFakeTimers();
  window.history.replaceState(null, "", `/?mode=short${query}`);
  render(<Workspace />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe("Short mode: one press, one section", () => {
  it("opens on the clean starting view and plays nothing until a press", async () => {
    await openShort();
    expect(label()).toBe("Short · Ready");
    expect(nextBtn().textContent).toContain("Play The company");
    wait(20_000);
    expect(label()).toBe("Short · Ready");
    // Astro Robotics with the 10MA on screen; no step has run (the drawer has no entry yet).
    expect(within(screen.getByRole("tablist", { name: "Products" })).getByRole("tab", { selected: true }).textContent).toBe("10MA");
    expect(screen.getByText("Astro's wallet")).toBeTruthy();
    expect(document.querySelector('[data-focus="products.motor"]')).toBeNull();
    expect(document.querySelector('[data-focus="developer.hash"]')).toBeNull();
  });

  it("plays a whole section on a press, holds on its final frame, and never starts the next by itself", async () => {
    await openShort();
    press();
    wait(SHORT.scenes[0].durationMs + 200);
    expect(label()).toBe("Short · Section 1 of 9");
    expect(document.querySelector('[data-focus="products.motor"]')).not.toBeNull();
    expect(nextBtn().textContent).toContain("Play The gap");
    wait(30_000);
    expect(label()).toBe("Short · Section 1 of 9");
    press();
    wait(200);
    expect(label()).toBe("Short · Section 2 of 9");
  });

  it("ignores Cmd+K and the right arrow while a section is still playing", async () => {
    await openShort();
    press();
    wait(2000);
    expect(nextBtn().textContent).toContain("Section 1 playing");
    expect((nextBtn() as HTMLButtonElement).disabled).toBe(true);
    press();
    act(() => { fireEvent.keyDown(window, { key: "ArrowRight" }); });
    wait(SHORT.scenes[0].durationMs);
    // Still on section 1, held at its end: the extra presses did not skip ahead.
    expect(label()).toBe("Short · Section 1 of 9");
    expect(nextBtn().textContent).toContain("Play The gap");
  });

  it("does the taps inside each section with the presenter cursor: the 10MA tab, Start sourcing, Choose Haoyun, both YES, the packing slip", async () => {
    await openShort();
    for (let i = 0; i < 6; i++) {
      press();
      play(SHORT.scenes[i].durationMs + 300);
      expect(label()).toBe(`Short · Section ${i + 1} of 9`);
    }
    expect(ghostPresses()).toBe(6);
    // The money moved through every step on the way: the balance went to Haoyun.
    expect(document.querySelector('[data-focus="money.payout"]')?.textContent).toContain("Paid to Haoyun Precision");
  });

  it("the left arrow arms the current section again for another take", async () => {
    await openShort();
    press(); wait(SHORT.scenes[0].durationMs + 200);
    press(); wait(SHORT.scenes[1].durationMs + 200);
    expect(label()).toBe("Short · Section 2 of 9");
    act(() => { fireEvent.keyDown(window, { key: "ArrowLeft" }); });
    expect(label()).toBe("Short · Section 1 of 9");
    expect(nextBtn().textContent).toContain("Play The gap");
    wait(10_000);
    expect(label()).toBe("Short · Section 1 of 9");
  });

  it("turns on from the demo panel's Short toggle", () => {
    render(<Workspace initialMs={0} autoplay={false} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Short" }));
    expect(label()).toBe("Short · Ready");
    expect(within(rail()).getByRole("list", { name: "Sections" })).toBeTruthy();
    expect(within(rail()).queryByRole("radiogroup", { name: "Scenario" })).toBeNull();
  });

  it("On chain opens the drawer on the Commit entry, with its real hash and its View on NearBlocks button", async () => {
    window.history.replaceState(null, "", "/?mode=short");
    render(<Workspace initialMs={sceneStartMs(7, SHORT.scenes) + 1500} autoplay={false} />);
    const drawer = screen.getByLabelText("Developer drawer");
    await waitFor(() => expect(drawer.getAttribute("data-open")).toBe("true"));
    const chain = drawer.querySelector<HTMLElement>('[data-focus="developer.chain"]')!;
    expect(chain.textContent).toContain("366nhBeJvx6Ch7kpx2ZR8ZchQvBDrxVhtPFe8J62ynC1");
    const link = within(chain).getByRole("link", { name: /View on NearBlocks/ });
    expect(link.getAttribute("href")).toBe("https://testnet.nearblocks.io/txns/366nhBeJvx6Ch7kpx2ZR8ZchQvBDrxVhtPFe8J62ynC1");
    const current = within(screen.getByRole("navigation", { name: "Steps so far" })).getAllByRole("button").find((b) => b.getAttribute("aria-current") === "step");
    expect(current?.textContent).toContain("Committed for PO 1042");
  });
});

describe("Short mode: every zoom target exists", () => {
  const steps = SHORT.timeline.filter((b) => b.focus);
  it(`each of ${steps.length} zooms finds its element on the stage, showing all it declares, uncut`, async () => {
    for (const b of steps) {
      const where = `section ${b.scene + 1} "${b.step}"`;
      window.history.replaceState(null, "", "/?mode=short");
      const { unmount } = render(<Workspace initialMs={b.atMs} autoplay={false} />);
      await tick();
      const el = document.querySelector<HTMLElement>(`[data-camera] [data-focus="${b.focus!.id}"]`);
      expect(el, `${where}: no [data-focus="${b.focus!.id}"]`).not.toBeNull();
      expect(showsAll(el!, b.focus!.shows), `${where}: "${el!.textContent}" lacks one of ${JSON.stringify(b.focus!.shows)}`).toBe(true);
      const walk = document.createTreeWalker(el!, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (/…/.test(n.textContent ?? "")) expect(n.parentElement?.closest("[data-abbr]"), `${where}: cut text "${n.textContent}"`).not.toBeNull();
      }
      unmount();
    }
  });
  it("every tap's button is on the stage just before the cursor sets off for it", async () => {
    for (const b of SHORT.timeline.filter((x) => clickTargetOf(x))) {
      window.history.replaceState(null, "", "/?mode=short");
      const { unmount } = render(<Workspace initialMs={b.atMs - 900} autoplay={false} />);
      await tick();
      const el = document.querySelector<HTMLButtonElement>(`[data-camera] [data-focus="${clickTargetOf(b)}"]`);
      expect(el, `section ${b.scene + 1} ${b.gate?.id ?? b.ev.type}: no [data-focus="${clickTargetOf(b)}"]`).not.toBeNull();
      expect(el!.disabled ?? false).toBe(false);
      unmount();
    }
  });
});

describe("Short mode on the /present remote", () => {
  it("shows the section number and the next section's name", async () => {
    window.history.replaceState(null, "", "/?mode=short&scene=3");
    render(<><Workspace /><Remote /></>);
    await waitFor(() => expect(screen.getByRole("region", { name: "Section" }).textContent).toContain("Section 2 of 9"), { timeout: 3000 });
    const card = screen.getByRole("region", { name: "Section" });
    expect(within(card).getByRole("heading").textContent).toBe("The gap");
    expect(card.textContent).toContain("Next: Search");
    expect(within(card).getByRole("button").textContent).toContain("Play Search");
  });
});
