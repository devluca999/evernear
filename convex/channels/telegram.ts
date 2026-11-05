// Stockbot on Telegram. DM only; every update must carry the webhook secret
// Telegram echoes in X-Telegram-Bot-Api-Secret-Token (set with setWebhook secret_token).
import { httpAction, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { safeEqual } from "./verify";

interface Update {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { first_name?: string }; text?: string; caption?: string; photo?: { file_id: string }[] };
}

export const webhook = httpAction(async (ctx, req) => {
  if (!safeEqual(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  const u = (await req.json()) as Update;
  const m = u.message;
  // Acknowledge everything else so Telegram does not retry, but store DMs only.
  if (!m || m.chat.type !== "private") return new Response("ignored", { status: 200 });
  const buyer = process.env.TELEGRAM_BUYER_CHAT_ID;
  if (buyer && String(m.chat.id) !== buyer) return new Response("ignored", { status: 200 });
  await ctx.runMutation(internal.messages.insert, {
    channel: "telegram", direction: "in", from: m.from?.first_name ?? "Buyer",
    text: m.text ?? m.caption ?? "", photo: m.photo?.at(-1)?.file_id, externalId: String(u.update_id),
  });
  return new Response("ok", { status: 200 });
});

/** Stockbot speaks: send on Telegram and mirror it to the virtual phone. */
export const send = internalAction({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_BUYER_CHAT_ID;
    let externalId: string | undefined;
    if (token && chat) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }),
      });
      const j = (await r.json()) as { ok: boolean; result?: { message_id: number } };
      if (j.ok && j.result) externalId = `out-${j.result.message_id}`;
    }
    await ctx.runMutation(internal.messages.insert, { channel: "telegram", direction: "out", from: "Stockbot", text, externalId });
  },
});
