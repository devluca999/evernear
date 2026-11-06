import type { WorkspaceState } from "@/scenario/types";
import { PO, astro, suppliers } from "@/seed/astro";
import { RulesEditor } from "../rules";
import { formatUsd, formatUsdShort, formatInt, scaleTestnet, TESTNET_SCALE } from "@/engine/money";
import { RAIL, railState } from "@/scenario/stages";
import { Panel } from "../Panel";
import { Led, type Tone } from "../Led";
import { PoLabel, Ruler, Stamp } from "../ui";
import { pct } from "../format";
import s from "../workspace.module.css";
import p from "../premium.module.css";

const haoyun = suppliers.find((x) => x.id === "haoyun")!;
const RECENT_MS = 4000;

function poTone(st: WorkspaceState): Tone {
  if (st.stage === "paid" || st.stage === "closed") return "success";
  if (st.dock) return "attention";
  return "active";
}

export function RulesPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const policy = st.policy;
  const showOrder = st.scene >= 4 && st.scene !== 9;
  const overCap = PO.revisedTotalCents >= policy.autoApproveUnderCents;
  const approved = st.approvals.length >= st.requiredApprovals;
  const paid = st.escrow !== null && st.escrow.releasedCents > 0;
  const rows: { tone: Tone; text: React.ReactNode }[] = [
    { tone: "success", text: <>Actuator motor at most <span className={s.fig}>{formatUsd(policy.priceCaps["Actuator motor"] ?? 0)}</span> a unit</> },
    { tone: showOrder && overCap ? (approved ? "success" : "attention") : "success", text: <>Auto approve under <span className={s.fig}>{formatUsdShort(policy.autoApproveUnderCents)}</span></> },
    { tone: showOrder ? (approved ? "success" : "attention") : "success", text: <>Over the cap or a new supplier: <span className={s.fig}>{policy.approversRequired}</span> {policy.approversRequired === 1 ? "approver" : "approvers"}</> },
    { tone: st.price.history.length ? (st.price.history.at(-1)!.pass ? "success" : "attention") : "success", text: <>Price change up to <span className={s.fig}>{pct(policy.priceChangeLimitBps)}</span></> },
  ];

  return (
    <Panel id="rules" title="Rules and approvals" pulse={pulse}>
      {st.escrow && (
        <div className={s.outcome}>
          <span className={s.micro}>PO {PO.number}</span>
          <p className={s.outcomeText}>
            {paid
              ? <><span className={s.fig}>{formatUsdShort(st.escrow.releasedCents)}</span> paid to Haoyun · <span className={s.fig}>{formatUsdShort(st.escrow.lockedCents - st.escrow.releasedCents)}</span> {st.escrow.reclaimedCents ? "back to Astro" : "held"}</>
              : <><span className={s.fig}>{formatUsdShort(st.escrow.lockedCents)}</span> committed to Haoyun&apos;s PO account</>}
          </p>
          <p className={s.sub}>{paid ? "Paid for what arrived. The rest returns to Astro." : "Visible to Haoyun. It can only pay Haoyun or go back to Astro."}</p>
        </div>
      )}
      {st.refused.filter((r) => r.kind === "wrong_address_release").map((r) => {
        const to = r.detail.split(":")[0];
        const short = to.length > 14 ? `${to.slice(0, 6)}…${to.slice(-4)}` : to;
        // A refusal here is the guard working: said as such, then reduced to a quiet line.
        return st.t - r.atMs < RECENT_MS
          ? <p key={r.atMs} className={s.refusal}><Led tone="success" />Blocked as designed: a release to {short} is not one of the three exits</p>
          : <p key={r.atMs} className={s.quietNote}>1 wrong address release blocked</p>;
      })}
      {st.escrow && (
        <PoLabel po={PO.number} tone={poTone(st)} title={`PO ${PO.number} escrow`} code={`PO${PO.number} ${haoyun.receiveAddress.slice(0, 10).toUpperCase()}`}
          stamp={paid ? <Stamp word="Paid" time="Day 9" /> : <Stamp word="Committed" time="Day 0" />}
          fields={[
            { label: "From", value: `${haoyun.name}, ${haoyun.city}` },
            { label: "PO", value: PO.number },
            { label: "Fits", value: "10MA actuator motor" },
            { label: "Qty", value: st.dock ? `${formatInt(st.dock.receivedQty)} of ${formatInt(PO.quantity)}` : formatInt(PO.quantity) },
            { label: paid ? "Paid" : "Committed", value: formatUsdShort(paid ? st.escrow.releasedCents : st.escrow.lockedCents) },
            { label: "Approved by", value: st.approvals.map((a) => a.by).join(", ") },
          ]} />
      )}
      {st.escrow && (
        <p className={s.quietNote}>
          Testnet at 1:{formatInt(TESTNET_SCALE)}: <span className={s.fig}>{formatUsd(scaleTestnet(st.escrow.lockedCents))}</span> moves for real.
          A commitment, not a lock: Tidepool enforces the rules, and Astro can change them.
        </p>
      )}
      {showOrder && !st.escrow && (
        <>
          <div className={s.orderLine}>
            <div><span className={s.micro}>ORDER TOTAL · PO {PO.number}</span><p className={s.big}><span className={s.fig}>{formatUsdShort(PO.revisedTotalCents)}</span></p></div>
            <p className={s.orderNote}><Led tone={approved ? "success" : "attention"} />{approved ? `Approved by ${st.approvals.length}` : `${overCap ? `Over the ${formatUsdShort(policy.autoApproveUnderCents)} cap` : "Under the cap"} and a new supplier: ${st.requiredApprovals} ${st.requiredApprovals === 1 ? "approval" : "approvals"} needed`}</p>
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
      <section className={s.rulesRef} aria-label="Company rules">
        <span className={s.micro}>COMPANY RULES</span>
        <ul className={s.rules}>
        {rows.map((r, i) => <li key={i}><Led tone={r.tone} />{r.text}</li>)}
      </ul>
      <RulesEditor />
      </section>
    </Panel>
  );
}
