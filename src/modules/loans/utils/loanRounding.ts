const DEFAULT_DECIMALS = 2;

export function moneyFactor(decimals = DEFAULT_DECIMALS): number {
  return 10 ** Math.max(0, Math.min(10, decimals));
}

export function roundMoney(value: number, decimals = DEFAULT_DECIMALS): number {
  if (!Number.isFinite(value)) return 0;
  const factor = moneyFactor(decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function toMinor(value: number, decimals = DEFAULT_DECIMALS): number {
  return Math.round(roundMoney(value, decimals) * moneyFactor(decimals));
}

export function fromMinor(minor: number, decimals = DEFAULT_DECIMALS): number {
  return roundMoney(minor / moneyFactor(decimals), decimals);
}

export function addMoney(...values: number[]): number {
  return roundMoney(values.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0));
}

export function clampNonNegative(value: number, decimals = DEFAULT_DECIMALS): number {
  return roundMoney(Math.max(0, value), decimals);
}

/** Split a total across parts, putting leftover cents on the last part. */
export function allocateRemainder(parts: number[], total: number, decimals = DEFAULT_DECIMALS): number[] {
  if (parts.length === 0) return [];
  const rounded = parts.map((p) => roundMoney(p, decimals));
  const sum = roundMoney(rounded.reduce((a, b) => a + b, 0), decimals);
  const next = [...rounded];
  next[next.length - 1] = roundMoney(next[next.length - 1] + (total - sum), decimals);
  return next;
}
