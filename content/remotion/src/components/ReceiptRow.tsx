import React from "react";
import { color, enter } from "../theme";
import { Card, Check, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type ReceiptRowProps = Sized & {
  readonly title: string;
  readonly amount: string;
  readonly chain: string;
  readonly txHash: string;
  readonly explorerUrl?: string | null;
  readonly verified: boolean;
  /** Shown when the recorded amount differs from what the data computes (receivedQty override). */
  readonly note?: string | null;
  readonly delay?: number;
};

/** Compact receipt (title, amount, chain, full hash). For frames that show several at once. */
export const ReceiptRow: React.FC<ReceiptRowProps> = ({ u = 1, delay = 0, ...p }) => {
  const t = useT(delay);
  return (
    <Card u={u} tone={p.verified ? "done" : "default"} style={{ width: "100%", padding: 24 * u, ...enter(t, 0) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 * u }}>
        {p.verified ? <Check size={28 * u} /> : null}
        <div style={{ fontSize: 26 * u, fontWeight: 600, flex: 1, lineHeight: 1.2 }}>{p.title}</div>
        <Mono size={36 * u} weight={500} c={color.accent}>
          {p.amount}
        </Mono>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 * u, marginTop: 10 * u, flexWrap: "wrap" }}>
        <span style={{ fontSize: 19 * u, color: color.muted, flex: 1 }}>
          {p.chain}
          {p.note ? <span style={{ color: color.needsYou }}> · {p.note}</span> : null}
        </span>
        <Tag u={u * 0.8} tone={p.verified ? "done" : "neutral"}>
          {p.verified ? "Verified on testnet" : "Not verified"}
        </Tag>
      </div>
      <div style={{ marginTop: 10 * u, paddingTop: 10 * u, borderTop: `1px solid ${color.hairline}` }}>
        <Micro u={u * 0.75}>Transaction hash</Micro>
        <div style={{ marginTop: 4 * u, lineHeight: 1.3 }}>
          <Mono size={20 * u} wrap>
            {p.txHash}
          </Mono>
        </div>
        {p.explorerUrl ? (
          <div style={{ marginTop: 6 * u, lineHeight: 1.3 }}>
            <Mono size={16 * u} c={color.faint} wrap>
              {p.explorerUrl}
            </Mono>
          </div>
        ) : null}
      </div>
    </Card>
  );
};
