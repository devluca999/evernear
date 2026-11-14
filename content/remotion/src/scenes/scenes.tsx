import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { formatUsd } from "../amounts";
import { AgentDecision } from "../components/AgentDecision";
import { ApprovalGate } from "../components/ApprovalGate";
import { EscrowWallet } from "../components/EscrowWallet";
import { ExplainerDiagram } from "../components/ExplainerDiagram";
import { PayoutComparison } from "../components/PayoutComparison";
import { PurchaseOrder } from "../components/PurchaseOrder";
import { SecurityRefusal } from "../components/SecurityRefusal";
import { ShipmentMilestones } from "../components/ShipmentMilestones";
import { TransactionReceipt } from "../components/TransactionReceipt";
import { TrustBoundary } from "../components/TrustBoundary";
import { Micro, Mono, Stage } from "../components/ui";
import { useT } from "../components/useT";
import { PROOFS_DOC, type Receipt, type Story } from "../data";
import { color, enter } from "../theme";
import { SceneFrame, useLayout } from "./SceneFrame";

type S = { readonly story: Story };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};
const plural = (part: string) => `${part.toLowerCase()}s`;
const motorWord = (part: string) => plural(part.split(" ").slice(-1)[0] ?? part);

// ---- text derived from data --------------------------------------------------------------------

export const hookLine = (s: Story) => `We ordered ${s.po.orderedQty} ${motorWord(s.po.part)}. Only ${s.po.receivedQty} arrived.`;

export const agentReasons = (s: Story) => [
  `First quote ${formatUsd(s.po.firstQuoteUnitCents)} per unit, negotiated to ${formatUsd(s.po.unitCents)}: within the urgent ceiling of ${formatUsd(s.po.priceCapCents)} (base ${formatUsd(s.po.baseUnitCents)} + ${s.policy.priceChangeLimitPercent}%)`,
  `Arrives ${fmtDate(s.po.arrives)}, before the need-by date of ${fmtDate(s.po.needBy)}`,
  `Fits all ${Object.keys(s.po.specs).length} motor specs`,
];

export const agentCannot = (s: Story) => [
  `Commit ${formatUsd(s.settlement.orderTotalCents)} without ${s.policy.approversRequired} human signatures (limit for auto-approve: ${formatUsd(s.policy.autoApproveUnderCents)})`,
  `Pay anyone except ${s.supplier.name} or ${s.buyer.short}`,
  `Release money without shipment evidence`,
];

export const approvalTerms = (s: Story, unitCents = s.po.unitCents) => [
  `Supplier ${s.supplier.name}`,
  `Pay to ${s.supplier.address}`,
  `${s.po.orderedQty} x ${formatUsd(unitCents)} = ${formatUsd(s.po.orderedQty * unitCents)}`,
  `PO ${s.po.number}, current version`,
  `Payment rules hash`,
];

export const walletPolicy = (s: Story) => [
  `Pays only ${s.supplier.name} or ${s.buyer.short}`,
  `At most ${formatUsd(s.settlement.orderTotalCents)} per transaction (${s.testnet.total} test USDC)`,
  `Supplier payouts go through the release gate in an OutLayer TEE`,
];

/** Recorded testnet amounts, only when the recorded run matches what is computed from the data. */
export const recordedTestnet = (s: Story) => {
  const { advance, balance, returned } = s.receipts;
  if (![advance, balance, returned].every((r) => r.matchesComputed)) return null;
  return { paid: `${advance.amountTestUsdc} + ${balance.amountTestUsdc}`, returned: returned.amountTestUsdc };
};

const receiptProps = (r: Receipt) => ({
  title: r.title,
  meaning: r.meaning,
  chain: r.network,
  txHash: r.txId,
  sender: r.sender,
  recipient: r.recipient,
  amount: r.amountTestUsdc,
  explorerUrl: r.explorerUrl,
  verified: r.verified,
  matchesComputed: r.matchesComputed,
  computedAmount: r.computedTestUsdc,
});

const ScaleNote: React.FC<S> = ({ story }) => {
  const { u, layout } = useLayout();
  return (
    <div style={{ fontSize: (layout === "tall" ? 24 : 20) * u, color: color.faint, marginTop: 14 * u }}>
      Testnet at {story.testnet.scaleLabel}: {formatUsd(story.settlement.orderTotalCents)} is {story.testnet.total} test USDC.
    </div>
  );
};

