import { plainEngine } from "../engine/plain";
import { requiredApprovals, checkPriceChange } from "../engine/policy";
import { closeWallet, createEscrow, releaseStage, reclaimHeld } from "../engine/escrow";
import { cents } from "../engine/money";
import { bom10MA, offers, policy as defaultPolicy, suppliers, PO, routineReorder, demand, NEED_BY } from "../seed/astro";
import type { Policy } from "../engine/types";
import { formatUsdShort } from "../engine/money";
import { advance } from "./stages";
import { timeline, scenes, type Scene } from "./scenes";
import { proofFor } from "./proofs";
import { CHECKPOINTS } from "./shipment";
import type { WorkspaceState, Beat } from "./types";

export const DRAWER_MS = 3000;
export const PULSE_MS = 1200;
const ESCROW_DEADLINE_MS = 30 * 24 * 3600 * 1000;

const haoyun = suppliers.find((s) => s.id === "haoyun")!;
const OWNER = "astro-robotics.testnet";

export function initialState(policy: Policy = defaultPolicy): WorkspaceState {
  const motorsFor = Math.floor(demand.motorsOnHand / demand.motorsPerRobot);
  return {
    t: 0, scene: 0, stage: "low", layout: [], phoneOpen: false, drawer: null, pulse: null, wallet: null,
    routine: { stage: "low", approvals: 0, totalCents: routineReorder.quantity * routineReorder.unitCents },
    demand: { ordered: 0, shippedOut: 0, motorsOnHand: demand.motorsOnHand, series: [demand.motorsOnHand], headline: `${demand.robotsOrdered} robots ordered, motors for ${motorsFor}` },
    messages: [], proofs: [], fitment: [],
    requiredApprovals: requiredApprovals({ totalCents: PO.revisedTotalCents, supplier: haoyun }, policy),
    approvals: [], limitApprovals: [],
    price: { originalCents: PO.originalUnitCents, limitBps: policy.priceChangeLimitBps, history: [] },
    escrow: null, shipment: { progress: 0, docs: [], checkpoints: [] }, dock: null, refused: [], endCard: false,
    policy, halted: null, product: null, highlight: null, search: null, offers: [], explain: null, signals: [], protectedShown: false, pin: null,
  };
}

const pctText = (bps: number) => `${(bps / 100).toFixed(1).replace(/\.0$/, "")}%`;

/** The PO stops here under the viewer's rules: the story freezes and says why. */
const halt = (s: WorkspaceState, b: Beat, reason: string): WorkspaceState => ({ ...s, halted: { atMs: b.atMs, scene: b.scene, reason } });

/** Beats that still play after a halt: the scene frame and the end card, nothing that moves the PO. */
const AFTER_HALT = new Set(["scene", "layout", "phone", "end_card"]);

