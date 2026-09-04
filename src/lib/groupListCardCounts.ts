/** Subtitle under group name — e.g. `Groups 10 & Accounts 4`. */
export function formatGroupListCardCountSubtitle(
  groupCount: number,
  accountCount: number
): string | null {
  const groups = Math.max(0, Number(groupCount) || 0);
  const accounts = Math.max(0, Number(accountCount) || 0);
  if (groups === 0 && accounts === 0) return null;
  if (groups > 0 && accounts > 0) return `Groups ${groups} & Accounts ${accounts}`;
  if (groups > 0) return `Groups ${groups}`;
  return `Accounts ${accounts}`;
}
