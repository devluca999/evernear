// The presenter remote (/present) and the workspace talk over a BroadcastChannel: same browser,
// any tab or window, nothing leaves the machine. The workspace sends its state; the remote sends commands.
export const PRESENT_CHANNEL = "evernear.present";

export interface RemoteState {
  type: "state";
  scenario: string;
  chapter: number;
  chapterTitle: string;
  chapters: number;
  /** What the next press does. */
  next: string | null;
  /** Where the camera is now. */
  camera: { on: boolean; follow: boolean; mode: string; focusId: string | null; zoom: number };
  /** Short mode: where the run is. */
  short?: ShortInfo | null;
  /** The next step with a focus, and whether it was skipped. */
  upcoming: { step: string; id: string; zoom: number; skipped: boolean } | null;
}

/** Short mode's run: the section on screen (0 for the hook), its time left, and the next section. */
export interface ShortInfo {
  section: number; sections: number;
  /** The section's name; null on the starting view. */
  title: string | null;
  next: string | null;
  playing: boolean; started: boolean; finished: boolean;
  /** Seconds left in the section (or the hook). The remote shows it; the recorded screen never does. */
  leftSec: number;
}

export type RemoteCommand = { type: "cmd"; cmd: "next" | "preview" | "skip" | "full" | "camera" | "follow" | "cursor" | "hello" };

export function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PRESENT_CHANNEL);
}