function apply(s: WorkspaceState, b: Beat): WorkspaceState {
  const ev = b.ev;
  const at = b.atMs;
  const policy = s.policy;
  if (s.halted && !AFTER_HALT.has(ev.type)) return s;
  switch (ev.type) {
    case "scene": return { ...s, scene: ev.id, layout: ev.layout, explain: null };
    case "layout": return { ...s, layout: ev.panels };
    case "phone": return { ...s, phoneOpen: ev.open };
    case "wallet": return { ...s, wallet: { owner: OWNER, agentKeyCapCents: policy.autoApproveUnderCents } };
    case "stage": {
      const last = s.price.history.at(-1);
      const r = advance(s.stage, ev.to, {
        approvals: s.approvals.length, requiredApprovals: s.requiredApprovals,
        priceOk: last ? last.pass : true, dockChecked: s.dock !== null,
      });
      if (ev.to === "approval" && !s.fitment.some((f) => f.pass)) {
        return halt(s, b, `No supplier passes your rules (motor price cap ${formatUsdShort(policy.priceCaps["Actuator motor"] ?? 0)}). Sourcing stops before any order.`);
      }
      if (!r.ok && r.reason === "approvals_missing") return halt(s, b, `Your rules need ${s.requiredApprovals} approvals for PO ${PO.number}; it has ${s.approvals.length}. Nothing is committed.`);
      if (!r.ok && r.reason === "price_over_limit") return halt(s, b, `Haoyun's price change of +${pctText(last!.bps)} is over your ${pctText(policy.priceChangeLimitBps)} limit. The PO stops before any money is committed.`);
      if (!r.ok) throw new Error(`scenario bug: ${s.stage} -> ${ev.to} refused (${r.reason}) at ${at}ms`);
      return { ...s, stage: ev.to };
    }
    case "routine": {
      const r = advance(s.routine.stage, ev.to, { approvals: 0, requiredApprovals: requiredApprovals({ totalCents: s.routine.totalCents, supplier: suppliers[0] }, policy), priceOk: true, dockChecked: true });
      if (!r.ok && r.reason === "approvals_missing") return { ...s, routine: { ...s.routine, held: `Under your rules this ${formatUsdShort(s.routine.totalCents)} reorder needs approval, so it waits for a person.` } };
      if (s.routine.held) return s;
      if (!r.ok) throw new Error(`scenario bug: routine ${s.routine.stage} -> ${ev.to} refused (${r.reason})`);
      return { ...s, routine: { ...s.routine, stage: ev.to } };
    }
    case "message": return {
      ...s, messages: [...s.messages, { ...ev.message, atMs: at }],
      pulse: ev.message.refersTo ?? s.pulse,
    };
    case "proof": {
      const p = { ...proofFor(ev.key, b.scene), ...(ev.label ? { label: ev.label } : {}), atMs: at };
      return { ...s, proofs: [...s.proofs, p], drawer: p };
    }
    case "demand": {
      const motorsOnHand = ev.motorsOnHand;
      return { ...s, demand: { ...s.demand, ordered: ev.ordered, shippedOut: ev.shippedOut, motorsOnHand, series: [...s.demand.series, motorsOnHand] } };
    }
    case "fitment": {
      const sup = suppliers.find((x) => x.id === ev.supplierId)!;
      const res = plainEngine.scoreFitment(bom10MA, offers.filter((o) => o.supplierId === sup.id), sup, policy, NEED_BY);
      return { ...s, fitment: [...s.fitment.filter((f) => f.supplierId !== sup.id), res] };
    }
    case "approval": return ev.scope === "limit"
      ? { ...s, limitApprovals: [...s.limitApprovals, { by: ev.by, atMs: at, time: ev.time }] }
      : { ...s, approvals: [...s.approvals, { by: ev.by, atMs: at, time: ev.time }] };
    case "price_quote": {
      const c = checkPriceChange(PO.originalUnitCents, ev.unitCents, policy.priceChangeLimitBps);
      return { ...s, price: { ...s.price, history: [...s.price.history, { unitCents: ev.unitCents, bps: c.bps, pass: c.pass, from: ev.from }] } };
    }
    case "refused": return { ...s, refused: [...s.refused, { kind: ev.kind, detail: ev.detail, atMs: at }] };
    case "lock_funds": {
      const last = s.price.history.at(-1);
      // The price is settled before anyone signs, so an over-limit price is the reason given first.
      if (last && !last.pass) return halt(s, b, `Haoyun's price change of +${pctText(last.bps)} is over your ${pctText(policy.priceChangeLimitBps)} limit. The PO stops before any money is committed.`);
      if (s.approvals.length < s.requiredApprovals) return halt(s, b, `Your rules need ${s.requiredApprovals} approvals for PO ${PO.number}; it has ${s.approvals.length}. Nothing is committed.`);
      const unit = last?.pass ? last.unitCents : PO.originalUnitCents;
      return { ...s, escrow: createEscrow({ supplier: haoyun.receiveAddress, owner: OWNER, lockedCents: unit * PO.quantity, deadlineMs: ESCROW_DEADLINE_MS }) };
    }
    case "shipment": return { ...s, shipment: { ...s.shipment, progress: ev.progress, docs: ev.docs } };
    case "checkpoint": {
      const c = CHECKPOINTS[ev.id];
      if (!c) throw new Error(`scenario bug: no checkpoint ${ev.id}`);
      return { ...s, shipment: { ...s.shipment, checkpoints: [...s.shipment.checkpoints, c] } };
    }
    case "dock": {
      // The attested count: what arrived times the unit price, minus what was already released.
      const unit = s.escrow!.lockedCents / PO.quantity;
      const m = plainEngine.matchReceipt({ orderedQty: PO.quantity, receivedQty: ev.receivedQty, unitCents: unit });
      return { ...s, dock: { receivedQty: ev.receivedQty, orderedQty: PO.quantity, releaseCents: m.releaseCents - s.escrow!.releasedCents, holdCents: m.holdCents } };
    }
    case "signal": return { ...s, signals: s.signals.includes(ev.id) ? s.signals : [...s.signals, ev.id] };
    case "reveal": return { ...s, protectedShown: true };
    case "release": {
      const unit = s.escrow!.lockedCents / PO.quantity;
      const r = releaseStage(s.escrow!, { stage: ev.stage, to: ev.to, signals: s.signals, unitCents: unit, receivedQty: s.dock?.receivedQty, nowMs: at });
      if (!r.ok) {
        const kind = r.reason === "address_not_allowed" ? "wrong_address_release" : r.reason === "missing_signal" ? "missing_signal" : "release_refused";
        return { ...s, refused: [...s.refused, { kind, detail: `${ev.to}: ${r.reason}${r.missing ? ` (${r.missing.join(", ")})` : ""}`, atMs: at }] };
      }
      return { ...s, escrow: r.escrow };
    }
    case "reclaim": {
      const r = reclaimHeld(s.escrow!, { to: OWNER, nowMs: at });
      if (!r.ok) throw new Error(`scenario bug: reclaim refused (${r.reason})`);
      return { ...s, escrow: r.escrow };
    }
    case "rules": {
      const next: Policy = {
        ...policy,
        ...(ev.patch.priceChangeLimitBps !== undefined ? { priceChangeLimitBps: ev.patch.priceChangeLimitBps } : {}),
        priceCaps: { ...policy.priceCaps, ...(ev.patch.motorCapCents !== undefined ? { "Actuator motor": ev.patch.motorCapCents } : {}) },
      };
      // Quotes already on the ruler are judged again against the new limit.
      const history = s.price.history.map((h) => ({ ...h, pass: checkPriceChange(PO.originalUnitCents, h.unitCents, next.priceChangeLimitBps).pass }));
      return { ...s, policy: next, price: { ...s.price, limitBps: next.priceChangeLimitBps, history } };
    }
    case "end_card": return { ...s, endCard: true };
    case "product": return { ...s, product: ev.id, highlight: null };
    case "highlight": return { ...s, highlight: ev.part };
    case "search": return { ...s, search: ev.query };
    case "explain": return { ...s, explain: ev.id };
    case "close_wallet": {
      const r = closeWallet(s.escrow!);
      if (!r.ok) throw new Error(`scenario bug: close refused (${r.reason})`);
      return { ...s, escrow: r.escrow };
    }
    case "pin": return { ...s, pin: ev.key };
    case "offer": return { ...s, offers: [...s.offers.filter((o) => o.supplierId !== ev.supplierId), { supplierId: ev.supplierId, unitCents: ev.unitCents, note: ev.note, tone: ev.tone }] };
  }
}

