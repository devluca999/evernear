import React from "react";
import { color, enter } from "../theme";
import { Card, Mono, Sized } from "./ui";
import { useT } from "./useT";

export type CommandCardProps = Sized & {
  readonly command: string;
  /** Plain description of what the command does (not a captured transcript). */
  readonly does: string;
  readonly result?: string;
  readonly delay?: number;
};

/** A command a judge can run from a clone, what it does, and the expected result. */
export const CommandCard: React.FC<CommandCardProps> = ({ u = 1, delay = 0, command, does, result }) => {
  const t = useT(delay);
  return (
    <Card u={u} style={{ width: "100%", padding: 28 * u, ...enter(t, 0) }}>
      <div style={{ backgroundColor: "#0B0C0F", border: `1px solid ${color.hairline}`, borderRadius: 10 * u, padding: `${14 * u}px ${18 * u}px` }}>
        <Mono size={28 * u} c={color.faint}>
          ${" "}
        </Mono>
        <Mono size={28 * u} weight={500}>
          {command}
        </Mono>
      </div>
      <div style={{ fontSize: 21 * u, color: color.muted, marginTop: 14 * u, lineHeight: 1.4, ...enter(t, 8) }}>{does}</div>
      {result ? (
        <div style={{ marginTop: 10 * u, ...enter(t, 16) }}>
          <Mono size={24 * u} c={color.accent} weight={500}>
            {result}
          </Mono>
        </div>
      ) : null}
    </Card>
  );
};
