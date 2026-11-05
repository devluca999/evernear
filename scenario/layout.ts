// Which panels are on screen: the ones the viewer pinned, in the order they arranged them, then the
// scene's own panels that are not pinned. At most MAX_PANELS. With nothing pinned it is the scene's layout.
import type { PanelId } from "./types";

export const PANEL_ORDER: PanelId[] = ["products", "demand", "map", "inbox", "bom", "rules"];
export const PANEL_NAMES: Record<PanelId, string> = { products: "Products", demand: "Orders", map: "Suppliers", inbox: "Inbox", bom: "Sourcing", rules: "Rules" };
export const MAX_PANELS = 5;

export function composeLayout(pinned: readonly PanelId[], scene: readonly PanelId[]): PanelId[] {
  const pins = pinned.filter((p, i) => PANEL_ORDER.includes(p) && pinned.indexOf(p) === i);
  return [...pins, ...scene.filter((p) => !pins.includes(p))].slice(0, MAX_PANELS);
}

/** Drag `id` onto `over`: the visible layout in its new order, all of it now kept in place (pinned). */
export function movePanel(layout: readonly PanelId[], id: PanelId, over: PanelId): PanelId[] {
  const from = layout.indexOf(id), to = layout.indexOf(over);
  if (from < 0 || to < 0 || from === to) return [...layout];
  const next = layout.filter((p) => p !== id);
  next.splice(to, 0, id);
  return next;
}

export function togglePin(pinned: readonly PanelId[], id: PanelId): PanelId[] {
  return pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id];
}
