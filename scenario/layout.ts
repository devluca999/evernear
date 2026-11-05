// Which panels are on screen: the ones the viewer pinned, in tray order, then the scene's own
// panels that are not pinned. At most MAX_PANELS. With nothing pinned it is the scene's layout.
import type { PanelId } from "./types";

export const PANEL_ORDER: PanelId[] = ["products", "demand", "map", "inbox", "bom", "rules"];
export const PANEL_NAMES: Record<PanelId, string> = { products: "Products", demand: "Demand", map: "Shipment", inbox: "Inbox", bom: "Sourcing", rules: "Rules" };
export const MAX_PANELS = 5;

export function composeLayout(pinned: readonly PanelId[], scene: readonly PanelId[]): PanelId[] {
  const pins = PANEL_ORDER.filter((p) => pinned.includes(p));
  return [...pins, ...scene.filter((p) => !pins.includes(p))].slice(0, MAX_PANELS);
}

export function togglePin(pinned: readonly PanelId[], id: PanelId): PanelId[] {
  return pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id];
}
