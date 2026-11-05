export const STAGES = ["low", "sourcing", "approval", "confirmed", "funds_locked", "shipped", "dock", "paid", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const RAIL: { stage: Stage; label: string }[] = [
  { stage: "low", label: "Low" },
  { stage: "sourcing", label: "Sourcing" },
  { stage: "approval", label: "Approval" },
  { stage: "confirmed", label: "Confirmed" },
  { stage: "funds_locked", label: "Funds locked" },
  { stage: "shipped", label: "Shipped" },
  { stage: "dock", label: "Dock" },
  { stage: "paid", label: "Paid" },
];

export interface Guards {
  approvals?: number;
  requiredApprovals?: number;
  priceOk?: boolean;
  dockChecked?: boolean;
}

export type AdvanceResult = { ok: true } | { ok: false; reason: "not_next" | "approvals_missing" | "price_over_limit" | "dock_check_missing" };

export function advance(from: Stage, to: Stage, g: Guards): AdvanceResult {
  if (STAGES.indexOf(to) !== STAGES.indexOf(from) + 1) return { ok: false, reason: "not_next" };
  if (to === "confirmed" && (g.approvals ?? 0) < (g.requiredApprovals ?? 0)) return { ok: false, reason: "approvals_missing" };
  if (to === "funds_locked" && g.priceOk !== true) return { ok: false, reason: "price_over_limit" };
  if (to === "paid" && g.dockChecked !== true) return { ok: false, reason: "dock_check_missing" };
  return { ok: true };
}

/** Where a stage sits on the rail: done, active or waiting. */
export function railState(current: Stage, step: Stage): "done" | "active" | "waiting" {
  const c = STAGES.indexOf(current), s = STAGES.indexOf(step);
  if (current === "closed" || s < c) return "done";
  return s === c ? "active" : "waiting";
}
