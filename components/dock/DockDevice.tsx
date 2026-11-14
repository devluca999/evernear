"use client";
// The receiving dock's device: the clerk counts the motors, types the count and signs it with the
// device's key (engine/attestation.ts signDockCount). The key stays in this tab; only the signed
// count goes to convex/dock.ts, which keeps it if the device is pinned in DOCK_DEVICE_KEYS. The live
// balance is then paid on this count. A signature says who reported the count, not that it is true.
import { useEffect, useState } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { signDockCount } from "@/engine/attestation";
import { PO } from "@/seed/astro";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export function DockDevice() {
  const [client, setClient] = useState<ConvexClient | null>(null);
  const [devices, setDevices] = useState<string[]>([]);
  const [device, setDevice] = useState("");
  const [count, setCount] = useState("");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [order, setOrder] = useState<{ agentId: string } | null>(null);

  useEffect(() => {
    if (!URL) return;
    const c = new ConvexClient(URL);
    queueMicrotask(() => setClient(c));
    return () => { void c.close(); };
  }, []);
  useEffect(() => {
    if (!client) return;
    const a = client.onUpdate(api.dock.devices, {}, (d) => { setDevices(d); setDevice((x) => x || d[0] || ""); });
    const b = client.onUpdate(api.dock.openOrder, { po: PO.number }, setOrder);
    return () => { a(); b(); };
  }, [client]);

  async function submit() {
    if (!client) return;
    if (!order) { setResult(`No open order wallet for PO ${PO.number}: nothing to count for.`); return; }
    const n = Number(count), hex = key.trim().toLowerCase();
    if (!Number.isSafeInteger(n) || n < 0 || n > PO.quantity) { setResult(`The count must be a whole number from 0 to ${PO.quantity}.`); return; }
    if (!/^[0-9a-f]{64}$/.test(hex)) { setResult("The device key must be 64 hex characters."); return; }
    const sk = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    const a = signDockCount({ po: PO.number, agentId: order.agentId, count: n, at: new Date().toISOString(), device, secretKey: sk });
    setKey("");
    const r = await client.mutation(api.dock.submit, { attestation: a });
    setResult(r.ok ? `Signed: ${n} of ${PO.quantity} received for PO ${PO.number} by ${device}.` : `Refused: ${r.reason}`);
  }

  if (!URL) return <main style={{ padding: 32, color: "var(--text-primary)" }}><p>The dock device needs a live deployment (NEXT_PUBLIC_CONVEX_URL is not set).</p></main>;
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px", display: "grid", gap: 16, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
      <h1 className="es-title">Dock count, PO {PO.number}</h1>
      <p>Order wallet: <code>{order?.agentId ?? "none open"}</code></p>
      <p>Count what arrived and sign it. The balance is paid on this number. Your signature says this device reported it; it does not prove it.</p>
      {devices.length === 0 ? <p role="status">No dock device is pinned on this deployment (DOCK_DEVICE_KEYS).</p> : (
        <label>Device <select value={device} onChange={(e) => setDevice(e.target.value)}>{devices.map((d) => <option key={d}>{d}</option>)}</select></label>
      )}
      <label>Motors received (of {PO.quantity}) <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></label>
      <label>Device key (stays in this tab) <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <button onClick={submit} disabled={!devices.length || !count || !key}>Sign the count</button>
      {result && <p role="status">{result}</p>}
    </main>
  );
}
