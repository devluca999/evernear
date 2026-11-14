import { useCurrentFrame } from "remotion";
import { useIsSettled } from "./ui";

/** Local frame, or "long after everything has entered" when rendering a settled still. */
export const useT = (delay = 0): number => {
  const frame = useCurrentFrame();
  return useIsSettled() ? 100_000 : frame - delay;
};
