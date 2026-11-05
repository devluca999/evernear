// Estimated arrival in Chicago for an order placed now: each supplier's lead time before it can
// ship, then transit (air freight with customs, or road for Ultra Motion). Sample estimates for
// the demo, not quotes. Dates are UTC calendar days (YYYY-MM-DD).

export interface Lane { mode: "air" | "road"; leadDays: number; transitDays: number; mark: string }

export const LANES: Record<string, Lane> = {
  ultra: { mode: "road", leadDays: 42, transitDays: 1, mark: "UM" }, // retooling: out for 6 weeks
  haoyun: { mode: "air", leadDays: 5, transitDays: 4, mark: "HP" },
  kansai: { mode: "air", leadDays: 7, transitDays: 3, mark: "KS" },
  rheinwerk: { mode: "air", leadDays: 6, transitDays: 4, mark: "RA" },
  huaxin: { mode: "air", leadDays: 5, transitDays: 4, mark: "HR" },
};

const DAY = 86_400_000;
const toDay = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => isoDay(toDay(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toDay(b) - toDay(a)) / DAY);

/** The earliest day the supplier can ship an order placed on `orderDay`. */
export const earliestShip = (supplierId: string, orderDay: string) => addDays(orderDay, LANES[supplierId].leadDays);

/** Arrival for a chosen ship day. A ship day before the earliest one is moved up to it. */
export function eta(supplierId: string, orderDay: string, shipDay?: string) {
  const lane = LANES[supplierId];
  const first = earliestShip(supplierId, orderDay);
  const ship = !shipDay || shipDay < first ? first : shipDay;
  const arrive = addDays(ship, lane.transitDays);
  return { ship, arrive, transitDays: lane.transitDays, totalDays: daysBetween(orderDay, arrive), movedUp: !!shipDay && shipDay < first, mode: lane.mode };
}
