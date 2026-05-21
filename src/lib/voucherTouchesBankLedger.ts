import { collectInterCompanyIdsForPendingApproval } from "@/lib/interCompany/interCompanyVoucherHydrate";

/**
 * Bank/Cash master badges: sirf un vouchers ko count jinki lines is company ke bank accounts
 * (`processedAccounts`) ko touch karti hain — top-level from/to/accountId + journal `entries`.
 * Inter Company: `companyBankAccountId` + compound `interCompanyLegs` (bank kind) bhi.
 */
export function collectBankAccountIdsTouchedByUnapprovedVoucher(
  v: any,
  accountIdSet: Set<string>
): Set<string> {
  const out = new Set<string>();
  if (!v || v.isApproved === true) return out;
  if (String(v?.type || "") === "inter_company") {
    collectInterCompanyIdsForPendingApproval(v, accountIdSet, "bank").forEach((id) => out.add(id));
    return out;
  }
  const add = (id: unknown) => {
    const s = id != null && id !== "" ? String(id) : "";
    if (s && accountIdSet.has(s)) out.add(s);
  };
  add(v.fromAccountId);
  add(v.toAccountId);
  add(v.accountId);
  add(v.companyBankAccountId);
  if (Array.isArray(v.entries)) v.entries.forEach((e: any) => add(e?.accountId));
  return out;
}
