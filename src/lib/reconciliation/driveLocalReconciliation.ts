/** Cloud sync removed — drive-local reconciliation stubs (legacy share ids never match). */

import type { ReconciliationShare } from "@/lib/reconciliation/types";

export const DRIVE_RECON_CHANGED_EVENT = "pl-drive-recon-removed";

export function isDriveLocalReconciliationShareId(_shareId: string): boolean {
  return false;
}

export async function getDriveLocalReconciliationShare(_shareId: string): Promise<null> {
  return null;
}

export function listDriveLocalReconciliationSharesForViewer(
  _userId: string,
  _companyId: string
): ReconciliationShare[] {
  return [];
}

/** Local mirror party list — cloud sync removed; Firestore path used instead. */
export async function loadReconciliationPartyAccountsFromLocalMirror(
  _companyId: string
): Promise<{ id: string; name: string }[]> {
  return [];
}

export async function pullDriveLocalReconciliationLinksForCompany(_companyId: string): Promise<void> {
  return;
}

export async function unlinkDriveLocalReconciliationShare(_params: unknown): Promise<void> {
  return;
}

export async function refreshDriveLocalReconciliationSideSnapshot(_params: unknown): Promise<void> {
  return;
}

export async function saveDriveLocalReconciliationRowComment(_params: unknown): Promise<void> {
  return;
}

export async function createDriveLocalReconciliationLink(_params: unknown): Promise<string> {
  throw new Error("Drive-local reconciliation was removed. Use online reconciliation sharing.");
}
