import React from "react";
import { color, enter } from "../theme";
import { Card, Check, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type TransactionReceiptProps = Sized & {
  readonly title: string;
  readonly meaning?: string;
  readonly chain: string;
  readonly txHash: string;
  readonly sender: string;
  readonly recipient: string;
  readonly amount: string;
  readonly explorerUrl: string | null;
  readonly verified: boolean;
  /** Proof amount equals the amount computed from the data files. null = not checked. */
  readonly matchesComputed: boolean | null;
  readonly computedAmount?: string;
  readonly delay?: number;
  readonly compact?: boolean;
  /** Two-column body for 16:9 frames. */
  readonly wide?: boolean;
};

/** A receipt drawn from payment-proofs.json. The full hash and URL wrap; nothing is cropped. */
export const TransactionReceipt: React.FC<TransactionReceiptProps> = ({ u = 1, delay = 0, compact = false, wide = false, ...p }) => {
  const t = useT(delay);
  const field = (label: string, node: React.ReactNode, i: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 * u, padding: `${(compact ? 8 : 11) * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 8 + i * 5) }}>
      <Micro u={u * 0.8}>{label}</Micro>
      <div style={{ lineHeight: 1.3 }}>{node}</div>
    </div>
  );
  return (
    <Card u={u} tone={p.verified ? "done" : "default"} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 * u, flexWrap: "wrap" }}>
        {p.verified ? <Check size={36 * u} /> : null}
        <div style={{ fontSize: 34 * u, fontWeight: 600, flex: 1 }}>{p.title}</div>
        <Tag u={u} tone={p.verified ? "done" : "neutral"}>
          {p.verified ? "Verified on testnet" : "Not verified"}
        </Tag>
      </div>
      {(() => {
        const head = (
          <>
            {p.meaning && !compact ? <div style={{ fontSize: 22 * u, color: color.muted, marginTop: 8 * u, lineHeight: 1.35 }}>{p.meaning}</div> : null}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 * u, marginTop: 14 * u, flexWrap: "wrap" }}>
              <Mono size={52 * u} weight={500} c={color.accent}>
                {p.amount}
              </Mono>
              <span style={{ fontSize: 24 * u, color: color.muted }}>test USDC</span>
            </div>
            {p.matchesComputed === true ? (
              <div style={{ fontSize: 20 * u, color: color.muted, marginTop: 4 * u }}>Matches the amount computed from the PO</div>
            ) : p.matchesComputed === false ? (
              <div style={{ fontSize: 20 * u, color: color.needsYou, marginTop: 4 * u }}>Recorded run differs from computed {p.computedAmount ?? ""}</div>
            ) : null}
          </>
        );
        const chain = field("Chain", <span style={{ fontSize: 24 * u }}>{p.chain}</span>, 0);
        const rest = (
          <>
            {field(
              "Transaction hash",
              <Mono size={24 * u} weight={500} wrap>
                {p.txHash}
              </Mono>,
              1,
            )}
            {field("Sender (as recorded)", <Mono size={21 * u} c={color.muted} wrap>{p.sender}</Mono>, 2)}
            {field("Recipient (as recorded)", <Mono size={21 * u} c={color.muted} wrap>{p.recipient}</Mono>, 3)}
            {p.explorerUrl ? field("Explorer", <Mono size={20 * u} c={color.muted} wrap>{p.explorerUrl}</Mono>, 4) : null}
          </>
        );
        return wide ? (
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 40 * u, marginTop: 6 * u }}>
            <div>
              {head}
              <div style={{ marginTop: 16 * u }}>{chain}</div>
            </div>
            <div>{rest}</div>
          </div>
        ) : (
          <>
            {head}
            <div style={{ marginTop: 10 * u }}>
              {chain}
              {rest}
            </div>
          </>
        );
      })()}
    </Card>
  );
};
