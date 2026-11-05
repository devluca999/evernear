// Simulated: Astro's customers. Orders for the 10MA arrive over the bottleneck scene.
import { demand as seed } from "../seed/astro";

export interface CustomerOrder { atMs: number; customer: string; robots: number }

export const orders: CustomerOrder[] = [
  { atMs: 500, customer: "Lakeview Restaurant Group", robots: 3 },
  { atMs: 1200, customer: "St. Brigid Hospital", robots: 2 },
  { atMs: 1800, customer: "Calumet Logistics warehouse", robots: 5 },
  { atMs: 2400, customer: "Lakeview Restaurant Group", robots: 1 },
  { atMs: 3000, customer: "St. Brigid Hospital", robots: 3 },
];

export function demandAt(ms: number) {
  const robots = orders.filter((o) => o.atMs <= ms).reduce((a, o) => a + o.robots, 0);
  const motorsNeeded = robots * seed.motorsPerRobot;
  const robotsCovered = Math.floor(seed.motorsOnHand / seed.motorsPerRobot);
  return { robots, motorsNeeded, motorsOnHand: seed.motorsOnHand, robotsCovered, short: motorsNeeded > seed.motorsOnHand };
}
