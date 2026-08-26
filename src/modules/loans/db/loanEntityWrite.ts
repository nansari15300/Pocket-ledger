"use client";

/**
 * Loan module write gate — always SQLite-first (`force: true`), then background sync:
 * - **Online:** `sync_outbox` → Firestore flush
 * - **PL Server:** authoritative host/client dispatch (via `upsertCompanyDocInBrowserDb`)
 * - **Local · Drive:** Drive delta queue (via mirror write side-effects)
 */

import {
  getCompanyDocFromBrowserDb,
  upsertCompanyDocInBrowserDb,
  type UpsertCompanyBrowserOptions,
} from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox, type VoucherOutboxOp } from "@/lib/localVoucherOutbox";
import { buildLedgerTombstoneFields } from "@/lib/ledgerTombstone";

export type LoanWriteOperation = "create" | "update" | "delete";

export type LoanWriteEntityRequest = {
  companyId: string;
  collectionName: string;
  docId: string;
  operation: LoanWriteOperation;
  data?: Record<string, unknown>;
  options?: UpsertCompanyBrowserOptions & { merge?: boolean };
};

export type LoanWriteEntityResult = { ok: true; docId: string } | { ok: false; error: string };

async function mergeWithExistingLocalDoc(
  companyId: string,
  collectionName: string,
  docId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const existing = (await getCompanyDocFromBrowserDb(companyId, collectionName, docId)) ?? {};
  return { ...existing, ...patch, id: docId };
}

/** SQLite-first company doc write for all loan-overview saves (masters + loan collections). */
export async function writeLoanEntity(req: LoanWriteEntityRequest): Promise<LoanWriteEntityResult> {
  const companyId = String(req.companyId || "").trim();
  const collectionName = String(req.collectionName || "").trim();
  const docId = String(req.docId || "").trim();
  const mergeSetDoc = req.options?.merge === true;

  if (!companyId || !collectionName || !docId) {
    return { ok: false, error: "writeLoanEntity: missing companyId, collectionName, or docId" };
  }

  try {
    const { assertPlServerStaffWriteAllowed } = await import("@/lib/plServerStaffOfflinePolicy");
    await assertPlServerStaffWriteAllowed(companyId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const upsertOpts: UpsertCompanyBrowserOptions = {
    ...req.options,
    force: true,
  };

  if (req.operation === "delete") {
    let merged: Record<string, unknown>;
    try {
      merged = await mergeWithExistingLocalDoc(
        companyId,
        collectionName,
        docId,
        buildLedgerTombstoneFields(docId)
      );
      const persisted = await upsertCompanyDocInBrowserDb(companyId, collectionName, docId, merged, upsertOpts);
      if (!persisted) {
        return { ok: false, error: "sqlite tombstone skipped" };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "sqlite tombstone failed" };
    }
    try {
      await enqueueCompanyDocOutbox(companyId, collectionName, "delete", docId, merged);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "outbox delete enqueue failed" };
    }
    return { ok: true, docId };
  }

  const patch = { ...(req.data || {}) } as Record<string, unknown>;
  const merged =
    req.operation === "create" && mergeSetDoc
      ? await mergeWithExistingLocalDoc(companyId, collectionName, docId, { ...patch, id: docId })
      : req.operation === "create"
        ? ({ ...patch, id: docId } as Record<string, unknown>)
        : await mergeWithExistingLocalDoc(companyId, collectionName, docId, patch);

  try {
    const persisted = await upsertCompanyDocInBrowserDb(companyId, collectionName, docId, merged, upsertOpts);
    if (!persisted) {
      return { ok: false, error: "sqlite upsert skipped" };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sqlite upsert failed" };
  }

  const op: VoucherOutboxOp = req.operation === "create" ? "create" : "update";
  try {
    await enqueueCompanyDocOutbox(companyId, collectionName, op, docId, merged);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outbox enqueue failed" };
  }

  return { ok: true, docId };
}
