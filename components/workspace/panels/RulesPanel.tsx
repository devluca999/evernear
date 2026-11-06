// Rules: Astro's spending policy as bars. Each bar shows the rule's line and, once there is an
// order, where PO 1042 sits against it. Approval slots fill as people sign. The thresholds can be
// changed (rules.tsx); the replay then runs on the new ones.
import type { ReactNode } from "react";
import type { WorkspaceState } from "@/scenario/types";
import { PO, astro, policy as seedPolicy, suppliers } from "@/seed/astro";
import { formatUsd, formatUsdShort } from "@/engine/money";
import { RulesEditor } from "../rules";
import { pct } from "../format";
import { Badge, Dot, N, Panel, Stamp } from "../Panel";
import s from "../shell.module.css";

const haoyun = suppliers.find((x) => x.id === "haoyun")!;
const ROLE: Record<string, string> = { [astro.buyer]: "Head of supply", [astro.secondApprover]: "Finance lead" };
const usdK = (c: number) => (c % 100_000 === 0 ? `$${c / 100_000}K` : formatUsdShort(c));
const pctOf = (v: number, max: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

type Tone = "attention" | "success" | "alert";

function Bar({ label, read, readTone, big, max, rule, oldRule, value, tone, ghost, ends, marks }: {
  label: ReactNode; read?: ReactNode; readTone?: Tone | "muted"; big?: boolean; max: number; rule: number; oldRule?: number;
  value?: number; tone?: Tone; ghost?: number; ends: [ReactNode, ReactNode, ReactNode?]; marks?: { at: number; text: ReactNode; tone?: Tone | "muted" }[];
}) {
  const ink = (t?: Tone | "muted") => (t === "attention" ? s.attnInk : t === "alert" ? s.alertInk : t === "success" ? s.hi : t === "muted" ? s.muted : undefined);
  return (
    <div className={s.bar}>
      <div className={s.barHead}>
        <span>{label}</span>
        {read !== undefined && (big ? <N className={`${s.barBig} ${ink(readTone) ?? s.hi}`}>{read}</N> : <span className={`${s.barRead} ${ink(readTone) ?? ""}`}>{read}</span>)}
      </div>
      <div className={s.track}>
        {value !== undefined && tone && <span className={s.fill} data-tone={tone} style={{ width: pctOf(value, max) }} />}
        {oldRule !== undefined && <span className={s.rule} data-old="true" style={{ left: pctOf(oldRule, max) }} />}
        <span className={s.rule} style={{ left: pctOf(rule, max) }} />
        {ghost !== undefined && <span className={s.ghost} style={{ left: pctOf(ghost, max) }} />}
        {value !== undefined && tone && <span className={s.knob} data-tone={tone} style={{ left: pctOf(value, max) }} />}
      </div>
      <div className={`es-num ${s.scale}`}>
        <span style={{ left: 0 }}>{ends[0]}</span>
        {(marks ?? []).map((m, i) => <span key={i} className={`${s.mid} ${ink(m.tone) ?? ""}`} style={{ left: pctOf(m.at, max) }}>{m.text}</span>)}
        {ends[2] !== undefined && <span className={s.mid} style={{ left: pctOf(rule, max) }}>{ends[2]}</span>}
        <span className={`${s.end} ${value !== undefined && value >= max ? s.hi : ""}`}>{ends[1]}</span>
      </div>
    </div>
  );
}

function Slot({ n, name, signed, waiting }: { n: number; name: string; signed?: string; waiting?: boolean }) {
  return (
    <div className={s.slotCard} data-tone={signed ? undefined : waiting ? "attention" : "idle"}>
      <div className={s.headRow}><Dot tone={signed ? "success" : waiting ? "attention" : undefined} /><span className="es-micro">Slot {n}</span></div>
      <div className={s.field} style={{ gap: 2 }}><span className={s.slotName}>{name}</span><span className={s.note} style={{ fontSize: 12 }}>{ROLE[name]}</span></div>
      {signed ? <Stamp word="Signed" time={signed} /> : waiting ? <span className={s.attnInk} style={{ fontSize: 12 }}>{name === astro.secondApprover ? "Signing on phone" : "Waiting to sign"}</span> : null}
    </div>
  );
}

export function RulesPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  const policy = st.policy;
  const last = st.price.history.at(-1);
  const order = last ? (last.pass ? last.unitCents : PO.originalUnitCents) * PO.quantity : PO.revisedTotalCents;
  const limitChanged = st.policy.priceChangeLimitBps !== seedPolicy.priceChangeLimitBps && st.limitApprovals.length > 0;
  // The limit change is the subject only until the PO goes for approval.
  const changing = (st.limitApprovals.length > 0 || limitChanged) && st.stage === "sourcing";
  const onHold = !changing && !st.escrow && !!last && !last.pass && (st.scene >= 5 || !!st.halted);
  // Chapter 6: the agreed price goes for two signatures, then the commit.
  const approvalPhase = st.stage === "approval" || (st.stage === "confirmed" && !st.escrow);
  const capMax = Math.max(4_000_000, order);
  const signed = (name: string) => st.approvals.find((a) => a.by === name)?.time;
  const meta = (extra?: string) => <>PO <N>{PO.number}</N>{extra ? ` · ${extra}` : ""}</>;

  // The adjustment: a higher limit for this PO, signed by two people.
  if (changing) {
    const quote = st.price.history.find((h) => h.unitCents > PO.originalUnitCents && h.bps > seedPolicy.priceChangeLimitBps);
    const qBps = quote ? Math.round(((quote.unitCents - PO.originalUnitCents) / PO.originalUnitCents) * 10_000) : 800;
    const newTotal = (quote?.unitCents ?? PO.confirmedUnitCents) * PO.quantity;
    const limitSigned = (name: string) => st.limitApprovals.find((a) => a.by === name)?.time;
    return (
      <Panel id="rules" title="Rules" pulse={pulse} meta={meta("limit change")}>
        <div className={s.pad} style={{ padding: 20, gap: 20 }}>
          <div className={s.field} style={{ gap: 6 }}>
            <p className={s.big} style={{ fontSize: 20 }}>{limitChanged ? <>Price limit raised to <N>{pct(policy.priceChangeLimitBps)}</N></> : <>Raising the price limit to <N>8%</N></>}</p>
            <span className={s.sub} style={{ fontSize: 13 }}>For PO <N>{PO.number}</N> only. Other orders keep the <N>{pct(seedPolicy.priceChangeLimitBps)}</N> limit.</span>
          </div>
          <Bar label={<>Price change up to <N>{pct(limitChanged ? policy.priceChangeLimitBps : 800)}</N></>} read={`+${(qBps / 100).toFixed(2)}%`} big max={1000}
            rule={limitChanged ? policy.priceChangeLimitBps : 800} oldRule={seedPolicy.priceChangeLimitBps} value={qBps} tone={limitChanged ? "success" : "attention"}
            ends={["0%", "10%"]} marks={[{ at: seedPolicy.priceChangeLimitBps, text: `Was ${pct(seedPolicy.priceChangeLimitBps)}` }, { at: limitChanged ? policy.priceChangeLimitBps : 800, text: "New limit 8%", tone: "muted" }]} />
          <Bar label={<>Auto approve under <N>{usdK(policy.autoApproveUnderCents)}</N></>} read={st.approvals.length >= st.requiredApprovals ? `Signed by ${st.approvals.length}` : "Needs approvers"} readTone="muted"
            max={Math.max(4_000_000, newTotal)} rule={policy.autoApproveUnderCents} value={newTotal} tone="success" ends={["$0", formatUsdShort(newTotal), usdK(policy.autoApproveUnderCents)]} />
          <div className={s.lines} style={{ gap: 10 }}>
            <span className="es-micro">Approval slots for the change</span>
            <div className={s.slots}>
              <Slot n={1} name={astro.buyer} signed={limitSigned(astro.buyer)} waiting={!limitSigned(astro.buyer)} />
              <Slot n={2} name={astro.secondApprover} signed={limitSigned(astro.secondApprover)} waiting={!!limitSigned(astro.buyer) && !limitSigned(astro.secondApprover)} />
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  // The bad path: Haoyun holds over the limit and nothing is committed.
  if (onHold && last) {
    return (
      <Panel id="rules" title="Rules" pulse={pulse} meta={meta()}>
        <div className={s.pad} style={{ padding: 18, gap: 18 }}>
          <div className={s.field} style={{ gap: 8 }}>
            <div className={s.headRow} style={{ gap: 10 }}>
              <p className={s.big} style={{ fontSize: 20 }}>Haoyun holds at <N>+{pct(last.bps)}</N></p>
              <span className={s.push}><Badge tone="alert">Over limit</Badge></span>
            </div>
            <span className={s.sub} style={{ fontSize: 13 }}>Quoted <N>{formatUsd(last.unitCents)}</N> a unit against a PO price of <N>{formatUsd(PO.originalUnitCents)}</N>.</span>
          </div>
          <Bar label={<>Price change up to <N>{pct(policy.priceChangeLimitBps)}</N></>} read={`+${pct(last.bps)}`} readTone="alert" big max={1000}
            rule={policy.priceChangeLimitBps} value={last.bps} tone="alert" ends={["0%", "10%"]}
            marks={[{ at: policy.priceChangeLimitBps, text: `Limit ${pct(policy.priceChangeLimitBps)}`, tone: "muted" }, { at: last.bps, text: `Held at ${pct(last.bps)}`, tone: "alert" }]} />
          <p className={s.sub} style={{ fontSize: 13 }}>Stockbot will not commit above your limit. Raise it with two approvals or end the order.</p>
          <div className={s.lines} style={{ paddingTop: 12, borderTop: "1px solid var(--line-hairline)", color: "var(--text-muted)" }}>
            <span className={s.line}><Dot tone="success" />Auto approve: signed by {st.approvals.map((a) => a.by).join(" and ")}</span>
            <span className={s.line}><Dot tone="success" />New supplier: approved</span>
            <span className={s.line}><Dot tone="alert" />Price change: refused at <N>{pct(last.bps)}</N></span>
          </div>
        </div>
      </Panel>
    );
  }

  // Approval: the order against each rule, and the two signatures.
  if (approvalPhase) {
    const approved = st.approvals.length >= st.requiredApprovals;
    const overCap = order >= policy.autoApproveUnderCents;
    return (
      <Panel id="rules" title="Rules" pulse={pulse} meta={meta()}>
        <div className={s.pad} style={{ padding: 20, gap: 20 }}>
          <div className={s.field} style={{ gap: 8 }}>
            <span className="es-micro">Order</span>
            <div className={s.headRow} style={{ gap: 12 }}>
              <N><span style={{ fontSize: 44, fontWeight: 500, lineHeight: 1 }}>{formatUsdShort(order)}</span></N>
              {approved ? <Badge tone="success">Approved</Badge> : <Badge tone="attention">Needs {st.requiredApprovals} approvers</Badge>}
            </div>
            <span className={s.sub} style={{ fontSize: 13 }}>Haoyun Precision, {haoyun.city} · new overseas supplier</span>
          </div>
          <Bar label={<>Auto approve under <N>{usdK(policy.autoApproveUnderCents)}</N></>} read={overCap ? "Past the line" : "Under the line"} readTone={overCap && !approved ? "attention" : "muted"}
            max={capMax} rule={policy.autoApproveUnderCents} value={order} tone={approved ? "success" : "attention"} ends={["$0", formatUsdShort(capMax === order ? order : capMax), usdK(policy.autoApproveUnderCents)]} />
          <Bar label={<>New supplier needs <N>{policy.approversRequired}</N> approvers</>} read={approved ? "Signed" : "Past the line"} readTone={approved ? "muted" : "attention"}
            max={100} rule={60} value={98} tone={approved ? "success" : "attention"} ends={["Established", "First order"]} />
          {last?.pass
            ? <Bar label={<>Price change up to <N>{pct(policy.priceChangeLimitBps)}</N></>} read={`Agreed +${pct(last.bps)}`} readTone="muted" max={1000} rule={policy.priceChangeLimitBps} value={last.bps} tone="success" ends={["0%", "10%", pct(policy.priceChangeLimitBps)]} />
            : <Bar label={<>Price change up to <N>{pct(policy.priceChangeLimitBps)}</N></>} read="Waiting on confirmation" max={1000} rule={policy.priceChangeLimitBps} ends={["0%", "10%", pct(policy.priceChangeLimitBps)]} />}
          <div className={s.lines} style={{ gap: 10 }} data-focus="rules.approvals">
            <span className="es-micro">Approval slots</span>
            <div className={s.slots}>
              <Slot n={1} name={astro.buyer} signed={signed(astro.buyer)} waiting={!signed(astro.buyer)} />
              <Slot n={2} name={astro.secondApprover} signed={signed(astro.secondApprover)} waiting={!!signed(astro.buyer) && !signed(astro.secondApprover)} />
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  // Negotiation onward: the price change against the limit, the approvals done.
  if (last) {
    const quoted = st.price.history.reduce((m, h) => Math.max(m, h.bps), 0);
    return (
      <Panel id="rules" title="Rules" pulse={pulse} meta={st.escrow ? meta() : null}>
        <div className={s.pad} style={{ padding: "16px 20px", gap: 14 }}>
          <Bar label={<>Price change up to <N>{pct(policy.priceChangeLimitBps)}</N></>} read={`+${pct(last.bps)}`} readTone={last.pass ? undefined : "attention"} big max={1000}
            rule={policy.priceChangeLimitBps} value={last.bps} tone={last.pass ? "success" : "attention"} ghost={quoted > last.bps ? quoted : undefined} ends={["0%", "10%"]}
            marks={[{ at: policy.priceChangeLimitBps, text: `Limit ${pct(policy.priceChangeLimitBps)}`, tone: "muted" }, ...(quoted > last.bps ? [{ at: quoted, text: `Quoted ${pct(quoted)}` }] : [])]} />
          <div className={s.headRow} style={{ gap: 18, paddingTop: 12, borderTop: "1px solid var(--line-hairline)", fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            {st.approvals.length === 0 ? (
              <span className={s.line} style={{ fontSize: 12 }}><Dot />Two approvals follow once the price is agreed</span>
            ) : (
              <>
                <span className={s.line} style={{ fontSize: 12 }}><Dot tone={st.approvals.length >= st.requiredApprovals ? "success" : "attention"} />Auto approve: signed by {st.approvals.length}</span>
                <span className={s.line} style={{ fontSize: 12 }}><Dot tone="success" />New supplier: {st.approvals.map((a) => a.by).join(", ")}</span>
              </>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  // Before any order: the policy itself, and who approves.
  return (
    <Panel id="rules" title="Rules" pulse={pulse} meta="Spending policy">
      <div className={s.pad} style={{ padding: 18, gap: 20 }}>
        <Bar label={<>Auto approve under <N>{usdK(policy.autoApproveUnderCents)}</N></>} read="No orders yet" max={4_000_000} rule={policy.autoApproveUnderCents} ends={["$0", "$40K", usdK(policy.autoApproveUnderCents)]} />
        <Bar label={<>New supplier needs <N>{policy.approversRequired}</N> approvers</>} read="No orders yet" max={100} rule={60} ends={["Established", "New"]} />
        <Bar label={<>Price change up to <N>{pct(policy.priceChangeLimitBps)}</N></>} read="No orders yet" max={1000} rule={policy.priceChangeLimitBps} ends={["0%", "10%", pct(policy.priceChangeLimitBps)]} />
        <div className={s.slots}>
          {[astro.buyer, astro.secondApprover].map((name, i) => (
            <div key={name} className={s.slotCard} data-tone="idle" style={{ gap: 5 }}>
              <span className="es-micro">Approver {i + 1}</span>
              <span className={s.slotName} style={{ fontSize: 14 }}>{name}</span>
              <span className={s.note} style={{ fontSize: 12 }}>{ROLE[name]}</span>
            </div>
          ))}
        </div>
        <RulesEditor />
      </div>
    </Panel>
  );
}
