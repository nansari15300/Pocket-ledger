/**
 * Firestore permission-denied console / overlay suppress — server-safe (no "use client").
 * Drive-shared local companies Firestore me nahi hote; snapshot listener deny expected.
 */

import { computeIsLocalOnlyMode } from "@/lib/dataSourceModeDefaults";

export function isExpectedFirestoreSnapshotPermissionDenial(message: string): boolean {
  const m = String(message || "").toLowerCase();
  return (
    (m.includes("snapshot listener") || m.includes("@firebase/firestore")) &&
    (m.includes("permission-denied") ||
      m.includes("permission_denied") ||
      m.includes("missing or insufficient permissions"))
  );
}

export function shouldSuppressFirestorePermissionConsole(): boolean {
  if (computeIsLocalOnlyMode()) return true;
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem("pl_drive_shared_local_session") === "1") return true;
    const cid = String(
      (window as Window & { __plActiveCompanyId?: string }).__plActiveCompanyId ?? ""
    ).trim();
    if (cid && sessionStorage.getItem(`pl_suppress_fs_perm_${cid}`) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function readActiveAttachmentCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cid = String(
      (window as Window & { __plActiveCompanyId?: string }).__plActiveCompanyId ?? ""
    ).trim();
    return cid || null;
  } catch {
    return null;
  }
}

export function markActiveAttachmentCompanyId(companyId: string): void {
  if (typeof window === "undefined" || !companyId.trim()) return;
  try {
    (window as Window & { __plActiveCompanyId?: string }).__plActiveCompanyId = companyId.trim();
  } catch {
    /* ignore */
  }
}

export function markSuppressFirestorePermissionForCompany(companyId: string): void {
  if (typeof window === "undefined" || !companyId.trim()) return;
  try {
    markActiveAttachmentCompanyId(companyId);
    sessionStorage.setItem(`pl_suppress_fs_perm_${companyId.trim()}`, "1");
    sessionStorage.setItem("pl_drive_shared_local_session", "1");
  } catch {
    /* ignore */
  }
}
