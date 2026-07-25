"use client";

import { isLocalhostDevPreview } from "@/lib/localAppServerDevPreview";

export type ShareableCompanySnapshotRow = {
  id: string;
  name: string;
  storageOption: "local";
  ownerEmail?: string | null;
  planId?: string | null;
  planExpiryMs?: number | null;
  offlineLicenseValidUntilMs?: number | null;
  requiresLogin?: boolean;
  usernameHint?: string | null;
  accessEmails?: string[];
};

type ElectronSnapshotBridge = {
  saveShareableCompaniesSnapshot?: (companies: ShareableCompanySnapshotRow[]) => Promise<{ ok?: boolean }>;
};

/** Dev bridge (Next API) ya EXE IPC — host shareable company cache update. */
export async function persistShareableCompaniesSnapshot(
  companies: ShareableCompanySnapshotRow[]
): Promise<void> {
  if (typeof window === "undefined" || !Array.isArray(companies) || companies.length === 0) return;

  const bridge = (window as Window & { plElectronLocalServer?: ElectronSnapshotBridge }).plElectronLocalServer;
  if (bridge?.saveShareableCompaniesSnapshot) {
    await bridge.saveShareableCompaniesSnapshot(companies).catch(() => undefined);
    return;
  }

  if (!isLocalhostDevPreview()) return;

  await fetch("/api/dev-pl-local-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveShareableCompaniesSnapshot", companies }),
  }).catch(() => undefined);
}
