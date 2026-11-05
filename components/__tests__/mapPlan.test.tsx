// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MapPanel } from "../workspace/panels/MapPanel";
import { stateAt } from "@/scenario/runner";
import { suppliers } from "@/seed/astro";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("map: supplier headquarters and the order planner", () => {
  it("shows every supplier's headquarters with its icon", () => {
    render(<MapPanel st={stateAt(0)} pulse={false} />);
    for (const s of suppliers) expect(screen.getByRole("button", { name: `${s.name}, ${s.city}` })).toBeTruthy();
  });
  it("picking a supplier draws its lane and gives an arrival that moves with the ship date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 5, 12));
    const { container } = render(<MapPanel st={stateAt(0)} pulse={false} />);
    const plan = screen.getByRole("group", { name: "Plan an order" });
    fireEvent.click(within(plan).getByRole("button", { name: /Haoyun Precision/ }));
    expect(container.querySelector("path[class*=lane]")).toBeTruthy();
    expect(within(plan).getByText(/Arrives Chicago/).textContent).toContain("2026-11-14");
    fireEvent.change(within(plan).getByLabelText("Ship date"), { target: { value: "2026-11-20" } });
    expect(within(plan).getByText(/Arrives Chicago/).textContent).toContain("2026-11-24");
    expect(within(plan).getByText(/Arrives Chicago/).textContent).toContain("19");
  });
});
