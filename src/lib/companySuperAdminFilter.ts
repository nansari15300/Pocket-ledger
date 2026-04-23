function normalizePath(p: string): string {
  return (p || "").replace(/\/+$/, "") || "/";
}

/**
 * Main app (not `/admin/*`): super admin only sees own companies (by uid or owner email), not "shared with me" from other users.
 */
export function filterSharedOnlyCompaniesForSuperAdminInMainApp<T extends { ownerId?: string; ownerEmail?: string }>(
  companies: T[],
  user: { uid: string; email: string | null } | null | undefined,
  isSuperAdmin: boolean,
  pathname: string | null
): T[] {
  if (!isSuperAdmin || !user) return companies;
  if (normalizePath(pathname ?? "").startsWith("/admin")) return companies;
  const e = (user.email || "").toLowerCase().trim();
  return companies.filter((c) => {
    if (c.ownerId && c.ownerId === user.uid) return true;
    if (c.ownerEmail && e && c.ownerEmail.toLowerCase().trim() === e) return true;
    return false;
  });
}
