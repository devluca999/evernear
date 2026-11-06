// Supplier email in: the inbound provider posts each message here as JSON.
// The shared secret must match INBOUND_EMAIL_SECRET. The engine sorts each reply.
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { safeEqual } from "./verify";
import { plainEngine } from "../../engine/plain";
import { checkPriceChange } from "../../engine/policy";
import { PO, policy } from "../../seed/astro";

export interface InboundEmail { id?: string; from: string; to?: string; subject?: string; text: string }

/** The agent's reading of a supplier reply. Deterministic: keywords and the price rule. */
export function readingFor(text: string): string {
  const kind = plainEngine.classifyReply(text);
  const price = text.match(/USD\s*(\d+(?:\.\d+)?)/i);
  if (price) {
    const unit = Math.round(Number(price[1]) * 100);
    const c = checkPriceChange(PO.originalUnitCents, unit, policy.priceChangeLimitBps);
    const pctText = `${c.bps >= 0 ? "+" : ""}${(c.bps / 100).toFixed(1).replace(/\.0$/, "")}%`;
    const over = `over the ${policy.priceChangeLimitBps / 100}% limit`;
    if (kind === "price_change") return c.pass ? `Price change: ${pctText}, inside the limit.` : `Price change: ${pctText}, ${over}.`;
    if (kind === "confirmed") return c.pass ? `Confirmed at ${pctText}, inside the limit.` : `Confirmed at ${pctText}, ${over}.`;
  }
  return kind === "quoted" ? "Quote received." : kind === "confirmed" ? "Confirmed." : "Price change.";
}

export const inbound = httpAction(async (ctx, req) => {
  const given = req.headers.get("X-Inbound-Secret") ?? req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!safeEqual(given, process.env.INBOUND_EMAIL_SECRET)) return new Response("forbidden", { status: 403 });
  const m = (await req.json()) as InboundEmail;
  if (!m.from || typeof m.text !== "string") return new Response("bad request", { status: 400 });
  await ctx.runMutation(internal.messages.insert, {
    channel: "email", direction: "in", from: m.from, to: m.to, subject: m.subject, text: m.text,
    reading: readingFor(m.text), externalId: m.id,
  });
  return new Response("ok", { status: 200 });
});
