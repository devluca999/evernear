import React from "react";
import { color, enter } from "../theme";
import { Card, Check, Empty, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type Milestone = {
  readonly id: string;
  readonly label: string;
  readonly at: string;
  readonly ref: string | null;
  readonly unlocks: "advance" | "balance";
  readonly done: boolean;
};

export type ShipmentMilestonesProps = Sized & {
  readonly milestones: readonly Milestone[];
  readonly dock?: { readonly received: number; readonly ordered: number } | null;
  readonly delay?: number;
  readonly stagger?: number;
};

/** Segmented steps (no percentage progress). Always tagged as a simulated feed. */
export const ShipmentMilestones: React.FC<ShipmentMilestonesProps> = ({ u = 1, delay = 0, stagger = 14, milestones, dock }) => {
  const t = useT(delay);
  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 * u }}>
        <Micro u={u}>Shipment evidence</Micro>
        <Tag u={u} tone="simulated">
          Simulated feed
        </Tag>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 * u, marginTop: 20 * u }}>
        {milestones.map((m, i) => {
          const on = m.done && t >= 8 + i * stagger;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16 * u,
                padding: `${12 * u}px ${16 * u}px`,
                borderRadius: 12 * u,
                border: `1px solid ${color.hairline}`,
                backgroundColor: color.surface2,
                ...enter(t, 4 + i * stagger),
              }}
            >
              {on ? <Check size={30 * u} /> : <Empty size={30 * u} dashed />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28 * u }}>{m.label}</div>
                {m.ref ? <div style={{ fontSize: 19 * u, color: color.faint }}>{m.ref}</div> : null}
              </div>
              <span style={{ fontSize: 20 * u, color: color.muted }}>unlocks {m.unlocks}</span>
            </div>
          );
        })}
      </div>
      {dock ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 * u, marginTop: 22 * u, paddingTop: 16 * u, borderTop: `1px solid ${color.hairline}`, ...enter(t, 8 + milestones.length * stagger) }}>
          <Micro u={u * 0.85}>Dock count</Micro>
          <Mono size={56 * u} weight={500} c={dock.received < dock.ordered ? color.needsYou : color.accent}>
            {dock.received}
          </Mono>
          <Mono size={34 * u} c={color.muted}>
            / {dock.ordered}
          </Mono>
        </div>
      ) : null}
    </Card>
  );
};
