/** Master entity list/detail — live UI patch helpers (party, staff, bank, tax, item). */

export type MasterEntityPatchCollection =
  | "parties"
  | "staff"
  | "bank_accounts"
  | "taxes"
  | "items"
  | "expense_accounts";

/** Fingerprint me profile/attachment fields — `entityListUiFingerprint` stale UI skip fix. */
export function masterEntityProfileUiFields(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const docs = Array.isArray(row.documentFileUrls) ? row.documentFileUrls : [];
  const fileUrls = Array.isArray(row.fileUrls) ? row.fileUrls : [];
  /** Live list fingerprint me edit-critical flags include — tab move/filter turant re-render ho. */
  const useFor = row.useFor && typeof row.useFor === "object" ? JSON.stringify(row.useFor) : "";
  return [
    String(row.name ?? ""),
    String(row.accountName ?? ""),
    String(row.email ?? ""),
    String(row.phone ?? ""),
    String(row.accountType ?? ""),
    String(row.groupId ?? ""),
    String(row.parentId ?? ""),
    String(row.openingBalance ?? ""),
    String(row.openingBalanceNarration ?? ""),
    String(row.isSpecial ?? ""),
    String(row.isClearing ?? ""),
    String(row.allowVoucherMinusBalance ?? ""),
    String(row.isFrozen ?? ""),
    String(row.freezeMessage ?? ""),
    useFor,
    String(row.fileUrl ?? ""),
    String(row.avatarUrl ?? ""),
    `${docs.length}:${docs.filter((u): u is string => typeof u === "string").join("\x1e")}`,
    `${fileUrls.length}:${fileUrls.filter((u): u is string => typeof u === "string").join("\x1e")}`,
  ].join("\x1d");
}

/** Master-detail `selected` ko vouchers context ki latest processed row se merge karo. */
export function resolveMasterListSelection<T extends { id: string }>(
  selected: T | null,
  processed: readonly T[] | undefined
): T | null {
  if (!selected) return null;
  return processed?.find((x) => x.id === selected.id) ?? selected;
}
