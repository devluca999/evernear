import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { formatUsd } from "../amounts";
import { ApprovalGate } from "../components/ApprovalGate";
import { AutonomyTable } from "../components/AutonomyTable";
import { BinaryVsMilestone } from "../components/BinaryVsMilestone";
import { CommandCard } from "../components/CommandCard";
import { FactList } from "../components/FactList";
import { SecurityRefusal } from "../components/SecurityRefusal";
import { TrustBoundary } from "../components/TrustBoundary";
import { Card, Micro, Mono } from "../components/ui";
import { useT } from "../components/useT";
import {
  ATTACK,
  AUTONOMY,
  AUTONOMY_RULE,
  buildStory,
  COMMIT_RECORDED_NOTE,
  DOCK_SIGNING,
  APPROVAL_RUN_NOTE,
  GATE_SCOPE,
  RELEASE_GRANT_NOTE,
  PROOFS_DOC,
  RECORDED_RUN_LABEL,
  STILL_SIMULATED_DOC,
  TRUSTED_PARTIES,
  TWO_SIGNATURES_SEEN,
  WALLET_RULES_NOTE,
  VERIFY,
  type Story,
} from "../data";
import { SceneFrame, useLayout } from "../scenes/SceneFrame";
import { approvalTerms, recordedTestnet, DockScene, EndCard, GrantRefusalScene, HookScene, hookLine, MilestonesScene, POScene, ReceiptScene, WalletScene } from "../scenes/scenes";
import { color, enter } from "../theme";
import { JUDGE_DEMO_SCENES as D, JUDGE_DEMO_T as T } from "../timing";
import type { StoryProps } from "./JudgeCut";
import { PAYOFF_LINE } from "./PartialShipment";

type S = { readonly story: Story };

