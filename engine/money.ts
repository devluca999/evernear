// All money is integer US cents. Floats never touch an amount.

export const cents = (dollars: number): number => Math.round(dollars * 100);

export function formatUsd(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}

/** Testnet runs at 1:1,000 of the story amounts: the faucet drips 100 test USDC an hour,
 *  so $38,000 is committed as $38.00. The screen keeps the story amounts and labels the scale. */
export const TESTNET_SCALE = 1_000;
export const scaleTestnet = (c: number): number => Math.round(c / TESTNET_SCALE);


/** Whole dollars when there are no cents: $38,000 rather than $38,000.00. */
export function formatUsdShort(c: number): string {
  const full = formatUsd(c);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

export const formatInt = (n: number): string => n.toLocaleString("en-US");
