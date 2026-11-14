"use client";
// An approver's device: shows the exact terms the live order would commit, and signs them with the
// approver's own key (engine/approvals.ts signApproval). The key is typed or pasted here, kept in
// this tab's memory only, and never sent: only the signature goes to convex/approvals.ts submit,
// which checks it against the keys Astro pinned (APPROVER_KEYS). Needs NEXT_PUBLIC_CONVEX_URL.
import { useEffect, useState } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { signApproval, type CommitTerms } from "@/engine/approvals";
import { formatUsd } from "@/engine/money";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL;
type Scenario = "happy" | "adjusted";
interface Terms { terms: CommitTerms; digest: string; approvers: string[]; signed: string[] }

const box: React.CSSProperties = { border: "1px solid var(--line-strong)", borderRadius: 12, padding: 20, display: "grid", gap: 10 };
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 13, wordBreak: "break-all" };

export function ApproveDevice() {
  const [client, setClient] = useState<ConvexClient | null>(null);
  const [scenario, setScenario] = useState<Scenario>("happy");
  const [data, setData] = useState<Terms | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!URL) return;
    const c = new ConvexClient(URL);
    queueMicrotask(() => setClient(c));
    return () => { void c.close(); };
  }, []);
  useEffect(() => {
    if (!client) return;
    return client.onUpdate(api.approvals.terms, { scenario }, (d) => setData(d as Terms));
  }, [client, scenario]);

  async function approve() {
    if (!client || !data) return;
    const hex = key.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) { setResult("The key must be 64 hex characters (the file scripts/approver-keygen.mts wrote)."); return; }
    const sk = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    const now = Date.now();
    const a = signApproval({ approver: name.trim(), secretKey: sk, digest: data.digest, nonce: crypto.randomUUID(), issuedAt: now, expiresAt: now + 60 * 60_000 });
    setKey("");
    const r = await client.mutation(api.approvals.submit, { approval: a });
    setResult(r.ok ? `Signed by ${a.approver}. Nonce ${a.nonce}. Valid for one hour.` : `Refused: ${r.reason}`);
  }

  if (!URL) return <main style={{ padding: 32, color: "var(--text-primary)" }}><p>Approvals need a live deployment (NEXT_PUBLIC_CONVEX_URL is not set). The replay demo does not use this page.</p></main>;
  const t = data?.terms;
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px", display: "grid", gap: 16, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
      <h1 className="es-title">Approve PO {t?.po ?? "…"}</h1>
      <p>You are signing exactly these terms. If any of them changes, this signature no longer counts.</p>
      <label>Deal{" "}
        <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
          <option value="happy">$1,260 a motor</option>
          <option value="adjusted">$1,320 a motor</option>
        </select>
      </label>
      {t && (
        <section style={box} aria-label="Terms">
          <div>{t.quantity} x {t.part} from {t.supplierId} at {formatUsd(t.unitCents)}</div>
          <div><strong>{formatUsd(t.totalCents)}</strong> committed ({t.settlement.units} test USDC units at 1:{t.settlement.scale.toLocaleString("en-US")}, testnet)</div>
          <div>Paid only to <span style={mono}>{t.supplierAddress}</span> on {t.supplierChain}</div>
          <div>Approvals required: {t.approvalsRequired}. Signed so far: {data!.signed.length ? data!.signed.join(", ") : "nobody"}</div>
          <div style={mono}>terms digest {data!.digest}</div>
        </section>
      )}
      <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} placeholder={data?.approvers.join(" or ")} /></label>
      <label>Your private key (stays in this tab) <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <button onClick={approve} disabled={!data || !name || !key}>Sign these terms</button>
      {result && <p role="status">{result}</p>}
    </main>
  );
}
