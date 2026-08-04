"use client";

import { readCloudSyncDriveShareUsers } from "@/lib/localCloudSync/companyConfig";
import { parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";

export const LOCAL_SHARE_ROUTE_CONFLICT_MESSAGE =
  "This user is already shared through another sharing method. A user can be shared either through PL Server or Google Drive, but not both for the same company.";

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function emailMatchesLocalUser(row: { username?: string; shareEmail?: string | null }, email: string): boolean {
  const em = normalizeEmail(email);
  if (!em.includes("@")) return false;
  return normalizeEmail(row.shareEmail) === em || normalizeEmail(row.username) === em;
}

export function assertCanAddDriveShareUser(
  company: Record<string, unknown> | null | undefined,
  email: string
): void {
  const em = normalizeEmail(email);
  if (!em.includes("@")) return;

  const driveEmails = new Set(readCloudSyncDriveShareUsers(company).map((u) => normalizeEmail(u.email)));
  if (driveEmails.has(em)) return;

  const localUsers = parseLocalCompanyUserRows(company?.localCompanyUsers);
  if (localUsers.some((u) => emailMatchesLocalUser(u, em))) {
    throw new Error(LOCAL_SHARE_ROUTE_CONFLICT_MESSAGE);
  }
}

export function assertCanAddPlServerShareUser(
  company: Record<string, unknown> | null | undefined,
  email: string
): void {
  const em = normalizeEmail(email);
  if (!em.includes("@")) return;
  const driveEmails = new Set(readCloudSyncDriveShareUsers(company).map((u) => normalizeEmail(u.email)));
  if (driveEmails.has(em)) {
    throw new Error(LOCAL_SHARE_ROUTE_CONFLICT_MESSAGE);
  }
}
