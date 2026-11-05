// Shared HTTP plumbing for the NEAR adapters. Every call goes through `call`,
// which records a proof row through the injected sink.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProofInput {
  kind: string;
  label: string;
  call: string;
  codePath: string;
  network: "testnet" | "mainnet" | "offchain";
  hash: string;
  explorerUrl?: string;
  response: unknown;
  replay: boolean;
  synthetic: boolean;
}

export type ProofSink = (p: ProofInput) => Promise<void> | void;

export const OUTLAYER_TESTNET = "https://testnet-api.outlayer.ai";
export const NEARAI_BASE = "https://cloud-api.near.ai/v1";
export const TESTNET_EXPLORER = "https://testnet.nearblocks.io/txns/";

export class MainnetRefused extends Error {
  constructor(what: string) { super(`mainnet refused: ${what} needs Luca's explicit yes in this session`); }
}

/** OutLayer is testnet only here. Mainnet is refused outright. */
export function outlayerBase(opts: { mainnet?: boolean } = {}): string {
  if (opts.mainnet) throw new MainnetRefused("OutLayer mainnet host");
  return OUTLAYER_TESTNET;
}

export async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class HttpError extends Error {
  constructor(public status: number, public body: unknown, msg: string) { super(msg); }
}

export interface CallOpts {
  fetch: Fetch;
  base: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function httpJson<T = unknown>(o: CallOpts): Promise<{ status: number; json: T; requestText: string; responseText: string }> {
  const requestText = o.body === undefined ? "" : JSON.stringify(o.body);
  const res = await o.fetch(o.base + o.path, {
    method: o.method,
    headers: { ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}), ...o.headers },
    body: o.body === undefined ? undefined : requestText,
  });
  const responseText = await res.text();
  let json: unknown = null;
  try { json = responseText ? JSON.parse(responseText) : null; } catch { json = responseText; }
  if (!res.ok) throw new HttpError(res.status, json, `${o.method} ${o.path} failed with ${res.status}`);
  return { status: res.status, json: json as T, requestText, responseText };
}

/** Hash of the exact request and response bytes, shown in the developer drawer. */
export const proofHash = (req: string, res: string) => sha256Hex(`${req}\n${res}`);

/** Strip secrets before a response is stored or shown. */
export function redact<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (k, val) => (/(api_key|check_key|payment_key|secret|bot_token)$/i.test(k) && typeof val === "string" ? "redacted" : val)));
}
