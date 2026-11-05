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
  it("keeps each static figure under 400 KB", () => {
    for (const svg of [EXPLODED_10MA_SVG, MOTOR_SVG]) expect(svg.length).toBeLessThan(400 * 1024);
  });
  it("draws the encoder cables as routed tubes ending on real parts, not as wires", () => {
    const { container } = render(<MotorCloseUp />);
    expect(container.querySelectorAll(".tb").length).toBeGreaterThan(3);
    expect(container.querySelectorAll(".iso-wire")).toHaveLength(0);
    const exploded = render(<ExplodedView highlight="Actuator motor" />).container;
    expect(exploded.querySelectorAll(".tb").length).toBeGreaterThan(3);
  });
  it("uses no fixed colours: the kit's CSS tokens carry the theme", () => {
    for (const svg of [EXPLODED_10MA_SVG, MOTOR_SVG]) expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
