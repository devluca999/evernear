// Simulated: the suppliers. Each reply is sent to the real inbound email path
// (convex/channels/email.ts). The negotiation is not canned: Haoyun sends the +2.5% revision
// only if the agent's counter stayed within the 3% limit.
import { checkPriceChange } from "../engine/policy";
import { PO, policy } from "../seed/astro";
import type { InboundEmail } from "../convex/channels/email";

export const MAILBOX: Record<string, string> = {
  ultra: "orders@ultra-motion.example",
  haoyun: "sales@haoyun-precision.example",
  kansai: "export@kansai-servo.example",
  rheinwerk: "vertrieb@rheinwerk-antrieb.example",
  huaxin: "bd@huaxin-robotics.example",
};

const offer = (unit: string, specs: Record<string, string>) =>
  [`Unit price: USD ${unit}`, ...Object.entries(specs).map(([k, v]) => `spec.${k}: ${v}`)].join("\n");

/** Opening quotes, readable by the engine's readDocument. */
export const quotes: Record<string, InboundEmail> = {
  haoyun: { id: "q-haoyun", from: MAILBOX.haoyun, subject: "Quote: actuator motor", text: "Our quote for 2,000 units.\n" + offer("18.54", { shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" }) },
  kansai: { id: "q-kansai", from: MAILBOX.kansai, subject: "Quote: servo motor", text: "Our quote.\n" + offer("17.20", { shaftDiameter: "8 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" }) },
  rheinwerk: { id: "q-rheinwerk", from: MAILBOX.rheinwerk, subject: "Angebot: Stellmotor", text: "Our quote.\n" + offer("45.84", { shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" }) },
};

export const ultraOut: InboundEmail = { id: "ultra-out", from: MAILBOX.ultra, subject: "Re: Actuator motor availability", text: "Our actuator motor line is down for retooling. Earliest restart is 6 weeks out." };

export const haoyunConfirmation: InboundEmail = {
  id: "haoyun-confirm", from: MAILBOX.haoyun, subject: "PO 1042 confirmation",
  text: `We confirm PO ${PO.number} for 2,000 units. Due to copper costs the unit price is now USD 20.02.`,
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
    return { id: "haoyun-revised", from: MAILBOX.haoyun, subject: "Re: PO 1042 confirmation", text: `Revised: we confirm PO ${PO.number} at USD ${(PO.revisedUnitCents / 100).toFixed(2)} per unit.` };
  }
  return { id: "haoyun-hold", from: MAILBOX.haoyun, subject: "Re: PO 1042 confirmation", text: `We confirm PO ${PO.number} and our price change stands at USD 20.02 per unit.` };
}

/** Post a simulated supplier reply to the real inbound endpoint. */
export async function deliver(email: InboundEmail, o: { endpoint: string; secret: string; fetch?: typeof fetch }) {
  const r = await (o.fetch ?? fetch)(o.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Secret": o.secret }, body: JSON.stringify(email) });
  return r.status;
}
