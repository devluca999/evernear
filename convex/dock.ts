// Signed dock counts. The receiving clerk signs {po, count, time, device} on the dock device
// (/dock page, engine/attestation.ts signDockCount); the server keeps it only if the device is
// pinned in DOCK_DEVICE_KEYS and the signature checks. The live balance (convex/live.ts) is then
// computed from the latest signed count for the PO instead of the scenario's fixed 44.
// A signature shows which pinned device reported the count; it does not prove the count is true.
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { parseDockDevices, verifyDockCount } from "../engine/attestation";

const attestationArg = v.object({ po: v.string(), count: v.number(), at: v.string(), device: v.string(), publicKey: v.string(), signature: v.string() });

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

/** The latest signed count for a PO signed (by the device's own clock) and received after `since`, or null. An older count never carries into a new run. */
export const latest = internalQuery({
  args: { po: v.string(), since: v.number() },
  handler: async (ctx, { po, since }) => {
    const rows = await ctx.db.query("dockCounts").withIndex("by_po", (q) => q.eq("po", po).gt("receivedAt", since)).order("desc").take(20);
    const row = rows.find((r) => Date.parse(r.at) >= since);
    if (!row) return null;
    const { po: p, count, at, device, publicKey, signature } = row;
    return { po: p, count, at, device, publicKey, signature };
  },
});
