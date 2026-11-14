import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { formatUsd } from "../amounts";
import { buildStory } from "../data";
import { ApprovalScene, DockScene, EndCard, HookScene, MilestonesScene, PayoutScene, POScene, WalletScene } from "../scenes/scenes";
import type { StoryProps } from "./JudgeCut";

const T = 12;

export const ShortShipment: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={120}>
        <HookScene story={s} sub="What should we pay for?" />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Purchase order" durationInFrames={150}>
        <POScene story={s} withAgent={false} caption="Our AI agent drafted the order." />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Approvals" durationInFrames={180}>
        <ApprovalScene story={s} splitAt={75} caption="Two people sign the exact terms. One is not enough." />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Wallet" durationInFrames={150}>
        <WalletScene story={s} withReceipt={false} caption="Recorded Nov 6, before the approval check. Rules: provider-enforced; the owner key can change them." />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Advance" durationInFrames={150}>
        <MilestonesScene story={s} caption={`Shipped: ${formatUsd(s.settlement.advanceCents)} advance released. Signals simulated.`} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Dock" durationInFrames={150}>
        <DockScene story={s} caption={`The dock counted ${s.po.receivedQty}. Signals simulated.`} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Payout" durationInFrames={180}>
        <PayoutScene story={s} caption={`Recorded testnet run: ${s.receipts.returned.amountTestUsdc} test USDC returned, verified on chain.`} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Payoff" durationInFrames={180}>
        <EndCard story={s} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

export const SHORT_SHIPMENT_FRAMES = 120 + 150 + 180 + 150 + 150 + 150 + 180 + 180 - 7 * T;
