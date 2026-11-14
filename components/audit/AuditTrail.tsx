// The order's audit trail for judges: the financial outcome at a glance, then 15 events, each
// expandable to who acted, which layer enforced it, the evidence, how it is known and the source.
import { auditTrail, type Status } from "@/scenario/auditTrail";
import { formatUsd } from "@/engine/money";

const TONE: Record<Status, string> = {
  "verified on chain": "var(--state-success, #2f9e74)",
  "recorded testnet response": "var(--state-active, #4a7dd8)",
  "real testnet refusal (no tx)": "var(--state-active, #4a7dd8)",
  "signed off-chain": "var(--state-active, #4a7dd8)",
  "computed by the engine": "var(--text-secondary, #9a9a9a)",
  simulated: "var(--state-attention, #d67855)",
};

const cell: React.CSSProperties = { border: "1px solid var(--line-hairline)", borderRadius: 10, padding: "12px 14px" };

export function AuditTrail() {
  const { events, summary } = auditTrail();
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 16px 64px", color: "var(--text-primary)", fontFamily: "var(--font-ui)", display: "grid", gap: 20 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 className="es-title">PO 1042 audit trail</h1>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>From the request to the final reconciliation. Each event says who acted, which layer enforced it and how it is known. Testnet at 1:1,000; shipment signals are simulated.</p>
      </header>
      <section aria-label="Outcome" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div style={cell}><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Committed</div><strong>{formatUsd(summary.committedCents)}</strong></div>
        <div style={cell}><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Arrived</div><strong>{summary.receivedQty} of {summary.orderedQty}</strong></div>
        <div style={cell}><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Paid to the supplier</div><strong>{formatUsd(summary.paidCents)}</strong></div>
        <div style={cell}><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Returned to the buyer</div><strong>{formatUsd(summary.returnedCents)}</strong></div>
        <div style={cell}><div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Engine vs chain</div><strong>{summary.reconciled ? "Reconciled" : "Not reconciled"}</strong></div>
      </section>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {events.map((e) => (
          <li key={e.n} style={cell}>
            <details>
              <summary style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{String(e.n).padStart(2, "0")}</span>
                <span style={{ fontWeight: 600 }}>{e.title}</span>
                {e.amountCents !== null && <span style={{ fontFamily: "var(--font-mono)" }}>{formatUsd(e.amountCents)}</span>}
                <span style={{ marginLeft: "auto", fontSize: 12 }}><span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: TONE[e.status], marginRight: 6 }} />{e.status}</span>
              </summary>
              <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", margin: "12px 0 0", fontSize: 14 }}>
                <dt>Actor</dt><dd style={{ margin: 0 }}>{e.actor}</dd>
                <dt>Time</dt><dd style={{ margin: 0 }}>{e.at ?? "story step, no timestamp"}</dd>
                <dt>Order</dt><dd style={{ margin: 0 }}>PO 1042</dd>
                <dt>Enforced by</dt><dd style={{ margin: 0 }}>{e.enforcement}</dd>
                <dt>Evidence</dt><dd style={{ margin: 0 }}>{e.evidence}</dd>
                {e.tx && (<><dt>Transaction</dt><dd style={{ margin: 0, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}><a href={e.tx.url} target="_blank" rel="noreferrer" style={{ color: "#8fb4ff" }}>{e.tx.hash}</a></dd></>)}
                <dt>Source</dt><dd style={{ margin: 0, fontFamily: "var(--font-mono)" }}>{e.source}</dd>
                {e.detail && (<><dt>Note</dt><dd style={{ margin: 0 }}>{e.detail}</dd></>)}
              </dl>
            </details>
          </li>
        ))}
      </ol>
      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Re-check: <code>npm run verify:proofs</code> reads every transaction above from public RPCs; <code>npm run reconcile</code> compares them with the engine; <code>npm run attack</code> runs the refusals.</p>
    </main>
  );
}
