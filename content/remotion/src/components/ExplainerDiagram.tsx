import React from "react";
import { color, enter, progress } from "../theme";
import { Micro, Sized } from "./ui";
import { useT } from "./useT";

export type DiagramNode = { readonly id: string; readonly label: string; readonly sub: string; readonly tone?: "default" | "simulated" | "done" | "needs" };

export type ExplainerDiagramProps = Sized & {
  readonly title?: string;
  readonly nodes: readonly DiagramNode[];
  /** Labels on the arrows between consecutive nodes (length = nodes - 1). */
  readonly edges: readonly string[];
  readonly direction?: "row" | "column";
  /** Frames between each node's reveal. */
  readonly step?: number;
  readonly delay?: number;
};

/** A left-to-right (or top-down) flow that reveals one node and arrow at a time. */
export const ExplainerDiagram: React.FC<ExplainerDiagramProps> = ({ u = 1, delay = 0, step = 22, direction = "row", title, nodes, edges }) => {
  const t = useT(delay);
  const row = direction === "row";
  return (
    <div style={{ width: "100%" }}>
      {title ? (
        <Micro u={u} style={{ marginBottom: 18 * u, ...enter(t, 0) }}>
          {title}
        </Micro>
      ) : null}
      <div style={{ display: "flex", flexDirection: row ? "row" : "column", alignItems: "stretch", gap: 0 }}>
        {nodes.map((n, i) => {
          const c = n.tone === "done" ? color.accent : n.tone === "needs" ? color.needsYou : n.tone === "simulated" ? color.muted : color.hairline;
          const edge = edges[i];
          const k = progress(t, i * step + step * 0.55, step * 0.5);
          return (
            <React.Fragment key={n.id}>
              <div
                style={{
                  flex: row ? 1 : undefined,
                  backgroundColor: color.surface,
                  border: `${1.5 * u}px ${n.tone === "simulated" ? "dashed" : "solid"} ${c}`,
                  borderRadius: 14 * u,
                  padding: `${18 * u}px ${18 * u}px`,
                  ...enter(t, i * step),
                }}
              >
                <div style={{ fontSize: 25 * u, fontWeight: 600, lineHeight: 1.2 }}>{n.label}</div>
                <div style={{ fontSize: 19 * u, color: color.muted, marginTop: 6 * u, lineHeight: 1.3 }}>{n.sub}</div>
              </div>
              {edge !== undefined && i < nodes.length - 1 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: row ? "column" : "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6 * u,
                    width: row ? 100 * u : undefined,
                    height: row ? undefined : 70 * u,
                    flexShrink: 0,
                    opacity: k,
                  }}
                >
                  <div style={{ fontSize: 16 * u, color: color.muted, textAlign: "center", lineHeight: 1.2 }}>{edge}</div>
                  <svg width={row ? 90 * u : 20 * u} height={row ? 20 * u : 34 * u} viewBox={row ? "0 0 90 20" : "0 0 20 34"}>
                    {row ? (
                      <>
                        <line x1="2" y1="10" x2={2 + 80 * k} y2="10" stroke={color.muted} strokeWidth="2" />
                        <path d="M80 4l8 6-8 6" stroke={color.muted} strokeWidth="2" fill="none" opacity={k} />
                      </>
                    ) : (
                      <>
                        <line x1="10" y1="2" x2="10" y2={2 + 26 * k} stroke={color.muted} strokeWidth="2" />
                        <path d="M4 25l6 8 6-8" stroke={color.muted} strokeWidth="2" fill="none" opacity={k} />
                      </>
                    )}
                  </svg>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
