"use client";

/**
 * After restoring an FY-scoped backup: drop cached FY opening snapshots (local + server for
 * cloud-linked companies) and tell ledgers that master openings changed.
 * Never throws - restore success must not depend on cache invalidation.
 */
export async function finalizeFyScopedBackupRestore(params: {
  companyId: string;
  cloudLinked: boolean;
}): Promise<void> {
  const cid = String(params.companyId || "").trim();
  if (!cid) return;
  try {
    const { invalidateAllLocalOpeningSnapshots } = await import("@/lib/fyPagination/snapshotStore");
    await invalidateAllLocalOpeningSnapshots(cid);
  } catch (err) {
    console.warn("[finalizeFyScopedBackupRestore] local snapshots", err);
  }
  try {
    const { dispatchMasterOpeningBalanceChanged } = await import("@/lib/fyPagination/masterOpeningSaveHooks");
    dispatchMasterOpeningBalanceChanged(cid);
  } catch (err) {
    console.warn("[finalizeFyScopedBackupRestore] dispatch", err);
  }
  if (params.cloudLinked) {
    void import("@/lib/fyPagination/serverFyOpeningInvalidateClient")
      .then(({ invalidateServerOpeningSnapshots }) =>
        invalidateServerOpeningSnapshots({ companyId: cid, invalidateAll: true })
      )
      .catch((err) => console.warn("[finalizeFyScopedBackupRestore] server snapshots", err));
  }
}