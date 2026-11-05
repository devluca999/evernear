// Approvals over the cap through OutLayer custody multisig (testnet).
// OutLayer approvals carry a vote count only, so "auto approve under $10K" is routed in code:
// the engine decides how many approvals an order needs (engine/policy.ts) and an order that
// needs them is sent through the multisig wallet. See docs/MORNING.md, design questions.
import { httpJson, outlayerBase, proofHash, type Fetch, type ProofSink } from "./http";

const PATH = "convex/near/approval.ts";

export interface PendingApproval { approval_id: string; type: string; op: unknown; request_hash: string; required: number; approved: number; expires_at?: string }

/** The exact NEP-413 message an approver signs. */
export const approvalMessage = (approvalId: string, walletPubkey: string, requestHash: string) =>
  `approve:${approvalId}:${walletPubkey}:${requestHash}`;

export class Approvals {
  constructor(private o: { fetch: Fetch; apiKey?: string; sink: ProofSink }) {}
  private base = outlayerBase();

  async pending(): Promise<PendingApproval[]> {
    if (!this.o.apiKey) throw new Error("OUTLAYER_API_KEY not configured");
    const r = await httpJson<{ approvals?: PendingApproval[] } | PendingApproval[]>({ fetch: this.o.fetch, base: this.base, method: "GET", path: "/wallet/v1/pending_approvals", headers: { Authorization: `Bearer ${this.o.apiKey}` } });
    return Array.isArray(r.json) ? r.json : r.json.approvals ?? [];
  }

  /** Submit a vote signed on the approver's own device. No API key: the signature is the proof. */
  async submit(i: { approvalId: string; approver: string; signature: string; public_key: string; account_id: string; nonce: string }) {
    const r = await httpJson<{ approval_id: string; status: string; approved: number; required: number; request_id?: string }>({
      fetch: this.o.fetch, base: this.base, method: "POST", path: `/wallet/v1/approve/${i.approvalId}`,
      body: { signature: i.signature, public_key: i.public_key, account_id: i.account_id, nonce: i.nonce },
    });
    await this.o.sink({ kind: "approval", label: `Approval ${r.json.approved} of ${r.json.required}: ${i.approver}`, call: `POST /wallet/v1/approve/${i.approvalId}`, codePath: `${PATH}#submit`, network: "testnet", hash: await proofHash(r.requestText, r.responseText), response: r.json, replay: false, synthetic: false });
    return r.json;
  }
}
