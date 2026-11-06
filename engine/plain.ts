import type { Engine, FitmentResult, Mismatch, PolicyFailure, ReplyKind, DocumentRead } from "./types";

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : null);

function field(text: string, label: RegExp): string | undefined {
  for (const line of text.split("\n")) {
    const m = line.match(label);
    if (m) return m[1].trim();
  }
  return undefined;
}

/** A deliberately plain engine: exact spec equality, simple arithmetic, keyword rules. */
export const plainEngine: Engine = {
  readDocument(doc): DocumentRead {
    const t = doc.text;
    if (doc.kind === "packing_slip") {
      return {
        kind: "packing_slip",
        po: field(t, /^\s*PO[^:]*:\s*(\S+)/i) ?? null,
        quantity: num(field(t, /quantity[^:]*:\s*([\d,]+)/i)),
        ordered: num(field(t, /ordered[^:]*:\s*([\d,]+)/i)),
      };
    }
    if (doc.kind === "invoice") {
      const total = field(t, /total[^:]*:\s*\$?\s*(?:USD\s*)?([\d,.]+)/i);
      return { kind: "invoice", po: field(t, /^\s*PO[^:]*:\s*(\S+)/i) ?? null, totalCents: total ? Math.round(Number(total.replace(/,/g, "")) * 100) : null };
    }
    const price = field(t, /unit price[^:]*:\s*\$?\s*(?:USD\s*)?([\d.]+)/i);
    const specs: Record<string, string> = {};
    for (const line of t.split("\n")) {
      const m = line.match(/^\s*spec\.(\w+):\s*(.+)$/i);
      if (m) specs[m[1]] = m[2].trim();
    }
    return { kind: "offer", unitCents: price ? Math.round(Number(price) * 100) : null, specs };
  },

  scoreFitment(bom, offers, supplier, policy, needBy): FitmentResult {
    const mismatches: Mismatch[] = [];
    const policyFailures: PolicyFailure[] = [];
    let priceCapMultiple: number | null = null;
    let linesOffered = 0;
    for (const offer of offers) {
      const line = bom.find((l) => l.part === offer.part);
      if (!line) continue;
      linesOffered++;
      for (const [spec, required] of Object.entries(line.specs)) {
        const offered = offer.specs[spec] ?? "missing";
        if (offered !== required) mismatches.push({ line: line.part, spec, required, offered });
      }
      const cap = policy.priceCaps[offer.part];
      if (cap !== undefined) {
        priceCapMultiple = Math.round((offer.unitCents / cap) * 10) / 10;
        if (offer.unitCents > cap && !policyFailures.includes("over_price_cap")) policyFailures.push("over_price_cap");
      }
      if (needBy && offer.arrives && offer.arrives > needBy && !policyFailures.includes("too_late")) policyFailures.push("too_late");
    }
    if (!supplier.approved) policyFailures.unshift("not_approved");
    return {
      supplierId: supplier.id,
      pass: mismatches.length === 0 && policyFailures.length === 0 && linesOffered > 0,
      mismatches, policyFailures, linesOffered, priceCapMultiple,
    };
  },

  matchReceipt({ orderedQty, receivedQty, unitCents }) {
    const acceptedQty = Math.max(0, Math.min(orderedQty, receivedQty));
    const releaseCents = acceptedQty * unitCents;
    return { acceptedQty, releaseCents, holdCents: orderedQty * unitCents - releaseCents };
  },

  classifyReply(text): ReplyKind {
    const t = text.toLowerCase();
    if (/(price (is )?now|price change|increase|revised price|is now usd|surcharge)/.test(t)) return "price_change";
    if (/\b(confirm|confirmed|accept|accepted|agreed)\b/.test(t)) return "confirmed";
    return "quoted";
  },
};
