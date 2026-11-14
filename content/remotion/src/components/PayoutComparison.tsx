import React from "react";
import { formatUsd, type Settlement } from "../amounts";
import { color, enter, progress } from "../theme";
import { Card, Micro, Mono, Sized } from "./ui";
import { useT } from "./useT";

export type PayoutComparisonProps = Sized & {
  readonly s: Settlement;
  readonly testnet?: { readonly paid: string; readonly returned: string } | null;
  readonly delay?: number;
};

export const PayoutComparison: React.FC<PayoutComparisonProps> = ({ u = 1, delay = 0, s, testnet }) => {
  const t = useT(delay);
  const bar = (cents: number, c: string, i: number) => (
    <div style={{ height: 14 * u, backgroundColor: color.surface2, borderRadius: 4 * u, overflow: "hidden", border: `1px solid ${color.hairline}` }}>
      <div style={{ height: "100%", width: `${(cents / s.orderTotalCents) * 100 * progress(t, 10 + i * 8, 24)}%`, backgroundColor: c }} />
    </div>
  );
  const rows: { label: string; detail: string; cents: number; c: string }[] = [
    { label: "Ordered", detail: `${s.orderedQty} units`, cents: s.orderTotalCents, c: color.muted },
    { label: "Delivered", detail: `${s.receivedQty} units`, cents: s.deliveredValueCents, c: color.text },
    { label: "Paid to supplier", detail: "advance + balance", cents: s.paidCents, c: color.accent },
    { label: "Missing", detail: `${s.missingQty} units`, cents: s.missingValueCents, c: color.needsYou },
    { label: "Returned to buyer", detail: "held part", cents: s.returnedCents, c: color.muted },
  ];
  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <Micro u={u}>Ordered vs paid</Micro>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 * u, marginTop: 18 * u }}>
        {rows.map((r, i) => (
          <div key={r.label} style={enter(t, 6 + i * 8)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 * u }}>
              <span style={{ fontSize: 26 * u }}>
                {r.label} <span style={{ color: color.faint, fontSize: 21 * u }}>{r.detail}</span>
              </span>
              <Mono size={32 * u} c={r.c} weight={500}>
                {formatUsd(r.cents)}
              </Mono>
            </div>
            {bar(r.cents, r.c, i)}
          </div>
        ))}
      </div>
      {testnet ? (
        <div style={{ marginTop: 18 * u, fontSize: 21 * u, color: color.muted }}>
          On testnet: <Mono size={21 * u} c={color.accent}>{testnet.paid}</Mono> paid,{" "}
          <Mono size={21 * u}>{testnet.returned}</Mono> returned (test USDC)
        </div>
      ) : null}
    </Card>
  );
};
