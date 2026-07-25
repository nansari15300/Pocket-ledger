import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";

function email(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

export function localCompanyAccessEmails(row: Partial<LocalCompanyDoc> | null | undefined): string[] {
  if (!row) return [];
  const values = new Set<string>();
  const add = (value: unknown) => {
    const normalized = email(value);
    if (normalized) values.add(normalized);
  };
  add(row.ownerEmail);
  add(row.accessAccount);
  for (const key of ["sharedWithEmails", "sharedWithEmailsLower"] as const) {
    const list = row[key];
    if (Array.isArray(list)) list.forEach(add);
  }
  for (const user of parseLocalCompanyUserRows(row.localCompanyUsers)) {
    add(user.shareEmail);
    add(user.username);
  }
  return [...values];
}

export function isLocalCompanyVisibleToAppAccount(
  row: Partial<LocalCompanyDoc> | null | undefined,
  user?: { uid?: string | null; email?: string | null } | null,
): boolean {
  if (!row || !user) return false;
  const uid = String(user.uid || "").trim();
  if (uid && String(row.ownerId || "").trim() === uid) return true;
  const userEmail = email(user.email);
  return Boolean(userEmail && localCompanyAccessEmails(row).includes(userEmail));
}
