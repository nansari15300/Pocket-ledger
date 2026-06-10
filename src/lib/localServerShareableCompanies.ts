"use client";

import type { Company } from "@/hooks/useCompany";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";

type ShareableCompanyRow = Company | LocalCompanyDoc | { storageOption?: string };

/** Local server gate tokens: sirf device-local companies — online/Firebase sharing alag channel hai. */
export function isLocalServerShareableCompany(c: ShareableCompanyRow | null | undefined): boolean {
  if (!c) return false;
  if (!isOfflineCompanyStorage(c as { storageOption?: string })) return false;
  if (isCloudBackedCompanyShape(c as Company)) return false;
  return true;
}

export type PlServerSharedCompanySummary = {
  id: string;
  name: string;
  storageOption: "local";
  ownerEmail?: string | null;
};

export function toPlServerSharedCompanySummary(row: {
  id: string;
  name?: string;
  ownerEmail?: string | null;
}): PlServerSharedCompanySummary {
  return {
    id: String(row.id),
    name: String(row.name || row.id),
    storageOption: "local",
    ownerEmail: row.ownerEmail ? String(row.ownerEmail) : null,
  };
}
