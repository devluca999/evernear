// All money is integer US cents. Floats never touch an amount.

export const cents = (dollars: number): number => Math.round(dollars * 100);

export function formatUsd(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}

/** Mainnet finale runs at 1:10,000 of the story amounts. */
export const FINALE_SCALE = 10_000;
export const scaleFinale = (c: number): number => Math.round(c / FINALE_SCALE);
