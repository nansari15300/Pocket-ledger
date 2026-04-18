/**
 * Bank/Cash master badges: sirf un vouchers ko count jinki lines is company ke bank accounts
 * (`processedAccounts`) ko touch karti hain — top-level from/to/accountId + journal `entries`.
 * Pehle journal contra lines miss ho rahi thin; sidebar me generic `fromAccountId` bhi galat count kar sakta tha.
 */
export function collectBankAccountIdsTouchedByUnapprovedVoucher(
  v: any,
  accountIdSet: Set<string>
): Set<string> {
  const out = new Set<string>();
  if (!v || v.isApproved === true) return out;
  const add = (id: unknown) => {
    const s = id != null && id !== "" ? String(id) : "";
    if (s && accountIdSet.has(s)) out.add(s);
  };
  add(v.fromAccountId);
  add(v.toAccountId);
  add(v.accountId);
  if (Array.isArray(v.entries)) v.entries.forEach((e: any) => add(e?.accountId));
  return out;
}
