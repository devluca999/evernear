// Money: Astro's wallet, then PO 1042's own account. It shows what is committed, what the dock check
// proposes to release and hold, what was paid, and who the account can pay. Amounts come from the
// engine (scenario state); the wallet balance and monthly spend are simulated (seed/astro.ts).
import type { WorkspaceState } from "@/scenario/types";
import { PO, policy as seedPolicy, story, suppliers, wallet } from "@/seed/astro";
import { formatInt, formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "@/engine/money";
import { Badge, Dot, N, Panel, Stamp } from "../Panel";
import { LifecycleStrip } from "../Diagrams";
import s from "../shell.module.css";

const haoyun = suppliers.find((x) => x.id === "haoyun")!;
const short = (a: string) => (a.startsWith("0x") && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function Cells({ items, cols = 4 }: { items: { label: string; cents: number; tone?: "success" | "attention" }[]; cols?: number }) {
  return (
    <div className={s.cells} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((x, i) => (
        <div key={x.label} className={s.cell} data-tone={x.tone === "attention" && x.cents ? "attention" : undefined}
          style={cols === 2 && i >= 2 ? { borderTop: "1px solid var(--line-hairline)" } : cols === 2 && i % 2 === 0 ? { borderLeft: "none" } : undefined}>
          <span className={s.cellHead}>{x.tone && x.cents > 0 && <Dot tone={x.tone} />}<span className="es-micro">{x.label}</span></span>
          <N className={x.cents ? undefined : s.faint}>{formatUsdShort(x.cents)}</N>
        </div>
      ))}
    </div>
  );
}

function CanPay({ owner }: { owner: string }) {
  return (
    <div className={s.rows}>
      <span className="es-micro" style={{ paddingBottom: 4 }}>Order wallet can pay</span>
      <div className={s.row}><Dot tone="success" /><span>Haoyun Precision</span><N className={s.rowEnd}>{short(haoyun.receiveAddress)}</N></div>
      <div className={s.row}><Dot tone="success" /><span>Astro Robotics</span><N className={s.rowEnd}>{short(owner)}</N></div>
      <div className={s.row}><Dot tone="alert" /><span className={s.muted}>Anyone else</span><span className={s.rowEnd}>Refused</span></div>
    </div>
  );
}

function Spend({ novCents, height }: { novCents: number; height: number }) {
  const months = [...wallet.spend, ["Nov", novCents] as [string, number]];
  const max = Math.max(...months.map((m) => m[1]));
  return (
    <div className={s.lines} style={{ gap: 6 }}>
      <div className={s.headRow}><span className="es-micro">Spend over time</span><N className={`${s.push} ${s.faint}`}>Jun to Nov</N></div>
      <div className={s.bars} style={{ height }} role="img" aria-label={months.map(([m, c]) => `${m} ${formatUsdShort(c)}`).join(", ")}>
        {months.map(([m, c]) => (
          <div key={m} className={s.barCol}><i style={{ height: `${Math.max(4, (c / max) * (height - 16))}px` }} /><span className="es-num">{m}</span></div>
        ))}
      </div>
    </div>
  );
}

/** PO 1042's wallet, from created to closed, always on the card once it exists. */
const Life = ({ e }: { e: NonNullable<WorkspaceState["escrow"]> }) => (
  <div className={s.lines} style={{ gap: 6 }}>
    <span className="es-micro">Order wallet</span>
    <LifecycleStrip at={e.lifecycle} focus />
  </div>
);

export function MoneyPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const e = st.escrow;
  const owner = st.wallet?.owner ?? "astro-robotics.testnet";
  const routine = st.routine.stage === "paid" || st.routine.stage === "closed" ? st.routine.totalCents : 0;
  const nov = routine + (e?.lockedCents ?? 0);
  const meta = e || st.halted ? <>PO <N>{PO.number}</N></> : null;
  const held = e ? e.lockedCents - e.releasedCents - e.reclaimedCents : 0;
  const refusedPay = st.refused.find((r) => r.kind === "wrong_address_release")?.detail.split(":")[0] ?? null;
  const scale = e ? <p className={s.note}>Testnet at 1:<N>{formatInt(TESTNET_SCALE)}</N>: <N>{formatUsd(scaleTestnet(e.lockedCents))}</N> moves for real. A commitment, not a lock: Tidepool enforces the rules, and Astro can change them.</p> : null;

  let body: React.ReactNode;
  if (e && e.releasedCents > 0) {
    body = (
      <div className={s.pad} style={{ gap: 11 }}>
        <div className={s.lines} data-focus="money.payout" style={{ gap: 8 }}>
          <div className={s.headRow} style={{ gap: 12 }}><N className={s.big} >{<span style={{ fontSize: 32, fontWeight: 500 }}>{formatUsdShort(e.releasedCents)}</span>}</N><Stamp word="Paid" time={story.paidAt} /></div>
          <p className={s.sub}>Paid to Haoyun Precision on its own chain. <N className={s.hi}>{formatUsdShort(held || e.reclaimedCents)}</N> {e.reclaimedCents ? "went back to Astro at the deadline." : "held until the deadline."}</p>
          {refusedPay && <span className={s.line}><Dot tone="alert" />Refused: a payment to <N>{short(refusedPay)}</N>, not on PO <N>{PO.number}</N>&apos;s list</span>}
        </div>
        <Cells items={[{ label: "Committed", cents: e.lockedCents }, { label: "Released", cents: e.releasedCents, tone: "success" }, { label: "Held", cents: held, tone: "attention" }, { label: "Returned", cents: e.reclaimedCents, tone: "success" }]} />
        <Life e={e} />
        <Spend novCents={nov} height={62} />
        {scale}
      </div>
    );
  } else if (e && st.dock) {
    body = (
      <div className={s.pad} style={{ gap: 12 }}>
        <div className={s.well} style={{ background: "none" }}>
          <div className={s.headRow}><Dot tone="proposed" /><span className="es-micro">Release</span><span className={`${s.push} ${s.note}`}>proposed</span></div>
          <N><span style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(st.dock.releaseCents)}</span></N>
          <span className={s.note} style={{ fontSize: 12 }}><N>{formatInt(st.dock.receivedQty)}</N> arrived at <N>{formatUsd(e.lockedCents / PO.quantity)}</N></span>
        </div>
        <div className={s.well} data-tone="attention">
          <div className={s.headRow}><Dot tone="attention" /><span className="es-micro">Hold</span><span className={`${s.push} ${s.attnInk}`} style={{ fontSize: 11 }}>Held</span></div>
          <N><span style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(st.dock.holdCents)}</span></N>
          <span className={s.note} style={{ fontSize: 12 }}><N>{formatInt(st.dock.orderedQty - st.dock.receivedQty)}</N> missing · back to Astro <N>{story.deadline}</N></span>
        </div>
        <div className={s.headRow} style={{ justifyContent: "space-between", fontSize: 12 }}>
          <span className={s.muted}>Committed <N className={s.hi}>{formatUsdShort(e.lockedCents)}</N></span>
          <span className={s.muted}>Returned <N>{formatUsdShort(e.reclaimedCents)}</N></span>
        </div>
        <Life e={e} />
      </div>
    );
  } else if (e) {
    body = (
      <div className={s.pad}>
        <div className={s.lines} data-focus="money.escrow" style={{ gap: 8 }}>
          <div className={s.headRow} style={{ gap: 10 }}><N><span style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(e.lockedCents)}</span></N><span className={s.push}><Stamp word="Committed" time={story.committedAt} /></span></div>
          <p className={s.sub}>Committed for PO <N>{PO.number}</N>. Visible to Haoyun. Pays Haoyun or Astro only.</p>
        </div>
        <Cells items={[{ label: "Committed", cents: e.lockedCents }, { label: "Released", cents: e.releasedCents }, { label: "Held", cents: 0 }, { label: "Returned", cents: e.reclaimedCents }]} />
        <Life e={e} />
        <CanPay owner={owner} />
        <Spend novCents={nov} height={110} />
        {scale}
      </div>
    );
  } else if (st.halted || (st.price.history.at(-1) && !st.price.history.at(-1)!.pass && st.scene >= 5)) {
    body = (
      <div className={s.pad} style={{ gap: 12 }}>
        <N className={s.faint}><span style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}>$0</span></N>
        <p className={s.sub} style={{ fontSize: 13 }}>Nothing committed. No money has left Astro&apos;s wallet.</p>
        <Cells cols={2} items={[{ label: "Committed", cents: 0 }, { label: "Released", cents: 0 }, { label: "Held", cents: 0 }, { label: "Returned", cents: 0 }]} />
        <CanPay owner={owner} />
      </div>
    );
  } else if (st.wallet) {
    body = (
      <div className={s.pad} style={{ gap: 12 }}>
        <div className={s.well} style={{ padding: 16, gap: 10 }}>
          <div className={s.headRow}><span className="es-micro">Wallet</span><span className={s.push}><Badge tone="success">Connected</Badge></span></div>
          <p className={s.big} style={{ fontSize: 26 }}>Astro&apos;s wallet</p>
          <p className={s.sub} style={{ fontSize: 14 }}>Keys on your devices. Evernear holds a capped key only.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 10, borderTop: "1px solid var(--line-hairline)" }}>
            <div className={s.field}><span className="es-micro">Balance</span><N><span style={{ fontSize: 22, fontWeight: 500 }}>{formatUsd(wallet.balanceCents)}</span></N></div>
            <div className={s.field}><span className="es-micro">Address</span><N className={s.muted}>{owner}</N></div>
          </div>
        </div>
        <div className={s.rows}>
          {wallet.keys.map((k) => <div key={k.name} className={s.row} style={{ minHeight: 36, fontSize: 13.5 }}><Dot tone="success" /><span>{k.name}</span><span className={s.rowEnd}>{k.role}</span></div>)}
          <div className={s.row} style={{ minHeight: 36, fontSize: 13.5 }}><Dot /><span>Stockbot</span><span className={s.rowEnd}>Capped key · <N className={s.hi}>{formatUsdShort(st.wallet.agentKeyCapCents ?? seedPolicy.autoApproveUnderCents)}</N> a payment</span></div>
        </div>
      </div>
    );
  } else {
    body = <p className={`${s.pad} ${s.note}`}>Connecting Astro&apos;s wallet.</p>;
  }

  return <Panel id="money" title="Money" pulse={pulse} meta={meta}>{body}</Panel>;
}
