import React from "react";
import { color, enter } from "../theme";
import { Card, Cross, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type SecurityRefusalProps = Sized & {
  readonly title: string;
  readonly attempt: string;
  readonly layer: string;
  readonly code: string;
  readonly httpStatus: number | null;
  readonly where: string;
  readonly proofNote: string;
  readonly delay?: number;
  readonly wide?: boolean;
};

export const SecurityRefusal: React.FC<SecurityRefusalProps> = ({ u = 1, delay = 0, wide = false, ...p }) => {
  const t = useT(delay);
  const field = (label: string, node: React.ReactNode, i: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 * u, padding: `${12 * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 10 + i * 7) }}>
      <Micro u={u * 0.85}>{label}</Micro>
      <div style={{ fontSize: 27 * u, lineHeight: 1.35 }}>{node}</div>
    </div>
  );
  return (
    <Card u={u} tone="refused" style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 * u }}>
        <Cross size={44 * u} />
        <div style={{ fontSize: 40 * u, fontWeight: 600, flex: 1 }}>{p.title}</div>
        <Tag u={u} tone="refused">
          Refused{p.httpStatus ? ` ${p.httpStatus}` : ""}
        </Tag>
      </div>
      <div style={{ marginTop: 18 * u, display: wide ? "grid" : "block", gridTemplateColumns: "1fr 1fr", columnGap: 40 * u }}>
        {field("Attempt", <Mono size={25 * u} wrap>{p.attempt}</Mono>, 0)}
        {field(
          "Layer that refused",
          <span>
            <span style={{ fontWeight: 600 }}>{p.layer}</span>
          </span>,
          1,
        )}
        {field(
          "Reason code",
          <Mono size={30 * u} c={color.refused} weight={500}>
            {p.code}
          </Mono>,
          2,
        )}
        {field("Where",<span style={{ color: color.muted }}>{p.where}</span>, 3)}
        {field("Proof", <span style={{ color: color.muted }}>{p.proofNote}</span>, 4)}
      </div>
    </Card>
  );
};
