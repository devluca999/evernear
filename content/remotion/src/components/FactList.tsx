import React from "react";
import { color, enter } from "../theme";
import { Card, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type Fact = { readonly label: string; readonly value: string; readonly mono?: boolean; readonly tone?: "default" | "done" | "refused" | "muted" };

export type FactListProps = Sized & {
  readonly title: string;
  readonly tag?: { readonly text: string; readonly tone: "simulated" | "done" | "refused" | "needs" | "neutral" };
  readonly facts: readonly Fact[];
  readonly note?: string;
  readonly delay?: number;
  readonly tone?: "default" | "refused" | "done" | "needs";
};

/** Label / value rows. Long values (hashes, URLs) wrap. */
export const FactList: React.FC<FactListProps> = ({ u = 1, delay = 0, title, tag, facts, note, tone = "default" }) => {
  const t = useT(delay);
  const c = (f: Fact) => (f.tone === "done" ? color.accent : f.tone === "refused" ? color.refused : f.tone === "muted" ? color.muted : color.text);
  return (
    <Card u={u} tone={tone} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 * u }}>
        <Micro u={u}>{title}</Micro>
        {tag ? (
          <Tag u={u * 0.9} tone={tag.tone}>
            {tag.text}
          </Tag>
        ) : null}
      </div>
      <div style={{ marginTop: 10 * u }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ padding: `${11 * u}px 0`, borderTop: `1px solid ${color.hairline}`, ...enter(t, 8 + i * 6) }}>
            <Micro u={u * 0.78}>{f.label}</Micro>
            <div style={{ marginTop: 4 * u, lineHeight: 1.3 }}>
              {f.mono ? (
                <Mono size={23 * u} c={c(f)} weight={500} wrap>
                  {f.value}
                </Mono>
              ) : (
                <span style={{ fontSize: 25 * u, color: c(f) }}>{f.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {note ? <div style={{ marginTop: 12 * u, fontSize: 19 * u, color: color.faint, lineHeight: 1.4 }}>{note}</div> : null}
    </Card>
  );
};
