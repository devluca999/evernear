import type { Fetch } from "@/convex/near/http";

export interface Sent { url: string; method: string; headers: Record<string, string>; body: string }

/** A recording fetch: routes by "METHOD path-prefix" and keeps every request. */
export function mockFetch(routes: Record<string, (req: Sent) => unknown>) {
  const sent: Sent[] = [];
  const fetch: Fetch = async (url, init) => {
    const req: Sent = { url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: (init?.body as string) ?? "" };
    sent.push(req);
    const path = new URL(url).pathname + new URL(url).search;
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === req.method && (path.startsWith(p) || url.startsWith(p));
    });
    if (!key) return new Response(JSON.stringify({ error: "no route" }), { status: 404 });
    const out = await routes[key](req);
    const [status, body] = Array.isArray(out) && typeof out[0] === "number" ? (out as [number, unknown]) : [200, out];
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, sent };
}

export function sinkRecorder() {
  const proofs: import("@/convex/near/http").ProofInput[] = [];
  return { proofs, sink: (p: import("@/convex/near/http").ProofInput) => { proofs.push(p); } };
}
