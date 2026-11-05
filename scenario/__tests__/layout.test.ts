import { describe, expect, it } from "vitest";
import { composeLayout, movePanel, togglePin } from "../layout";

describe("composeLayout", () => {
  it("is the scene's layout when nothing is pinned", () => {
    expect(composeLayout([], ["bom", "map"])).toEqual(["bom", "map"]);
  });
  it("keeps pinned panels first, in the order you arranged them, and fills the rest from the scene", () => {
    expect(composeLayout(["rules", "map"], ["bom", "map"])).toEqual(["rules", "map", "bom"]);
  });
  it("moves a dragged panel to where it was dropped", () => {
    expect(movePanel(["map", "rules", "bom"], "bom", "map")).toEqual(["bom", "map", "rules"]);
    expect(movePanel(["map", "rules", "bom"], "map", "bom")).toEqual(["rules", "bom", "map"]);
    expect(movePanel(["map", "rules"], "map", "map")).toEqual(["map", "rules"]);
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
