// Money: Astro's wallet, then PO 1042's own account. It shows what is committed, what the dock check
// proposes to release and hold, what was paid, and who the account can pay. Amounts come from the
// engine (scenario state); the wallet balance and monthly spend are simulated (seed/astro.ts).
import type { WorkspaceState } from "@/scenario/types";
import { PO, policy as seedPolicy, story, suppliers, wallet } from "@/seed/astro";
import { formatInt, formatUsd, formatUsdShort, scaleTestnet, TESTNET_SCALE } from "@/engine/money";
import { Badge, Dot, N, Panel, Stamp } from "../Panel";
import { LifecycleStrip } from "../Diagrams";
import { RELEASE_RULES } from "@/engine/escrow";
import { Loader } from "lucide-react";
import { useActions } from "../actions";
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
      <div className={s.row}><Dot tone="success" /><span>Haoyun Precision</span><span className={`es-num ${s.rowEnd}`} data-abbr title={haoyun.receiveAddress}>{short(haoyun.receiveAddress)}</span></div>
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

/**
 * What the two-stage escrow protected, against the two usual ways to pay an overseas supplier.
 * The wire and letter-of-credit columns are typical figures, labelled so.
 */
function Protected({ heldCents, lockedCents, advanceCents }: { heldCents: number; lockedCents: number; advanceCents: number }) {
  const lc = (lockedCents * 3) / 100;
  return (
    <section className={s.protect} aria-label="What this protected" data-focus="money.protected">
      <span className="es-micro">What this protected</span>
      <div className={s.protectGrid}>
        <span />
        <span className="es-micro">Prepaid wire, typical</span>
        <span className="es-micro">Letter of credit, typical</span>
        <span className="es-micro">Evernear two-stage escrow</span>
        <span className={s.note}>Money at risk for the missing motors</span>
        <span><N>{formatUsdShort(heldCents)}</N> already paid, to be chased</span>
        <span>Paid on documents, <N>{formatUsdShort(heldCents)}</N> to dispute</span>
        <span className={s.protectWin}><N>{formatUsdShort(heldCents)}</N> never left Astro&apos;s control</span>
        <span className={s.note}>Cost and time to set up</span>
        <span>Wire fees, 3 to 5 days</span>
        <span>About 3% (<N>{formatUsdShort(lc)}</N>), up to 14 days, missing Dec 14</span>
        <span className={s.protectWin}>Instant</span>
        <span className={s.note}>Haoyun&apos;s protection</span>
        <span>Paid in full</span>
        <span>Bank guarantee</span>
        <span className={s.protectWin}><N>{formatUsdShort(advanceCents)}</N> on departure, the rest visibly locked</span>
      </div>
    </section>
  );
}

/** PO 1042's wallet, from created to closed, always on the card once it exists. */
const Life = ({ e }: { e: NonNullable<WorkspaceState["escrow"]> }) => (
  <div className={s.lines} style={{ gap: 6 }}>
    <span className="es-micro">Order wallet</span>
    <LifecycleStrip at={e.lifecycle} focus />
  </div>
);

/** Live: the money step running on testnet right now. Next waits until it is confirmed. */
function Running({ text }: { text: string }) {
  return (
    <div className={s.liveRun} role="status" data-focus="money.running">
      <Loader size={15} strokeWidth={2} aria-hidden="true" className={s.spin} />
      <span>{text}</span>
      <span className={`${s.push} ${s.note}`}>Confirming</span>
    </div>
  );
}