const fmtUtc = (iso: string) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][new Date(iso).getUTCMonth()]} ${new Date(iso).getUTCDate()}`;

export const act = (n: number, name: string) => `Act ${n} of 8 · ${name}`;

const grid = (u: number, cols = "1fr 1fr"): React.CSSProperties => ({ display: "grid", gridTemplateColumns: cols, gap: 36 * u, alignItems: "start" });

// ---- Act 1 -------------------------------------------------------------------------------------

const ProblemScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  return (
    <SceneFrame
      eyebrow={act(1, "The problem")}
      headline="One release or one refund can't pay for part of an order."
      caption={`Milestones: ${s.policy.advancePercent}% advance on shipment, the balance on what the dock counted, the rest goes back. ${WALLET_RULES_NOTE}.`}
    >
      <BinaryVsMilestone u={u} s={s.settlement} c={s.comparison} />
    </SceneFrame>
  );
};

// ---- Act 2 -------------------------------------------------------------------------------------

const AutonomyScene: React.FC = () => {
  const { u } = useLayout();
  const rows = AUTONOMY.filter((r) => !r.step.startsWith("Requirement intake"));
  return (
    <SceneFrame eyebrow={act(2, "Agent autonomy")} headline="What runs each step of the agent's work.">
      <AutonomyTable u={u * 1.08} rows={rows} footer={AUTONOMY_RULE} title="From docs/hackathon/READINESS.md · Agent autonomy" />
    </SceneFrame>
  );
};

// ---- Act 3 -------------------------------------------------------------------------------------

const RealRefusalScene: React.FC<S & { valid: 0 | 1 }> = ({ story: s, valid }) => {
  const { u } = useLayout();
  const r = s.approvalRun;
  const attempt = r.attempts.find((a) => a.valid === valid);
  if (!attempt) throw new Error(`approval-gated-run.json has no attempt with ${valid} approvals`);
  return (
    <SceneFrame
      eyebrow={act(3, "Financial authorization")}
      headline={valid === 0 ? "Commit with no approvals: refused before any call." : `Commit with ${valid} of ${attempt.required} approvals: refused again.`}
      caption={`${APPROVAL_RUN_NOTE}, ${r.date}. Approvals came from ${r.approvers}.`}
    >
      <div style={grid(u, "1.15fr 0.85fr")}>
        <ApprovalGate
          u={u * 0.86}
          required={attempt.required}
          approvers={[
            { name: "Rehearsal approver 1", signed: valid >= 1 },
            { name: "Rehearsal approver 2", signed: false },
          ]}
          terms={approvalTerms(s)}
          state="refused"
          reason={attempt.reason}
          enforcedBy={`${s.refusals.approval.layer}: convex/approvals.ts claimCommit`}
        />
        <FactList
          u={u * 0.86}
          delay={16}
          title="What Tidepool saw"
          tag={{ text: "Real Tidepool testnet key", tone: "done" }}
          facts={[
            { label: "Agent accounts on the key, before", value: String(r.agentsBefore), mono: true },
            { label: "After", value: String(r.agentsAfter), mono: true },
            { label: "Order wallet opened", value: r.walletOpened ? "Yes" : "No", tone: r.walletOpened ? "refused" : "done" },
            { label: "Transaction", value: attempt.hash === "none" ? "None: refused before any call" : attempt.hash, tone: "muted" },
          ]}
          note={`Source: ${r.source}. Not the hosted deployment.`}
        />
      </div>
    </SceneFrame>
  );
};

const TwoSignaturesScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const [first, second] = s.approvers;
  return (
    <SceneFrame eyebrow={act(3, "Financial authorization")} headline={`${s.policy.approversRequired} signatures over the exact terms unlock the commit.`} caption="Change one term and the signatures no longer count.">
      <div style={grid(u, "1.15fr 0.85fr")}>
        <ApprovalGate
          u={u * 0.92}
          required={s.policy.approversRequired}
          approvers={[
            { name: first, signed: true },
            { name: second, signed: true },
          ]}
          terms={approvalTerms(s)}
          state="approved"
          enforcedBy={s.refusals.approval.layer}
          footnote={`Shown from ${s.refusals.approval.test}`}
        />
        <FactList
          u={u * 0.92}
          delay={16}
          title="Where each step was seen"
          facts={[
            { label: "0 and 1 approvals refused", value: `By our backend before any call, run against real testnet, ${s.approvalRun.date}`, tone: "done" },
            { label: "2 approvals, then commit", value: TWO_SIGNATURES_SEEN, tone: "muted" },
            { label: "Commit receipt (next)", value: `${COMMIT_RECORDED_NOTE} No signatures were checked.`, tone: "muted" },
          ]}
        />
      </div>
    </SceneFrame>
  );
};

// ---- Act 6 -------------------------------------------------------------------------------------

const ReconciliationScene: React.FC<S> = ({ story: s }) => {
  const t = useT();
  const { u } = useLayout();
  const r = s.reconciliation;
  const st = s.settlement;
  const term = (v: string, label: string, c: string, i: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * u, ...enter(t, 8 + i * 12) }}>
      <Mono size={88 * u} weight={500} c={c}>
        {v}
      </Mono>
      <Micro u={u}>{label}</Micro>
    </div>
  );
  const op = (x: string, i: number) => (
    <Mono size={72 * u} c={color.faint} style={{ ...enter(t, 8 + i * 12), paddingBottom: 40 * u }}>
      {x}
    </Mono>
  );
  return (
    <SceneFrame eyebrow={act(6, "Reconciliation")} headline="Read from chain, it adds up to the cent." caption={recordedTestnet(s) ? `In dollars: ${formatUsd(st.advanceCents)} + ${formatUsd(st.balanceCents)} + ${formatUsd(st.returnedCents)} = ${formatUsd(st.orderTotalCents)}.` : `Recorded run (${s.reconciliation.sumOut}); the amounts computed for ${st.receivedQty} received differ.`}>
      <Card u={u} tone={r.reconciles ? "done" : "refused"} style={{ padding: 48 * u }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 34 * u }}>
          {term(r.advance, "Advance", color.accent, 0)}
          {op("+", 1)}
          {term(r.balance, "Balance", color.accent, 1)}
          {op("+", 2)}
          {term(r.returned, "Returned", color.muted, 2)}
          {op("=", 3)}
          {term(r.sumOut, `Committed ${r.commit}`, color.text, 3)}
        </div>
        <div style={{ marginTop: 34 * u, paddingTop: 20 * u, borderTop: `1px solid ${color.hairline}`, fontSize: 22 * u, color: color.muted, lineHeight: 1.45, ...enter(t, 60) }}>
          Test USDC at {s.testnet.scaleLabel}. Commit and return read from NEAR testnet Intents events; advance and balance from Base Sepolia ERC-20 Transfer logs ({PROOFS_DOC}). The
          wallet's final balance of 0 is Tidepool's report, not read from chain.
        </div>
      </Card>
    </SceneFrame>
  );
};

// ---- Act 7 -------------------------------------------------------------------------------------

const DestinationRefusalScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const d = s.refusals.destination;
  return (
    <SceneFrame
      eyebrow={act(7, "Adversarial")}
      headline="A valid grant still can't pay an address off the list."
      caption="A different account, a different day and a different layer from the grant refusal."
      contentWidth={1600}
    >
      <SecurityRefusal
        u={u * 0.88}
        wide
        title="Withdraw off the allowlist"
        attempt={d.attempt}
        layer={`Destination policy (Tidepool account policy), with a valid grant`}
        code={d.code}
        httpStatus={d.httpStatus}
        where={d.where}
        proofNote={`${d.proofNote} The same grant then paid ${s.supplier.name} ${d.paidAfterAmount} test USDC on Base Sepolia: ${d.paidAfterTx}`}
      />
    </SceneFrame>
  );
};

const GateV2Scene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const g = s.gateV2;
  return (
    <SceneFrame eyebrow={act(7, "Adversarial")} headline="Release gate v2 refused a frozen wallet, on chain." caption={GATE_SCOPE}>
      <div style={grid(u, "1fr 1fr")}>
        <SecurityRefusal
          u={u * 0.8}
          title={`Release for the frozen PO ${g.po} wallet`}
          attempt={`Release the ${g.stage} for PO ${g.po} after the ${RECORDED_RUN_LABEL} order was settled, closed and frozen`}
          layer="Release gate v2 in OutLayer's TEE: reads the wallet's policy from Tidepool inside the enclave"
          code={g.reason}
          httpStatus={null}
          where={`${g.network}, ${g.date}`}
          proofNote="Signed refusal; nothing was sent."
        />
        <FactList
          u={u * 0.8}
          delay={16}
          title="Check it yourself"
          tag={{ text: g.signatureValid ? "Signature valid" : "Signature not checked", tone: g.signatureValid ? "done" : "neutral" }}
          facts={[
            { label: "Transaction", value: g.tx, mono: true },
            { label: "Explorer", value: g.explorerUrl, mono: true, tone: "muted" },
            { label: "Signed by / contract", value: `${g.signer} → ${g.contract}`, mono: true, tone: "muted" },
            { label: "Gate answer", value: `ok: ${String(g.ok)}, reason: ${g.reason}`, mono: true, tone: "refused" },
            { label: `Also: deployed gate v4 refused a balance off the approved terms, ${s.gateV4.reason}`, value: s.gateV4.tx, mono: true, tone: "muted" },
          ]}
          note={`Source: ${g.source}. Verify: read the tx's SuccessValue on NEAR testnet RPC and check the ed25519 signature.`}
        />
      </div>
    </SceneFrame>
  );
};

