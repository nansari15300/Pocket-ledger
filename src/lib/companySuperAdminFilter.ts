"use client";

import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

function normalizePath(p: string): string {
  return (p || "").replace(/\/+$/, "") || "/";
}

function isOwnedByUser<
  T extends { ownerId?: string; ownerEmail?: string },
>(company: T, user: { uid: string; email: string | null }): boolean {
  if (company.ownerId && company.ownerId === user.uid) return true;
  const e = (user.email || "").toLowerCase().trim();
  if (!e) return false;
  if (company.ownerEmail && company.ownerEmail.toLowerCase().trim() === e) return true;
  return false;
}

/**
 * Main app (not `/admin/*`): SuperAdmin sees only owned companies — no shared-with list.
 * `/company` picker + EXE/APK: poori Firestore registry (shared + legacy ownerId owned rows).
 */
export function filterSharedOnlyCompaniesForSuperAdminInMainApp<
  T extends { ownerId?: string; ownerEmail?: string; isOwned?: boolean },
>(
  companies: T[],
  user: { uid: string; email: string | null } | null | undefined,
  isSuperAdmin: boolean,
  pathname: string | null
): T[] {
  if (!isSuperAdmin || !user) return companies;
  const path = normalizePath(pathname ?? "");
  if (path.startsWith("/admin")) return companies;
  if (path === "/company") return companies;
  if (isEmbeddedOfflinePreloadClient()) return companies;
  return companies.filter((c) => c.isOwned === true || isOwnedByUser(c, user));
}
