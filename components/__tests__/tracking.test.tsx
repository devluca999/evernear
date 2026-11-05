// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs, stateAt } from "@/scenario/runner";
import { CHECKPOINTS } from "@/scenario/shipment";

afterEach(cleanup);
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);
const dockScene = sceneStartMs(8) - 100;

describe("tracking checkpoints", () => {
  it("adds checkpoints in time order, ending on Day 9 at the Chicago dock", () => {
    const cps = stateAt(dockScene).shipment.checkpoints;
    expect(cps.map((c) => c.id)).toEqual(["packed", "handover", "departed", "arrived", "customs", "dock"]);
    const minutes = cps.map((c) => c.day * 1440 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(3)) + (c.zone === "Chicago" ? 13 * 60 : 0));
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    const flightHours = (minutes[3] - minutes[2]) / 60;
    expect(flightHours).toBeGreaterThan(14);
    expect(flightHours).toBeLessThan(18);
    expect(cps.at(-1)).toMatchObject({ day: 9, proofId: "dock_attestation", photos: ["packing_slip", "pallets_dock"] });
  });
  it("shows who acknowledged the latest checkpoint and when", () => {
    at(dockScene);
    expect(screen.getByText(/Last acknowledged/).textContent).toBe("Last acknowledged Day 9, 08:42 Chicago time by Astro receiving (Luca)");
  });
  it("opens a dock photo with its metadata, steps to the next, and closes on Escape", () => {
    at(dockScene);
    fireEvent.click(screen.getAllByRole("button", { name: "Open photo: Packing slip at the Chicago dock" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Received at dock")).toBeTruthy();
    expect(within(dialog).getByText("Day 9, 08:42 Chicago time")).toBeTruthy();
    expect(within(dialog).getByText("synthetic photo")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Received at dock: Pallets on dock door 4, Chicago");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens the dock check proof from the photo", () => {
    at(dockScene);
    fireEvent.click(screen.getAllByRole("button", { name: "Open photo: Packing slip at the Chicago dock" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open proof" }));
    const drawer = screen.getByLabelText("Developer drawer");
    expect(within(drawer).getByText("worker/dock-check/src/lib.rs")).toBeTruthy();
  });
  it("every checkpoint photo has a caption and every proof link exists", async () => {
    const { PHOTO_CAPTION } = await import("@/scenario/shipment");
    const proofIds = stateAt(dockScene).proofs.map((p) => p.id);
    for (const c of Object.values(CHECKPOINTS)) {
      for (const p of c.photos) expect(PHOTO_CAPTION[p]).toBeTruthy();
      if (c.proofId) expect(proofIds).toContain(c.proofId);
    }
  });
});
