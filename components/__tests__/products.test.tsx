// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProductsPanel } from "../workspace/panels/ProductsPanel";
import { sceneStartMs, stateAt } from "@/scenario/runner";

afterEach(cleanup);

describe("Products and BOM", () => {
  it("lists the 10MA BOM with stock on hand, and marks the motor short while robots wait", () => {
    render(<ProductsPanel st={stateAt(sceneStartMs(2))} pulse={false} />);
    const list = screen.getByRole("list", { name: "10MA BOM" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(14);
    const motor = within(list).getByText("Actuator motor").closest("button")!;
    expect(motor.textContent).toContain("1x");
    expect(within(motor).getByLabelText("Short")).toBeTruthy();
  });
  it("opens a line to show its specs, and explodes the drawing", () => {
    render(<ProductsPanel st={stateAt(0)} pulse={false} />);
    fireEvent.click(screen.getByText("Actuator motor").closest("button")!);
    expect(screen.getByText("NEMA 17")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explode" }));
    expect(screen.getByRole("img", { name: /10MA exploded view/ })).toBeTruthy();
  });
  it("switches to a sample product, labelled as sample data", () => {
    render(<ProductsPanel st={stateAt(0)} pulse={false} />);
    fireEvent.click(screen.getByRole("tab", { name: /Porter/ }));
    expect(within(screen.getByRole("list", { name: "Porter BOM" })).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("sample data")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Explode" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
