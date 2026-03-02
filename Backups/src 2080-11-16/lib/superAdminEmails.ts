/**
 * Super admin emails that should always have access to every company (e.g. for Admin Panel).
 * Used to merge into company.sharedWithEmails on create/update so list/get rules allow access.
 */
const DEFAULT_SUPER_ADMIN_EMAIL = "nansari15300@gmail.com";

export function getSuperAdminEmails(): string[] {
  const fromEnv =
    typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_SUPER_ADMIN_EMAILS;
  if (fromEnv && typeof fromEnv === "string") {
    return fromEnv.split(",").map((e) => e.trim()).filter(Boolean);
  }
  return [DEFAULT_SUPER_ADMIN_EMAIL];
}

/**
 * Returns sharedWithEmails with super admin emails merged in (no duplicates).
 * When the current user is Super Admin, pass their email so they get access to every company.
 */
export function ensureSuperAdminInSharedEmails(
  sharedWithEmails: string[] = [],
  currentUserEmail?: string | null,
  isSuperAdmin?: boolean
): string[] {
  const list = Array.isArray(sharedWithEmails) ? [...sharedWithEmails] : [];
  const superEmails = getSuperAdminEmails();
  const extra = isSuperAdmin && currentUserEmail ? [currentUserEmail.trim()] : [];
  return [...new Set([...list, ...superEmails, ...extra])];
}
