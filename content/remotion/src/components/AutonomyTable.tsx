import React from "react";
import { color, enter } from "../theme";
import { Card, Micro, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type AutonomyRow = { readonly step: string; readonly cls: string; readonly kind: "deterministic" | "real" | "simulated" | "human" | "fixed"; readonly tag: string };

export type AutonomyTableProps = Sized & { readonly rows: readonly AutonomyRow[]; readonly title?: string; readonly footer?: string; readonly delay?: number; readonly stagger?: number };

const tone = (k: AutonomyRow["kind"]) => (k === "human" ? "needs" : k === "simulated" || k === "fixed" ? "simulated" : k === "real" ? "done" : "neutral") as "needs" | "simulated" | "done" | "neutral";

/** Each step of the agent's work and what kind of logic runs it (READINESS.md table). */
export const AutonomyTable: React.FC<AutonomyTableProps> = ({ u = 1, delay = 0, stagger = 10, rows, title = "What runs each step", footer }) => {
  const t = useT(delay);
  return (
    <Card u={u} style={{ width: "100%", padding: 28 * u, ...enter(t, 0) }}>
      <Micro u={u}>{title}</Micro>
      <div style={{ marginTop: 8 * u }}>
        {rows.map((r, i) => (
          <div
            key={r.step}
            style={{ display: "grid", gridTemplateColumns: "0.9fr 1.9fr 0.75fr", gap: 22 * u, alignItems: "center", padding: `${9 * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 6 + i * stagger) }}
          >
            <span style={{ fontSize: 22 * u, fontWeight: 600, lineHeight: 1.25 }}>{r.step}</span>
            <span style={{ fontSize: 18 * u, color: color.muted, lineHeight: 1.3 }}>{r.cls.replace(/\*\*/g, "")}</span>
            <span style={{ justifySelf: "end" }}>
              <Tag u={u * 0.78} tone={tone(r.kind)}>
                {r.tag}
              </Tag>
            </span>
          </div>
        ))}
      </div>
      {footer ? <div style={{ marginTop: 12 * u, paddingTop: 12 * u, borderTop: `1px solid ${color.hairline}`, fontSize: 24 * u, fontWeight: 600, ...enter(t, 6 + rows.length * stagger) }}>{footer}</div> : null}
    </Card>
  );
};
