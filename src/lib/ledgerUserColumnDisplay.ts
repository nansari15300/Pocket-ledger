/**
 * Party / account statement "User" column helpers.
 * Recurring BS-month vouchers `userDisplayName: "Auto"` + `recurringMeta` save hote hain, par local Firestore
 * user-name fetch `userNames[uid]` ko asli naam se overwrite kar deta tha — display pe pehle auto-detect lagao.
 */

const BAD_USER_LIST_LABEL = new Set(["unknown", "n/a"]);

/** Khali / placeholder ko merge me "missing" maano taaki doosri source se naam aaye. */
export function isMeaningfulLedgerUserListLabel(s: string | undefined | null): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  return !BAD_USER_LIST_LABEL.has(t.toLowerCase());
}

/**
 * PartyDetails / GroupDetails: `useVouchers` se aaya `userNames` (voucher `userDisplayName` se "Auto" bhi) ko
 * `localFetchedUserNames` se upar rakho jab dono meaningful hon — warna pehle wala overwrite ho jata tha.
 */
export function mergeLedgerUserDisplayNameMaps(
  voucherSide: Record<string, string | undefined>,
  fetchedSide: Record<string, string | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = new Set([...Object.keys(voucherSide || {}), ...Object.keys(fetchedSide || {})]);
  for (const k of keys) {
    const v = voucherSide[k];
    const f = fetchedSide[k];
    if (isMeaningfulLedgerUserListLabel(v)) out[k] = String(v).trim();
    else if (isMeaningfulLedgerUserListLabel(f)) out[k] = String(f).trim();
  }
  return out;
}

/** BS-month recurring auto row — User cell me scheduler ki jagah "Auto". */
export function isRecurringBsMonthlyAutoVoucherForLedgerUserDisplay(t: unknown): boolean {
  const o = t as { recurringMeta?: { generationKind?: string }; userDisplayName?: string } | null | undefined;
  if (!o || typeof o !== "object") return false;
  const kind = o.recurringMeta?.generationKind;
  if (kind === "recurring_bs_monthly") return true;
  return String(o.userDisplayName ?? "").trim() === "Auto";
}
