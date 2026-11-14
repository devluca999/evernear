import React from "react";
import { color, enter } from "../theme";
import { Card, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type Boundary = { readonly id: string; readonly name: string; readonly by: string; readonly kind: string };

export type TrustBoundaryProps = Sized & {
  readonly boundaries: readonly Boundary[];
  readonly stillSimulated?: readonly string[];
  readonly delay?: number;
  readonly columns?: 1 | 2;
  readonly title?: string;
  readonly simulatedTitle?: string;
};

export const TrustBoundary: React.FC<TrustBoundaryProps> = ({ u = 1, delay = 0, boundaries, stillSimulated = [], columns = 2, title = "Who enforces what", simulatedTitle = "What remains simulated" }) => {
  const t = useT(delay);
  return (
    <div style={{ display: "grid", gridTemplateColumns: columns === 2 ? "1.15fr 1fr" : "1fr", gap: 28 * u, width: "100%" }}>
      <Card u={u} style={enter(t, 0)}>
        <Micro u={u}>{title}</Micro>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 * u }}>
          {boundaries.map((b, i) => (
            <div
              key={b.id}
              style={{ display: "flex", alignItems: "center", gap: 16 * u, padding: `${13 * u}px 0`, borderTop: i ? `1px solid ${color.hairline}` : "none", ...enter(t, 6 + i * 6) }}
            >
              <Mono size={22 * u} c={color.faint}>
                {b.id}
              </Mono>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 27 * u }}>{b.name}</div>
                <div style={{ fontSize: 20 * u, color: color.muted }}>{b.by}</div>
              </div>
              <Tag u={u * 0.9} tone={b.kind === "simulated" ? "simulated" : "neutral"}>
                {b.kind}
              </Tag>
            </div>
          ))}
        </div>
      </Card>
      {stillSimulated.length ? (
        <Card u={u} style={{ border: `${1.5 * u}px dashed ${color.muted}`, ...enter(t, 14) }}>
          <Micro u={u}>{simulatedTitle}</Micro>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 * u, marginTop: 16 * u }}>
            {stillSimulated.map((x, i) => (
              <div key={x} style={{ fontSize: 25 * u, lineHeight: 1.35, color: color.text, display: "flex", gap: 12 * u, ...enter(t, 20 + i * 6) }}>
                <span style={{ color: color.faint }}>·</span>
                <span>{x}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
};
