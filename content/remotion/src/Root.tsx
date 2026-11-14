import React from "react";
import { Composition, Folder, Still } from "remotion";
import { ApprovalGateVideo, APPROVAL_GATE_FRAMES } from "./compositions/ApprovalGateVideo";
import { JudgeCut, JUDGE_CUT_FRAMES } from "./compositions/JudgeCut";
import { JudgeDemo } from "./compositions/JudgeDemo";
import { PartialShipment } from "./compositions/PartialShipment";
import { JUDGE_DEMO_FRAMES, PARTIAL_FRAMES } from "./timing";
import { ShortShipment, SHORT_SHIPMENT_FRAMES } from "./compositions/ShortShipment";
import { ApprovalGateThumb, JudgeCutThumb, JudgeDemoThumb, PartialShipmentThumb, PromoSquare, ShortShipmentThumb } from "./compositions/Stills";

// receivedQty: null reads seed/astro.ts (PO.receivedQty). Set a number in Studio or with
// --props='{"receivedQty":40}' and every amount, caption and comparison is recomputed.
// Receipts always show the recorded run from payment-proofs.json, and flag when it differs.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Videos">
        <Composition id="JudgeCut" component={JudgeCut} width={1920} height={1080} fps={30} durationInFrames={JUDGE_CUT_FRAMES} defaultProps={{ receivedQty: null }} />
        <Composition id="ShortShipment" component={ShortShipment} width={1080} height={1920} fps={30} durationInFrames={SHORT_SHIPMENT_FRAMES} defaultProps={{ receivedQty: null }} />
        <Composition id="ApprovalGate" component={ApprovalGateVideo} width={1080} height={1920} fps={30} durationInFrames={APPROVAL_GATE_FRAMES} defaultProps={{ receivedQty: null }} />
        <Composition id="PartialShipment" component={PartialShipment} width={1080} height={1920} fps={30} durationInFrames={PARTIAL_FRAMES} defaultProps={{ receivedQty: null }} />
        <Composition id="JudgeDemo" component={JudgeDemo} width={1920} height={1080} fps={30} durationInFrames={JUDGE_DEMO_FRAMES} defaultProps={{ receivedQty: null }} />
      </Folder>
      <Folder name="Stills">
        <Still id="PromoSquare" component={PromoSquare} width={1080} height={1080} defaultProps={{ receivedQty: null }} />
        <Still id="JudgeCutThumb" component={JudgeCutThumb} width={1920} height={1080} defaultProps={{ receivedQty: null }} />
        <Still id="ShortShipmentThumb" component={ShortShipmentThumb} width={1080} height={1920} defaultProps={{ receivedQty: null }} />
        <Still id="PartialShipmentThumb" component={PartialShipmentThumb} width={1080} height={1920} defaultProps={{ receivedQty: null }} />
        <Still id="JudgeDemoThumb" component={JudgeDemoThumb} width={1920} height={1080} defaultProps={{ receivedQty: null }} />
        <Still id="ApprovalGateThumb" component={ApprovalGateThumb} width={1080} height={1920} defaultProps={{ receivedQty: null }} />
      </Folder>
    </>
  );
};
