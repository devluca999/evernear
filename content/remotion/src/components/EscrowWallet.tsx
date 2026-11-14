import React from "react";
import { formatUsd } from "../amounts";
import { color, enter, progress } from "../theme";
import { Card, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type EscrowWalletProps = Sized & {
  readonly account: string;
  readonly provider: string;
  readonly providerNote: string;
  readonly committedCents: number;
  readonly releasedCents: number;
  readonly returnedCents: number;
  readonly committedTestUsdc: string;
  readonly policy: readonly string[];
  readonly delay?: number;
  /** Frames over which the bar animates from its previous to its current values. */
  readonly animateFrom?: { readonly releasedCents: number; readonly returnedCents: number };
};

export const EscrowWallet: React.FC<EscrowWalletProps> = ({ u = 1, delay = 0, animateFrom, ...p }) => {
  const t = useT(delay);
  const k = animateFrom ? progress(t, 10, 30) : 1;
  const released = (animateFrom?.releasedCents ?? p.releasedCents) + (p.releasedCents - (animateFrom?.releasedCents ?? p.releasedCents)) * k;
  const returned = (animateFrom?.returnedCents ?? p.returnedCents) + (p.returnedCents - (animateFrom?.returnedCents ?? p.returnedCents)) * k;
  const remaining = p.committedCents - released - returned;
  const pct = (c: number) => `${(c / p.committedCents) * 100}%`;
  const round = (c: number) => Math.round(c);

  const stat = (label: string, cents: number, c: string) => (
    <div style={{ flex: 1 }}>
      <Micro u={u * 0.85}>{label}</Micro>
      <Mono size={34 * u} c={c} weight={500}>
        {formatUsd(round(cents))}
      </Mono>
    </div>
  );

  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 * u }}>
        <Micro u={u}>Order wallet</Micro>
        <Tag u={u}>Testnet</Tag>
      </div>
      <div style={{ marginTop: 10 * u }}>
        <Mono size={30 * u} weight={500} wrap>
          {p.account}
        </Mono>
      </div>
      <div style={{ fontSize: 21 * u, color: color.muted, marginTop: 6 * u }}>
        NEAR Intents Agent API account on {p.provider}, a {p.providerNote}
      </div>

      <div style={{ marginTop: 26 * u }}>
        <Micro u={u * 0.85}>Committed</Micro>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 * u, flexWrap: "wrap" }}>
          <Mono size={64 * u} weight={500}>
            {formatUsd(p.committedCents)}
          </Mono>
          <Mono size={26 * u} c={color.muted}>
            {p.committedTestUsdc} test USDC
          </Mono>
        </div>
      </div>

      <div style={{ display: "flex", height: 18 * u, borderRadius: 6 * u, overflow: "hidden", marginTop: 20 * u, backgroundColor: color.surface2, border: `1px solid ${color.hairline}` }}>
        <div style={{ width: pct(released), backgroundColor: color.accent }} />
        <div style={{ width: pct(remaining), backgroundColor: "#3A3B44" }} />
        <div style={{ width: pct(returned), backgroundColor: color.muted }} />
      </div>
      <div style={{ display: "flex", gap: 20 * u, marginTop: 18 * u }}>
        {stat("Released to supplier", released, color.accent)}
        {stat("Remaining", remaining, color.text)}
        {stat("Returned to buyer", returned, color.muted)}
      </div>

      <div style={{ marginTop: 24 * u, paddingTop: 16 * u, borderTop: `1px solid ${color.hairline}` }}>
        <Micro u={u * 0.85}>Rules on this wallet</Micro>
        {p.policy.map((x, i) => (
          <div key={x} style={{ fontSize: 24 * u, marginTop: 8 * u, color: color.text, ...enter(t, 12 + i * 6) }}>
            {x}
          </div>
        ))}
      </div>
    </Card>
  );
};