export function MoneyPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const { live } = useActions();
  const e = st.escrow;
  const owner = st.wallet?.owner ?? "astro-robotics.testnet";
  const routine = st.routine.stage === "paid" || st.routine.stage === "closed" ? st.routine.totalCents : 0;
  const nov = routine + (e?.lockedCents ?? 0);
  const meta = e || st.halted ? <>PO <N>{PO.number}</N></> : null;
  const held = e ? e.lockedCents - e.releasedCents - e.reclaimedCents : 0;
  const refusedPay = st.refused.find((r) => r.kind === "wrong_address_release")?.detail.split(":")[0] ?? null;
  const scale = e ? <p className={s.note}>Testnet at 1:<N>{formatInt(TESTNET_SCALE)}</N>: <N>{formatUsd(scaleTestnet(e.lockedCents))}</N> moves for real. A commitment, not a lock: Tidepool enforces the rules, and Astro can change them.</p> : null;

  // The two-stage release: the advance is a fixed share of the commitment, the balance the rest released.
  const balanceDone = !!e && (e.lifecycle === "balance_released" || e.lifecycle === "settled" || e.lifecycle === "closed");
  const advanceCents = e && e.releasedCents > 0 ? Math.min(e.releasedCents, (e.lockedCents * RELEASE_RULES.advancePercent) / 100) : 0;
  const balanceCents = e ? e.releasedCents - advanceCents : 0;
  const stages = e ? <Cells cols={5} items={[
    { label: "Committed", cents: e.lockedCents }, { label: "Advance", cents: advanceCents, tone: "success" }, { label: "Balance", cents: balanceCents, tone: "success" },
    // Before the dock count the rest is still locked for the balance; after it, what stays is held for the missing motors.
    balanceDone ? { label: "Held", cents: held, tone: "attention" } : { label: "Still locked", cents: held }, { label: "Returned", cents: e.reclaimedCents, tone: "success" },
  ]} /> : null;

  let body: React.ReactNode;
  if (e && balanceDone) {
    body = (
      <div className={s.pad} style={{ gap: 11 }}>
        <div className={s.lines} data-focus="money.payout" style={{ gap: 8 }}>
          <div className={s.headRow} style={{ gap: 12 }}><N className={s.big} >{<span style={{ fontSize: 32, fontWeight: 500 }}>{formatUsdShort(e.releasedCents)}</span>}</N><Stamp word="Paid" time={story.paidAt} /></div>
          <p className={s.sub}>Paid to Haoyun Precision on its own chain: <N className={s.hi}>{formatUsdShort(advanceCents)}</N> on departure, <N className={s.hi}>{formatUsdShort(balanceCents)}</N> for what arrived. <N className={s.hi}>{formatUsdShort(held || e.reclaimedCents)}</N> {e.reclaimedCents ? "went back to Astro at the deadline." : "held until the deadline."}</p>
          {refusedPay && <span className={s.line}><Dot tone="alert" />Refused: a payment to <span className="es-num" data-abbr title={refusedPay}>{short(refusedPay)}</span>, not on PO <N>{PO.number}</N>&apos;s list</span>}
        </div>
        {stages}
        <Life e={e} />
        {st.protectedShown && <Protected heldCents={held || e.reclaimedCents} lockedCents={e.lockedCents} advanceCents={advanceCents} />}
        {!st.protectedShown && <Spend novCents={nov} height={62} />}
        {scale}
      </div>
    );
  } else if (e && st.dock) {
    body = (
      <div className={s.pad} style={{ gap: 12 }}>
        <div className={s.headRow} style={{ fontSize: 12.5 }}><Dot tone="success" /><span className={s.muted}>Advance paid on departure <N className={s.hi}>{formatUsdShort(advanceCents)}</N></span></div>
        <div className={s.well} style={{ background: "none" }}>
          <div className={s.headRow}><Dot tone="proposed" /><span className="es-micro">Balance</span><span className={`${s.push} ${s.note}`}>proposed</span></div>
          <N><span style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(st.dock.releaseCents)}</span></N>
          <span className={s.note} style={{ fontSize: 12 }}><N>{formatInt(st.dock.receivedQty)}</N> arrived at <N>{formatUsd(e.lockedCents / PO.quantity)}</N>, minus the advance</span>
        </div>
        <div className={s.well} data-tone="attention">
          <div className={s.headRow}><Dot tone="attention" /><span className="es-micro">Hold</span><span className={`${s.push} ${s.attnInk}`} style={{ fontSize: 11 }}>Held</span></div>
          <N><span style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(st.dock.holdCents)}</span></N>
          <span className={s.note} style={{ fontSize: 12 }}><N>{formatInt(st.dock.orderedQty - st.dock.receivedQty)}</N> missing or damaged · replacements or back to Astro <N>{story.deadline}</N></span>
        </div>
        <Life e={e} />
      </div>
    );
  } else if (e && e.releasedCents > 0) {
    body = (
      <div className={s.pad} style={{ gap: 11 }}>
        <div className={s.lines} data-focus="money.advance" style={{ gap: 8 }}>
          <div className={s.headRow} style={{ gap: 12 }}><N><span style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(advanceCents)}</span></N><span className={s.push}><Stamp word="Advance paid" time={story.departedAt} /></span></div>
          <p className={s.sub}>{RELEASE_RULES.advancePercent}% to Haoyun as the motors leave Shenzhen: the bill of lading and the export clearance both came in. <N className={s.hi}>{formatUsdShort(e.lockedCents - e.releasedCents)}</N> stays locked for the dock.</p>
        </div>
        {stages}
        <Life e={e} />
        {scale}
      </div>
    );
  } else if (e) {
    body = (
      <div className={s.pad}>
        <div className={s.lines} data-focus="money.escrow" style={{ gap: 8 }}>
          <div className={s.headRow} style={{ gap: 10 }}><N><span style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(e.lockedCents)}</span></N><span className={s.push}><Stamp word="Committed" time={story.committedAt} /></span></div>
          <p className={s.sub}>Committed for PO <N>{PO.number}</N>. Visible to Haoyun. Pays Haoyun or Astro only: {RELEASE_RULES.advancePercent}% when the goods leave, the rest for what arrives.</p>
        </div>
        {stages}
        <Life e={e} />
        <CanPay owner={owner} />
        <Spend novCents={nov} height={90} />
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
          <div className={s.headRow}><span className="es-micro">Wallet</span><span className={s.push}>{live?.on && live.connected === null
            ? <Badge tone="active">Connecting</Badge>
            : live?.on && live.connected === false ? <Badge tone="attention">Replay</Badge> : <Badge tone="success">Connected</Badge>}</span></div>
          <p className={s.big} style={{ fontSize: 26 }}>Astro&apos;s wallet</p>
          <p className={s.sub} style={{ fontSize: 14 }}>Keys on your devices. Evernear holds a capped key only.</p>
          {live?.note && <p className={s.note} style={{ fontSize: 13 }}><Dot tone="success" /> {live.note}</p>}
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
    // The wallet is there from the first frame (scenes.ts puts it at 0 ms); this only shows mid-load.
    body = <p className={`${s.pad} ${s.note}`}>Astro&apos;s wallet</p>;
  }

  return <Panel id="money" title="Money" pulse={pulse} meta={meta}>{live?.running && <Running text={live.running} />}{body}</Panel>;
}
