import type { WorkspaceState } from "@/scenario/types";
import { suppliers, bom10MA } from "@/seed/astro";
import { formatUsdShort, formatInt } from "@/engine/money";
import { Panel } from "../Panel";
import { Led } from "../Led";
import { mismatchText } from "../format";
import { ExplodedView, MotorCloseUp } from "../figures/ExplodedView";
import s from "../workspace.module.css";

const ORDER = ["kansai", "rheinwerk", "huaxin", "haoyun"];

export function BomPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const attested = st.proofs.some((p) => p.id === "inference_attestation");
  const results = ORDER.map((id) => st.fitment.find((f) => f.supplierId === id)).filter((f) => f !== undefined);
  return (
    <Panel id="bom" title="Order and BOM" pulse={pulse} meta={attested ? <span className={s.badge}>Read privately in an attested enclave</span> : null}>
      <div className={s.bomGrid}>
        <figure className={s.figure}>
          <div className={s.figPair}>
            <ExplodedView highlight="Actuator motor" />
            <MotorCloseUp />
          </div>
          <figcaption className={s.micro}>10MA · {bom10MA.length} BOM LINES</figcaption>
        </figure>
        {st.dock ? (
          <div className={s.dockCard}>
            <span className={s.micro}>DOCK CHECK · PO 1042</span>
            <p className={s.big}><span className={s.fig}>{formatInt(st.dock.receivedQty)}</span> of <span className={s.fig}>{formatInt(st.dock.orderedQty)}</span> arrived</p>
            <dl className={s.stats}>
              <div><dt>RELEASE</dt><dd className={s.fig}>{formatUsdShort(st.dock.releaseCents)}</dd></div>
              <div><dt>HOLD</dt><dd className={`${s.fig} ${s.attentionFig}`}><Led tone="attention" />{formatUsdShort(st.dock.holdCents)}</dd></div>
            </dl>
          </div>
        ) : (
          <ul className={s.cards}>
            {results.map((f) => {
              const sup = suppliers.find((x) => x.id === f.supplierId)!;
              const lines = new Set(f.mismatches.map((m) => m.line)).size;
              return (
                <li key={f.supplierId} className={s.supCard} data-pass={f.pass}>
                  <div className={s.supHead}>
                    <Led tone={f.pass ? "success" : "alert"} label={f.pass ? "Passes" : "Fails"} />
                    <span className={s.supName}>{sup.name}</span>
                    <span className={s.supCity}>{sup.city}</span>
                  </div>
                  {f.pass && <p className={s.ok}>Fits every spec. Passes policy.</p>}
                  {f.supplierId === "huaxin" && <p className={s.sub}><span className={s.fig}>{f.linesOffered}</span> of <span className={s.fig}>14</span> BOM lines offered, <span className={s.fig}>{lines}</span> fail</p>}
                  {f.mismatches.map((m) => <p key={m.line + m.spec} className={s.fail}>{mismatchText(m)}</p>)}
                  {f.policyFailures.length > 0 && f.mismatches.length === 0 && (
                    <p className={s.fail}>{[f.policyFailures.includes("not_approved") && "Not approved", f.policyFailures.includes("over_price_cap") && `${f.priceCapMultiple}x price cap`].filter(Boolean).join(", ")}</p>
                  )}
                </li>
              );
            })}
            {results.length === 0 && <li className={s.empty}>Scanning alternatives against the BOM</li>}
          </ul>
        )}
      </div>
    </Panel>
  );
}
