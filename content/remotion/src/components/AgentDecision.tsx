import React from "react";
import { color, enter } from "../theme";
import { Card, Check, Cross, Micro, Sized } from "./ui";
import { useT } from "./useT";

export type AgentDecisionProps = Sized & {
  readonly title: string;
  readonly decision: string;
  readonly reasons: readonly string[];
  /** Things the agent is not allowed to do on its own. */
  readonly cannot?: readonly string[];
  readonly delay?: number;
};

export const AgentDecision: React.FC<AgentDecisionProps> = ({ u = 1, delay = 0, title, decision, reasons, cannot = [] }) => {
  const t = useT(delay);
  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <Micro u={u}>{title}</Micro>
      <div style={{ fontSize: 38 * u, fontWeight: 600, marginTop: 10 * u, lineHeight: 1.2 }}>{decision}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 * u, marginTop: 22 * u }}>
        {reasons.map((r, i) => (
          <div key={r} style={{ display: "flex", gap: 14 * u, alignItems: "flex-start", fontSize: 26 * u, lineHeight: 1.35, ...enter(t, 10 + i * 8) }}>
            <span style={{ marginTop: 3 * u, flexShrink: 0 }}>
              <Check size={26 * u} />
            </span>
            <span>{r}</span>
          </div>
        ))}
        {cannot.map((r, i) => (
          <div
            key={r}
            style={{ display: "flex", gap: 14 * u, alignItems: "flex-start", fontSize: 26 * u, lineHeight: 1.35, color: color.muted, ...enter(t, 10 + (reasons.length + i) * 8) }}
          >
            <span style={{ marginTop: 3 * u, flexShrink: 0 }}>
              <Cross size={26 * u} c={color.needsYou} />
            </span>
            <span>{r}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
