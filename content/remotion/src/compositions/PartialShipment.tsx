import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { formatUsd } from "../amounts";
import { BinaryVsMilestone } from "../components/BinaryVsMilestone";
import { ExplainerDiagram } from "../components/ExplainerDiagram";
import { ReceiptRow } from "../components/ReceiptRow";
import { Recompute } from "../components/Recompute";
import { Micro, Stage } from "../components/ui";
import { useT } from "../components/useT";
import { buildStory, DOCK_SIGNING, OWNER_KEY_NOTE, WALLET_RULES_NOTE, type Receipt, type Story } from "../data";
import { SceneFrame, useLayout } from "../scenes/SceneFrame";
import { EndCard } from "../scenes/scenes";
import { color, enter } from "../theme";
import { PARTIAL_SCENES as D, PARTIAL_T as T } from "../timing";
import type { StoryProps } from "./JudgeCut";

export const PARTIAL_HOOK = ["Escrow can hold a payment.", "But what happens when only part of the order shows up?"] as const;
export const PAYOFF_LINE = "AI can handle procurement. It doesn't get to invent the payment rules.";

type S = { readonly story: Story };

export const PartialHook: React.FC = () => {
  const t = useT();
  const { u, layout } = useLayout();
  const tall = layout === "tall";
  return (
    <Stage>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: tall ? "0 80px" : `0 ${160 * u}px`, gap: 40 * u }}>
        <div style={{ fontSize: tall ? 100 : 104 * u, fontWeight: 600, letterSpacing: -2 * u, lineHeight: 1.05, color: color.muted, ...enter(t, 4) }}>{PARTIAL_HOOK[0]}</div>
        <div style={{ fontSize: tall ? 100 : 104 * u, fontWeight: 600, letterSpacing: -2 * u, lineHeight: 1.05, ...enter(t, 40) }}>{PARTIAL_HOOK[1]}</div>
      </div>
    </Stage>
  );
};

const BinaryScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  return (
    <SceneFrame eyebrow="One release or one refund" headline="One release, one refund: two buttons." caption="Neither one matches what arrived.">
      <BinaryVsMilestone u={u * 1.05} s={s.settlement} c={s.comparison} direction="column" show="binary" />
    </SceneFrame>
  );
};

const MilestoneScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const st = s.settlement;
  return (
    <SceneFrame eyebrow="EverNEAR" headline="A purchase order with milestones.">
      <ExplainerDiagram
        u={u * 1.2}
        direction="column"
        step={26}
        nodes={[
          { id: "commit", label: `${formatUsd(st.orderTotalCents)} committed`, sub: `${st.orderedQty} x ${formatUsd(st.unitCents)}, in a wallet made for this one order. ${WALLET_RULES_NOTE}.` },
          { id: "advance", label: `${s.policy.advancePercent}% advance: ${formatUsd(st.advanceCents)}`, sub: `on ${s.policy.advanceRequires.map((x) => x.toLowerCase()).join(" + ")}`, tone: "done" },
          { id: "balance", label: "Balance at the dock", sub: "received x unit price - advance", tone: "done" },
          { id: "return", label: "The held part returns", sub: `to the buyer, ${s.buyer.short}` },
        ]}
        edges={["", "", ""]}
      />
    </SceneFrame>
  );
};

const DockRecomputeScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  return (
    <SceneFrame eyebrow={`PO ${s.po.number} · dock count`} headline={`${s.po.receivedQty} of ${s.po.orderedQty} arrived.`} caption={`The ${s.settlement.missingQty} missing motors are never paid for.`}>
      <Recompute u={u * 1.0} s={s.settlement} />
    </SceneFrame>
  );
};

const ComparisonScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  return (
    <SceneFrame eyebrow="Same order, same dock count" headline={`${formatUsd(s.comparison.binaryReleaseAllCents)} or ${formatUsd(s.comparison.milestonePaidCents)}?`} caption="Two people sign the exact terms. The release grant is held by an OutLayer enclave.">
      <BinaryVsMilestone u={u * 1.0} s={s.settlement} c={s.comparison} direction="column" />
    </SceneFrame>
  );
};

const rowProps = (r: Receipt, title: string) => ({
  title,
  amount: r.amountTestUsdc,
  chain: r.network,
  txHash: r.txId,
  explorerUrl: r.explorerUrl,
  verified: r.verified,
  note: r.matchesComputed ? null : `Recorded run; differs from computed ${r.computedTestUsdc}`,
});

const ReceiptsScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const k = u * 0.78;
  const t = useT();
  return (
    <SceneFrame eyebrow={`Real testnet receipts · ${s.testnet.scaleLabel}`} headline="Every payment has a hash.">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <ReceiptRow u={k} {...rowProps(s.receipts.advance, `Advance to ${s.supplier.name}`)} />
        <ReceiptRow u={k} delay={14} {...rowProps(s.receipts.balance, `Balance for ${s.po.receivedQty} motors`)} />
        <ReceiptRow u={k} delay={28} {...rowProps(s.receipts.returned, `Held part back to ${s.buyer.short}`)} />
        <div style={{ marginTop: 6, ...enter(t, 44) }}>
          <Micro u={k}>Test USDC on testnet, at {s.testnet.scaleLabel} of the story amounts</Micro>
          <div style={{ fontSize: 26, color: color.muted, lineHeight: 1.4, marginTop: 10 }}>
            Shipment signals simulated. {DOCK_SIGNING.recorded}. {DOCK_SIGNING.capability}. {OWNER_KEY_NOTE}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
};

export const PartialShipment: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={D.hook}>
        <PartialHook />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Single escrow" durationInFrames={D.binary}>
        <BinaryScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Milestone PO" durationInFrames={D.milestones}>
        <MilestoneScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Dock recompute" durationInFrames={D.dock}>
        <DockRecomputeScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Comparison" durationInFrames={D.comparison}>
        <ComparisonScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Receipts" durationInFrames={D.receipts}>
        <ReceiptsScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Payoff" durationInFrames={D.payoff}>
        <EndCard story={s} line={PAYOFF_LINE} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
