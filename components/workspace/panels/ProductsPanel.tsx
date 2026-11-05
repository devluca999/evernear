"use client";
// Products and their BOMs: pick a product, scroll its BOM, open a line for its specs, explode the drawing.
// Kip and Porter are sample BOMs (seed/astro.ts); only the 10MA story plays.
import { useState } from "react";
import type { WorkspaceState } from "@/scenario/types";
import { bomFor, demand, MOTOR_PART, partStock, products } from "@/seed/astro";
import { formatInt } from "@/engine/money";
import { Panel } from "../Panel";
import { Led } from "../Led";
import { Pill } from "../ui";
import { ExplodedView } from "../figures/ExplodedView";
import s from "../workspace.module.css";

const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export function ProductsPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const [productId, setProductId] = useState<string>("10ma");
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const product = products.find((p) => p.id === productId)!;
  const bom = bomFor[productId] ?? [];
  const motorsOnHand = st.demand.motorsOnHand + (st.dock?.receivedQty ?? 0);
  const stockOf = (part: string) => (productId === "10ma" && part === MOTOR_PART ? motorsOnHand : partStock[part] ?? 0);
  const buildable = (qty: number, part: string) => Math.floor(stockOf(part) / qty);
  const canBuild = bom.length ? Math.min(...bom.map((l) => buildable(l.qty, l.part))) : 0;

  return (
    <Panel id="products" title="Products and BOM" pulse={pulse} meta={product.playable ? null : <Pill tone="idle">sample data</Pill>}>
      <div className={s.prodTabs} role="tablist" aria-label="Products">
        {products.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === productId} className={s.prodTab}
            onClick={() => { setProductId(p.id); setOpenLine(null); setExploded(false); }}>
            {p.name}<span className={s.faint}>{p.kind}</span>
          </button>
        ))}
      </div>
      <div className={s.prodHead}>
        <span className={s.sub}><span className={s.fig}>{bom.length}</span> BOM lines. Stock builds <span className={s.fig}>{formatInt(canBuild)}</span> {product.name}.</span>
        <button type="button" className={s.btnQuiet} aria-pressed={exploded} onClick={() => setExploded((x) => !x)} disabled={productId !== "10ma"}
          title={productId === "10ma" ? "Show the exploded drawing" : "No drawing for sample products yet"}>{exploded ? "Close drawing" : "Explode"}</button>
      </div>
      {exploded && productId === "10ma" && (
        <figure className={s.figure}><ExplodedView highlight={openLine ? bom.find((l) => l.id === openLine)?.part ?? MOTOR_PART : MOTOR_PART} /></figure>
      )}
      <ul className={s.bomList} aria-label={`${product.name} BOM`}>
        {bom.map((l) => {
          const short = productId === "10ma" && l.part === MOTOR_PART && st.demand.ordered * demand.motorsPerRobot > motorsOnHand;
          const open = openLine === l.id;
          return (
            <li key={l.id} className={s.bomRow} data-open={open}>
              <button type="button" className={s.bomRowBtn} aria-expanded={open} onClick={() => setOpenLine(open ? null : l.id)}>
                <span className={s.fig}>{l.id.split("-")[1]}</span>
                <span className={s.bomPart}>{short && <Led tone="alert" label="Short" />}{l.part}</span>
                <span className={s.fig} title="Per unit">{l.qty}x</span>
                <span className={s.fig} title="On hand">{formatInt(stockOf(l.part))}</span>
              </button>
              {open && (
                <dl className={s.bomSpecs}>
                  {Object.entries(l.specs).map(([k, v]) => <div key={k}><dt className={s.micro}>{label(k).toUpperCase()}</dt><dd>{v}</dd></div>)}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
