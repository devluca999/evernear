import { describe, expect, it } from "vitest";
import { eta, earliestShip, LANES } from "../eta";
import { suppliers } from "@/seed/astro";

describe("arrival estimate", () => {
  it("has a lane and an icon mark for every supplier", () => {
    for (const s of suppliers) expect(LANES[s.id]?.mark).toMatch(/^[A-Z]{2}$/);
  });
  it("buying now: earliest ship day plus transit", () => {
    expect(earliestShip("haoyun", "2026-11-05")).toBe("2026-11-10");
    expect(eta("haoyun", "2026-11-05")).toMatchObject({ ship: "2026-11-10", arrive: "2026-11-14", totalDays: 9, mode: "air" });
  });
  it("moves with a later ship date", () => {
    expect(eta("haoyun", "2026-11-05", "2026-11-20")).toMatchObject({ ship: "2026-11-20", arrive: "2026-11-24", totalDays: 19, movedUp: false });
  });
  it("cannot ship before the supplier is ready: an earlier date is moved up and says so", () => {
    expect(eta("kansai", "2026-11-05", "2026-11-06")).toMatchObject({ ship: "2026-11-12", movedUp: true });
  });
  it("shows why Ultra Motion does not help: six weeks out", () => {
    expect(eta("ultra", "2026-11-05").totalDays).toBe(43);
  });
  it("crosses month and year ends", () => {
    expect(eta("rheinwerk", "2026-12-28").arrive).toBe("2027-01-07");
  });
});
