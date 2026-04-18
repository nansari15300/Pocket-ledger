"use client";

/**
 * Super Admin ke liye Firestore/rules `sharedWithEmails` me auto-merge se har company
 * `sharedWithEmails` query me aa sakti hai. Main app selector me sirf **explicit share**
 * (`sharedWith[]` me user row) wahi companies dikhanao — admin panel alag se full list use karta hai.
 */
export function filterCompaniesForMainAppSelector<
  T extends { isOwned?: boolean; sharedWith?: Array<{ email?: string }> },
>(companies: T[], options: { role?: string | null; email?: string | null }): T[] {
  if (options.role !== "SuperAdmin" || !options.email?.trim()) return companies;
  const em = options.email.toLowerCase().trim();
  return companies.filter((c) => {
    if (c.isOwned) return true;
    const sw = c.sharedWith;
    return Array.isArray(sw) && sw.some((u) => String(u?.email || "").toLowerCase().trim() === em);
  });
}
