import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { formatUsd } from "../amounts";
import { AgentDecision } from "../components/AgentDecision";
import { ApprovalGate } from "../components/ApprovalGate";
import { buildStory, OWNER_KEY_NOTE, type Story } from "../data";
import { SceneFrame, useLayout } from "../scenes/SceneFrame";
import { agentReasons, approvalTerms, EndCard, GrantRefusalScene, HookScene } from "../scenes/scenes";
import type { StoryProps } from "./JudgeCut";

const T = 12;

export const CouldScene: React.FC<{ story: Story }> = ({ story: s }) => {
  const { u } = useLayout();
  return (
    <SceneFrame eyebrow="What it could do" headline="Find, compare, negotiate and draft." caption={`It picked ${s.supplier.name} and drafted PO ${s.po.number}.`}>
      <AgentDecision u={u * 0.92} title="Agent decision" decision={`${s.po.orderedQty} x ${s.po.part.toLowerCase()} from ${s.supplier.name}`} reasons={agentReasons(s)} />
    </SceneFrame>
  );
};

export const OneSignatureScene: React.FC<{ story: Story }> = ({ story: s }) => {
  const { u } = useLayout();
  const [first, second] = s.approvers;
  return (
    <SceneFrame eyebrow="What it couldn't do · 1" headline={`Commit ${formatUsd(s.settlement.orderTotalCents)} on one signature.`} caption={`${s.policy.approversRequired} people must sign. With only ${first}, the commit is refused.`}>
      <ApprovalGate
        u={u * 0.92}
        required={s.policy.approversRequired}
        approvers={[
          { name: first, signed: true },
          { name: second, signed: false },
        ]}
        terms={approvalTerms(s)}
        state="refused"
        reason={s.refusals.approval.code}
        enforcedBy={s.refusals.approval.layer}
        footnote={`From ${s.refusals.approval.test}. ${s.refusals.approval.liveNote}`}
      />
    </SceneFrame>
  );
};

const ChangedTermsScene: React.FC<{ story: Story }> = ({ story: s }) => {
  const { u } = useLayout();
  const [first, second] = s.approvers;
  return (
    <SceneFrame
      eyebrow="What it couldn't do · 2"
      headline={`Change ${formatUsd(s.po.unitCents)} to ${formatUsd(s.po.firstQuoteUnitCents)} after the signatures.`}
      caption={`${s.refusals.changedTerms.note}. The old signatures cover the old terms only.`}
    >
      <ApprovalGate
        u={u * 0.92}
        required={s.policy.approversRequired}
        approvers={[
          { name: first, signed: false },
          { name: second, signed: false },
        ]}
        terms={approvalTerms(s, s.po.firstQuoteUnitCents)}
        state="refused"
        reason={s.refusals.changedTerms.code}
        enforcedBy={s.refusals.approval.layer}
        footnote={`From ${s.refusals.approval.test}. ${s.refusals.approval.liveNote}`}
      />
    </SceneFrame>
  );
};

export const ApprovalGateVideo: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  const fadeT = <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook" durationInFrames={150}>
        <HookScene story={s} line={`We gave an AI a ${formatUsd(s.settlement.orderTotalCents)} purchasing decision.`} sub="Here's what it couldn't do." />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Could" durationInFrames={150}>
        <CouldScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="One signature" durationInFrames={180}>
        <OneSignatureScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Changed terms" durationInFrames={150}>
        <ChangedTermsScene story={s} />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="Grant refusal" durationInFrames={180}>
        <GrantRefusalScene
          story={s}
          eyebrow="What it couldn't do · 3"
          headline="Pay out from the order wallet."
          caption={`Its withdraw was refused at the grant layer. ${OWNER_KEY_NOTE}`}
        />
      </TransitionSeries.Sequence>
      {fadeT}
      <TransitionSeries.Sequence name="End" durationInFrames={150}>
        <EndCard story={s} line={`The agent did the work. ${s.policy.approversRequired} humans and the payment rules decide the money.`} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

export const APPROVAL_GATE_FRAMES = 150 + 150 + 180 + 150 + 180 + 150 - 5 * T;
