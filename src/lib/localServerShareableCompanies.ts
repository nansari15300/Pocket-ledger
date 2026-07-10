"use client";

import type { Company } from "@/hooks/useCompany";
import { isDeviceLocalCompany, isPureLocalLedgerCompany, isServerGateCompany } from "@/lib/companyStorageKind";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";

type ShareableCompanyRow = Company | LocalCompanyDoc | { storageOption?: string };

/**
 * Host PC par P2P server se share — sirf **pure local** company (SQLite-owned).
 * Online / Firestore mirror (`storageOption: firebase`, `syncedFromCloud`) yahan nahi — unka share Firebase se hota hai.
 */
export function isLocalServerShareableCompany(c: ShareableCompanyRow | null | undefined): boolean {
  if (!c) return false;
  if (isServerGateCompany(c as { plServerShared?: boolean })) return false;
  if (
    isCloudLinkedCompanyStorage(c as { storageOption?: string; syncedFromCloud?: boolean }) &&
    !isDeviceLocalCompany(c as Company)
  ) {
    return false;
  }
  return isPureLocalLedgerCompany(c as Company);
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
