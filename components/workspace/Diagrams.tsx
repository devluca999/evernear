// Five small diagrams for the developer drawer's Learn view, each readable in about three seconds.
// Colour is state only: blue working, jade done, crimson refused. The motion is a slow flow along
// the arrows, off with reduced motion (shell.module.css). The lifecycle strip is also on the Money card.
import type { Lifecycle } from "@/engine/escrow";
import type { DiagramId } from "@/scenario/explain";
import s from "./shell.module.css";

const Box = ({ x, y, w, h, label, sub, tone }: { x: number; y: number; w: number; h: number; label: string; sub?: string; tone?: "ok" | "alert" | "active" }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="8" className={s.dgBox} data-tone={tone} />
    <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 5)} textAnchor="middle" className={s.dgLabel}>{label}</text>
    {sub && <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" className={s.dgSub}>{sub}</text>}
  </g>
);
const Arrow = ({ d, tone, label, lx, ly }: { d: string; tone?: "ok" | "alert"; label?: string; lx?: number; ly?: number }) => (
  <g>
    <path d={d} className={s.dgArrow} data-tone={tone} markerEnd={`url(#dg-head${tone ? `-${tone}` : ""})`} />
    <path d={d} className={s.dgFlow} data-tone={tone} />
    {label && <text x={lx} y={ly} textAnchor="middle" className={s.dgSub}>{label}</text>}
  </g>
);
const Heads = () => (
  <defs>
    {[["", "var(--text-muted)"], ["-ok", "var(--state-success)"], ["-alert", "var(--state-alert)"]].map(([k, c]) => (
      <marker key={k} id={`dg-head${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L8 4L0 8z" fill={c} />
      </marker>
    ))}
  </defs>
);

function Enclave() {
  return (
    <svg viewBox="0 0 360 170" role="img" aria-label="BOM, suppliers and prices flow into a sealed enclave; only the answer comes out; nobody can see in">
      <Heads />
      {["BOM", "Suppliers", "Prices"].map((t, i) => <Box key={t} x={4} y={10 + i * 50} w={78} h={36} label={t} />)}
      {[0, 1, 2].map((i) => <Arrow key={i} d={`M84 ${28 + i * 50} C110 ${28 + i * 50}, 112 80, 130 80`} />)}
      <rect x={132} y={40} width={110} height={80} rx="10" className={s.dgBox} data-tone="active" />
      <path d="M178 66v-6a9 9 0 0 1 18 0v6" className={s.dgLock} />
      <rect x={172} y={66} width={30} height={22} rx="4" className={s.dgLock} />
      <text x={187} y={108} textAnchor="middle" className={s.dgLabel}>Enclave</text>
      <text x={187} y={140} textAnchor="middle" className={s.dgSub}>Nobody can see in</text>
      <Arrow d="M244 80 L268 80" tone="ok" />
      <Box x={272} y={58} w={84} h={44} label="Answer" sub="2 fit" tone="ok" />
    </svg>
  );
}

function Attestation() {
  return (
    <svg viewBox="0 0 360 170" role="img" aria-label="The chip maker's key signs the enclave, which contains a code fingerprint; a one-line change gives a different fingerprint, not trusted">
      <Heads />
      <Box x={2} y={22} w={92} h={46} label="Chip maker" sub="key" />
      <Arrow d="M96 45 L130 45" label="signs" lx={113} ly={14} />
      <Box x={134} y={22} w={84} h={46} label="Enclave" tone="active" />
      <Arrow d="M220 45 L262 45" label="holds" lx={241} ly={14} />
      <Box x={266} y={22} w={92} h={46} label="Fingerprint" sub="of the code" tone="ok" />
      <text x={180} y={96} textAnchor="middle" className={s.dgSub}>Change one line of code</text>
      <Arrow d="M180 102 L180 116" tone="alert" />
      <Box x={110} y={120} w={140} h={44} label="New fingerprint" sub="not the attested one" tone="alert" />
    </svg>
  );
}

function Wallet() {
  return (
    <svg viewBox="0 0 360 170" role="img" aria-label="Astro's wallet funds the PO 1042 wallet, which has two doors: Haoyun and back to Astro; a payment to any other address bounces off">
      <Heads />
      <Box x={2} y={62} w={84} h={46} label="Astro" sub="wallet" />
      <Arrow d="M88 85 L118 85" tone="ok" />
      <Box x={122} y={50} w={104} h={70} label="PO 1042" sub="order wallet" tone="active" />
      <Arrow d="M228 66 C250 50, 256 32, 272 30" tone="ok" />
      <Box x={276} y={10} w={82} h={40} label="Haoyun" tone="ok" />
      <Arrow d="M228 90 C250 96, 256 90, 272 86" tone="ok" />
      <Box x={276} y={66} w={82} h={40} label="Astro" sub="refund" tone="ok" />
      <path d="M228 108 C248 130, 258 140, 262 142" className={s.dgArrow} data-tone="alert" />
      <path d="M262 142 L246 152" className={s.dgArrow} data-tone="alert" />
      <text x={300} y={142} textAnchor="middle" className={s.dgSub} data-tone="alert">Anyone else</text>
      <text x={300} y={158} textAnchor="middle" className={s.dgSub} data-tone="alert">refused</text>
    </svg>
  );
}

function Signed() {
  return (
    <svg viewBox="0 0 360 170" role="img" aria-label="The slip photo goes into the dock-check enclave, which stamps a signed result that unlocks the release; a forged result without the stamp is refused">
      <Heads />
      <Box x={2} y={18} w={70} h={44} label="Slip" sub="photo" />
      <Arrow d="M74 40 L96 40" />
      <Box x={100} y={14} w={92} h={52} label="Dock check" sub="enclave" tone="active" />
      <Arrow d="M194 40 L216 40" tone="ok" />
      <Box x={220} y={18} w={60} h={44} label="Result" sub="signed" tone="ok" />
      <Arrow d="M282 40 L300 40" tone="ok" />
      <Box x={302} y={18} w={56} h={44} label="Release" tone="ok" />
      <Box x={120} y={112} w={110} h={44} label="Forged result" sub="no stamp" tone="alert" />
      <path d="M232 134 L296 134" className={s.dgArrow} data-tone="alert" />
      <text x={326} y={139} textAnchor="middle" className={s.dgSub} data-tone="alert">refused</text>
    </svg>
  );
}

const STATES: { id: Lifecycle; label: string; signals?: string[] }[] = [
  { id: "created", label: "Created" }, { id: "funded", label: "Funded", signals: ["Two approvals"] },
  { id: "advance_released", label: "Advance released", signals: ["Bill of lading", "Export cleared"] },
  { id: "balance_released", label: "Balance released", signals: ["Import cleared", "Dock count"] },
  { id: "closed", label: "Closed" },
];
/** Settled (nothing left, not yet closed) shows as the balance done and Closed next. */
const shown = (at: Lifecycle | null) => (at === "settled" ? "balance_released" : at);

/** The order wallet's lifecycle: done states jade, the current one blue. */
export function LifecycleStrip({ at, focus = false }: { at: Lifecycle | null; focus?: boolean }) {
  const settled = at === "settled";
  const cur = at ? STATES.findIndex((x) => x.id === shown(at)) : -1;
  return (
    <ol className={s.life} aria-label="Order wallet lifecycle" data-focus={focus ? "money.lifecycle" : undefined}>
      {STATES.map((x, i) => {
        const state = i < cur || (i === cur && (x.id === "closed" || settled)) ? "done" : i === cur ? "current" : "pending";
        return (
          <li key={x.id} className={s.lifeStep} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <i aria-hidden="true" />
            <span>{x.label}</span>
            {x.signals?.map((g) => <span key={g} className={s.lifeCheck} data-on={state === "done" || state === "current"}>{g}</span>)}
            {x.id === "closed" && <span className={s.lifeNote}>frozen, key revoked, kept as receipt</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function Diagram({ id, lifecycle = null }: { id: DiagramId; lifecycle?: Lifecycle | null }) {
  return (
    <figure className={s.diagram} data-diagram={id}>
      {id === "enclave" ? <Enclave /> : id === "attestation" ? <Attestation /> : id === "wallet" ? <Wallet /> : id === "signed" ? <Signed /> : <LifecycleStrip at={lifecycle} />}
    </figure>
  );
}
