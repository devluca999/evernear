"use client";
// Company rules the viewer can change. The replay runs on them (scenario/runner.ts stateAt), so a
// stricter rule really stops PO 1042, and the workspace says where and why.
import { createContext, useContext, useState } from "react";
import { MOTOR_PART, policy as defaultPolicy } from "@/seed/astro";
import type { Policy } from "@/engine/types";
import s from "./workspace.module.css";

export const POLICY_KEY = "evernear.policy";
export const PolicyContext = createContext<{ policy: Policy; setPolicy: (p: Policy) => void; reset: () => void; changed: boolean } | null>(null);
export const usePolicy = () => useContext(PolicyContext);

export function sameRules(a: Policy, b: Policy) {
  return a.autoApproveUnderCents === b.autoApproveUnderCents && a.approversRequired === b.approversRequired
    && a.priceChangeLimitBps === b.priceChangeLimitBps && a.priceCaps[MOTOR_PART] === b.priceCaps[MOTOR_PART];
}

/** Reads a saved rule set, falling back to the defaults for anything missing or malformed. */
export function loadPolicy(raw: string | null): Policy {
  try {
    const p = raw ? JSON.parse(raw) : null;
    const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
    if (!p) return defaultPolicy;
    return {
      autoApproveUnderCents: num(p.autoApproveUnderCents, defaultPolicy.autoApproveUnderCents, 0, 10_000_000_00),
      approversRequired: num(p.approversRequired, defaultPolicy.approversRequired, 1, 3),
      priceChangeLimitBps: num(p.priceChangeLimitBps, defaultPolicy.priceChangeLimitBps, 0, 5_000),
      priceCaps: { ...defaultPolicy.priceCaps, [MOTOR_PART]: num(p.priceCaps?.[MOTOR_PART], defaultPolicy.priceCaps[MOTOR_PART], 1, 10_000_00) },
    };
  } catch { return defaultPolicy; }
}

/** The editor: four thresholds, in dollars and percent, and a reset. */
export function RulesEditor() {
  const ctx = usePolicy();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  const { policy, setPolicy, reset, changed } = ctx;
  const field = (label: string, value: number, step: number, min: number, max: number, onChange: (n: number) => void, unit: string) => (
    <label className={s.ruleField}>
      <span className={s.micro}>{label}</span>
      <span className={s.ruleInput}>
        {unit === "$" && <span className={s.faint}>$</span>}
        <input type="number" inputMode="decimal" value={value} step={step} min={min} max={max}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} aria-label={label.toLowerCase()} />
        {unit === "%" && <span className={s.faint}>%</span>}
      </span>
    </label>
  );
  return (
    <div className={s.rulesEditor}>
      <div className={s.rulesEditorHead}>
        <button type="button" className={s.btnQuiet} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Done" : "Change thresholds"}</button>
        {changed && <button type="button" className={s.pinClear} onClick={reset}>Reset to Astro&apos;s rules</button>}
      </div>
      {open && (
        <div className={s.ruleGrid} role="group" aria-label="Company rules">
          {field("AUTO APPROVE UNDER", policy.autoApproveUnderCents / 100, 1000, 0, 1_000_000, (n) => setPolicy({ ...policy, autoApproveUnderCents: Math.round(n * 100) }), "$")}
          {field("APPROVERS OVER THE CAP", policy.approversRequired, 1, 1, 3, (n) => setPolicy({ ...policy, approversRequired: Math.min(3, Math.max(1, Math.round(n))) }), "")}
          {field("PRICE CHANGE LIMIT", policy.priceChangeLimitBps / 100, 0.5, 0, 50, (n) => setPolicy({ ...policy, priceChangeLimitBps: Math.round(n * 100) }), "%")}
          {field("MOTOR PRICE CAP", policy.priceCaps[MOTOR_PART] / 100, 10, 1, 10_000, (n) => setPolicy({ ...policy, priceCaps: { ...policy.priceCaps, [MOTOR_PART]: Math.round(n * 100) } }), "$")}
          <p className={s.faint}>The story replays on these rules. A stricter rule stops PO 1042 where it applies.</p>
        </div>
      )}
    </div>
  );
}
