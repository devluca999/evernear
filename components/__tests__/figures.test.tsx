// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ExplodedView, MotorCloseUp } from "../workspace/figures/ExplodedView";
import { EXPLODED_10MA_SVG, MOTOR_SVG } from "../workspace/figures/generated";

afterEach(cleanup);

describe("anatomy figures", () => {
  it("draws all four actuator motors in the exploded view, marked for highlight", () => {
    const { container } = render(<ExplodedView highlight="Actuator motor" />);
    expect(container.querySelectorAll('[data-part="motor"]')).toHaveLength(4);
    expect(container.firstElementChild!.getAttribute("data-highlight")).toBe("motor");
  });
  it("draws the motor close-up with its rating engraved", () => {
    const { container } = render(<MotorCloseUp />);
    expect(container.querySelectorAll('[data-part="motor"]')).toHaveLength(1);
    expect(container.textContent).toContain("48 V");
  });
  it("uses no fixed colours: the kit's CSS tokens carry the theme", () => {
    for (const svg of [EXPLODED_10MA_SVG, MOTOR_SVG]) expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
