import type { WorkspaceState } from "@/scenario/types";
import { policy, PO, astro, suppliers } from "@/seed/astro";
import { formatUsdShort, formatInt } from "@/engine/money";
import { RAIL, railState } from "@/scenario/stages";
import { Panel } from "../Panel";
import { Led, type Tone } from "../Led";
import { PoLabel, Ruler, Stamp } from "../ui";
import { pct } from "../format";
import s from "../workspace.module.css";
import p from "../premium.module.css";

const haoyun = suppliers.find((x) => x.id === "haoyun")!;

function poTone(st: WorkspaceState): Tone {
  if (st.stage === "paid" || st.stage === "closed") return "success";
  if (st.dock) return "attention";
  return "active";
}

export function RulesPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const showOrder = st.scene >= 4 && st.scene !== 9;
  const overCap = PO.revisedTotalCents >= policy.autoApproveUnderCents;
  const approved = st.approvals.length >= st.requiredApprovals;
  const paid = st.escrow !== null && st.escrow.releasedCents > 0;
  const rows: { tone: Tone; text: React.ReactNode }[] = [
    { tone: showOrder && overCap ? (approved ? "success" : "attention") : "success", text: <>Auto approve under <span className={s.fig}>{formatUsdShort(policy.autoApproveUnderCents)}</span></> },
    { tone: showOrder ? (approved ? "success" : "attention") : "success", text: <>New supplier needs <span className={s.fig}>{policy.approversRequired}</span> approvers</> },
    { tone: st.price.history.length ? (st.price.history.at(-1)!.pass ? "success" : "attention") : "success", text: <>Price change up to <span className={s.fig}>{pct(policy.priceChangeLimitBps)}</span></> },
  ];

  return (
    <Panel id="rules" title="Rules and approvals" pulse={pulse}>
      {st.wallet && st.scene <= 1 && (
        <div className={s.card}>
          <span className={s.micro}>{"ASTRO'S WALLET"}</span>
          <p className={s.mono}>{st.wallet.owner}</p>
          <p className={s.sub}><Led tone="success" />Keys on your devices. Evernear holds a capped key only.</p>
        </div>
      )}
      {st.scene === 2 && (
        <div className={s.card}>
          <span className={s.micro}>ROUTINE REORDER · ULTRA MOTION</span>
          <p className={s.sub}><span className={s.fig}>300</span> motors, <span className={s.fig}>{formatUsdShort(st.routine.totalCents)}</span>, under the cap, no approval needed</p>
          <ol className={p.dotRow} aria-label="Routine reorder steps">
            {RAIL.map((r) => {
              const rs = railState(st.routine.stage, r.stage);
              return <li key={r.stage} title={r.label}><Led tone={rs === "done" ? "success" : rs === "active" ? "active" : "idle"} label={`${r.label}: ${rs}`} /></li>;
            })}
          </ol>
        </div>
      )}
      <ul className={s.rules}>
        {rows.map((r, i) => <li key={i}><Led tone={r.tone} />{r.text}</li>)}
      </ul>
      {showOrder && (
        <>
          <div className={s.orderLine}>
            <div><span className={s.micro}>ORDER TOTAL · PO {PO.number}</span><p className={s.big}><span className={s.fig}>{formatUsdShort(PO.revisedTotalCents)}</span></p></div>
            <p className={s.orderNote}><Led tone={approved ? "success" : "attention"} />{approved ? "Over the cap, approved by 2" : `Over the ${formatUsdShort(policy.autoApproveUnderCents)} cap and a new supplier: 2 approvals needed`}</p>
          </div>
          {st.price.history.length > 0 && (
            <div>
              <span className={s.micro}>PRICE CHANGE AGAINST PO</span>
              <Ruler max={1000} step={50} major={200} limit={policy.priceChangeLimitBps} limitText={`LIMIT ${pct(policy.priceChangeLimitBps)}`}
                fmt={(n) => pct(n)} marks={st.price.history.map((h) => ({ at: h.bps, tone: h.pass ? "success" : "attention", text: `+${pct(h.bps)}` }))} />
            </div>
          )}
          <div className={s.slots}>
            {[astro.buyer, astro.secondApprover].map((name, i) => {
              const a = st.approvals[i];
              return (
                <div key={name} className={s.slot} data-signed={!!a}>
                  <Led tone={a ? "success" : i === st.approvals.length ? "attention" : "idle"} />
                  <span>{a ? `Signed by ${a.by}` : i === st.approvals.length ? `Waiting for ${name}` : "Approval slot"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {st.escrow && (
        <PoLabel po={PO.number} tone={poTone(st)} title={`PO ${PO.number} escrow`} code={`PO${PO.number} ${haoyun.receiveAddress.toUpperCase()}`}
          stamp={paid ? <Stamp word="Paid" time="Day 9" /> : <Stamp word="Locked" time="Day 0" />}
          fields={[
            { label: "From", value: `${haoyun.name}, ${haoyun.city}` },
            { label: "PO", value: PO.number },
            { label: "Fits", value: "10MA actuator motor" },
            { label: "Qty", value: st.dock ? `${formatInt(st.dock.receivedQty)} of ${formatInt(PO.quantity)}` : formatInt(PO.quantity) },
            { label: paid ? "Paid" : "Locked", value: formatUsdShort(paid ? st.escrow.releasedCents : st.escrow.lockedCents) },
            { label: "Approved by", value: st.approvals.map((a) => a.by).join(", ") },
          ]} />
      )}
      {st.escrow && (
        <p className={s.sub}>
          {paid
            ? <><span className={s.fig}>{formatUsdShort(st.escrow.releasedCents)}</span> paid to Haoyun. <span className={s.fig}>{formatUsdShort(st.escrow.lockedCents - st.escrow.releasedCents)}</span> {st.escrow.reclaimedCents ? "returned to Astro" : "held"}.</>
            : <><span className={s.fig}>{formatUsdShort(st.escrow.lockedCents)}</span> locked. Visible to Haoyun. Pays Haoyun or Astro only.</>}
        </p>
      )}
      {st.refused.filter((r) => r.kind === "wrong_address_release").map((r) => (
        <p key={r.atMs} className={s.refusal}><Led tone="alert" />Release refused: {r.detail.split(":")[0]} is not one of the three exits</p>
      ))}
    </Panel>
  );
}