// ---- Act 8 -------------------------------------------------------------------------------------

const VerifyScene: React.FC<S> = ({ story: s }) => {
  const { u } = useLayout();
  const r = s.reconciliation;
  const links = [
    { label: "Commit", value: s.receipts.commit.explorerUrl },
    { label: "Advance", value: s.receipts.advance.explorerUrl },
    { label: "Balance", value: s.receipts.balance.explorerUrl },
    { label: "Returned", value: s.receipts.returned.explorerUrl },
    { label: "Gate v2 refusal", value: s.gateV2.explorerUrl },
    { label: "Gate v4 refusal", value: s.gateV4.explorerUrl },
  ].filter((x): x is { label: string; value: string } => typeof x.value === "string");
  return (
    <SceneFrame eyebrow={act(8, "Independent verification")} headline="Don't trust the video. Check it.">
      <div style={grid(u, "0.9fr 1.1fr")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 * u }}>
          <CommandCard u={u * 0.85} command={VERIFY.command} does={VERIFY.does} result={`payment-proofs.json, checked ${fmtUtc(s.run.checkedAt)}: ${r.advance} + ${r.balance} + ${r.returned} = ${r.sumOut}, reconciles: ${String(r.reconciles)}`} />
          <CommandCard
            u={u * 0.85}
            delay={14}
            command={ATTACK.command}
            does="Runs the commit-authorization, release enforcement-matrix and approval tests: each attack must be refused at the layer the matrix names."
            result={`${ATTACK.cases} tests, all passing`}
          />
        </div>
        <FactList u={u * 0.78} delay={24} title="Explorer links" facts={links.map((l) => ({ ...l, mono: true, tone: "muted" as const }))} />
      </div>
    </SceneFrame>
  );
};

const StillTrustedScene: React.FC = () => {
  const { u } = useLayout();
  const simulated = STILL_SIMULATED_DOC.replace(/\.$/, "")
    .split("; ")
    .map((x) => x[0].toUpperCase() + x.slice(1));
  return (
    <SceneFrame eyebrow={act(8, "What is still simulated or trusted")} headline="What this demo does not prove." caption={DOCK_SIGNING.gap + "."}>
      <TrustBoundary
        u={u * 0.9}
        title="Still trusted (TRUST-MODEL.md)"
        simulatedTitle="Still simulated (READINESS.md)"
        boundaries={TRUSTED_PARTIES.map((p, i) => ({ id: String(i + 1), name: p.who, by: p.could, kind: p.who === "Evidence sources" ? "simulated" : "trusted" }))}
        stillSimulated={simulated}
      />
    </SceneFrame>
  );
};

