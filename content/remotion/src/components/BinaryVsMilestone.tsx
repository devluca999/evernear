import React from "react";
import { formatUsd, type BinaryComparison, type Settlement } from "../amounts";
import { color, enter } from "../theme";
import { Card, Cross, Check, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type BinaryVsMilestoneProps = Sized & {
  readonly s: Settlement;
  readonly c: BinaryComparison;
  /** Side by side (16:9) or stacked (9:16). */
  readonly direction?: "row" | "column";
  /** Show only the single-escrow card (the problem), only the milestone card, or both. */
  readonly show?: "binary" | "milestone" | "both";
  readonly delay?: number;
};

/** A single escrow (release all / refund all) next to the milestone PO, same order, same dock count. */
export const BinaryVsMilestone: React.FC<BinaryVsMilestoneProps> = ({ u = 1, delay = 0, s, c, direction = "row", show = "both" }) => {
  const t = useT(delay);
  const line = (icon: React.ReactNode, label: React.ReactNode, value: React.ReactNode, i: number, tone = color.text) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14 * u, padding: `${12 * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 8 + i * 8) }}>
      <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 24 * u, flex: 1, lineHeight: 1.3, color: tone }}>{label}</span>
      {value}
    </div>
  );
  const binary = (
    <Card u={u} tone="refused" style={{ flex: 1, ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 * u }}>
        <Micro u={u}>Single release or refund</Micro>
        <Tag u={u * 0.9} tone="refused">
          Two outcomes
        </Tag>
      </div>
      <div style={{ fontSize: 30 * u, fontWeight: 600, marginTop: 10 * u, lineHeight: 1.25 }}>
        {s.receivedQty} of {s.orderedQty} arrived. It can only:
      </div>
      <div style={{ marginTop: 12 * u }}>
        {line(
          <Cross size={28 * u} c={color.needsYou} />,
          <>Release all: the supplier is paid for {s.orderedQty}</>,
          <Mono size={32 * u} weight={500} c={color.needsYou}>
            {formatUsd(c.binaryReleaseAllCents)}
          </Mono>,
          0,
        )}
        {line(
          <Cross size={28 * u} c={color.needsYou} />,
          <>Refund all, then dispute the {s.receivedQty} that arrived</>,
          <Mono size={32 * u} weight={500} c={color.needsYou}>
            {formatUsd(c.binaryRefundAllCents)}
          </Mono>,
          1,
        )}
      </div>
    </Card>
  );
  const milestone = (
    <Card u={u} tone="done" style={{ flex: 1, ...enter(t, show === "both" ? 18 : 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 * u }}>
        <Micro u={u}>Purchase order with milestones</Micro>
        <Tag u={u * 0.9} tone="done">
          EverNEAR
        </Tag>
      </div>
      <div style={{ fontSize: 30 * u, fontWeight: 600, marginTop: 10 * u, lineHeight: 1.25 }}>Pays for what arrived:</div>
      <div style={{ marginTop: 12 * u }}>
        {line(<Check size={28 * u} />, "Advance + balance to the supplier", <Mono size={32 * u} weight={500} c={color.accent}>{formatUsd(c.milestonePaidCents)}</Mono>, 2)}
        {line(<Check size={28 * u} c={color.muted} />, "Held part back to the buyer", <Mono size={32 * u} weight={500} c={color.muted}>{formatUsd(s.returnedCents)}</Mono>, 3)}
      </div>
    </Card>
  );
  return (
    <div style={{ display: "flex", flexDirection: direction, gap: 28 * u, alignItems: "stretch", width: "100%" }}>
      {show !== "milestone" ? binary : null}
      {show !== "binary" ? milestone : null}
    </div>
  );
};
