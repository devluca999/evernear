"use client";
// Orders: customer orders for the 10MA and shipments out, or Astro's purchase orders. On the
// purchase side PO 1042 leads once it exists: its approvals, then the dock check on day 9.
import { useEffect, useState } from "react";
import type { WorkspaceState } from "@/scenario/types";
import { demand, PO, purchaseOrders, shipmentsOut, story, suppliers } from "@/seed/astro";
import { formatInt, formatUsd, formatUsdShort } from "@/engine/money";
import { Badge, Dot, N, Panel, Seg } from "../Panel";
import s from "../shell.module.css";

type Tab = "customer" | "purchase";
const haoyun = suppliers.find((x) => x.id === "haoyun")!;
const NAME: Record<string, string> = { kansai: "Kansai Servo Works", rheinwerk: "Rheinwerk", huaxin: "Huaxin Robotics", haoyun: "Haoyun Precision" };
const CITY: Record<string, string> = { kansai: "Osaka", rheinwerk: "Stuttgart", huaxin: "Dongguan", haoyun: "Shenzhen" };

function Customer({ st }: { st: WorkspaceState }) {
  const cover = Math.floor(st.demand.motorsOnHand / demand.motorsPerRobot) + (st.dock ? Math.floor(st.dock.receivedQty / demand.motorsPerRobot) : 0);
  const shown = st.demand.ordered === 0 ? [] : demand.customers.slice(0, st.demand.ordered >= 14 ? 3 : st.demand.ordered >= 10 ? 2 : 1);
  // Orders are covered first come, first served from the motors on hand.
  const covered = shown.map((c, i) => shown.slice(0, i + 1).reduce((n, x) => n + x.robots, 0) <= cover);
  return (
    <div className={s.pad} style={{ padding: "14px 16px", gap: 10 }}>
      <span className="es-micro">Orders in · 10MA</span>
      {shown.length === 0 && <p className={s.note}>No orders yet.</p>}
      {shown.map((c, i) => {
        const ok = covered[i];
        return (
          <div key={c.so} className={s.well} data-tone={ok ? undefined : "attention"} style={{ background: ok ? "none" : undefined, padding: 12, borderRadius: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</span>
            <div className={s.headRow} style={{ gap: 10, fontSize: 12, color: "var(--text-muted)" }}>
              <N className={s.hi}>SO {c.so}</N><span><N>{c.robots}</N> robots</span><span>Due <N>{c.due}</N></span>
              <span className={s.push}>{ok ? <Badge tone="success">Covered</Badge> : <Badge tone="attention">No motors</Badge>}</span>
            </div>
          </div>
        );
      })}
      <span className="es-micro" style={{ marginTop: 10 }}>Shipments out</span>
      <div className={s.rows}>
        {shipmentsOut.map((x) => (
          <div key={x.ref} className={s.row} style={{ gridTemplateColumns: "16px 62px 1fr auto", fontSize: 12.5 }}>
            <Dot tone={x.done ? "success" : undefined} /><N>{x.ref}</N><span>{x.what}</span><N className={s.rowEnd}>{x.date}</N>
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({ st }: { st: WorkspaceState }) {
  const cols = { gridTemplateColumns: "92px 1fr 104px 72px 64px" };
  const fit = (id: string) => st.fitment.find((f) => f.supplierId === id);
  const quotes = ["rheinwerk", "kansai", "huaxin"].filter((id) => fit(id));
  const yes = (ok: boolean | null, a: string, b: string) => <span className={s.line} style={{ fontSize: 12 }}><Dot tone={ok === null ? undefined : ok ? "success" : "alert"} />{ok === null ? "Not yet" : ok ? a : b}</span>;
  return (
    <div style={{ padding: "6px 14px" }} className={s.rows} role="table" aria-label="Purchase orders">
      <div className={s.row} role="row" style={{ ...cols, minHeight: 26 }}>
        {["Order", "Supplier", "Location", "Approved", "Fitment"].map((h) => <span key={h} className="es-micro" role="columnheader">{h}</span>)}
      </div>
      {purchaseOrders.map((p) => (
        <div key={p.ref} className={s.row} role="row" style={cols}><N>{p.ref}</N><span>{p.supplier}</span><span className={s.rowEnd} style={{ textAlign: "left" }}>{p.location}</span>{yes(p.approved, "Yes", "No")}{yes(p.fitment, "Pass", "Fail")}</div>
      ))}
      {fit("haoyun") && (
        <div className={s.row} role="row" style={cols}>
          <N>PO {PO.number}{st.approvals.length < st.requiredApprovals ? " draft" : ""}</N><span>Haoyun Precision</span><span className={s.rowEnd} style={{ textAlign: "left" }}>{haoyun.city}</span>
          {yes(st.approvals.length >= st.requiredApprovals ? true : null, "Yes", "No")}{yes(fit("haoyun")!.pass, "Pass", "Fail")}
        </div>
      )}
      {quotes.map((id) => {
        const f = fit(id)!;
        return (
          <div key={id} className={s.row} role="row" style={cols}>
            <N>Quote</N><span>{NAME[id]}</span><span className={s.rowEnd} style={{ textAlign: "left" }}>{CITY[id]}</span>
            {yes(!f.policyFailures.includes("not_approved"), "Yes", "No")}{yes(f.mismatches.length === 0, "Pass", "Fail")}
          </div>
        );
      })}
    </div>
  );
}

function PoDetail({ st }: { st: WorkspaceState }) {
  const last = st.price.history.at(-1);
  const repriced = st.limitApprovals.length > 0;
  const unit = repriced ? PO.confirmedUnitCents : PO.originalUnitCents;
  const total = (repriced ? PO.confirmedUnitCents : last?.pass ? last.unitCents : PO.originalUnitCents) * PO.quantity;
  const signed = st.approvals.length;
  const done = repriced ? st.limitApprovals.length >= 2 : signed >= st.requiredApprovals;
  return (
    <div className={s.pad} style={{ padding: 14, gap: 12 }}>
      <div className={s.headRow}>
        <Dot tone={repriced ? "active" : done ? "success" : "attention"} pulse={repriced} /><N>PO {PO.number}</N>
        <span className={s.push}>{repriced ? <Badge tone="active">Repriced</Badge> : done ? <Badge tone="success">Approved</Badge> : <Badge tone="attention">{signed} of {st.requiredApprovals} signed</Badge>}</span>
      </div>
      <div className={s.field} style={{ gap: 2 }}><span style={{ fontSize: 14, fontWeight: 500 }}>Haoyun Precision</span><span className={s.note} style={{ fontSize: 12 }}>{haoyun.city}, {haoyun.country}{repriced ? "" : " · new supplier"}</span></div>
      <div className={s.fields}>
        {repriced ? (
          <>
            <div className={s.field}><span className="es-micro">Unit price</span><N>{formatUsd(unit)}</N></div>
            <div className={s.field}><span className="es-micro">Was</span><N className={s.muted}>{formatUsd(PO.originalUnitCents)}</N></div>
            <div className={s.field}><span className="es-micro">Qty</span><N>{formatInt(PO.quantity)}</N></div>
            <div className={s.field}><span className="es-micro">Total</span><N>{formatUsdShort(total)}</N></div>
          </>
        ) : (
          <>
            <div className={s.field}><span className="es-micro">Part</span><N>AM17</N></div>
            <div className={s.field}><span className="es-micro">Qty</span><N>{formatInt(PO.quantity)}</N></div>
            <div className={s.field}><span className="es-micro">Unit price</span><N>{formatUsd(unit)}</N></div>
            <div className={s.field}><span className="es-micro">Ceiling</span><N>{formatUsdShort(PO.revisedTotalCents)}</N></div>
          </>
        )}
      </div>
      <div className={s.lines}>
        <span className={s.line}><Dot tone="success" />Fitment <N>14</N> of <N>14</N></span>
        {repriced ? (
          <>
            <span className={s.line}><Dot tone={done ? "success" : "attention"} />Limit change signed by {st.limitApprovals.map((a) => a.by).join(", ") || "nobody yet"}</span>
            {done && <span className={s.line}><Dot tone="active" pulse />Next: funds committed</span>}
          </>
        ) : (
          st.approvals.map((a) => <span key={a.by} className={s.line}><Dot tone="success" />Signed by {a.by} <N className={s.muted}>{a.time}</N></span>)
        )}
        {!repriced && !done && <span className={s.line}><Dot tone="attention" />{signed === 0 ? "Luca to sign" : "Jordy to sign"}</span>}
      </div>
    </div>
  );
}

function Dock({ st }: { st: WorkspaceState }) {
  const d = st.dock;
  const counted = !!d;
  const missing = d ? d.orderedQty - d.receivedQty : 0;
  return (
    <div className={s.pad} style={{ gap: 12 }}>
      <div className={s.headRow} style={{ gap: 10, alignItems: "baseline", paddingBottom: 10, borderBottom: "1px solid var(--line-hairline)" }}>
        <span className={s.big} style={{ fontSize: 17 }}>Day <N>9</N> · Chicago dock</span>
        <N className={`${s.push} ${s.muted}`} >{story.dockAt}</N>
      </div>
      <div className={s.headRow}>
        <Dot tone={counted && missing ? "attention" : counted ? "success" : "active"} pulse={!counted} /><N>PO {PO.number}</N><span style={{ fontSize: 13.5, fontWeight: 500 }}>Haoyun Precision</span>
        <span className={s.push}>{counted ? (missing ? <Badge tone="attention">Short {formatInt(missing)}</Badge> : <Badge tone="success">Complete</Badge>) : <Badge tone="active">Unloading</Badge>}</span>
      </div>
      <div className={s.cells} data-focus="dock.count" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className={s.cell} style={{ padding: "10px 12px" }}><span className="es-micro">Ordered</span><N><span style={{ fontSize: 20, fontWeight: 500 }}>{formatInt(PO.quantity)}</span></N></div>
        <div className={s.cell} data-tone={missing ? "attention" : undefined} style={{ padding: "10px 12px" }}><span className="es-micro">Arrived</span><N className={counted ? undefined : s.faint}><span style={{ fontSize: 20, fontWeight: 500 }}>{counted ? formatInt(d.receivedQty) : "..."}</span></N></div>
        <div className={s.cell} style={{ padding: "10px 12px" }}><span className="es-micro">Billed</span><N><span style={{ fontSize: 20, fontWeight: 500 }}>{formatInt(PO.quantity)}</span></N></div>
      </div>
      <div className={s.rows}>
        <span className="es-micro" style={{ paddingBottom: 4 }}>Dock check</span>
        {counted ? (
          <>
            <div className={s.row}><Dot tone="attention" /><span>Cartons counted</span><N className={s.hi}>{d.receivedQty / 100} of {d.orderedQty / 100}</N></div>
            <div className={s.row}><Dot tone="attention" /><span>Packing slip quantity</span><N className={s.hi}>{formatInt(d.receivedQty)}</N></div>
            <div className={s.row}><Dot tone="success" /><span>Spot fitment check</span><N className={s.hi}>12 of 12 pass</N></div>
            <div className={s.row}><Dot tone="success" /><span>Commercial invoice</span><N className={s.hi}>{formatUsd(st.escrow?.lockedCents ?? PO.revisedTotalCents)}</N></div>
            {missing > 0 && <div className={s.row}><Dot tone="attention" /><span>Remaining <N>{formatInt(missing)}</N></span><N className={s.hi}>Ships {story.remainderShips}</N></div>}
          </>
        ) : (
          <div className={s.row}><Dot tone="active" pulse /><span>Waiting for the packing slip photo</span><span /></div>
        )}
      </div>
    </div>
  );
}

export function OrdersPanel({ st, pulse }: { st: WorkspaceState; pulse: boolean }) {
  // Customer orders until sourcing starts; purchase orders from then on.
  const auto: Tab = !st.fitment.length && st.stage === "low" ? "customer" : "purchase";
  const [picked, setPicked] = useState<Tab | null>(null);
  // A tab you pick holds for the scene; the next scene picks again.
  useEffect(() => { queueMicrotask(() => setPicked(null)); }, [st.scene]);
  const tab = picked ?? auto;
  const atDock = st.stage === "dock" || (!!st.dock && !st.escrow?.releasedCents);
  const lastQuote = st.price.history.at(-1);
  const detail = st.stage === "approval" || st.limitApprovals.length > 0 || (st.approvals.length > 0 && !st.escrow && !st.price.history.length) || (!!lastQuote && !lastQuote.pass && !st.escrow);
  return (
    <Panel id="orders" title="Orders" pulse={pulse}
      meta={<Seg label="Order type" value={tab} onChange={setPicked} options={[{ id: "customer", label: "Customer" }, { id: "purchase", label: "Purchase" }]} />}>
      {tab === "customer" ? <Customer st={st} /> : atDock ? <Dock st={st} /> : detail ? <PoDetail st={st} /> : <Table st={st} />}
    </Panel>
  );
}
