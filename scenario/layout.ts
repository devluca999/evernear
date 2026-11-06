// The workspace's cards, their order in the sidebar and their names. Placement is scenario/board.ts.
import type { PanelId } from "./types";

export const PANEL_ORDER: PanelId[] = ["products", "stock", "orders", "inbox", "map", "rules", "money"];
export const PANEL_NAMES: Record<PanelId, string> = {
  products: "Products", stock: "Stock", orders: "Orders", inbox: "Inbox", map: "Map", rules: "Rules", money: "Money",
};