// ---- the cut -----------------------------------------------------------------------------------

export const JudgeDemo: React.FC<StoryProps> = ({ receivedQty }) => {
  const s = useMemo(() => buildStory({ receivedQty }), [receivedQty]);
  const pct = s.policy.advancePercent;
  const items: React.ReactNode[] = [];
  let n = 0;
  const seq = (name: string, frames: number, node: React.ReactNode, last = false) => {
    items.push(
      <TransitionSeries.Sequence key={name} name={name} durationInFrames={frames}>
        {node}
      </TransitionSeries.Sequence>,
    );
    if (!last) items.push(<TransitionSeries.Transition key={`t${n++}`} presentation={fade()} timing={linearTiming({ durationInFrames: T })} />);
    return null;
  };
  return (
    <>
      {seq("1 Hook", D.hook, <HookScene story={s} line={hookLine(s)} sub={`An AI agent placed the ${formatUsd(s.settlement.orderTotalCents)} order. Who decides what gets paid?`} />)}
      {seq("1 Problem", D.problem, <ProblemScene story={s} />)}
      {seq("2 PO", D.po, <POScene story={s} eyebrow={act(2, "Agent autonomy")} caption={`Over ${formatUsd(s.policy.autoApproveUnderCents)}, so the agent cannot commit it alone.`} />)}
      {seq("2 Autonomy", D.autonomy, <AutonomyScene />)}
      {seq("3 Zero approvals", D.zeroApprovals, <RealRefusalScene story={s} valid={0} />)}
      {seq("3 One approval", D.oneApproval, <RealRefusalScene story={s} valid={1} />)}
      {seq("3 Two signatures", D.twoSignatures, <TwoSignaturesScene story={s} />)}
      {seq("3 Commit", D.commit, <WalletScene story={s} eyebrow={act(3, "Financial authorization")} caption="Recorded Nov 6, before the approval check: no signatures were checked." />)}
      {seq("4 Milestones", D.milestones, <MilestonesScene story={s} eyebrow={act(4, "Advance")} />)}
      {seq(
        "4 Advance",
        D.advance,
        <ReceiptScene
          story={s}
          receipt={s.receipts.advance}
          eyebrow={act(4, `Advance, ${pct}% of the order`)}
          headline={`${formatUsd(s.settlement.advanceCents)} advance, released by gate v1 in an OutLayer TEE.`}
          caption={RELEASE_GRANT_NOTE}
        />,
      )}
      {seq(
        "5 Dock",
        D.dock,
        <DockScene
          story={s}
          eyebrow={act(5, `${s.po.receivedQty} of ${s.po.orderedQty} arrive`)}
          caption={`Balance = ${s.po.receivedQty} x ${formatUsd(s.po.unitCents)} - ${formatUsd(s.settlement.advanceCents)} = ${formatUsd(s.settlement.balanceCents)}. ${DOCK_SIGNING.recorded}.`}
        />,
      )}
      {seq(
        "6 Balance",
        D.balance,
        <ReceiptScene
          story={s}
          receipt={s.receipts.balance}
          eyebrow={act(6, "Balance and return")}
          headline={`${formatUsd(s.settlement.balanceCents)} balance for ${s.po.receivedQty} ${s.po.part.toLowerCase()}s.`}
          caption={`${s.po.receivedQty} x ${formatUsd(s.po.unitCents)} - ${formatUsd(s.settlement.advanceCents)} already paid. ${DOCK_SIGNING.recorded}.`}
        />,
      )}
      {seq(
        "6 Returned",
        D.returned,
        <ReceiptScene
          story={s}
          receipt={s.receipts.returned}
          eyebrow={act(6, "Balance and return")}
          headline={`${formatUsd(s.settlement.returnedCents)} for the ${s.settlement.missingQty} missing units goes back to ${s.buyer.short}.`}
          caption={`Before the held part moved, the wallet policy was narrowed to pay only ${s.buyer.short}.`}
        />,
      )}
      {seq("6 Reconciliation", D.reconciliation, <ReconciliationScene story={s} />)}
      {seq("7 Grant refusal", D.grantRefusal, <GrantRefusalScene story={s} eyebrow={act(7, "Adversarial")} />)}
      {seq("7 Destination refusal", D.destinationRefusal, <DestinationRefusalScene story={s} />)}
      {seq("7 Gate v2", D.gateV2, <GateV2Scene story={s} />)}
      {seq("8 Verify", D.verify, <VerifyScene story={s} />)}
      {seq("8 Still trusted", D.trust, <StillTrustedScene />)}
      {seq("8 End", D.end, <EndCard story={s} line={PAYOFF_LINE} />, true)}
      <TransitionSeries>{items}</TransitionSeries>
    </>
  );
};
