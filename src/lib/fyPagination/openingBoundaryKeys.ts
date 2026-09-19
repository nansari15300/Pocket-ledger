/** Point-in-time opening snapshot key — `fySnapshots/month_ob_{beforeMs}`. */
export function openingBoundaryPeriodKey(beforeMs: number): string {
  const ms = Math.floor(Number(beforeMs) || 0);
  return `ob_${ms}`;
}

export function isOpeningBoundaryPeriodKey(key: string | null | undefined): boolean {
  return Boolean(key && /^ob_\d+$/.test(key));
}

export function beforeMsFromOpeningBoundaryKey(key: string | null | undefined): number | null {
  const raw = String(key || "").trim();
  const match = /^ob_(\d+)$/.exec(raw);
  if (!match) return null;
  const ms = Number(match[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
