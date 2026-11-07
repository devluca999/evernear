const SPEC_LABEL: Record<string, string> = {
  shaftDiameter: "Shaft",
  mountingFlange: "Flange",
  voltage: "Voltage",
  encoderConnector: "Connector",
  connector: "Connector",
};

export const specLabel = (spec: string) => SPEC_LABEL[spec] ?? spec;

/** "Shaft 8 mm, needs 6 mm" */
export const mismatchText = (m: { spec: string; offered: string; required: string; line?: string }) => {
  const label = m.line === "Battery pack" && m.spec === "voltage" ? "Battery" : specLabel(m.spec);
  return `${label} ${m.offered}, needs ${m.required}`;
};

/** 300 -> "3%", 250 -> "2.5%", 798 -> "8%" (one decimal at most, trailing zero dropped). */
export const pct = (bps: number) => `${+(bps / 100).toFixed(1)}%`;

/**
 * How a supplier's search result reads on the map: it fits, it is close (a kit that covers most
 * of the BOM, or a motor that fits but the rules block), or it fails a motor spec outright.
 */
export function matchKind(f: { pass: boolean; mismatches: unknown[]; policyFailures: unknown[]; linesOffered: number }): "fits" | "partial" | "fails" {
  if (f.pass) return "fits";
  // Close: fits every spec and every rule, but cannot deliver in time.
  if (f.mismatches.length === 0 && f.policyFailures.length === 1 && f.policyFailures[0] === "too_late") return "partial";
  return "fails";
}

/** The one line of reasons beside a result. */
export function matchReason(f: { pass: boolean; mismatches: { spec: string; offered: string; required: string; line?: string }[]; policyFailures: string[]; linesOffered: number; priceCapMultiple: number | null }, bomLines: number): string {
  if (f.pass) return "Fits every spec, passes your rules, delivers before Dec 14";
  const rules = [f.policyFailures.includes("not_approved") && "not approved", f.policyFailures.includes("over_price_cap") && `${f.priceCapMultiple}x the price cap`].filter(Boolean).join(", ");
  if (f.mismatches.length === 0 && f.policyFailures.length === 1 && f.policyFailures[0] === "too_late") return "Fits every spec, but delivers after Dec 14";
  if (f.linesOffered > 1) return `Offers ${f.linesOffered} of ${bomLines} BOM lines; ${f.mismatches.length} fail: ${f.mismatches.map(mismatchText).join("; ")}`;
  if (f.mismatches.length === 0) return `Fits every spec, but ${rules}`;
  return f.mismatches.map(mismatchText).join("; ");
}

/** A pin's state on the search map: green fits, orange late, crimson fails. */
export type PinTag = "fits" | "late" | "missing parts" | "fails policy";

/** The one line under a supplier's pin while Stockbot compares (shorter than `matchReason`). */
export function pinReason(f: Parameters<typeof matchReason>[0], bomLines: number): { tag: PinTag; tone: "success" | "attention" | "alert"; text: string } {
  if (f.pass) return { tag: "fits", tone: "success", text: "Fits, on time by Dec 14" };
  if (matchKind(f) === "partial") return { tag: "late", tone: "attention", text: "Late, delivers after Dec 14" };
  if (f.mismatches.length > 0) {
    return { tag: "missing parts", tone: "alert", text: f.linesOffered > 1 ? `Missing parts: ${f.mismatches.length} of ${bomLines} BOM lines fail` : `Missing parts: ${f.mismatches.map(mismatchText).join("; ")}` };
  }
  const why = [f.policyFailures.includes("not_approved") && "not approved", f.policyFailures.includes("over_price_cap") && `${f.priceCapMultiple}x the price cap`].filter(Boolean).join(", ");
  return { tag: "fails policy", tone: "alert", text: `Fails policy: ${why || "outside your rules"}` };
}

/** "2 fit, 1 late, 2 fail" once every supplier is checked. */
export function searchSummary(fs: Parameters<typeof matchReason>[0][]): string {
  const fit = fs.filter((f) => f.pass).length, late = fs.filter((f) => matchKind(f) === "partial").length;
  return `${fit} fit, ${late} late, ${fs.length - fit - late} fail`;
}
