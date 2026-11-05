// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs } from "@/scenario/runner";
import { scenes } from "@/scenario/scenes";

afterEach(cleanup);
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);

describe("V2 design rules", () => {
  it("renders the journey as LED dots that navigate", () => {
    at(0);
    const nav = screen.getByRole("navigation", { name: "Restock progress" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(within(nav).getByRole("button", { name: /^Dock:/ }));
    expect(screen.getByText("Day 9 · Chicago dock")).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Next scene" }));
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });
  it("uses no progress bars or fill meters in any scene", () => {
    for (const sc of scenes) {
      const { container, unmount } = at(sceneStartMs(sc.id) + sc.durationMs - 100);
      expect(container.querySelectorAll('[role="meter"], [role="progressbar"], progress, meter')).toHaveLength(0);
      unmount();
    }
  });
  it("every status dot is the one LED implementation", () => {
    const { container } = at(sceneStartMs(8) + 9000);
    const dots = container.querySelectorAll("[data-tone]");
    expect(dots.length).toBeGreaterThan(20);
    for (const d of dots) {
      if (d.closest("svg")) continue; // figure strokes use the kit's own data-tone
      expect(["active", "attention", "success", "alert", "idle", "proposed"]).toContain(d.getAttribute("data-tone"));
    }
  });
  it("stamps the PO label Committed, then Paid, and says it is a commitment at 1:1,000", () => {
    at(sceneStartMs(6) + 2000);
    expect(within(screen.getByLabelText("PO 1042")).getByRole("status").textContent).toBe("CommittedDay 0");
    expect(screen.getByText(/Testnet at 1:1,000:/).textContent).toBe("Testnet at 1:1,000: $38.00 moves for real. A commitment, not a lock: Tidepool enforces the rules, and Astro can change them.");
    cleanup();
    at(sceneStartMs(8) + 9000);
    expect(within(screen.getByLabelText("PO 1042")).getByRole("status").textContent).toBe("PaidDay 9");
  });
  it("states exactly what YES does on the approval card", () => {
    at(sceneStartMs(4) + 2000);
    expect(within(screen.getByRole("group", { name: "Approval card" })).getByText(/^YES approves PO 1042: 2,000 actuator motors from Haoyun Precision for \$38,000/)).toBeTruthy();
  });
});