// ---- scenes ------------------------------------------------------------------------------------

export const HookScene: React.FC<S & { line?: string; sub?: string }> = ({ story, line, sub }) => {
  const t = useT();
  const { u, layout } = useLayout();
  const tall = layout === "tall";
  return (
    <Stage>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: tall ? "0 80px" : `0 ${160 * u}px`, gap: 30 * u }}>
        <Micro u={tall ? 1.5 : u * 1.2} style={enter(t, 0)}>
          {story.buyer.name} · PO {story.po.number}
        </Micro>
        <div style={{ fontSize: tall ? 110 : 120 * u, fontWeight: 600, letterSpacing: -2.5 * u, lineHeight: 1.04, ...enter(t, 6) }}>{line ?? hookLine(story)}</div>
        {sub ? <div style={{ fontSize: tall ? 48 : 44 * u, color: color.muted, lineHeight: 1.3, ...enter(t, 30) }}>{sub}</div> : null}
      </div>
    </Stage>
  );
};

export const POScene: React.FC<S & { withAgent?: boolean; caption?: string }> = ({ story, withAgent = true, caption }) => {
  const { u, layout } = useLayout();
  const s = story;
  const po = (
    <PurchaseOrder
      u={layout === "wide" ? u * 1.05 : u}
      poNumber={s.po.number}
      buyer={s.buyer.name}
      supplier={s.supplier.name}
      supplierPlace={`${s.supplier.city}, ${s.supplier.country}`}
      part={s.po.part}
      qty={s.po.orderedQty}
      unitCents={s.po.unitCents}
      totalCents={s.settlement.orderTotalCents}
      needBy={fmtDate(s.po.needBy)}
      specs={s.po.specs}
      status="Awaiting approval"
    />
  );
  return (
    <SceneFrame eyebrow="Step 1 · The agent drafts the order" headline={`An AI agent chose ${s.supplier.name} for ${formatUsd(s.settlement.orderTotalCents)}.`} caption={caption}>
      {withAgent && layout === "wide" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 * u, alignItems: "start" }}>
          {po}
          <AgentDecision u={u} delay={20} title="Why the agent chose it" decision={`${s.supplier.name}, ${s.supplier.city}`} reasons={agentReasons(s)} />
        </div>
      ) : (
        po
      )}
    </SceneFrame>
  );
};

export const ApprovalScene: React.FC<S & { splitAt: number; caption?: string }> = ({ story, splitAt, caption }) => {
  const frame = useCurrentFrame();
  const { u, layout } = useLayout();
  const s = story;
  const [first, second] = s.approvers;
  const common = {
    u: layout === "wide" ? u * 1.05 : u,
    required: s.policy.approversRequired,
    terms: approvalTerms(s),
    enforcedBy: s.refusals.approval.layer,
  };
  const refusedNote = `Refusal from ${s.refusals.approval.test} (${s.refusals.approval.environment}). ${s.refusals.approval.liveNote}`;
  const approvedNote = `Illustrates the check. ${s.refusals.approval.liveNote}`;
  const refused = frame < splitAt;
  return (
    <SceneFrame
      eyebrow="Step 2 · Humans sign the exact terms"
      headline={refused ? `One signature is not enough.` : `${s.policy.approversRequired} of ${s.policy.approversRequired}: ${first} and ${second} signed.`}
      caption={caption ?? (refused ? `With ${first}'s signature alone, the commit is refused.` : "Both signatures cover the exact supplier, amount and quantity. Change a term and they no longer count.")}
      contentWidth={layout === "wide" ? 1100 : undefined}
    >
      {refused ? (
        <ApprovalGate {...common} approvers={[{ name: first, signed: true }, { name: second, signed: false }]} state="refused" reason={s.refusals.approval.code} footnote={refusedNote} />
      ) : (
        <Sequence from={splitAt} layout="none">
          <ApprovalGate {...common} approvers={[{ name: first, signed: true }, { name: second, signed: true }]} state="approved" footnote={approvedNote} />
        </Sequence>
      )}
    </SceneFrame>
  );
};