/** Deterministic replay: the workspace at time t is the fold of every beat up to t. */
export function stateAt(t: number, beats: Beat[] = timeline, policy: Policy = defaultPolicy): WorkspaceState {
  let s = initialState(policy);
  let pulseAt = -Infinity;
  for (const b of beats) {
    if (b.atMs > t) break;
    const before = s.pulse;
    s = apply(s, b);
    if (b.ev.type === "message" && b.ev.message.refersTo) pulseAt = b.atMs;
    else if (s.pulse !== before) pulseAt = b.atMs;
  }
  const drawerAt = s.drawer ? beats.filter((b) => b.ev.type === "proof" && b.atMs <= t).at(-1)!.atMs : 0;
  return {
    ...s, t,
    drawer: s.drawer && t - drawerAt < DRAWER_MS ? s.drawer : null,
    pulse: t - pulseAt < PULSE_MS ? s.pulse : null,
  };
}

export function sceneStartMs(id: number, list: Scene[] = scenes): number {
  let t = 0;
  for (const sc of list) { if (sc.id === id) return t; t += sc.durationMs; }
  return t;
}

export const usd = cents;

/** When a stage first begins in the script (Low begins at 0). */
export function stageStartMs(stage: import("./stages").Stage, beats: Beat[] = timeline): number {
  if (stage === "low") return 0;
  const b = beats.find((x) => x.ev.type === "stage" && x.ev.to === stage);
  return b ? b.atMs : 0;
}
