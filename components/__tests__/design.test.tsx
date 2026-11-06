// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Workspace } from "../workspace/Workspace";
import { sceneStartMs } from "@/scenario/runner";
import { scenes } from "@/scenario/scenes";

afterEach(cleanup);
const at = (ms: number) => render(<Workspace initialMs={ms} autoplay={false} />);

describe("V2 design rules", () => {
  it("shows the journey as a scene list with state dots that navigate", () => {
    at(0);
    const list = screen.getByRole("list", { name: "Scenes" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(8);
    fireEvent.click(within(list).getByRole("button", { name: /Day 9 · Chicago dock$/ }));
    expect(within(screen.getByRole("complementary", { name: "Demo mode" })).getByRole("heading", { name: "Day 9 · Chicago dock" })).toBeTruthy();
    expect(buttons.slice(0, 6).every((x) => x.querySelector(".es-dot-success"))).toBe(true);
    expect(buttons[6].querySelector(".es-dot-active.es-dot-pulse")).toBeTruthy();
    expect(buttons[7].querySelector(".es-dot")!.className).toBe("es-dot");
  });
  it("uses no progress bars or fill meters in any scene", () => {
    for (const sc of scenes) {
      const { container, unmount } = at(sceneStartMs(sc.id) + sc.durationMs - 100);
      expect(container.querySelectorAll('[role="meter"], [role="progressbar"], progress, meter')).toHaveLength(0);
      unmount();
    }
  });
  it("every status dot is the one design-system dot", () => {
    const { container } = at(sceneStartMs(7) + 11000);
    const dots = container.querySelectorAll(".es-dot");
    expect(dots.length).toBeGreaterThan(10);
    for (const d of dots) {
      expect(d.getAttribute("aria-hidden")).toBe("true");
      const tones = [...d.classList].filter((c) => c.startsWith("es-dot-") && c !== "es-dot-pulse").map((c) => c.slice(7));
      expect(tones.length).toBeLessThanOrEqual(1);
      for (const t of tones) expect(["active", "attention", "success", "alert", "proposed"]).toContain(t);
    }
  });
  it("stamps the money Committed, then Paid, and says it is a commitment at 1:1,000", () => {
    at(sceneStartMs(5) + 2000);
    const money = () => screen.getByRole("region", { name: "Money" });
    expect(within(money()).getByRole("status").textContent).toBe("Committed3 Nov 15:04");
    expect(within(money()).getByText(/^Testnet at 1:/).textContent).toBe("Testnet at 1:1,000: $38.00 moves for real. A commitment, not a lock: Tidepool enforces the rules, and Astro can change them.");
    cleanup();
    at(sceneStartMs(7) + 4000);
    expect(within(money()).getByRole("status").textContent).toBe("Paid11 Nov 08:42");
    expect(within(money()).getByText(/^Paid to Haoyun Precision/).textContent).toBe("Paid to Haoyun Precision on its own chain. $3,800 held until the deadline.");
    cleanup();
    at(sceneStartMs(7) + 11000);
    expect(within(money()).getByText(/^Paid to Haoyun Precision/).textContent).toBe("Paid to Haoyun Precision on its own chain. $3,800 went back to Astro at the deadline.");
  });
  it("states exactly what YES does on the approval card", () => {
    at(sceneStartMs(3) + 2000);
    const card = within(screen.getByRole("group", { name: "Approval card" }));
    expect(card.getByText("YES signs approval 1 of 2. No money moves until Haoyun confirms.")).toBeTruthy();
    expect(card.getByText("1042 · Haoyun Precision")).toBeTruthy();
    expect(card.getByText("2,000 AM17")).toBeTruthy();
    expect(card.getByText("$38,000")).toBeTruthy();
  });
});
