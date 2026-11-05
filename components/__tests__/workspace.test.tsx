// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs } from "@/scenario/runner";
import { totalDurationMs } from "@/scenario/scenes";

afterEach(cleanup);
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
  it("never renders more than 3 panels", () => {
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
  it("labels synthetic proofs on screen", () => {
    at(sceneStartMs(1));
    expect(screen.getAllByText("synthetic").length).toBeGreaterThan(0);
  });
  it("ends on the end card", () => {
    at(totalDurationMs);
    expect(screen.getByText(/human decision/)).toBeTruthy();
  });
});
