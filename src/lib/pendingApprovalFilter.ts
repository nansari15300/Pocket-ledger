/**
 * Account list "Unapproved" toggle: sirf un accounts jin par abhi approve na hua vouchers count > 0.
 */

/** pending map se filter — enabled false par poori list */
export function filterByPendingApproval<T extends { id: string }>(
  items: T[],
  pendingById: Record<string, number>,
  onlyUnapproved: boolean
): T[] {
  if (!onlyUnapproved) return items;
  return items.filter((x) => (pendingById[x.id] ?? 0) > 0);
}
