// Supplier email out through the OutLayer Gmail connector (testnet).
// The connector has no Reply-To field, so replies are routed by the demo domain mailbox
// the connected account forwards from. See docs/MORNING.md, design questions.
// Recipients are checked here against the allowlist before any call, and the connector's
// owner policy (recipients) refuses again inside OutLayer.
import { httpJson, outlayerBase, proofHash, type Fetch, type ProofSink } from "./http";

const PATH = "convex/near/gmail.ts";
export const GMAIL_PROJECT = "/call/connectors.outlayer.testnet/gmail";

export function gmailOwnerPolicy(recipients: string[]) {
  return { recipients, max_per_day: 50, max_recipients: 1, subject_prefix: "PO " };
}

export function allowed(to: string, allowlist: string[]) {
  return allowlist.map((a) => a.toLowerCase()).includes(to.trim().toLowerCase());
}

export class Gmail {
  constructor(private o: { fetch: Fetch; paymentKey?: string; ownerAccount?: string; walletId?: string; allowlist: string[]; sink: ProofSink }) {}

  async send(m: { to: string; subject: string; body: string }) {
    if (!allowed(m.to, this.o.allowlist)) {
      await this.o.sink({ kind: "refusal", label: "Email to an off list address refused", call: "gmail send (allowlist)", codePath: `${PATH}#send`, network: "testnet", hash: "none", response: { to: m.to, status: "refused", reason: "recipient not on allowlist" }, replay: false, synthetic: false });
      return { ok: false as const, reason: "recipient_not_allowed" };
    }
    if (!this.o.paymentKey || !this.o.ownerAccount) throw new Error("OUTLAYER_PAYMENT_KEY or OUTLAYER_OWNER_ACCOUNT not configured");
    const r = await httpJson<{ call_id: string; status: string; output?: { success: boolean; error?: string }; attestation_url?: string }>({
      fetch: this.o.fetch, base: outlayerBase(), method: "POST", path: GMAIL_PROJECT,
      headers: { "X-Payment-Key": this.o.paymentKey, ...(this.o.walletId ? { "X-Wallet-Id": this.o.walletId } : {}) },
      body: { input: { operation: "send", to: m.to, subject: m.subject, body: m.body }, secrets_ref: { account_id: this.o.ownerAccount, profile: "gmail" }, async: false },
    });
    const ok = r.json.status === "completed" && r.json.output?.success === true;
    await this.o.sink({
      kind: ok ? "connector_receipt" : "refusal", label: ok ? `Email sent to ${m.to}` : `Connector refused: ${r.json.output?.error ?? r.json.status}`,
      call: `POST ${GMAIL_PROJECT} send`, codePath: `${PATH}#send`, network: "testnet",
      hash: await proofHash(r.requestText, r.responseText), explorerUrl: r.json.attestation_url, response: r.json, replay: false, synthetic: false,
    });
    return ok ? { ok: true as const, callId: r.json.call_id } : { ok: false as const, reason: r.json.output?.error ?? r.json.status };
  }
}
