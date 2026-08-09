/** Firebase Storage prefix list — company hard delete / restore wipe (client + server shared). */

function slugifyCompanyName(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function buildCompanyStorageWipePrefixes(input: {
  companyId: string;
  companyName?: string;
}): string[] {
  const cid = String(input.companyId || "").trim();
  if (!cid) return [];
  const prefixes = new Set<string>([
    `voucher-files/${cid}`,
    `pocket-ledger/${cid}`,
    `companies/${cid}`,
  ]);
  const name = String(input.companyName || "").trim();
  if (name) {
    prefixes.add(`companies/${cid}__${slugifyCompanyName(name)}`);
  }
  return [...prefixes];
}

export function buildVoucherStorageScanPrefixes(input: {
  companyId: string;
  voucherType?: string;
}): string[] {
  const cid = String(input.companyId || "").trim();
  if (!cid) return [];
  const vt = String(input.voucherType || "journal").trim() || "journal";
  return [`pocket-ledger/${cid}/vouchers/${vt}`, `voucher-files/${cid}/${vt}`];
}
