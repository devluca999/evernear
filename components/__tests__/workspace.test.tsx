// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, act, waitFor } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs, stateAt } from "@/scenario/runner";
import { amounts, scenes, totalDurationMs, timeline } from "@/scenario/scenes";
import { PO, suppliers } from "@/seed/astro";
import { formatUsdShort } from "@/engine/money";

const a = amounts(PO.revisedUnitCents);
const HAOYUN = suppliers.find((x) => x.id === "haoyun")!.receiveAddress;

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);
const panels = () => [...document.querySelectorAll("[data-panel]")].map((e) => e.getAttribute("data-panel"));
const nav = () => screen.getByRole("navigation", { name: "Workspace panels" });
const rail = () => screen.getByRole("complementary", { name: "Demo mode" });
const whole = (t: string) => (_: string, el: Element | null) => el?.textContent === t && [...el.children].every((c) => c.textContent !== t);
const nextButton = () => within(screen.getByRole("group", { name: "Next step" })).getByRole("button");
const chapters = () => within(screen.getByRole("list", { name: "Chapters" })).getAllByRole("button");

describe("workspace", () => {
  it("has no camera placeholder: the presenter camera is overlaid top right when recording", () => {
    at(0);
    expect(screen.queryByLabelText("Presenter camera")).toBeNull();
  });
  it("shows the developer drawer as a collapsed bar with the latest step; Open shows the call and plain words", () => {
    const commit = timeline.find((b) => b.ev.type === "proof" && b.ev.key === "escrow_wallet")!;
    at(commit.atMs + 700); // the commit proof has just arrived
    const drawer = screen.getByLabelText("Developer drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
    const bar = within(drawer).getByRole("button", { name: "Open developer drawer" });
    expect(bar.textContent).toContain("Developer");
    expect(bar.textContent).toContain("Committed for PO 1042");
    expect(bar.textContent).toContain("Open");
    fireEvent.click(bar);
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(within(drawer).getByText("POST /v1/agents/{id}/transfer")).toBeTruthy();
    expect(within(drawer).getByText("Request")).toBeTruthy();
    expect(within(drawer).getByText("Response")).toBeTruthy();
    expect(within(screen.getByLabelText("Explained")).getByText(/It can pay Haoyun or return to Astro, nothing else/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse developer drawer" }));
    expect(drawer.getAttribute("data-open")).toBe("false");
  });
  it("lists every step so far in the drawer, with when it happened, and lets you inspect an earlier one", () => {
    at(sceneStartMs(7) + 11000);
    fireEvent.click(screen.getByRole("button", { name: "Open developer drawer" }));
    const hist = screen.getByRole("navigation", { name: "Steps so far" });
    const items = within(hist).getAllByRole("button").filter((b) => b.textContent!.includes(" · Ch "));
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0].textContent).toMatch(/Astro's wallet created0:01 · Ch 1$/);
    expect(items.at(-1)!.getAttribute("aria-current")).toBe("step");
    fireEvent.click(items[0]);
    expect(items[0].getAttribute("aria-current")).toBe("step");
    expect(within(screen.getByLabelText("Explained")).getByText(/Astro opened its own wallet/)).toBeTruthy();
    fireEvent.click(within(hist).getByRole("button", { name: "Follow the latest" }));
    expect(items.at(-1)!.getAttribute("aria-current")).toBe("step");
  });
  it("Present mode: nothing moves until you act; Next (Cmd+K or ArrowRight) plays the next step and says what it is", () => {
    at(sceneStartMs(2) - 1);
    expect(nextButton().textContent).toBe("Ask Ultra Motion for motors⌘K");
    expect(within(rail()).getByText("Happy path · Chapter 2")).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(within(rail()).getByText("Happy path · Chapter 3")).toBeTruthy();
    expect(within(rail()).getByRole("heading", { name: "Ultra's reply" })).toBeTruthy();
    // The press that enters the chapter also delivers Ultra's reply: no press lands on an empty inbox.
    expect(nextButton().textContent).toContain("Stockbot: Ultra Motion is out for 6 weeks");
    // ArrowRight plays the next step too, inside the chapter, not a jump to the next chapter.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(rail()).getByText("Happy path · Chapter 3")).toBeTruthy();
    expect(rail().textContent).toContain("Start sourcing");
    // ArrowLeft goes back one chapter.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(within(rail()).getByText("Happy path · Chapter 2")).toBeTruthy();
    const fit = timeline.find((b) => b.ev.type === "fitment")!;
    cleanup();
    at(fit.atMs - 1);
    expect(nextButton().textContent).toContain("Check every match against the 10MA BOM");
    // Between stops the next step is still named and one press away.
    cleanup();
    at(fit.atMs - 900);
    expect(nextButton().textContent).toContain("Check every match against the 10MA BOM");
  });
  it("shows the phone as a left column only in chapters with a conversation", () => {
    for (const sc of scenes) {
      const { unmount } = at(sceneStartMs(sc.id) + 1000);
      expect(!!screen.queryByLabelText("Phone")).toBe(!!sc.phone);
      unmount();
    }
    expect(scenes.filter((x) => x.phone).map((x) => x.title)).toEqual(["Negotiation", "Approve and commit", "Shenzhen to the Chicago dock"]);
  });
  it("records a payment to a wrong address as refused, the guard working", () => {
    const r = timeline.find((b) => b.ev.type === "release" && b.ev.to !== HAOYUN)!;
    at(r.atMs + 500);
    const bar = screen.getByRole("button", { name: "Open developer drawer" });
    expect(bar.textContent).toContain("refused a withdraw to 0x000000000000000000000000000000000000dead");
    fireEvent.click(bar);
    expect(within(screen.getByLabelText("Explained")).getByText(/refused by the PO account itself\. The guard works\./)).toBeTruthy();
    expect(stateAt(r.atMs + 500).refused.map((x) => x.kind)).toContain("wrong_address_release");
  });
  it("shows the end line below the cards, then the money goes back at the deadline", () => {
    at(sceneStartMs(7) + 8500);
    const end = screen.getByRole("region", { name: "End card" });
    expect(end.closest("main")).toBeTruthy();
    expect(end.textContent).toContain("0 wires. 0 days waiting. 1 human decision.");
    expect(panels()).toEqual(["money", "stock"]);
  });
  it("lists the eight chapters in the rail and jumps to one", () => {
    at(0);
    const list = chapters();
    expect(list.map((b) => b.textContent)).toEqual([
      "01The 10MA", "02The gap", "03Ultra's reply", "04Search", "05Negotiation",
      "06Approve and commit", "07Shenzhen to the Chicago dock", "08Paid",
    ]);
    expect(list[0].getAttribute("aria-current")).toBe("step");
    fireEvent.click(list[6]);
    expect(within(rail()).getByRole("heading", { name: "Shenzhen to the Chicago dock" })).toBeTruthy();
    expect(within(rail()).getByText("Happy path · Chapter 7")).toBeTruthy();
    expect(list[6].getAttribute("aria-current")).toBe("step");
    expect(list[0].getAttribute("data-state")).toBe("done");
  });
  it("in Present mode shows the next approval as waiting; YES on the phone approves as Luca and asks Jordan", () => {
    const g = timeline.find((b) => b.gate?.id === "approve_luca")!;
    at(g.atMs - 600); // the clock is not yet at the gate, but it comes next
    const ask = screen.getByRole("group", { name: "Waiting for you" });
    expect(within(ask).getByText("Waiting for Luca")).toBeTruthy();
    expect(within(ask).getByText("Reply YES on Telegram to sign PO 1042.")).toBeTruthy();
    const yes = within(screen.getByRole("group", { name: "Approval card" })).getByRole("button", { name: "YES, approve as Luca" }) as HTMLButtonElement;
    expect(yes.disabled).toBe(false);
    fireEvent.click(yes);
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
    const rules = screen.getByRole("region", { name: "Rules" });
    expect(within(rules).getByRole("status").textContent).toBe("Signed14:56");
    expect(nextButton().textContent).toContain("Jordan, PO 1042 needs your signature");
  });
  it("blocks at a gate in Autoplay too, answers it by itself after a beat, and the scenario picker switches the story", () => {
    vi.useFakeTimers();
    const g = timeline.find((b) => b.gate?.id === "start_sourcing")!;
    at(g.atMs - 1);
    fireEvent.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Autoplay" }));
    expect(within(screen.getByRole("group", { name: "Waiting for you" })).getByText("Waiting for Luca")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
    vi.useRealTimers();
    const picker = screen.getByRole("radiogroup", { name: "Scenario" });
    const radios = within(picker).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(picker).getByRole("radio", { name: /^Bad pathBoth contenders hold/ }));
    expect(within(picker).getByRole("radio", { name: /^Bad pathBoth contenders hold/ }).getAttribute("aria-checked")).toBe("true");
    expect(chapters().map((b) => b.textContent)).toEqual(["01The 10MA", "02The gap", "03Ultra's reply", "04Search", "05Negotiation", "06On hold"]);
    expect(within(rail()).getByText("Bad path · Chapter 1")).toBeTruthy();
  });
  it("tracks the scenario numbers on top: stock, shortfall and where the money is", () => {
    const val = (label: string) => within(screen.getByRole("group", { name: "Scenario numbers" })).getByText(label).nextElementSibling!.textContent;
    at(sceneStartMs(2));
    expect(val("Motors on hand")).toBe("450");
    expect(val("Robots ordered")).toBe("500");
    expect(val("Motors short")).toBe("50");
    expect(val("PO")).toBe("None");
    cleanup();
    at(timeline.find((b) => b.ev.type === "reclaim")!.atMs + 300);
    expect(val("Motors on hand")).toBe("494");
    expect(val("Motors short")).toBe(`${PO.quantity - PO.receivedQty}`);
    expect(val("PO")).toBe("1042");
    expect(val("Committed")).toBe(formatUsdShort(a.lockedCents));
    expect(val("Paid to supplier")).toBe(formatUsdShort(a.releaseCents));
    expect(val("Back to Astro")).toBe(formatUsdShort(a.holdCents));
    expect([val("Committed"), val("Paid to supplier"), val("Back to Astro")]).toEqual(["$63,000", "$55,440", "$7,560"]);
  });
  it("opens the sidebar on onboarding with the brand and seven panels, and collapses it to an icon rail", () => {
    at(0);
    const n = nav();
    expect(n.getAttribute("data-open")).toBe("true");
    expect(within(n).getByText("Astro Robotics")).toBeTruthy();
    expect(within(n).getByText("Supply workspace")).toBeTruthy();
    expect(within(n).getByText("Panels")).toBeTruthy();
    expect(within(n).getByText("Powered by Evernear")).toBeTruthy();
    const names = ["Products", "Stock", "Orders", "Inbox", "Map", "Rules", "Money"];
    for (const x of names) expect(within(n).getByRole("button", { name: x })).toBeTruthy();
    expect(within(n).getByRole("status").textContent).toBe("Stockbot ready");
    fireEvent.click(within(n).getByRole("button", { name: "Collapse" }));
    expect(n.getAttribute("data-open")).toBe("false");
    expect(within(n).queryByText("Supply workspace")).toBeNull();
    for (const x of names) expect(within(n).getByRole("button", { name: x })).toBeTruthy();
    fireEvent.click(within(n).getByRole("button", { name: "Expand sidebar" }));
    expect(n.getAttribute("data-open")).toBe("true");
  });
  it("marks the card that needs you in the sidebar", () => {
    const g = timeline.find((b) => b.gate?.id === "start_sourcing")!;
    at(g.atMs - 1);
    const n = nav();
    expect(n.getAttribute("data-open")).toBe("false"); // icons after onboarding
    expect(within(within(n).getByRole("button", { name: "Inbox" })).getByLabelText("1 needs you")).toBeTruthy();
    expect(within(n).getAllByLabelText(/needs you/)).toHaveLength(1);
    // The Inbox card answers it: Start sourcing.
    fireEvent.click(within(screen.getByRole("region", { name: "Inbox" })).getByRole("button", { name: "Start sourcing" }));
    expect(within(nav()).queryAllByLabelText(/needs you/)).toHaveLength(0);
  });
  it("a card you open from the sidebar stays across chapters until you close it; unlocking never removes it", () => {
    at(sceneStartMs(4) + 2000);
    expect(panels()).toEqual(["inbox"]);
    fireEvent.click(within(nav()).getByRole("button", { name: "Stock" }));
    expect(panels()).toContain("stock");
    expect(within(nav()).getByRole("button", { name: "Stock" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Lock Stock" }));
    fireEvent.click(chapters()[5]);
    expect(within(rail()).getByText("Happy path · Chapter 6")).toBeTruthy();
    expect(panels()).toContain("stock");
    expect(screen.queryByRole("button", { name: "Close Stock" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unlock Stock" }));
    expect(panels()).toContain("stock");
    fireEvent.click(screen.getByRole("button", { name: "Close Stock" }));
    expect(panels()).not.toContain("stock");
  });
  it("moves a card to another spot on the grid from its grip, and a locked card stays put", () => {
    at(sceneStartMs(3) + 2000); // Search: map and products
    const slot = (id: string) => document.querySelector(`[data-panel="${id}"]`)!.parentElement as HTMLElement;
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Map" }), { key: "ArrowRight", altKey: true });
    expect(slot("map").style.gridColumn).toBe("2");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Map" }), { key: "ArrowDown", altKey: true });
    expect(slot("map").style.gridRow).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Lock Map" }));
    expect((screen.getByRole("button", { name: "Move Map" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(chapters()[6]); // Shenzhen to the Chicago dock also shows the map
    expect(slot("map").style.gridRow).toBe("2");
    expect(slot("map").style.gridColumn).toBe("2");
  });
  it("lets you change the thresholds, says where a stricter rule stops PO 1042, and resets", async () => {
    at(6000);
    const rules = screen.getByRole("region", { name: "Rules" });
    fireEvent.click(within(rules).getByRole("button", { name: "Change thresholds" }));
    fireEvent.change(screen.getByLabelText("price change limit"), { target: { value: "2" } });
    expect(within(rules).getByRole("button", { name: "Reset to Astro's rules" })).toBeTruthy();
    // The replay runs on the saved rules: at the commit, the PO stops.
    cleanup();
    const lock = timeline.find((b) => b.ev.type === "lock_funds")!.atMs;
    window.history.replaceState(null, "", `/?scene=6&at=${lock - sceneStartMs(5) + 1000}`);
    at(0);
    const stop = await waitFor(() => screen.getByRole("status", { name: "Stopped by your rules" }));
    expect(within(stop).getByText(/Haoyun's price change of \+5% is over your 2% limit/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Scenario numbers" })).getByText("Committed").nextElementSibling!.textContent).toBe("$0");
    fireEvent.click(within(stop).getByRole("button", { name: "Reset to Astro's rules" }));
    expect(screen.queryByRole("status", { name: "Stopped by your rules" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Scenario numbers" })).getByText("Committed").nextElementSibling!.textContent).toBe("$63,000");
  });
  it("groups the numbers into stock and money, and says what each chapter is about", () => {
    at(sceneStartMs(4) + 1000);
    const bar = screen.getByRole("group", { name: "Scenario numbers" });
    expect(within(bar).getByLabelText("Stock")).toBeTruthy();
    const money = within(bar).getByLabelText("Money");
    expect(within(money).getByText("PO").nextElementSibling!.textContent).toBe("1042");
    expect(within(money).getByText("Committed").parentElement!.getAttribute("data-empty")).toBe("true");
    expect(within(rail()).getByText("Haoyun and QuickShip both ask +10%. Your ceiling is 5%.")).toBeTruthy();
  });
  it("never renders more than 3 panels when nothing is pinned", () => {
    for (const sc of scenes) {
      const { container, unmount } = at(sceneStartMs(sc.id) + 2000);
      expect(container.querySelectorAll("[data-panel]").length).toBeLessThanOrEqual(3);
      unmount();
    }
  });
  it("names each supplier's result on the map pin, the exact failing specs on the pin itself", () => {
    at(sceneStartMs(4) - 100); // the end of Search
    const map = within(screen.getByRole("region", { name: "Map" }));
    expect(map.getByRole("status").textContent).toBe("2 fit, 1 late, 2 fail");
    const pin = (name: string) => map.getByLabelText(new RegExp(`^${name}: `));
    expect(within(pin("Haoyun Precision")).getByText("Fits, on time by Dec 14")).toBeTruthy();
    expect(within(pin("Kansai Servo Works")).getByText("Late, delivers after Dec 14")).toBeTruthy();
    expect(within(pin("Rheinwerk Antriebstechnik")).getByText("Fails policy: not approved, 2.4x the price cap")).toBeTruthy();
    expect(within(pin("Huaxin Robotics Components")).getByText(/^Missing parts: 3 of \d+ BOM lines fail$/)).toBeTruthy();
    const huaxin = pin("Huaxin Robotics Components").getAttribute("title")!;
    for (const spec of ["Flange NEMA 23, needs NEMA 17", "Connector JST-GH, needs Molex", "Battery 36 V, needs 48 V"]) expect(huaxin).toContain(spec);
  });
  it("pops each supplier's pin in as Stockbot checks it, counting up, with none before the search", () => {
    const fits = timeline.filter((b) => b.ev.type === "fitment");
    const { unmount } = at(fits[0].atMs - 1);
    const map = () => within(screen.getByRole("region", { name: "Map" }));
    expect(map().getByRole("status").textContent).toBe("Comparing suppliers: 0 of 5");
    expect(map().queryAllByRole("button", { name: /Precision|Motion|Works|Antriebstechnik/ })).toHaveLength(0);
    unmount();
    at(fits[2].atMs);
    expect(map().getByRole("status").textContent).toBe("Comparing suppliers: 3 of 5");
    expect(map().queryAllByLabelText(/^[A-Z][\w ]+: /)).toHaveLength(3);
  });
  it("pays the balance at the dock on its signals, with no YES to tap, and holds the rest", () => {
    const pay = timeline.find((b) => b.ev.type === "release" && b.ev.stage === "balance" && b.ev.to === HAOYUN)!;
    expect(pay.gate).toBeUndefined();
    at(pay.atMs - 1);
    expect(nextButton().textContent).toContain("Pay Haoyun the balance for what arrived");
    expect(screen.queryByRole("group", { name: "Release card" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Orders" })).getByText(`Short ${PO.quantity - PO.receivedQty}`)).toBeTruthy();
    cleanup();
    at(pay.atMs + 500);
    const cells = [["Committed", a.lockedCents], ["Advance", a.advanceCents], ["Balance", a.balanceCents], ["Held", a.holdCents], ["Returned", 0]] as const;
    expect(screen.getByRole("region", { name: "Money" }).textContent).toContain(cells.map(([k, v]) => `${k}${formatUsdShort(v)}`).join(""));
  });
  it("says what is real: on the happy path the money steps are a recorded testnet run, the steps before are placeholders", () => {
    at(sceneStartMs(1));
    const foot = rail();
    expect(within(foot).getByText("testnet + synthetic")).toBeTruthy();
    expect(foot.textContent).toContain("The money steps are a real testnet run through the release gate; the steps before them are placeholders.");
    expect(stateAt(sceneStartMs(1)).proofs.some((p) => p.synthetic)).toBe(true);
  });
  it("ends on the end card", () => {
    at(totalDurationMs);
    expect(screen.getByText(/human decision/)).toBeTruthy();
  });
  it("on the bad path puts the PO on hold with $0 moved", () => {
    at(0);
    fireEvent.click(screen.getByRole("radio", { name: /^Bad pathBoth contenders hold/ }));
    fireEvent.click(within(screen.getByRole("list", { name: "Chapters" })).getByRole("button", { name: "06On hold" }));
    expect(within(rail()).getByRole("heading", { name: "On hold" })).toBeTruthy();
    const money = within(screen.getByRole("region", { name: "Money" }));
    expect(money.getAllByText("$0")).toHaveLength(5); // the total and its four cells
    expect(money.getByText("Nothing committed. No money has left Astro's wallet.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Rules" })).getByText("Over limit")).toBeTruthy();
    expect(within(screen.getByLabelText("Phone")).getByRole("status").textContent).toContain("On hold");
  });
  it("on the bad path waits at On hold; ending the order says $0 moved", async () => {
    window.history.replaceState(null, "", "/?scenario=standoff&scene=6&at=3000");
    at(0);
    const ask = await waitFor(() => screen.getByRole("group", { name: "Waiting for you" }));
    expect(within(ask).getByText("On hold")).toBeTruthy();
    expect(within(ask).getByText("Raise the ceiling with two approvals, or end the order.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "End card" })).toBeNull();
    fireEvent.click(within(screen.getByLabelText("Phone")).getByRole("button", { name: "End the order" }));
    expect(screen.getByRole("region", { name: "End card" }).textContent).toContain("PO 1042 ended. $0 moved.");
  });
  it("on the adjusted path raises the ceiling to 10% with two approvals", async () => {
    window.history.replaceState(null, "", "/?scenario=adjusted&scene=6&at=7000");
    at(0);
    await waitFor(() => expect(within(rail()).getByRole("heading", { name: "Adjustment" })).toBeTruthy());
    const rules = within(screen.getByRole("region", { name: "Rules" }));
    expect(rules.getByText(whole("Price limit raised to 10%"))).toBeTruthy();
    expect(rules.getAllByRole("status").map((x) => x.textContent)).toEqual(["Signed15:12", "Signed15:13"]);
  });
});
