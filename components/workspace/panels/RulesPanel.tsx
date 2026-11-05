import type { WorkspaceState } from "@/scenario/types";
import { policy, PO, astro } from "@/seed/astro";
import { formatUsdShort } from "@/engine/money";
import { RAIL, railState } from "@/scenario/stages";
import { Panel } from "../Panel";
import { Led } from "../Led";
import { pct } from "../format";
import s from "../workspace.module.css";

function Meter({ label, value, limit, max, fmt, over }: { label: string; value: number; limit: number; max: number; fmt: (n: number) => string; over: boolean }) {
  return (
    <div className={s.meter}>
      <div className={s.meterHead}><span className={s.micro}>{label}</span><span className={s.fig}>{fmt(value)}<span className={s.limit}> / limit {fmt(limit)}</span></span></div>
      <div className={s.meterTrack} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <span className={`${s.meterFill} ${over ? s.meterOver : s.meterOk}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        <span className={s.meterLine} style={{ left: `${(limit / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function RulesPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const price = st.price.history.at(-1);
  const showOrder = st.scene >= 4 && st.scene !== 9;
  return (
    <Panel id="rules" title="Rules and approvals" pulse={pulse}>
      {st.wallet && st.scene <= 1 && (
        <div className={s.card}>
          <span className={s.micro}>{"ASTRO'S WALLET"}</span>
          <p className={s.mono}>{st.wallet.owner}</p>
          <p className={s.sub}>Keys on your devices. Evernear holds a capped key only.</p>
        </div>
      )}
      {st.scene === 2 && (
        <div className={s.card}>
          <span className={s.micro}>ROUTINE REORDER · ULTRA MOTION</span>
          <p className={s.sub}><span className={s.fig}>300</span> motors, <span className={s.fig}>{formatUsdShort(st.routine.totalCents)}</span>, under the cap, no approval needed</p>
          <ol className={s.miniRail}>
            {RAIL.map((r) => <li key={r.stage} data-state={railState(st.routine.stage, r.stage)} />)}
          </ol>
        </div>
      )}
      <ul className={s.rules}>
        <li><Led tone="success" />Auto approve under <span className={s.fig}>{formatUsdShort(policy.autoApproveUnderCents)}</span></li>
        <li><Led tone="success" />New supplier needs <span className={s.fig}>{policy.approversRequired}</span> approvers</li>
        <li><Led tone="success" />Price change up to <span className={s.fig}>{pct(policy.priceChangeLimitBps)}</span></li>
      </ul>
      {showOrder && (
        <>
          <Meter label="ORDER TOTAL" value={PO.revisedTotalCents} limit={policy.autoApproveUnderCents} max={PO.revisedTotalCents * 1.1} fmt={formatUsdShort} over />
          {price && <Meter label="PRICE CHANGE" value={Math.max(0, price.bps)} limit={policy.priceChangeLimitBps} max={1000} fmt={pct} over={!price.pass} />}
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
        <div className={s.card}>
          <span className={s.micro}>ESCROW · PO 1042</span>
          <p className={s.big}><span className={s.fig}>{formatUsdShort(st.escrow.lockedCents)}</span> locked for PO 1042</p>
          <p className={s.sub}>Visible to Haoyun. Pays Haoyun or Astro only.</p>
          {st.escrow.releasedCents > 0 && (
            <dl className={s.stats}>
              <div><dt>PAID TO HAOYUN</dt><dd className={s.fig}>{formatUsdShort(st.escrow.releasedCents)}</dd></div>
              <div><dt>{st.escrow.reclaimedCents ? "RECLAIMED BY ASTRO" : "HELD"}</dt><dd className={s.fig}>{formatUsdShort(st.escrow.lockedCents - st.escrow.releasedCents)}</dd></div>
            </dl>
          )}
        </div>
      )}
      {st.refused.filter((r) => r.kind === "wrong_address_release").map((r) => (
        <p key={r.atMs} className={s.fail}><Led tone="alert" />Release refused: {r.detail.split(":")[0]} is not one of the three exits</p>
      ))}
    </Panel>
  );
}
