"use client";
// Products: the fitment verdict once sourcing runs (which alternative fits the 10MA, and the exact
// spec each other one fails), and the BOM to browse: pick a product, open a line for its specs,
// explode the drawing. Kip and Porter are sample BOMs (seed/astro.ts); only the 10MA story plays.
import { useEffect, useState } from "react";
import type { WorkspaceState } from "@/scenario/types";
import { bomFor, demand, MOTOR_PART, partStock, products, suppliers } from "@/seed/astro";
import { formatInt } from "@/engine/money";
import { matchKind, matchReason, mismatchText } from "../format";
import { Badge, Dot, N, Panel } from "../Panel";
import { ExplodedView, MotorCloseUp } from "../figures/ExplodedView";
import s from "../shell.module.css";

const ORDER = ["haoyun", "quickship", "kansai", "rheinwerk", "huaxin"];
const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export function ProductsPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  // The story picks the product (chapter 1 switches Kip, Porter, then the 10MA); a tab you pick holds until it moves on.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { queueMicrotask(() => setPicked(null)); }, [st.product]);
  const productId = picked ?? st.product ?? "10ma";
  const setProductId = setPicked;
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const product = products.find((p) => p.id === productId)!;
  const bom = bomFor[productId] ?? [];
  const attested = st.proofs.some((p) => p.id === "inference_attestation");
  const results = ORDER.map((id) => st.fitment.find((f) => f.supplierId === id)).filter((f) => f !== undefined);
  const fitmentView = productId === "10ma" && results.length > 0 && !showBom;
  // Chapter 1 shows the drawing by itself; later the drawing waits for Explode.
  const story = st.product !== null && results.length === 0 && !exploded && picked === null;
  const winner = results.find((f) => f.pass);
  const motorsOnHand = st.demand.motorsOnHand + (st.dock?.receivedQty ?? 0);
  const stockOf = (part: string) => (productId === "10ma" && part === MOTOR_PART ? motorsOnHand : partStock[part] ?? 0);
  const canBuild = bom.length ? Math.min(...bom.map((l) => Math.floor(stockOf(l.part) / l.qty))) : 0;

  return (
    <Panel id="products" title="Products" pulse={pulse}
      meta={attested && productId === "10ma" ? <Badge tone="success">Read privately in an attested enclave</Badge> : !product.playable ? <span className="es-tag">sample data</span> : null}>
      <div className={s.pad} style={{ padding: "14px 16px", gap: 12 }}>
        <div className={s.headRow}>
          <span role="tablist" aria-label="Products" className={s.seg}>
            {products.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={p.id === productId} data-on={p.id === productId} title={p.kind}
                onClick={() => { setProductId(p.id); setOpenLine(null); setExploded(false); }}>{p.name}</button>
            ))}
          </span>
          {productId === "10ma" && results.length > 0 && (
            <button type="button" className={`${s.linkBtn} ${s.push}`} onClick={() => setShowBom((b) => !b)}>{showBom ? "Show fitment" : "Show BOM"}</button>
          )}
        </div>

        {fitmentView ? (
          <>
            <div className={s.field} style={{ gap: 4 }}>
              <p className={s.big} style={{ fontSize: 19, letterSpacing: "-0.012em" }}>
                {winner && results.length === ORDER.length ? `${results.filter((f) => f.pass).map((f) => suppliers.find((x) => x.id === f.supplierId)!.name.split(" ")[0]).join(" and ")} fit every spec, on time` : "Checking alternatives against the BOM"}
              </p>
              <span className={s.sub} style={{ fontSize: 13 }}><N>{results.filter((f) => !f.pass).length}</N> of <N>{results.length}</N> alternatives fail on a spec, on policy or on the date</span>
            </div>
            <ul className={s.rows} aria-label="Fitment" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {results.map((f) => {
                const sup = suppliers.find((x) => x.id === f.supplierId)!;
                const specs = bomFor["10ma"][0].specs;
                return (
                  <li key={f.supplierId} style={{ borderTop: "1px solid var(--line-hairline)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 5 }}>
                    <div className={s.headRow}>
                      <Dot tone={{ fits: "success", partial: "attention", fails: "alert" }[matchKind(f)] as "success" | "attention" | "alert"} />
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{sup.name}</span>
                      <span className={`${s.push} ${s.note}`} style={{ fontSize: 12 }}>{sup.city}</span>
                    </div>
                    {f.pass && <span className={s.note} style={{ paddingLeft: 16, fontSize: 12 }}><N>Shaft {specs.shaftDiameter}</N> · <N>{specs.mountingFlange}</N> · <N>{specs.encoderConnector}</N> · <N>{specs.voltage}</N></span>}
                    {f.mismatches.map((m) => <span key={m.line + m.spec} className={s.alertInk} style={{ paddingLeft: 16, fontSize: 12 }}>{mismatchText(m)}</span>)}
                    {matchKind(f) === "partial" && <span className={s.attnInk} style={{ paddingLeft: 16, fontSize: 12 }}>{matchReason(f, bomFor["10ma"].length)}</span>}
                    {matchKind(f) === "fails" && f.policyFailures.length > 0 && f.mismatches.length === 0 && (
                      <span className={s.alertInk} style={{ paddingLeft: 16, fontSize: 12 }}>{[f.policyFailures.includes("not_approved") && "Not approved", f.policyFailures.includes("over_price_cap") && `${f.priceCapMultiple}x price cap`].filter(Boolean).join(", ")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className={s.figPair} data-focus="products.figure">
              <ExplodedView highlight="Actuator motor" />
              <div data-focus="products.motor"><MotorCloseUp /></div>
            </div>
            <N className={s.muted}><span style={{ fontSize: 12 }}>10MA · {bom.length} BOM lines</span></N>
          </>
        ) : (
          <>
            <div className={s.headRow}>
              <span className={s.sub} style={{ fontSize: 13 }}><N>{bom.length}</N> BOM lines. Stock builds <N>{formatInt(canBuild)}</N> {product.name}.</span>
              <button type="button" className={`es-btn es-btn-secondary es-btn-sm ${s.push}`} aria-pressed={exploded} onClick={() => setExploded((x) => !x)} disabled={productId !== "10ma"}
                title={productId === "10ma" ? "Show the exploded drawing" : "No drawing for sample products yet"}>{exploded ? "Close drawing" : "Explode"}</button>
            </div>
            {story ? (
              <figure style={{ margin: 0 }} data-focus="products.figure" aria-label={`${product.name} drawing`}>
                {productId === "10ma" ? (
                  <div className={`${s.figPair} ${s.figStory}`} data-one={!st.highlight}>
                    <ExplodedView highlight={st.highlight ?? ""} />
                    {st.highlight && <div data-focus="products.motor"><MotorCloseUp /></div>}
                  </div>
                ) : (
                  <div className={s.figBlank}><span className={s.note}>{product.name} · {product.kind}. No drawing for sample products yet.</span></div>
                )}
              </figure>
            ) : exploded && productId === "10ma" && (
              <figure style={{ margin: 0 }}><ExplodedView highlight={openLine ? bom.find((l) => l.id === openLine)?.part ?? MOTOR_PART : MOTOR_PART} /></figure>
            )}
            <ul className={s.rows} aria-label={`${product.name} BOM`} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bom.map((l) => {
                const short = productId === "10ma" && l.part === MOTOR_PART && st.demand.ordered * demand.motorsPerRobot > motorsOnHand;
                const open = openLine === l.id;
                return (
                  <li key={l.id} style={{ borderTop: "1px solid var(--line-hairline)" }}>
                    <button type="button" className={s.bomBtn} aria-expanded={open} onClick={() => setOpenLine(open ? null : l.id)}>
                      <N className={s.faint}>{l.id.split("-")[1]}</N>
                      <span className={s.headRow} style={{ gap: 6 }}>{short && <span role="img" aria-label="Short"><Dot tone="alert" /></span>}{l.part}</span>
                      <N className={s.muted}>{l.qty}x</N>
                      <span title="On hand"><N>{formatInt(stockOf(l.part))}</N></span>
                    </button>
                    {open && (
                      <dl className={s.specs}>
                        {Object.entries(l.specs).map(([k, v]) => <div key={k}><dt className="es-micro">{label(k)}</dt><dd className="es-num">{v}</dd></div>)}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
