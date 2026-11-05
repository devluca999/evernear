import { describe, expect, it } from "vitest";
import { composeLayout, togglePin } from "../layout";

describe("composeLayout", () => {
  it("is the scene's layout when nothing is pinned", () => {
    expect(composeLayout([], ["bom", "map"])).toEqual(["bom", "map"]);
  });
  it("keeps pinned panels first, in tray order, and fills the rest from the scene", () => {
    expect(composeLayout(["rules", "map"], ["bom", "map"])).toEqual(["map", "rules", "bom"]);
  });
  it("keeps a pinned panel on a scene that does not use it", () => {
    expect(composeLayout(["demand"], [])).toEqual(["demand"]);
  });
  it("never shows more than 5 panels or the same one twice", () => {
    const all = composeLayout(["demand", "map", "inbox", "bom", "rules"], ["rules", "map"]);
    expect(all).toEqual(["demand", "map", "inbox", "bom", "rules"]);
  });
});

describe("togglePin", () => {
  it("pins and unpins", () => {
    expect(togglePin([], "map")).toEqual(["map"]);
    expect(togglePin(["map", "bom"], "map")).toEqual(["bom"]);
  });
});
