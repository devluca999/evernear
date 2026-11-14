import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { formatUsd } from "../amounts";
import { buildStory } from "../data";
import {
  ApprovalScene,
  DockScene,
  EndCard,
  GrantRefusalScene,
  HookScene,
  MilestonesScene,
  POScene,
  ReceiptScene,
  TrustScene,
  WalletScene,
} from "../scenes/scenes";

export type StoryProps = {
  /** null = use seed/astro.ts. Set a number to re-run every amount with a different dock count. */
  readonly receivedQty: number | null;
};

const T = 15; // transition overlap in frames

export const JudgeCut: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  const pct = s.policy.advancePercent;
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={150}>
        <HookScene story={s} sub={`An AI agent placed the ${formatUsd(s.settlement.orderTotalCents)} order. Here is what happened to the money.`} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Purchase order" durationInFrames={240}>
        <POScene story={s} caption={`Over ${formatUsd(s.policy.autoApproveUnderCents)}, so the agent cannot commit it alone.`} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Approval gate" durationInFrames={300}>
        <ApprovalScene story={s} splitAt={150} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Wallet committed" durationInFrames={240}>
        <WalletScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Milestones" durationInFrames={210}>
        <MilestonesScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Advance receipt" durationInFrames={225}>
        <ReceiptScene
          story={s}
          receipt={s.receipts.advance}
          eyebrow={`Advance · ${pct}% of the order`}
          headline={`${formatUsd(s.settlement.advanceCents)} advance, released by the gate in an OutLayer TEE.`}
          caption="Sent from the enclave. Evernear's server holds no grant on this wallet."
        />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Dock count" durationInFrames={240}>
        <DockScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Balance receipt" durationInFrames={225}>
        <ReceiptScene
          story={s}
          receipt={s.receipts.balance}
          eyebrow="Balance · only what arrived"
          headline={`${formatUsd(s.settlement.balanceCents)} balance for ${s.po.receivedQty} ${s.po.part.toLowerCase()}s.`}
          caption={`${s.po.receivedQty} x ${formatUsd(s.po.unitCents)} - ${formatUsd(s.settlement.advanceCents)} already paid.`}
        />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Returned receipt" durationInFrames={225}>
        <ReceiptScene
          story={s}
          receipt={s.receipts.returned}
          eyebrow={`The ${s.settlement.missingQty} missing units`}
          headline={`${formatUsd(s.settlement.returnedCents)} goes back to ${s.buyer.short}.`}
          caption={`Before the held part moved, the wallet policy was narrowed to pay only ${s.buyer.short}.`}
        />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Refusal" durationInFrames={270}>
        <GrantRefusalScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Trust boundary" durationInFrames={330}>
        <TrustScene story={s} splitAt={150} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="End card" durationInFrames={180}>
        <EndCard story={s} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

/** Sum of sequence durations minus transition overlaps. */
export const JUDGE_CUT_FRAMES = 150 + 240 + 300 + 240 + 210 + 225 + 240 + 225 + 225 + 270 + 330 + 180 - 11 * T;
