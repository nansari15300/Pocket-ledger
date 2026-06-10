"use client";

import { deleteCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { removeOutboxRowsForCompanyDoc } from "@/lib/localVoucherOutbox";

/** Recycle-bin / ledger soft-delete patch. */
export function isSoftDeleteLedgerPatch(patch: Record<string, unknown> | null | undefined): boolean {
  return patch?.isDeleted === true;
}

/**
 * Firestore pe doc kabhi tha hi nahi (sirf SQLite mirror / stale warm) —
 * local row + outbox hatao taaki UI se item gayab ho, retry loop na chale.
 */
export async function purgeGhostLocalCompanyDoc(
  companyId: string,
  collectionName: string,
  docId: string
): Promise<void> {
  const cid = String(companyId || "").trim();
  const col = String(collectionName || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !col || !id) return;
  await deleteCompanyDocFromBrowserDb(cid, col, id, { force: true, notify: true });
  try {
    await removeOutboxRowsForCompanyDoc(cid, col, id);
  } catch {
    /* outbox optional */
  }
}
