// Signed dock counts. The receiving clerk signs {po, count, time, device} on the dock device
// (/dock page, engine/attestation.ts signDockCount); the server keeps it only if the device is
// pinned in DOCK_DEVICE_KEYS and the signature checks. The live balance (convex/live.ts) is then
// computed from the latest signed count for the PO instead of the scenario's fixed 44.
// A signature shows which pinned device reported the count; it does not prove the count is true.
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { parseDockDevices, verifyDockCount } from "../engine/attestation";

const attestationArg = v.object({ po: v.string(), agentId: v.string(), count: v.number(), at: v.string(), device: v.string(), publicKey: v.string(), signature: v.string() });

/** Whether dock devices are pinned on this deployment, and their names (for the /dock page). */
export const devices = query({
  args: {},
  handler: async () => parseDockDevices(process.env.DOCK_DEVICE_KEYS).map((d) => d.device),
});

export const submit = mutation({
  args: { attestation: attestationArg },
  handler: async (ctx, { attestation: a }): Promise<{ ok: boolean; reason?: string }> => {
    const devices = parseDockDevices(process.env.DOCK_DEVICE_KEYS);
    if (!devices.length) return { ok: false, reason: "devices_not_configured" };
    const v1 = verifyDockCount(a, { po: a.po, devices, nowMs: Date.now() });
    if (!v1.ok) return { ok: false, reason: v1.reason };
    // A signature is accepted once: the same signed count submitted again is a replay.
    const seen = await ctx.db.query("dockCounts").withIndex("by_po", (q) => q.eq("po", a.po)).collect();
    if (seen.some((x) => x.signature === a.signature)) return { ok: false, reason: "replayed" };
    await ctx.db.insert("dockCounts", { ...a, receivedAt: Date.now() });
    return { ok: true };
  },
});

/** The order wallet a dock count is signed for: the open (not settled) escrow of this PO. For the /dock page and scripts/dock-sign.mts. */
export const openOrder = query({
  args: { po: v.string() },
  handler: async (ctx, { po }) => {
    const rows = await ctx.db.query("escrows").withIndex("by_po", (q) => q.eq("po", po)).collect();
    const open = rows.filter((e) => !e.closed && e.lockedCents - e.releasedCents - e.reclaimedCents > 0).at(-1);
    return open ? { agentId: open.agentId } : null;
  },
});

/** The latest count signed for this PO and this order's wallet, signed (by the device's own clock) and received after `since`, or null. */
export const latest = internalQuery({
  args: { po: v.string(), agentId: v.string(), since: v.number() },
  handler: async (ctx, { po, agentId, since }) => {
    const rows = await ctx.db.query("dockCounts").withIndex("by_po", (q) => q.eq("po", po).gt("receivedAt", since)).order("desc").take(20);
    const row = rows.find((r) => r.agentId === agentId && Date.parse(r.at) >= since);
    if (!row) return null;
    return { po: row.po, agentId, count: row.count, at: row.at, device: row.device, publicKey: row.publicKey, signature: row.signature };
  },
});
