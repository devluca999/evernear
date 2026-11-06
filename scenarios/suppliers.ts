// Simulated: the suppliers. Each reply is sent to the real inbound email path
// (convex/channels/email.ts). The negotiation is not canned: Haoyun and QuickShip both open at a
// +10% urgent fee; Haoyun sends its +5% all-50 offer only if the agent's counter stayed within the
// 5% ceiling. QuickShip answers any counter with part now at +10%, the rest late, and a discount.
import { checkPriceChange } from "../engine/policy";
import { MOTOR_BASE_CENTS, PO, policy, quickshipOffer } from "../seed/astro";
import type { InboundEmail } from "../convex/channels/email";

export const MAILBOX: Record<string, string> = {
  ultra: "orders@ultra-motion.example",
  haoyun: "sales@haoyun-precision.example",
  quickship: "orders@quickship-motion.example",
  kansai: "export@kansai-servo.example",
  rheinwerk: "vertrieb@rheinwerk-antrieb.example",
  huaxin: "bd@huaxin-robotics.example",
};

const offer = (unit: string, specs: Record<string, string>) =>
  [`Unit price: USD ${unit}`, ...Object.entries(specs).map(([k, v]) => `spec.${k}: ${v}`)].join("\n");

/** Opening quotes, readable by the engine's readDocument. */
const usd = (cents: number) => (cents / 100).toFixed(2);
const FITS = { shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" };
export const quotes: Record<string, InboundEmail> = {
  haoyun: { id: "q-haoyun", from: MAILBOX.haoyun, subject: "Quote: AM-17 actuator motor", text: `Our quote for ${PO.quantity} units, all by Dec 14, urgent fee included.\n` + offer(usd(PO.confirmedUnitCents), FITS) },
  quickship: { id: "q-quickship", from: MAILBOX.quickship, subject: "Quote: AM-17 actuator motor", text: `Fast shipping. Our quote for ${PO.quantity} units, urgent fee included.\n` + offer(usd(quickshipOffer.unitCents), FITS) },
  kansai: { id: "q-kansai", from: MAILBOX.kansai, subject: "Quote: servo motor", text: "Our quote. Earliest delivery 22 Dec.\n" + offer("1180.00", FITS) },
  rheinwerk: { id: "q-rheinwerk", from: MAILBOX.rheinwerk, subject: "Angebot: Stellmotor", text: "Our quote.\n" + offer("3024.00", FITS) },
};

export const ultraOut: InboundEmail = { id: "ultra-out", from: MAILBOX.ultra, subject: "Re: Actuator motor availability", text: "Our actuator motor line is down for retooling. Earliest restart is 6 weeks out." };

export const haoyunConfirmation: InboundEmail = {
  id: "haoyun-confirm", from: MAILBOX.haoyun, subject: "PO 1042 quote",
  text: `For PO ${PO.number}, ${PO.quantity} units by Dec 14: with the urgent fee the unit price is now USD ${usd(PO.confirmedUnitCents)}.`,
};

/** The price the agent proposed, read from its own email. */
export function counterPriceCents(body: string): number | null {
  const m = body.match(/USD\s*([\d]+\.\d{2})/i);
  return m ? Math.round(Number(m[1]) * 100) : null;
}

/** Haoyun's answer to the agent's counter. */
export function haoyunReplyTo(agentEmail: { to: string; body: string }): InboundEmail | null {
  if (agentEmail.to.toLowerCase() !== MAILBOX.haoyun) return null;
  const counter = counterPriceCents(agentEmail.body);
  const within = counter !== null && checkPriceChange(PO.originalUnitCents, counter, policy.priceChangeLimitBps).pass;
  if (within) {
    return { id: "haoyun-revised", from: MAILBOX.haoyun, subject: "Re: PO 1042 quote", text: `Agreed: all ${PO.quantity} by Dec 14 at USD ${usd(PO.revisedUnitCents)} per unit for PO ${PO.number}.` };
  }
  return { id: "haoyun-hold", from: MAILBOX.haoyun, subject: "Re: PO 1042 quote", text: `For PO ${PO.number} our urgent fee stands at USD ${usd(PO.confirmedUnitCents)} per unit.` };
}

/** QuickShip's answer to any counter: part now at +10%, the rest after Dec 14, and a discount next time. */
export function quickshipReplyTo(agentEmail: { to: string; body: string }): InboundEmail | null {
  if (agentEmail.to.toLowerCase() !== MAILBOX.quickship) return null;
  return {
    id: "quickship-final", from: MAILBOX.quickship, subject: "Re: AM-17 quote",
    text: `We can ship ${quickshipOffer.nowQty} now at USD ${usd(quickshipOffer.unitCents)} per unit and the other ${quickshipOffer.laterQty} after Dec 14, with ${quickshipOffer.nextOrderDiscountPercent}% off your next order.`,
  };
}

/** QuickShip's final price against the ceiling: over it, so it needs an exception. */
export const quickshipOverCeiling = () => !checkPriceChange(MOTOR_BASE_CENTS, quickshipOffer.unitCents, policy.priceChangeLimitBps).pass;

/** Post a simulated supplier reply to the real inbound endpoint. */
export async function deliver(email: InboundEmail, o: { endpoint: string; secret: string; fetch?: typeof fetch }) {
  const r = await (o.fetch ?? fetch)(o.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Secret": o.secret }, body: JSON.stringify(email) });
  return r.status;
}
