// Scene lengths in frames (30 fps) for the newer compositions. Import-free so test/timing.spec.mjs
// can check the total lengths without bundling.

export const FPS = 30;

/** Total frames of a TransitionSeries: sum of scenes minus one overlap per transition. */
export const seriesFrames = (scenes: Record<string, number>, overlap: number): number => {
  const v = Object.values(scenes);
  return v.reduce((a, b) => a + b, 0) - Math.max(0, v.length - 1) * overlap;
};

export const PARTIAL_T = 12;
export const PARTIAL_SCENES = {
  hook: 150,
  binary: 165,
  milestones: 195,
  dock: 180,
  comparison: 180,
  receipts: 300,
  payoff: 150,
} as const;
export const PARTIAL_FRAMES = seriesFrames(PARTIAL_SCENES, PARTIAL_T);

export const JUDGE_DEMO_T = 15;
export const JUDGE_DEMO_SCENES = {
  // Act 1 · problem
  hook: 180,
  problem: 330,
  // Act 2 · agent autonomy
  po: 300,
  autonomy: 450,
  // Act 3 · financial authorization
  zeroApprovals: 300,
  oneApproval: 270,
  twoSignatures: 270,
  commit: 330,
  // Act 4 · advance
  milestones: 240,
  advance: 330,
  // Act 5 · dock count and recomputation
  dock: 360,
  // Act 6 · balance, return, reconciliation
  balance: 300,
  returned: 300,
  reconciliation: 330,
  // Act 7 · adversarial
  grantRefusal: 330,
  destinationRefusal: 300,
  gateV2: 360,
  // Act 8 · independent verification
  verify: 450,
  trust: 450,
  end: 240,
} as const;
export const JUDGE_DEMO_FRAMES = seriesFrames(JUDGE_DEMO_SCENES, JUDGE_DEMO_T);
