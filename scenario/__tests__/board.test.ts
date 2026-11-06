import { describe, expect, it } from "vitest";
import { arrange, closeCard, emptyBoard, loadBoard, lockCard, openCard, placeCard, rowsUsed, type Board } from "../board";
import { PANEL_ORDER } from "../layout";

const b = (...xs: (string | null)[]) => [...xs, ...Array(6 - xs.length).fill(null)] as Board;

describe("the board", () => {
  it("with nothing of yours, it is the scene's layout, in one row", () => {
    const p = arrange(emptyBoard(), ["products", "map"]);
    expect(p).toEqual([{ id: "products", spot: 0, mine: false }, { id: "map", spot: 1, mine: false }]);
    expect(rowsUsed(p)).toBe(1);
  });
  it("keeps your cards where you put them and fills the free spots with the scene's", () => {
    expect(arrange(b(null, "rules"), ["products", "map"]).map((x) => [x.id, x.spot])).toEqual([["products", 0], ["rules", 1], ["map", 2]]);
  });
  it("a card you open stays when the scene moves on, and closes only when you close it", () => {
    const board = openCard(emptyBoard(), "orders");
    expect(arrange(board, []).map((x) => x.id)).toEqual(["orders"]);
    expect(arrange(closeCard(board, "orders"), [])).toEqual([]);
  });
  it("drops a card onto an empty spot, including the second row", () => {
    const board = placeCard(b("map"), [], "map", 4);
    expect(board).toEqual(b(null, null, null, null, "map"));
    expect(rowsUsed(arrange(board, []))).toBe(2);
  });
  it("dropping onto a card swaps them", () => {
    expect(placeCard(b("map", "products"), [], "map", 1)).toEqual(b("products", "map"));
  });
  it("dragging a scene card makes it yours where you drop it", () => {
    const onScreen = arrange(emptyBoard(), ["products", "map"]);
    expect(placeCard(emptyBoard(), [], "map", 3, onScreen)).toEqual(b(null, null, null, "map"));
  });
  it("dropping a scene card onto one of yours moves yours to a free spot, never off the board", () => {
    expect(placeCard(b("rules"), [], "map", 0)).toEqual(b("map", "rules"));
  });
  it("a locked card neither moves nor gets displaced", () => {
    expect(placeCard(b("map", "products"), ["map"], "map", 2)).toEqual(b("map", "products"));
    expect(placeCard(b("map", "products"), ["map"], "products", 0)).toEqual(b("map", "products"));
  });
  it("locking a scene card keeps it where it is; unlocking keeps it on the board", () => {
    const onScreen = arrange(emptyBoard(), ["products", "map"]);
    const l = lockCard(emptyBoard(), [], "map", onScreen);
    expect(l).toEqual({ board: b(null, "map"), locked: ["map"] });
    const u = lockCard(l.board, l.locked, "map", arrange(l.board, []));
    expect(u.locked).toEqual([]);
    expect(arrange(u.board, []).map((x) => x.id)).toEqual(["map"]);
  });
  it("reads a saved board safely", () => {
    expect(loadBoard("nope", PANEL_ORDER)).toEqual(emptyBoard());
    expect(loadBoard(JSON.stringify(["map", "map", "x", null, null, null]), PANEL_ORDER)).toEqual(b("map"));
  });
});
