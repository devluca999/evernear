import React from "react";
import { formatInt, formatUsd } from "../amounts";
import { color, enter } from "../theme";
import { Card, Micro, Mono, Sized, Tag } from "./ui";
import { useT } from "./useT";

export type PurchaseOrderProps = Sized & {
  readonly poNumber: string;
  readonly buyer: string;
  readonly supplier: string;
  readonly supplierPlace: string;
  readonly part: string;
  readonly qty: number;
  readonly unitCents: number;
  readonly totalCents: number;
  readonly needBy: string;
  readonly specs?: Record<string, string>;
  readonly delay?: number;
  readonly status?: string;
};

export const PurchaseOrder: React.FC<PurchaseOrderProps> = ({ u = 1, delay = 0, ...p }) => {
  const t = useT(delay);
  const line = (i: number) => enter(t, 8 + i * 6);
  return (
    <Card u={u} style={{ width: "100%", ...enter(t, 0) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Micro u={u}>Purchase order</Micro>
        {p.status ? <Tag u={u} tone="needs">{p.status}</Tag> : null}
      </div>
      <div style={{ fontSize: 64 * u, fontWeight: 600, marginTop: 10 * u, letterSpacing: -1 * u }}>
        PO <Mono size={64 * u} weight={500}>{p.poNumber}</Mono>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 * u, marginTop: 24 * u, ...line(0) }}>
        <div>
          <Micro u={u * 0.85}>Buyer</Micro>
          <div style={{ fontSize: 28 * u, marginTop: 6 * u }}>{p.buyer}</div>
        </div>
        <div>
          <Micro u={u * 0.85}>Supplier</Micro>
          <div style={{ fontSize: 28 * u, marginTop: 6 * u }}>{p.supplier}</div>
          <div style={{ fontSize: 22 * u, color: color.muted }}>{p.supplierPlace}</div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1.2fr 1.4fr",
          gap: 16 * u,
          marginTop: 28 * u,
          paddingTop: 18 * u,
          borderTop: `1px solid ${color.hairline}`,
          alignItems: "end",
          ...line(1),
        }}
      >
        <div>
          <Micro u={u * 0.85}>Item</Micro>
          <div style={{ fontSize: 30 * u, marginTop: 6 * u }}>{p.part}</div>
        </div>
        <div>
          <Micro u={u * 0.85}>Qty</Micro>
          <Mono size={34 * u}>{formatInt(p.qty)}</Mono>
        </div>
        <div>
          <Micro u={u * 0.85}>Unit</Micro>
          <Mono size={34 * u}>{formatUsd(p.unitCents)}</Mono>
        </div>
        <div style={{ textAlign: "right" }}>
          <Micro u={u * 0.85}>Total</Micro>
          <Mono size={44 * u} weight={500}>{formatUsd(p.totalCents)}</Mono>
        </div>
      </div>
      {p.specs ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 * u, marginTop: 22 * u, ...line(2) }}>
          {Object.values(p.specs).map((s) => (
            <span key={s} style={{ fontSize: 20 * u, color: color.muted, border: `1px solid ${color.hairline}`, borderRadius: 8 * u, padding: `${4 * u}px ${12 * u}px` }}>
              {s}
            </span>
          ))}
          <span style={{ fontSize: 20 * u, color: color.muted, padding: `${4 * u}px 0` }}>Need by {p.needBy}</span>
        </div>
      ) : null}
    </Card>
  );
};
