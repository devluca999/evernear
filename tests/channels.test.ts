// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it, beforeEach } from "vitest";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { haoyunReplyTo, haoyunConfirmation, quotes, deliver, ultraOut } from "@/scenarios/suppliers";
import { demandAt } from "@/scenarios/demand";
import { plainEngine } from "@/engine/plain";
import { readingFor } from "@/convex/channels/email";

const modules = import.meta.glob("../convex/**/*.ts");

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tg-secret";
  process.env.INBOUND_EMAIL_SECRET = "mail-secret";
  delete process.env.TELEGRAM_BUYER_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

const dm = (id: number, text: string, type = "private") => ({ update_id: id, message: { message_id: id, chat: { id: 77, type }, from: { first_name: "Luca" }, text } });

describe("Telegram Stockbot", () => {
  it("refuses an update without the webhook secret", async () => {
    const t = convexTest(schema, modules);
    const r = await t.fetch("/telegram/webhook", { method: "POST", body: JSON.stringify(dm(1, "hi")), headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" } });
    expect(r.status).toBe(403);
    expect(await t.query(api.messages.recent, { channel: "telegram" })).toHaveLength(0);
  });
  it("ignores group chats", async () => {
    const t = convexTest(schema, modules);
    const r = await t.fetch("/telegram/webhook", { method: "POST", body: JSON.stringify(dm(2, "hi", "group")), headers: { "X-Telegram-Bot-Api-Secret-Token": "tg-secret" } });
    expect(r.status).toBe(200);
    expect(await t.query(api.messages.recent, { channel: "telegram" })).toHaveLength(0);
  });
  it("shows a DM on the virtual phone within 1 s, once", async () => {
    const t = convexTest(schema, modules);
    const start = Date.now();
    for (let i = 0; i < 2; i++) {
      await t.fetch("/telegram/webhook", { method: "POST", body: JSON.stringify(dm(3, "Up to 3%")), headers: { "X-Telegram-Bot-Api-Secret-Token": "tg-secret" } });
    }
    const msgs = await t.query(api.messages.recent, { channel: "telegram" });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(msgs.map((m) => m.text)).toEqual(["Up to 3%"]);
  });
});

describe("inbound supplier email", () => {
  const post = (t: ReturnType<typeof convexTest>, secret: string) => (_url: string, init?: RequestInit) => t.fetch("/email/inbound", { ...init, headers: { ...(init?.headers as Record<string, string>), "X-Inbound-Secret": secret } });
  it("refuses a post without the shared secret", async () => {
    const t = convexTest(schema, modules);
    expect(await deliver(ultraOut, { endpoint: "/email/inbound", secret: "nope", fetch: post(t, "nope") as typeof fetch })).toBe(403);
  });
  it("stores the reply with the agent's reading", async () => {
    const t = convexTest(schema, modules);
    expect(await deliver(haoyunConfirmation, { endpoint: "/email/inbound", secret: "mail-secret", fetch: post(t, "mail-secret") as typeof fetch })).toBe(200);
    const [m] = await t.query(api.messages.recent, { channel: "email" });
    expect(m.reading).toBe("Price change: +8%, over the 3% limit.");
  });
});

describe("supplier simulator", () => {
  it("sends the +2.5% revision only when the agent's counter is within 3%", () => {
    const ok = haoyunReplyTo({ to: "sales@haoyun-precision.example", body: "We can accept up to USD 19.00 per unit." })!;
    expect(ok.text).toContain("USD 19.00");
    expect(readingFor(ok.text)).toBe("Confirmed at +2.5%, inside the limit.");
    const over = haoyunReplyTo({ to: "sales@haoyun-precision.example", body: "We can accept USD 19.28 per unit." })!;
    expect(over.text).toContain("USD 20.02");
    expect(haoyunReplyTo({ to: "other@x.example", body: "USD 19.00" })).toBeNull();
  });
  it("sends quotes the engine can read", () => {
    const d = plainEngine.readDocument({ kind: "offer", text: quotes.kansai.text });
    expect(d).toMatchObject({ kind: "offer", unitCents: 1720, specs: { shaftDiameter: "8 mm" } });
  });
});

describe("demand simulator", () => {
  it("reaches 14 robots ordered, motors for 6", () => {
    expect(demandAt(5000)).toMatchObject({ robots: 14, robotsCovered: 6, short: true });
  });
});
