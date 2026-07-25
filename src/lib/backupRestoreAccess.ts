"use client";

/** Normalize email for backup restore allow-list checks. */
export function normalizeBackupRestoreEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

export function isValidRestoreAllowedGmail(raw: unknown): boolean {
  const email = normalizeBackupRestoreEmail(raw);
  return email.includes("@") && email.includes(".");
}

/** Unique valid restore Gmail list — merges legacy single field + array. */
export function normalizeRestoreAllowedGmailList(
  gmails?: unknown[] | null,
  legacySingle?: unknown
): string[] {
  const out = new Set<string>();
  const legacy = normalizeBackupRestoreEmail(legacySingle);
  if (legacy && isValidRestoreAllowedGmail(legacy)) out.add(legacy);
  if (Array.isArray(gmails)) {
    for (const row of gmails) {
      const email = normalizeBackupRestoreEmail(row);
      if (email && isValidRestoreAllowedGmail(email)) out.add(email);
    }
  }
  return [...out];
}

/** Emails allowed to restore this backup (owner + explicit restore Gmail). */
export function collectBackupRestoreAllowedEmails(
  backupCompanyDetails: Record<string, unknown> | null | undefined
): string[] {
  if (!backupCompanyDetails) return [];
  const out = new Set<string>();
  const owner = normalizeBackupRestoreEmail(backupCompanyDetails.ownerEmail);
  if (owner) out.add(owner);

  const explicit = normalizeBackupRestoreEmail(backupCompanyDetails.backupRestoreGmail);
  if (explicit) out.add(explicit);

  const legacyList = backupCompanyDetails.backupRestoreEmails;
  if (Array.isArray(legacyList)) {
    for (const row of legacyList) {
      const email = normalizeBackupRestoreEmail(row);
      if (email) out.add(email);
    }
  }

  return [...out];
}

export function canUserRestoreBackup(args: {
  userUid?: string | null;
  userEmail?: string | null;
  backupCompanyDetails: Record<string, unknown> | null | undefined;
}): boolean {
  const details = args.backupCompanyDetails;
  if (!details) return false;

  const backupOwnerId = String(details.ownerId || "").trim();
  const userUid = String(args.userUid || "").trim();
  if (userUid && backupOwnerId && userUid === backupOwnerId) return true;

  const currentEmail = normalizeBackupRestoreEmail(args.userEmail);
  if (!currentEmail) return false;

  const allowed = collectBackupRestoreAllowedEmails(details);
  return allowed.includes(currentEmail);
}
