"use client";

import type { CompanyBackupCollection } from "@/lib/companyBackupCollections";

/** Open route → server collections to keep live in display cache. */
export function plServerLiveCollectionsForPathname(pathname: string): CompanyBackupCollection[] {
  const p = String(pathname || "").toLowerCase();

  if (p.includes("/parties") || p.includes("/party") || p.includes("/ledger")) {
    return ["vouchers", "parties"];
  }
  if (p.includes("/bank")) {
    return ["bank_accounts", "vouchers", "parties"];
  }
  if (p.includes("/items") || p.includes("/inventory")) {
    return ["items", "vouchers"];
  }
  if (p.includes("/staff")) {
    return ["staff", "vouchers"];
  }
  if (p.includes("/expense")) {
    return ["expense_accounts", "vouchers"];
  }
  if (p.includes("/tax")) {
    return ["taxes", "vouchers"];
  }
  if (p.includes("/voucher")) {
    return ["vouchers", "parties", "bank_accounts", "items"];
  }
  if (p.includes("/dashboard")) {
    return ["vouchers", "parties", "bank_accounts"];
  }
  if (p.includes("/reports") || p.includes("/statement")) {
    return ["vouchers", "parties", "bank_accounts"];
  }

  return ["vouchers", "parties"];
}
