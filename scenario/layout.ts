// The workspace's cards, their order in the sidebar and their names. Placement is scenario/board.ts.
import type { PanelId } from "./types";

export const PANEL_ORDER: PanelId[] = ["products", "demand", "map", "inbox", "bom", "rules"];
export const PANEL_NAMES: Record<PanelId, string> = { products: "Products", demand: "Orders", map: "Suppliers", inbox: "Inbox", bom: "Sourcing", rules: "Rules" };
