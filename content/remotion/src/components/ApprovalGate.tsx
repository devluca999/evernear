import React from "react";
import { color, enter } from "../theme";
import { Card, Check, Empty, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type Approver = { readonly name: string; readonly signed: boolean };

export type ApprovalGateProps = Sized & {
  readonly required: number;
  readonly approvers: readonly Approver[];
  /** The exact terms the signatures cover. */
  readonly terms: readonly string[];
  readonly state: "pending" | "refused" | "approved";
  readonly reason?: string;
  readonly enforcedBy: string;
  readonly footnote?: string;
  readonly delay?: number;
};

export const ApprovalGate: React.FC<ApprovalGateProps> = ({ u = 1, delay = 0, required, approvers, terms, state, reason, enforcedBy, footnote }) => {
  const t = useT(delay);
  const valid = approvers.filter((a) => a.signed).length;
  const tone = state === "refused" ? "refused" : state === "approved" ? "done" : "needs";
  return (
    <Card u={u} tone={tone} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 * u }}>
        <Micro u={u}>Approval to commit money</Micro>
        <Tag u={u} tone={tone}>
          {state === "refused" ? "Refused" : state === "approved" ? "Approved" : "Needs you"}
        </Tag>
      </div>
      <div style={{ fontSize: 40 * u, fontWeight: 600, marginTop: 12 * u }}>
        <Mono size={40 * u} weight={500}>
          {valid} of {required}
        </Mono>{" "}
        required signatures
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 * u, marginTop: 22 * u }}>
        {approvers.map((a, i) => (
          <div
            key={a.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16 * u,
              padding: `${14 * u}px ${18 * u}px`,
              border: `1px solid ${color.hairline}`,
              borderRadius: 12 * u,
              backgroundColor: color.surface2,
              ...enter(t, 8 + i * 6),
            }}
          >
            {a.signed ? <Check size={30 * u} /> : <Empty size={30 * u} dashed />}
            <span style={{ fontSize: 30 * u, flex: 1 }}>{a.name}</span>
            <span style={{ fontSize: 22 * u, color: a.signed ? color.accent : color.faint }}>{a.signed ? "Signed exact terms" : "Not signed"}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 * u, ...enter(t, 20) }}>
        <Micro u={u * 0.85}>Signatures cover</Micro>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 * u, marginTop: 10 * u }}>
          {terms.map((x) => (
            <span key={x} style={{ fontSize: 21 * u, color: color.muted, border: `1px solid ${color.hairline}`, borderRadius: 8 * u, padding: `${4 * u}px ${12 * u}px` }}>
              {x}
            </span>
          ))}
        </div>
      </div>

      {state === "refused" && reason ? (
        <div style={{ marginTop: 22 * u, display: "flex", alignItems: "baseline", gap: 14 * u, flexWrap: "wrap", ...enter(t, 6) }}>
          <span style={{ fontSize: 26 * u, color: color.refused }}>Commit refused:</span>
          <Mono size={28 * u} c={color.refused} weight={500}>
            {reason}
          </Mono>
        </div>
      ) : null}

      <div style={{ marginTop: 18 * u, fontSize: 20 * u, color: color.faint, lineHeight: 1.4 }}>
        Enforced by {enforcedBy}
        {footnote ? `. ${footnote}` : ""}
      </div>
    </Card>
  );
};