export const WalletScene: React.FC<S & { withReceipt?: boolean; caption?: string }> = ({ story, withReceipt = true, caption }) => {
  const { u, layout } = useLayout();
  const s = story;
  const wallet = (
    <EscrowWallet
      u={u}
      account={s.wallet.account}
      provider={s.wallet.provider}
      providerNote={s.wallet.providerNote}
      committedCents={s.settlement.orderTotalCents}
      committedTestUsdc={s.testnet.total}
      releasedCents={0}
      returnedCents={0}
      policy={walletPolicy(s)}
    />
  );
  return (
    <SceneFrame
      eyebrow="Step 3 · Money is committed, not paid"
      headline={`${formatUsd(s.settlement.orderTotalCents)} moves into a wallet for this one order.`}
      caption={caption ?? "Recorded Nov 6, before the signature check existed."}
    >
      {withReceipt && layout === "wide" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 * u, alignItems: "start" }}>
          {wallet}
          <TransactionReceipt u={u * 0.95} delay={24} compact {...receiptProps(s.receipts.commit)} />
        </div>
      ) : (
        wallet
      )}
    </SceneFrame>
  );
};

export const MilestonesScene: React.FC<S & { caption?: string }> = ({ story, caption }) => {
  const { u } = useLayout();
  const s = story;
  return (
    <SceneFrame
      eyebrow="Step 4 · The goods leave the factory"
      headline={`${s.policy.advanceRequires.join(" + ")} unlock the ${s.policy.advancePercent}% advance.`}
      caption={caption ?? "Shipment signals in this demo come from a simulated carrier and customs feed."}
      contentWidth={1150}
    >
      <ShipmentMilestones u={u} milestones={s.signals.map((m) => ({ ...m, done: m.unlocks === "advance" }))} />
    </SceneFrame>
  );
};

export const ReceiptScene: React.FC<S & { receipt: Receipt; eyebrow: string; headline: string; caption?: string }> = ({ story, receipt, eyebrow, headline, caption }) => {
  const { u, layout } = useLayout();
  return (
    <SceneFrame eyebrow={eyebrow} headline={headline} caption={caption} contentWidth={layout === "wide" ? 1600 : undefined}>
      <TransactionReceipt u={layout === "wide" ? u * 1.05 : u * 0.92} wide={layout === "wide"} {...receiptProps(receipt)} />
      <ScaleNote story={story} />
    </SceneFrame>
  );
};

export const DockScene: React.FC<S & { caption?: string }> = ({ story, caption }) => {
  const { u, layout } = useLayout();
  const s = story;
  const dock = s.signals.find((x) => x.event === "dock_count");
  const milestones = (
    <ShipmentMilestones
      u={u}
      stagger={8}
      milestones={s.signals.map((m) => ({ ...m, done: true }))}
      dock={{ received: s.po.receivedQty, ordered: s.po.orderedQty }}
    />
  );
  return (
    <SceneFrame
      eyebrow="Step 5 · The dock counts the boxes"
      headline={`${s.po.receivedQty} of ${s.po.orderedQty} arrived. The balance pays for ${s.po.receivedQty}.`}
      caption={
        caption ??
        `Balance = ${s.po.receivedQty} x ${formatUsd(s.po.unitCents)} - ${formatUsd(s.settlement.advanceCents)} advance = ${formatUsd(s.settlement.balanceCents)}.${dock && dock.count !== null && dock.count !== s.po.receivedQty ? ` (Recorded dock count: ${dock.count}.)` : ""}`
      }
    >
      {layout === "wide" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 * u, alignItems: "start" }}>
          {milestones}
          <PayoutComparison u={u} delay={30} s={s.settlement} testnet={recordedTestnet(s)} />
        </div>
      ) : (
        milestones
      )}
    </SceneFrame>
  );
};

export const PayoutScene: React.FC<S & { caption?: string; headline?: string }> = ({ story, caption, headline }) => {
  const { u } = useLayout();
  const s = story;
  return (
    <SceneFrame
      eyebrow="The settlement"
      headline={headline ?? `${formatUsd(s.settlement.paidCents)} paid. ${formatUsd(s.settlement.returnedCents)} back to ${s.buyer.short}.`}
      caption={caption}
    >
      <PayoutComparison u={u} s={s.settlement} testnet={recordedTestnet(s)} />
    </SceneFrame>
  );
};

