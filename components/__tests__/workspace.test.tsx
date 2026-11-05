// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs, stateAt } from "@/scenario/runner";
import { totalDurationMs, timeline } from "@/scenario/scenes";

afterEach(() => { cleanup(); localStorage.clear(); });
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);

describe("workspace", () => {
  it("has no camera placeholder: the presenter camera is overlaid top right when recording", () => {
    at(0);
    expect(screen.queryByLabelText("Presenter camera")).toBeNull();
  });
  it("docks the phone and a collapsed developer drawer at the bottom; the chevron pulls it up with plain words beside the call", () => {
    at(sceneStartMs(6) + 700); // the escrow proof has just arrived
    const drawer = screen.getByLabelText("Developer drawer");
    expect(drawer.parentElement).toBe(screen.getByLabelText("Phone").parentElement);
    expect(drawer.className).not.toMatch(/drawerOpen/);
    expect(within(drawer).getByRole("button", { name: "Expand developer drawer" }).textContent).toContain("Committed for PO 1042");
    fireEvent.click(screen.getByRole("button", { name: "Expand developer drawer" }));
    expect(drawer.className).toMatch(/drawerOpen/);
    expect(within(screen.getByLabelText("What happened")).getByText(/can only pay Haoyun or go back to Astro/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse developer drawer" }));
    expect(drawer.className).not.toMatch(/drawerOpen/);
  });
  it("holds at the end of a scene until Cmd+K, so the presenter can narrate", () => {
    at(sceneStartMs(3) - 1);
    expect(screen.getByRole("group", { name: "End of scene" }).textContent).toContain("Sourcing and fitment");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("group", { name: "End of scene" })).toBeNull();
    expect(screen.getByText("SCENE 3")).toBeTruthy();
  });
  it("keeps the phone tucked away unless it is waiting for you", () => {
    at(sceneStartMs(5) + 1000);
    expect(screen.getByLabelText("Phone").className).not.toMatch(/phoneOpen/);
  });
  it("says a wrong address refusal is the guard working, then reduces it to a quiet line", () => {
    const r = timeline.find((b) => b.ev.type === "release")!;
    at(r.atMs + 500);
    expect(screen.getByText(/^Blocked as designed: a release to 0x0000…dead is not one of the three exits$/)).toBeTruthy();
    cleanup();
    at(r.atMs + 6000);
    expect(screen.queryByText(/Blocked as designed/)).toBeNull();
    expect(screen.getByText("1 wrong address release blocked")).toBeTruthy();
  });
  it("shows the end card in the workspace instead of over the panels", () => {
    at(sceneStartMs(9) + 1000);
    expect(screen.getByRole("region", { name: "End card" }).closest("main")).toBeTruthy();
    expect(document.querySelectorAll("[data-panel]")).toHaveLength(0);
  });
  it("shows the rail with eight steps", () => {
    at(0);
    expect(within(screen.getByLabelText("Restock progress")).getAllByRole("listitem")).toHaveLength(8);
  });
  it("waits for the approval click, then approves as Luca and asks Jordy", () => {
    const g = timeline.find((b) => b.gate?.id === "approve_luca")!;
    at(g.atMs - 1);
    const ask = screen.getByRole("group", { name: "Waiting for you" });
    expect(within(ask).getByText("Approve PO 1042: $38,000 to Haoyun Precision?")).toBeTruthy();
    expect(screen.getByLabelText("Phone").className).toMatch(/phoneOpen/);
    fireEvent.click(within(screen.getByRole("group", { name: "Approval card" })).getByRole("button", { name: "YES, approve as Luca" }));
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
    expect(screen.getByText("Approval 1 of 2")).toBeTruthy();
  });
  it("plays through without asking when waiting is off", () => {
    const g = timeline.find((b) => b.gate?.id === "start_sourcing")!;
    at(g.atMs - 1);
    fireEvent.click(screen.getByRole("button", { name: "Waits for me" }));
    expect(screen.queryByRole("group", { name: "Waiting for you" })).toBeNull();
  });
  it("tracks the scenario numbers on top: stock, shortfall and where the money is", () => {
    at(sceneStartMs(8) + 9000);
    const bar = screen.getByLabelText("Scenario numbers");
    const val = (label: string) => within(bar).getByText(label).nextElementSibling!.textContent;
    expect(val("ROBOTS ORDERED")).toBe("14");
    expect(val("PO 1042")).toBe("$38,000");
    expect(val("PAID TO SUPPLIER")).toBe("$34,200");
    expect(val("BACK TO ASTRO")).toBe("$3,800");
    expect(val("COMMITTED")).toBe("$0");
  });
  it("collapses the sidebar to icons and keeps every component reachable", () => {
    at(0);
    const nav = screen.getByRole("navigation", { name: "Workspace components" });
    fireEvent.click(within(nav).getByRole("button", { name: "Collapse sidebar" }));
    expect(nav.getAttribute("data-open")).toBe("false");
    expect(within(nav).getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(5);
  });
  it("shows the everNEAR wordmark", () => {
    at(0);
    expect(screen.getByLabelText("everNEAR").textContent).toBe("everNEAR");
  });
  it("keeps a pinned panel on screen across scenes, and gives control back when unpinned", () => {
    at(sceneStartMs(6) + 2000);
    const panels = () => [...document.querySelectorAll("[data-panel]")].map((e) => e.getAttribute("data-panel"));
    expect(panels()).not.toContain("demand");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace components" })).getByRole("button", { name: "Orders" }));
    expect(panels()[0]).toBe("demand");
    fireEvent.click(screen.getByRole("button", { name: "Pin Suppliers" }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(panels()).toEqual(["demand", "map", "bom"]); // scene 7 wants BOM and Suppliers
    expect(screen.getByRole("button", { name: "Unpin Suppliers" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear pins" }));
    expect(panels()).toEqual(["bom", "map"]);
  });
  it("reorders panels from the grip, and keeps the new order across scenes", () => {
    at(sceneStartMs(7) + 2000);
    const panels = () => [...document.querySelectorAll("[data-panel]")].map((e) => e.getAttribute("data-panel"));
    expect(panels()).toEqual(["bom", "map"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Suppliers" }), { key: "ArrowLeft", altKey: true });
    expect(panels()).toEqual(["map", "bom"]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(panels().slice(0, 2)).toEqual(["map", "bom"]);
  });
  it("never renders more than 3 panels when nothing is pinned", () => {
    for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const { container, unmount } = at(sceneStartMs(id) + 2000);
      expect(container.querySelectorAll("[data-panel]").length).toBeLessThanOrEqual(3);
      unmount();
    }
  });
  it("names the exact failing spec in fitment", () => {
    at(sceneStartMs(4) - 100);
    expect(screen.getByText("Shaft 8 mm, needs 6 mm")).toBeTruthy();
    expect(screen.getByText("Not approved, 2.4x price cap")).toBeTruthy();
    expect(screen.getByText("Flange NEMA 23, needs NEMA 17")).toBeTruthy();
    expect(screen.getByText("Connector JST-GH, needs Molex")).toBeTruthy();
    expect(screen.getByText("Battery 36 V, needs 48 V")).toBeTruthy();
  });
  it("shows the dock release and hold", () => {
    at(sceneStartMs(8) - 100);
    expect(screen.getByText("$34,200")).toBeTruthy();
    expect(screen.getByText("$3,800")).toBeTruthy();
  });
  it("labels every synthetic proof on screen, and only those", () => {
    const { container } = at(sceneStartMs(1));
    const synthetic = stateAt(sceneStartMs(1)).proofs.some((p) => p.synthetic);
    expect(screen.queryAllByText("synthetic").length > 0).toBe(synthetic);
    expect(container.textContent?.includes("Proofs are placeholders")).toBe(synthetic);
  });
  it("ends on the end card", () => {
    at(totalDurationMs);
    expect(screen.getByText(/human decision/)).toBeTruthy();
  });
});
