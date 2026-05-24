import { ledgerNarrationFromVoucher } from "@/lib/copyLedgerCrossCompany";
import type { ReconciliationSideContext } from "@/lib/reconciliation/buildSyncVoucherDraft";
import { buildReconciliationLedgerSnapshot, loadCompanyVouchers } from "@/lib/reconciliation/ledgerSnapshot";
import {
  getReconciliationShare,
  refreshReconciliationSideSnapshot,
} from "@/lib/reconciliation/reconciliationStore";
import type { ReconciliationLedgerRow, ReconciliationShare } from "@/lib/reconciliation/types";

/** NOTE row — type field missing ho to voucher no. se pehchano (purane snapshot). */
export function isReconciliationNoteRow(row: ReconciliationLedgerRow): boolean {
  if (String(row.type || "").toLowerCase() === "note") return true;
  return /^note\s*-/i.test(String(row.voucherNumber || "").trim());
}

export function noteRowNeedsTitleEnrich(row: ReconciliationLedgerRow): boolean {
  if (!isReconciliationNoteRow(row)) return false;
  if (String(row.title || "").trim()) return false;
  const n = String(row.narration || "").trim();
  return !n || n === "-";
}

export function snapshotHasStaleNoteTitles(rows: ReconciliationLedgerRow[] | undefined): boolean {
  return (rows ?? []).some(noteRowNeedsTitleEnrich);
}

/** NOTE row — sirf title; baaki txn — narration text. */
export function reconciliationLedgerRowDisplayNarration(row: ReconciliationLedgerRow): string {
  if (isReconciliationNoteRow(row)) {
    const title = String(row.title || "").trim();
    if (title) return title;
    const n = String(row.narration || "").trim();
    return n && n !== "-" ? n : "";
  }
  const n = String(row.narration || "").trim();
  return n && n !== "-" ? n : "";
}

/** Note voucher = "Title", baaki = "Narration" (party txn table jaisa). */
export function reconciliationLedgerRowNarrationLabel(row: ReconciliationLedgerRow): string {
  return isReconciliationNoteRow(row) ? "Title" : "Narration";
}

export function reconciliationLedgerRowHasNarrationLine(row: ReconciliationLedgerRow): boolean {
  return Boolean(reconciliationLedgerRowDisplayNarration(row));
}

/** Snapshot row me title field ho to narration patch — bina voucher fetch. */
export function applySnapshotRowDisplayNarration(rows: ReconciliationLedgerRow[]): ReconciliationLedgerRow[] {
  let changed = false;
  const out = rows.map((row) => {
    if (!noteRowNeedsTitleEnrich(row)) return row;
    const title = String(row.title || "").trim();
    if (!title) return row;
    changed = true;
    return { ...row, type: row.type || "note", narration: title, title };
  });
  return changed ? out : rows;
}

/** Owned + Other dono — same live build (shareScope all, NOTE title narration me). */
export async function buildLiveReconciliationSideRows(
  ctx: ReconciliationSideContext | null,
): Promise<{ rows: ReconciliationLedgerRow[]; openingBalance: number } | null> {
  if (!ctx?.companyId || !ctx.accountId) return null;
  try {
    const built = await buildReconciliationLedgerSnapshot({
      companyId: ctx.companyId,
      accountId: ctx.accountId,
      collection: ctx.collection,
      shareScope: "all",
    });
    if (built.rows.length === 0) return null;
    return built;
  } catch {
    return null;
  }
}

/** Snapshot NOTE rows — company vouchers batch se title patch. */
export async function enrichReconciliationNoteTitlesInRows(
  rows: ReconciliationLedgerRow[],
  companyId: string,
): Promise<ReconciliationLedgerRow[]> {
  if (!companyId || rows.length === 0) return rows;
  const targets = rows.filter(noteRowNeedsTitleEnrich);
  if (targets.length === 0) return rows;

  let vouchers: Array<Record<string, unknown>> = [];
  try {
    vouchers = await loadCompanyVouchers(companyId);
  } catch {
    return applySnapshotRowDisplayNarration(rows);
  }
  const voucherById = new Map<string, Record<string, unknown>>();
  for (const v of vouchers) {
    const id = String(v.id || "");
    if (id) voucherById.set(id, v);
  }

  let changed = false;
  const out = rows.map((row) => {
    if (!noteRowNeedsTitleEnrich(row)) return row;
    const v = voucherById.get(row.id);
    if (!v) return row;
    const text = ledgerNarrationFromVoucher(v);
    if (!text || text === "-") return row;
    const title = String(v.title || "").trim();
    changed = true;
    return { ...row, type: row.type || "note", narration: text, title: title || text };
  });
  return changed ? out : applySnapshotRowDisplayNarration(rows);
}

/**
 * Other side — pehle owned jaisa live build; phir snapshot + title enrich.
 * Cross-user: dusri party ka snapshot purana ho to unke open par refresh (ensureFresh…).
 */
export async function resolveRemoteReconciliationRows(params: {
  share: ReconciliationShare;
  userId: string;
  remoteCtx: ReconciliationSideContext | null;
  snapshotRows: ReconciliationLedgerRow[];
  snapshotOpening: number;
}): Promise<{ rows: ReconciliationLedgerRow[]; openingBalance: number }> {
  const { remoteCtx, snapshotRows, snapshotOpening } = params;

  const live = await buildLiveReconciliationSideRows(remoteCtx);
  if (live) return live;

  let rows = applySnapshotRowDisplayNarration(snapshotRows);
  if (remoteCtx?.companyId) {
    rows = await enrichReconciliationNoteTitlesInRows(rows, remoteCtx.companyId);
  }
  return { rows, openingBalance: snapshotOpening };
}

/**
 * Participant apni side snapshot me purane NOTE ("-" narration) ho to ek baar refresh —
 * dusri party ko other column me sahi title dikhe.
 */
export async function ensureFreshParticipantSnapshotNotes(
  share: ReconciliationShare,
  userId: string,
): Promise<ReconciliationShare | null> {
  let refreshed = false;
  const iAmSender = share.senderUserId === userId;
  const iAmReceiver = share.receiverUserId === userId || share.targetUserId === userId;

  if (iAmReceiver && share.receiverCompanyId && snapshotHasStaleNoteTitles(share.receiverLedgerSnapshot)) {
    await refreshReconciliationSideSnapshot({ shareId: share.id, side: "receiver" });
    refreshed = true;
  }
  if (iAmSender && snapshotHasStaleNoteTitles(share.senderLedgerSnapshot)) {
    await refreshReconciliationSideSnapshot({ shareId: share.id, side: "sender" });
    refreshed = true;
  }
  if (!refreshed) return null;
  return getReconciliationShare(share.id, share.senderCompanyId || share.receiverCompanyId);
}
