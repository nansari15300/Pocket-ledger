/**
 * Party / account statement "User" column helpers.
 * Recurring BS-month vouchers `userDisplayName: "Auto"` + `recurringMeta` save hote hain — sirf wahi rows "Auto".
 * `userDisplayName === "Auto"` alone se recurring mat samjho (IC / manual rows flicker na karein).
 */
import { isRecurringAutoUserDisplayLabel } from "@/lib/interCompany/interCompanyVoucherHistory";

const BAD_USER_LIST_LABEL = new Set(["unknown", "n/a"]);

/** Khali / placeholder ko merge me "missing" maano taaki doosri source se naam aaye. */
export function isMeaningfulLedgerUserListLabel(s: string | undefined | null): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  if (isRecurringAutoUserDisplayLabel(t)) return false;
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

/** BS-month recurring auto row — User cell me scheduler ki jagah "Auto" (sirf `recurringMeta`). */
export function isRecurringBsMonthlyAutoVoucherForLedgerUserDisplay(t: unknown): boolean {
  const o = t as { recurringMeta?: { generationKind?: string } } | null | undefined;
  if (!o || typeof o !== "object") return false;
  return o.recurringMeta?.generationKind === "recurring_bs_monthly";
}

/** Auto recurring switch indicator: sirf current trigger/source voucher par dikhao. */
export function isActiveRecurringTriggerVoucherForLedgerSwitch(t: unknown): boolean {
  const o = t as { id?: string; recurringMeta?: { generationKind?: string; isActiveTriggerSource?: boolean; activeTriggerSourceVoucherId?: string | null } } | null | undefined;
  if (!o || typeof o !== "object") return false;
  const meta = o?.recurringMeta;
  if (meta?.isActiveTriggerSource === true) return true;
  const activeId = String(meta?.activeTriggerSourceVoucherId || "").trim();
  const id = String(o?.id || "").trim();
  return !!activeId && !!id && activeId === id;
}

/** Ledger / mobile card User column — stable naam, "Auto" sirf recurring BS-month par. */
export function resolveLedgerTransactionUserDisplayName(
  transaction: Record<string, unknown> | null | undefined,
  userNames?: Record<string, string> | null,
  opts?: { currentUserUid?: string | null; currentUserDisplayName?: string | null }
): string {
  if (!transaction) return "N/A";
  if (isRecurringBsMonthlyAutoVoucherForLedgerUserDisplay(transaction)) return "Auto";

  const uid = String(transaction.userId || "").trim();
  const fromMap = uid && userNames?.[uid] ? String(userNames[uid]).trim() : "";
  if (isMeaningfulLedgerUserListLabel(fromMap)) return fromMap;

  const fromDoc = String(transaction.userDisplayName || transaction.userName || "").trim();
  if (isMeaningfulLedgerUserListLabel(fromDoc)) return fromDoc;

  const curUid = String(opts?.currentUserUid || "").trim();
  const curName = String(opts?.currentUserDisplayName || "").trim();
  if (uid && curUid && uid === curUid) {
    return curName || "You";
  }
  return "N/A";
}
