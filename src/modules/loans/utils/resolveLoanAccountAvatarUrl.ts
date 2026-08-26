import type { Staff } from "@/components/staff/types";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import type { Loan } from "../types/loanTypes";

type BankLike = { id: string; fileUrl?: string | null; avatarUrl?: string | null };

function firstPreviewUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const url = trimEntityFileUrlForPreview(raw);
    if (url) return url;
  }
  return null;
}

/** Loan liability list/detail avatar — staff profile first, then linked bank account. */
export function resolveLoanAccountAvatarUrl(
  account: Staff | null | undefined,
  loan: Loan | null | undefined,
  bankAccounts?: readonly BankLike[] | null
): string | null {
  if (!account) return null;

  const staffUrl = firstPreviewUrl(
    account.fileUrl,
    (account as { avatarUrl?: string | null }).avatarUrl
  );
  if (staffUrl) return staffUrl;

  const bankIds = [
    loan?.convertedFromBankAccountId,
    loan?.bankAccountId,
    (account as { convertedFromBankAccountId?: string | null }).convertedFromBankAccountId,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  for (const bankId of bankIds) {
    if (seen.has(bankId)) continue;
    seen.add(bankId);
    const bank = bankAccounts?.find((row) => String(row.id) === bankId);
    const bankUrl = firstPreviewUrl(bank?.fileUrl, bank?.avatarUrl);
    if (bankUrl) return bankUrl;
  }

  return null;
}
