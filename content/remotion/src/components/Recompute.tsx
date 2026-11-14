import React from "react";
import { formatUsd, type Settlement } from "../amounts";
import { color, enter } from "../theme";
import { Card, Micro, Mono, Sized } from "./ui";
import { useT } from "./useT";

export type RecomputeProps = Sized & { readonly s: Settlement; readonly delay?: number; readonly title?: string };

/** The balance and the returned part, recomputed from the dock count, one line at a time. */
export const Recompute: React.FC<RecomputeProps> = ({ u = 1, delay = 0, s, title = "Recomputed from the dock count" }) => {
  const t = useT(delay);
  const row = (label: string, expr: string, result: string, c: string, i: number) => (
    <div style={{ padding: `${14 * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 8 + i * 12) }}>
      <div style={{ fontSize: 22 * u, color: color.muted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 * u, marginTop: 4 * u, flexWrap: "wrap" }}>
        <Mono size={26 * u} c={color.muted}>
          {expr}
        </Mono>
        <Mono size={40 * u} weight={500} c={c}>
          {result}
        </Mono>
      </div>
    </div>
  );
  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <Micro u={u}>{title}</Micro>
      <div style={{ marginTop: 12 * u }}>
        {row("Delivered value", `${s.receivedQty} x ${formatUsd(s.unitCents)}`, formatUsd(s.deliveredValueCents), color.text, 0)}
        {row("Balance at the dock", `${formatUsd(s.deliveredValueCents)} - ${formatUsd(s.advanceCents)} advance`, formatUsd(s.balanceCents), color.accent, 1)}
        {row("Held part returns to the buyer", `${formatUsd(s.orderTotalCents)} - ${formatUsd(s.paidCents)} paid`, formatUsd(s.returnedCents), color.muted, 2)}
      </div>
    </Card>
  );
};
