import React, { useMemo } from "react";
import { formatUsd } from "../amounts";
import { Settled } from "../components/ui";
import { buildStory } from "../data";
import { HookScene, PayoutScene } from "../scenes/scenes";
import type { StoryProps } from "./JudgeCut";

/** Square promo: the hook and the settlement in one frame. */
export const PromoSquare: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <PayoutScene story={s} headline={`We ordered ${s.po.orderedQty}. ${s.po.receivedQty} arrived. We paid for ${s.po.receivedQty}.`} caption="The payment rules settled it, not the agent." />
    </Settled>
  );
};

export const JudgeCutThumb: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <HookScene story={s} sub={`${formatUsd(s.settlement.returnedCents)} went back to the buyer. Every payment has a testnet hash.`} />
    </Settled>
  );
};

export const ShortShipmentThumb: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <HookScene story={s} sub={`We paid for ${s.po.receivedQty}. ${formatUsd(s.settlement.returnedCents)} came back.`} />
    </Settled>
  );
};

export const ApprovalGateThumb: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <HookScene story={s} line={`We gave an AI a ${formatUsd(s.settlement.orderTotalCents)} purchasing decision.`} sub="Here's what it couldn't do." />
    </Settled>
  );
};

export const PartialShipmentThumb: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <HookScene
        story={s}
        line={`${s.po.receivedQty} of ${s.po.orderedQty} arrived. A single release pays ${formatUsd(s.comparison.binaryReleaseAllCents)}.`}
        sub={`A milestone PO pays ${formatUsd(s.comparison.milestonePaidCents)} and returns ${formatUsd(s.settlement.returnedCents)}.`}
      />
    </Settled>
  );
};

export const JudgeDemoThumb: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  return (
    <Settled>
      <HookScene
        story={s}
        line="AI can handle procurement. It doesn't get to invent the payment rules."
        sub={`One PO, eight acts. ${s.testnet.advance} + ${s.testnet.balance} + ${s.testnet.returned} = ${s.testnet.total} test USDC, read from chain.`}
      />
    </Settled>
  );
};
