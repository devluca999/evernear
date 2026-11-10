// The story's own clock for the Money card's badges in Short mode. The deal starts on day 1, 3 Nov
// (the dock count is day 9, 11 Nov); the commit follows Jordan's approval on the phone, the advance
// goes as the motors depart Shenzhen, the balance is paid at the dock. All from the script and the
// shipment's checkpoints, so the badges agree with the tracking card and the approvals on screen.
// The drawer keeps the real timestamps of the recorded testnet run.
import { CHECKPOINTS } from "./shipment";
import { scenes } from "./scenes";

/** Day 1 of the story, as a UTC date. */
export const DAY_ONE_UTC = Date.UTC(2026, 10, 3);

/** "7 Nov" for story day 5. */
export function storyDay(day: number): string {
  return new Date(DAY_ONE_UTC + (day - 1) * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The second approval's time in the script: the commit follows it. */
const lastApproval = (() => {
  const times = scenes.flatMap((sc) => sc.beats.map((b) => b[1])).filter((e) => e.type === "approval" && e.scope !== "limit") as { time: string }[];
  return times.at(-1)!.time;
})();

/** The badges' dates: committed on day 1 after the approvals, advance at departure, paid at the dock. */
export const STORY_STAMPS = {
  committed: `${storyDay(1)} ${lastApproval}`,
  advance: `${storyDay(CHECKPOINTS.departed.day)} ${CHECKPOINTS.departed.time}`,
  paid: `${storyDay(CHECKPOINTS.dock.day)} ${CHECKPOINTS.dock.time}`,
};
