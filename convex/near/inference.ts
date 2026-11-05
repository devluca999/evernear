// Document reads (offers, invoices, packing slips) through NEAR AI Cloud private inference.
// The model only reads: it returns the fields it sees. Amounts are computed by the engine.
// Per read we keep: model, nonce, attestation report signer, completion id, request and
// response sha256, and the provider signature. Flow: docs/NOTES.md section 2.
import { httpJson, NEARAI_BASE, proofHash, sha256Hex, type Fetch, type ProofSink } from "./http";

const PATH = "convex/near/inference.ts";

/** Confidential TEE models only. An Incognito model would let the BOM leave the enclave. */
export function isConfidential(m: { id: string; owned_by?: string }) {
  return m.owned_by === "nearai";
}

export interface ReadRecord {
  model: string;
  nonce: string;
  signingAddress: string | null;
  completionId: string;
  requestSha256: string;
  responseSha256: string;
  signatureText: string | null;
  signature: string | null;
  signatureKind: string | null;
  /** True only when the signed text binds this model, this request and this response. */
  bound: boolean;
}

const SYSTEM = "You read supply chain documents. Reply with one JSON object holding only the fields asked for, copied exactly as printed. Never compute totals.";

export class Inference {
  constructor(private o: { fetch: Fetch; apiKey?: string; sink: ProofSink; model?: string; nonce?: () => string }) {}
  private h() {
    if (!this.o.apiKey) throw new Error("NEARAI_API_KEY not configured");
    return { Authorization: `Bearer ${this.o.apiKey}`, "x-no-aliasing": "true", "Accept-Encoding": "identity" };
  }

  async pickModel(): Promise<string> {
    if (this.o.model) return this.o.model;
    const r = await httpJson<{ data: { id: string; owned_by?: string }[] }>({ fetch: this.o.fetch, base: NEARAI_BASE, method: "GET", path: "/models", headers: this.h() });
    const m = r.json.data.find(isConfidential);
    if (!m) throw new Error("no confidential TEE model available");
    return m.id;
  }

  async read<T extends Record<string, unknown>>(i: { kind: string; text?: string; imageDataUrl?: string; fields: string[]; label: string }): Promise<{ fields: T; record: ReadRecord }> {
    const model = await this.pickModel();
    const nonce = this.o.nonce?.() ?? [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const report = await httpJson<{ model_attestations?: { signing_address?: string }[]; gateway_attestation?: { signing_address?: string } }>({
      fetch: this.o.fetch, base: NEARAI_BASE, method: "GET", headers: this.h(),
      path: `/attestation/report?model=${encodeURIComponent(model)}&provider=near&signing_algo=ecdsa&nonce=${nonce}&include_tls_fingerprint=false`,
    });
    const modelAtt = report.json.model_attestations?.[0];
    if (!modelAtt) throw new Error(`no model attestation for ${model}: refusing to send the document`);

    const content: unknown[] = [{ type: "text", text: `Document kind: ${i.kind}. Fields: ${i.fields.join(", ")}.${i.text ? `\n\n${i.text}` : ""}` }];
    if (i.imageDataUrl) content.push({ type: "image_url", image_url: { url: i.imageDataUrl } });
    const c = await httpJson<{ id: string; choices: { message: { content: string } }[] }>({
      fetch: this.o.fetch, base: NEARAI_BASE, method: "POST", path: "/chat/completions", headers: this.h(),
      body: { model, stream: false, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content }] },
    });
    const sig = await httpJson<{ text?: string; signature?: string; signing_address?: string; signature_kind?: string; error_code?: string }>({
      fetch: this.o.fetch, base: NEARAI_BASE, method: "GET", path: `/signature/${c.json.id}?signing_algo=ecdsa`, headers: this.h(),
    }).catch(() => null);

    const requestSha256 = await sha256Hex(c.requestText);
    const responseSha256 = await sha256Hex(c.responseText);
    const s = sig?.json;
    const bound = !!s && !s.error_code && s.signature_kind === "provider_tee"
      && s.text === `${model}:${requestSha256}:${responseSha256}`
      && (!modelAtt.signing_address || s.signing_address?.toLowerCase() === modelAtt.signing_address.toLowerCase());
    const record: ReadRecord = {
      model, nonce, signingAddress: modelAtt.signing_address ?? null, completionId: c.json.id, requestSha256, responseSha256,
      signatureText: s?.text ?? null, signature: s?.signature ?? null, signatureKind: s?.signature_kind ?? null, bound,
    };
    let fields: T;
    try { fields = JSON.parse(c.json.choices[0].message.content) as T; } catch { throw new Error("model reply was not JSON"); }
    await this.o.sink({ kind: "attestation", label: i.label, call: "POST /v1/chat/completions (NEAR AI Cloud)", codePath: `${PATH}#read`, network: "offchain", hash: await proofHash(c.requestText, c.responseText), response: { record, fields }, replay: false, synthetic: false });
    return { fields, record };
  }
}
