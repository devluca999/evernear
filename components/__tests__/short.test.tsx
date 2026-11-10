// @vitest-environment jsdom
// Short mode in the workspace: nothing plays until Play; then the whole run plays by itself to the
// end with no presses, at the table's length, its taps done by the presenter cursor; Space pauses and
// resumes; Cmd+K skips ahead; the recorded screen shows no countdown while the /present remote shows
// the section, the time left and the next section; every zoom target exists; and the three fixes
// (the explainer alone in the drawer, the map's labels, the badges' story dates) hold.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { Remote } from "../workspace/Remote";
import { showsAll } from "../workspace/Camera";
import { SHORT, SHORT_PLAN, TIMING } from "@/scenario/short";
import { clickTargetOf } from "@/scenario/cursor";
import { STORY_STAMPS } from "@/scenario/storyDates";
import { story } from "@/seed/astro";

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });

const tick = () => new Promise((r) => setTimeout(r, 0));
const rail = () => screen.getByRole("complementary", { name: "Demo mode" });
const label = () => within(rail()).getByText(/^Short · /).textContent;
const nextBtn = () => within(within(rail()).getByRole("group", { name: "Next step" })).getByRole("button");
const press = () => act(() => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
const space = () => act(() => { fireEvent.keyDown(window, { key: " " }); });
/** The clock in 100 ms slices, each rendered, as browser frames would be. */
const play = (ms: number) => { for (let x = 0; x < ms; x += 100) act(() => { vi.advanceTimersByTime(100); }); };
const ghostPresses = () => Number(document.querySelector<HTMLElement>("[data-camera] [data-press]")?.dataset.press ?? 0);
const shown = (sel: string) => document.querySelector(`[data-camera] ${sel}`) !== null;
async function openShort(query = "") {
  vi.useFakeTimers();
  window.history.replaceState(null, "", `/?mode=short${query}`);
  render(<Workspace />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe("Short mode plays by itself", () => {
  it("waits on the starting view until Play: nothing moves before it", async () => {
    await openShort();
    expect(label()).toBe("Short · Ready");
    expect(nextBtn().textContent).toContain("Play");
    play(20_000);
    expect(label()).toBe("Short · Ready");
    expect(within(screen.getByRole("tablist", { name: "Products" })).getByRole("tab", { selected: true }).textContent).toBe("10MA");
    expect(shown('[data-focus="developer.hash"]')).toBe(false);
  });

  it("plays the whole run with one press and no other: hook, 9 sections with their taps, end frame, stop, at the table's length", async () => {
    await openShort();
    press();
    // The hook holds the starting view.
    play(TIMING.hookMs - 500);
    expect(label()).toBe("Short · Opening");
    expect(shown('[data-focus="products.motor"]')).toBe(false);
    // Each section starts on its own when the one before has had its time.
    for (let i = 0; i < SHORT_PLAN.length; i++) {
      play(SHORT_PLAN[i].endMs - (i === 0 ? TIMING.hookMs - 500 : SHORT_PLAN[i].startMs) - 200);
      expect(label(), `during ${SHORT_PLAN[i].title}`).toBe(`Short · Section ${i + 1} of 9`);
      play(200);
    }
    // At the table's total the run has stopped on the end frame (a moment's slack: the fake frames
    // trail the clock by a few ms each).
    play(1000);
    expect(screen.getByRole("region", { name: "End card" }).textContent).toContain("0 wires. 0 days waiting. 1 human decision.");
    expect(nextBtn().textContent).toContain("Run finished");
    expect(ghostPresses()).toBe(6);
    play(10_000);
    expect(label()).toBe("Short · Section 9 of 9");
  }, 60_000); // two minutes of story, rendered frame by frame

  it("Space pauses and resumes the run", async () => {
    await openShort();
    press();
    play(TIMING.hookMs + 2000);
    space();
    const paused = label();
    play(30_000);
    expect(label()).toBe(paused);
    expect(within(rail()).getByText("Paused")).toBeTruthy();
    space();
    play(SHORT_PLAN[0].endMs - TIMING.hookMs);
    expect(label()).toBe("Short · Section 2 of 9");
  });

  it("Cmd+K skips ahead to the next section while the run plays", async () => {
    await openShort();
    press();
    play(1000);
    press();
    play(100);
    expect(label()).toBe("Short · Section 1 of 9");
    press();
    play(100);
    expect(label()).toBe("Short · Section 2 of 9");
  });

  it("shows no countdown on the recorded screen", async () => {
    await openShort();
    press();
    play(TIMING.hookMs + 3000);
    const stage = document.querySelector("[data-camera]")!.textContent!;
    expect(rail().textContent).not.toMatch(/\d+ ?s left|left in/i);
    expect(stage).not.toMatch(/\d+ ?s left|left in/i);
  });
});

describe("Short mode on the /present remote", () => {
  it("shows the section number, the time left in it and the next section's name", async () => {
    window.history.replaceState(null, "", "/?mode=short&scene=3");
    render(<><Workspace /><Remote /></>);
    await waitFor(() => expect(screen.getByRole("region", { name: "Section" }).textContent).toContain("Section 3 of 9"), { timeout: 3000 });
    const card = screen.getByRole("region", { name: "Section" });
    expect(within(card).getByRole("heading").textContent).toBe("Search");
    const left = Math.ceil((SHORT_PLAN[2].endMs - SHORT_PLAN[2].playMs) / 1000);
    expect(within(card).getByLabelText("Time left in the section").textContent).toBe(`${left} s`);
    expect(card.textContent).toContain("Negotiation");
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

describe("Short mode fixes", () => {
  const at = async (ms: number) => {
    window.history.replaceState(null, "", "/?mode=short");
    render(<Workspace initialMs={ms} autoplay={false} />);
    await tick();
  };

  it("the TEE explainer shows the Explained column and its diagram only, no synthetic proof beside it", async () => {
    const tee = SHORT.timeline.find((b) => b.ev.type === "explain" && b.ev.id === "enclave")!;
    await at(tee.atMs + 500);
    const drawer = screen.getByLabelText("Developer drawer");
    await waitFor(() => expect(drawer.getAttribute("data-open")).toBe("true"));
    const explained = within(drawer).getByLabelText("Explained");
    expect(explained.getAttribute("data-focus")).toBe("developer.attestation");
    expect(explained.textContent).toContain("Private inference in an enclave");
    expect(within(explained).getByRole("img", { name: /sealed enclave/ })).toBeTruthy();
    expect(within(drawer).queryByLabelText("Proof")).toBeNull();
    expect(within(drawer).queryByText("synthetic")).toBeNull();
    expect(within(drawer).queryByRole("navigation", { name: "Steps so far" })).toBeNull();
  });

  it("the money badges show the story's dates: committed after the approvals, advance at departure, paid at the dock", async () => {
    expect(STORY_STAMPS).toEqual({ committed: "3 Nov 14:58", advance: "7 Nov 01:40", paid: "11 Nov 08:42" });
    // The paid date is the seed story's own, so the story's clock and the seed agree on day 9.
    expect(STORY_STAMPS.paid).toBe(story.paidAt);
    const stamps = () => document.querySelector('[data-panel="money"]')!.textContent!;
    await at(SHORT_PLAN[4].playMs + 9000);
    expect(stamps()).toContain(STORY_STAMPS.committed);
    cleanup();
    await at(SHORT_PLAN[5].playMs + 2000);
    expect(stamps()).toContain(STORY_STAMPS.advance);
    cleanup();
    await at(SHORT_PLAN[5].playMs + 8800);
    expect(stamps()).toContain(STORY_STAMPS.paid);
    // The drawer keeps the recorded run's real timestamps.
    fireEvent.click(screen.getByRole("button", { name: "Open developer drawer" }));
    const commit = within(screen.getByRole("navigation", { name: "Steps so far" })).getAllByRole("button").find((b) => b.textContent!.includes("Committed for PO 1042"))!;
    expect(commit.querySelector("time")!.textContent).toMatch(/^\d\d:\d\d:\d\d$/);
  });
});
