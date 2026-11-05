// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs, stateAt } from "@/scenario/runner";
import { totalDurationMs, timeline } from "@/scenario/scenes";

afterEach(() => { cleanup(); localStorage.clear(); });
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);

describe("workspace", () => {
  it("always reserves the presenter camera corner", () => {
    at(0);
    expect(screen.getByLabelText("Presenter camera")).toBeTruthy();
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
  it("shows the everNEAR wordmark", () => {
    at(0);
    expect(screen.getByLabelText("everNEAR").textContent).toBe("everNEAR");
  });
  it("keeps a pinned panel on screen across scenes, and gives control back when unpinned", () => {
    at(sceneStartMs(6) + 2000);
    const panels = () => [...document.querySelectorAll("[data-panel]")].map((e) => e.getAttribute("data-panel"));
    expect(panels()).not.toContain("demand");
    fireEvent.click(within(screen.getByRole("group", { name: "Pin panels" })).getByRole("button", { name: "Demand" }));
    expect(panels()[0]).toBe("demand");
    fireEvent.click(screen.getByRole("button", { name: "Pin Shipment" }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(panels()).toEqual(["demand", "map", "bom"]); // scene 7 wants BOM and Shipment
    expect(screen.getByRole("button", { name: "Unpin Shipment" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear pins" }));
    expect(panels()).toEqual(["bom", "map"]);
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