export const GrantRefusalScene: React.FC<S & { caption?: string; eyebrow?: string; headline?: string }> = ({ story, caption, eyebrow, headline }) => {
  const { u, layout } = useLayout();
  const s = story;
  const g = s.refusals.grant;
  const d = s.refusals.destination;
  return (
    <SceneFrame
      eyebrow={eyebrow ?? "What the server could not do"}
      headline={headline ?? "Our own server tried to pay an unknown address."}
      caption={caption ?? "Refused at the grant layer: Evernear's server holds no grant on this wallet."}
      contentWidth={layout === "wide" ? 1600 : undefined}
    >
      <SecurityRefusal
        u={layout === "wide" ? u * 0.9 : u * 0.92}
        wide={layout === "wide"}
        title="Server withdraw refused"
        attempt={g.attempt}
        layer={`${g.layer[0].toUpperCase()}${g.layer.slice(1)} layer (Tidepool): the caller holds no grant`}
        code={g.code}
        httpStatus={g.httpStatus}
        where={g.where}
        proofNote={g.proofNote}
      />
      {layout === "wide" ? (
        <div style={{ fontSize: 20 * u, color: color.faint, marginTop: 16 * u, lineHeight: 1.4 }}>
          Separate event, different layer: the destination allowlist refusal (<Mono size={20 * u}>{d.code}</Mono>) was seen on the {d.where}.
        </div>
      ) : null}
    </SceneFrame>
  );
};

export const TrustScene: React.FC<S & { splitAt: number }> = ({ story, splitAt }) => {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const s = story;
  const diagram = frame < splitAt;
  return (
    <SceneFrame
      eyebrow="Trust boundaries"
      headline={diagram ? "Each step is enforced by a different party." : "What is enforced, and what is still simulated."}
      caption={diagram ? undefined : "Details: docs/hackathon/TRUST-MODEL.md and ENFORCEMENT-MATRIX.md"}
    >
      {diagram ? (
        <ExplainerDiagram
          u={u * 1.25}
          step={24}
          nodes={[
            { id: "agent", label: "Procurement agent", sub: "drafts the PO" },
            { id: "approvals", label: `${s.policy.approversRequired} human signatures`, sub: "backend check, off-chain", tone: "needs" },
            { id: "wallet", label: "Order wallet", sub: `Tidepool policy: ${s.supplier.name} or ${s.buyer.short}` },
            { id: "gate", label: "Release gate", sub: "OutLayer TEE holds the grant that pays the supplier" },
            { id: "payout", label: "Payout", sub: "Base Sepolia / NEAR testnet", tone: "done" },
          ]}
          edges={["terms", "commit", "evidence (simulated)", "release"]}
        />
      ) : (
        <Sequence from={splitAt} layout="none">
          <TrustBoundary u={u * 0.95} boundaries={s.trust} stillSimulated={s.stillSimulated} />
        </Sequence>
      )}
    </SceneFrame>
  );
};

export const EndCard: React.FC<S & { line?: string }> = ({ story, line }) => {
  const t = useT();
  const { u, layout } = useLayout();
  const tall = layout === "tall";
  const { fps } = useVideoConfig();
  return (
    <Stage>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: tall ? "0 80px" : `0 ${160 * u}px`, gap: 34 * u }}>
        <div style={{ fontSize: tall ? 96 : 92 * u, fontWeight: 600, letterSpacing: -2 * u, lineHeight: 1.06, ...enter(t, 0) }}>
          {line ?? "Your AI can execute the purchase. The payment rules still protect your money."}
        </div>
        <div style={{ ...enter(t, fps * 0.8) }}>
          <Micro u={tall ? 1.4 : u * 1.1}>Every transaction, with full hashes</Micro>
          <div style={{ marginTop: 10 * u }}>
            <Mono size={tall ? 40 : 40 * u} c={color.accent} weight={500}>
              {PROOFS_DOC}
            </Mono>
          </div>
        </div>
        <div style={{ fontSize: tall ? 30 : 24 * u, color: color.faint, lineHeight: 1.4, ...enter(t, fps * 1.4) }}>
          EverNEAR · testnet demo at {story.testnet.scaleLabel} · shipment signals simulated · Tidepool is community-run, not NEAR infrastructure
        </div>
      </div>
    </Stage>
  );
};
