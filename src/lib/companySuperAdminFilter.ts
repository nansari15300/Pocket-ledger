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
  if (normalizePath(pathname ?? "").startsWith("/admin")) return companies;
  return companies.filter((c) => isOwnedByUser(c, user));
}
