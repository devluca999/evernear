// Simulated: Astro's customers. Orders for the 10MA arrive over the bottleneck scene.
import { demand as seed } from "../seed/astro";

export interface CustomerOrder { atMs: number; customer: string; robots: number }

/** The three customers' orders (seed/astro.ts demand), arriving over the bottleneck scene: 500 robots in all. */
export const orders: CustomerOrder[] = seed.customers.map((c, i) => ({ atMs: 500 + i * 1000, customer: c.name, robots: c.robots }));

export function demandAt(ms: number) {
  const robots = orders.filter((o) => o.atMs <= ms).reduce((a, o) => a + o.robots, 0);
  const motorsNeeded = robots * seed.motorsPerRobot;
  const robotsCovered = Math.floor(seed.motorsOnHand / seed.motorsPerRobot);
  return { robots, motorsNeeded, motorsOnHand: seed.motorsOnHand, robotsCovered, short: motorsNeeded > seed.motorsOnHand };
}
