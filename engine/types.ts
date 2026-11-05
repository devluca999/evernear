export type Specs = Record<string, string>;

export interface BomLine {
  id: string;
  product: string;
  part: string;
  qty: number;
  specs: Specs;
}

export interface Supplier {
  id: string;
  name: string;
  city: string;
  country: string;
  /** On Astro's vetted list. */
  approved: boolean;
  /** No order history with Astro yet. */
  isNew: boolean;
  receiveChain: string;
  receiveAddress: string;
}

export interface Offer {
  supplierId: string;
  part: string;
  unitCents: number;
  specs: Specs;
}

export interface Policy {
  /** Orders under this total from a known supplier need no human. */
  autoApproveUnderCents: number;
  /** Approvals needed over the cap or for a new supplier. */
  approversRequired: number;
  /** Largest allowed price change, in basis points (300 = 3%). */
  priceChangeLimitBps: number;
  /** Per-part unit price caps. */
  priceCaps: Record<string, number>;
}

export interface Mismatch {
  line: string;
  spec: string;
  required: string;
  offered: string;
}

export type PolicyFailure = "not_approved" | "over_price_cap";

export interface FitmentResult {
  supplierId: string;
  pass: boolean;
  mismatches: Mismatch[];
  policyFailures: PolicyFailure[];
  linesOffered: number;
  /** Offer price over the cap for a capped part, one decimal. Null when no capped part is offered. */
  priceCapMultiple: number | null;
}

export interface ReceiptMatch {
  releaseCents: number;
  holdCents: number;
  acceptedQty: number;
}

export type ReplyKind = "quoted" | "confirmed" | "price_change";

export type DocumentRead =
  | { kind: "packing_slip"; po: string | null; quantity: number | null; ordered: number | null }
  | { kind: "offer"; unitCents: number | null; specs: Specs }
  | { kind: "invoice"; po: string | null; totalCents: number | null };

export type DocumentInput = { kind: DocumentRead["kind"]; text: string };

/** The reference engine. Deterministic: amounts and thresholds are computed here only. */
export interface Engine {
  readDocument(doc: DocumentInput): DocumentRead;
  scoreFitment(bom: BomLine[], offers: Offer[], supplier: Supplier, policy: Policy): FitmentResult;
  matchReceipt(input: { orderedQty: number; receivedQty: number; unitCents: number }): ReceiptMatch;
  classifyReply(text: string): ReplyKind;
}
