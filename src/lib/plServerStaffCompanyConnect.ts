"use client";

import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { getPlServerSharedCompanies } from "@/lib/plServerAccessContext";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";

/** Connect / gate: company shell row (picker) + SQLite ledger mirror pull. */
export async function ensurePlServerStaffCompanyShell(companyId: string): Promise<void> {
  const id = String(companyId || "").trim();
  if (!id) return;
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const existing = await getLocalCompanyById(id, { includeDeleted: true });
    if (existing && isServerGateCompany(existing)) return;
  } catch {
    /* continue */
  }
  const shared = getPlServerSharedCompanies().find((row) => String(row.id || "").trim() === id);
  const { plServerClientLocalCompanyRow } = await import("@/lib/plServerClientCompanyMirror");
  await upsertLocalCompany(
    plServerClientLocalCompanyRow(
      id,
      String(shared?.name || id),
      shared?.ownerEmail ?? null
    )
  );
}

/**
 * Staff connect / company open: SQLite mirror pull (EXE/APK/iOS same).
 * Offline: existing SQLite rows are enough; display cache hydrate is optional warm.
 */
export async function preparePlServerStaffCompanyConnect(
  companyId: string,
  options?: { pullFullLedger?: boolean; timeoutMs?: number; background?: boolean }
): Promise<{ ok: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id) return { ok: false, fullPull: false };

  if (!isPlServerThinStaffClient()) {
    const { mirrorPlServerSharedCompanyByIdLegacy } = await import("@/lib/plServerClientCompanyMirror");
    const legacy = await mirrorPlServerSharedCompanyByIdLegacy(id, {
      pullFullLedger: options?.pullFullLedger !== false,
    });
    return { ok: legacy.mirrored, fullPull: legacy.fullPull };
  }

  await ensurePlServerStaffCompanyShell(id);
  const pullFull = options?.pullFullLedger !== false;
  const timeoutMs = options?.timeoutMs ?? 45_000;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    try {
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers");
      if (vouchers.length > 0) return { ok: true, fullPull: false };
    } catch {
      /* continue */
    }
    try {
      const { hydratePlServerDisplayCacheFromIdb, plServerDisplayCacheHasUsableLedger } = await import(
        "@/lib/plServerDisplayCache"
      );
      await hydratePlServerDisplayCacheFromIdb(id);
      return { ok: plServerDisplayCacheHasUsableLedger(id), fullPull: false };
    } catch {
      return { ok: false, fullPull: false };
    }
  }

  const { mirrorPlServerSharedCompanyByIdLegacy } = await import("@/lib/plServerClientCompanyMirror");
  const load = mirrorPlServerSharedCompanyByIdLegacy(id, { pullFullLedger: pullFull }).catch(() => ({
    mirrored: false,
    fullPull: false,
  }));

  if (options?.background) {
    void load;
    return { ok: true, fullPull: false };
  }

  const result = await Promise.race([
    load,
    new Promise<{ mirrored: boolean; fullPull: boolean }>((resolve) => {
      setTimeout(() => resolve({ mirrored: false, fullPull: false }), timeoutMs);
    }),
  ]);
  return { ok: result.mirrored, fullPull: result.fullPull && pullFull };
}
