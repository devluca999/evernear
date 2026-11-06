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
  /** The next step with a focus, and whether it was skipped. */
  upcoming: { step: string; id: string; zoom: number; skipped: boolean } | null;
}

export type RemoteCommand = { type: "cmd"; cmd: "next" | "preview" | "skip" | "full" | "camera" | "follow" | "hello" };

export function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PRESENT_CHANNEL);
}
