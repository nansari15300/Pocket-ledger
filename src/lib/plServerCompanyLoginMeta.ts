"use client";

import type { CompanyUnlockRow } from "@/lib/companyUnlockGate";
import {
  companyDocRequiresUnlock,
  offlineCompanyHasLocalLoginUsers,
} from "@/lib/companyUnlockGate";
import { findLocalCompanyUserRowForAppUser, parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";

export type PlServerCompanyLoginMeta = {
  requiresLogin: boolean;
  usernameHint: string | null;
};

/** Host company doc se — client gate unlock dialog / passwordless open. */
export function computePlServerCompanyLoginMeta(
  doc: unknown,
  appEmail?: string | null,
  appUid?: string | null
): PlServerCompanyLoginMeta {
  if (!doc || typeof doc !== "object") {
    return { requiresLogin: false, usernameHint: null };
  }
  const row = doc as CompanyUnlockRow & { localCompanyUsers?: unknown };
  const hasLocalLoginUsers = offlineCompanyHasLocalLoginUsers(row);
  const requiresLogin =
    companyDocRequiresUnlock(row, appEmail, appUid, false) ||
    (!appEmail?.trim() && !appUid?.trim() && hasLocalLoginUsers);
  const users = parseLocalCompanyUserRows(row.localCompanyUsers);
  let usernameHint: string | null = null;

  const userRow = findLocalCompanyUserRowForAppUser(users, appUid, appEmail);
  if (userRow?.username?.trim()) {
    usernameHint = userRow.username.trim();
  } else if (appEmail?.trim()) {
    const email = appEmail.trim().toLowerCase();
    const byEmailUsername = users.find((u) => u.username.trim().toLowerCase() === email);
    if (byEmailUsername?.username?.trim()) usernameHint = byEmailUsername.username.trim();
    else if (email.includes("@")) usernameHint = email.split("@")[0] || null;
  } else if (users.length === 1 && users[0]?.username?.trim()) {
    usernameHint = users[0].username.trim();
  }

  if (!requiresLogin) {
    return { requiresLogin: false, usernameHint };
  }
  if (!usernameHint && hasLocalLoginUsers) {
    const first = users.find((u) => u.username?.trim());
    if (first?.username?.trim()) usernameHint = first.username.trim();
  }
  return { requiresLogin: true, usernameHint };
}

export function loginMetaFromSharedSummary(row: unknown): PlServerCompanyLoginMeta | null {
  if (!row || typeof row !== "object") return null;
  const summary = row as { requiresLogin?: unknown; usernameHint?: unknown };
  if (typeof summary.requiresLogin !== "boolean") return null;
  return {
    requiresLogin: summary.requiresLogin,
    usernameHint:
      typeof summary.usernameHint === "string" && summary.usernameHint.trim()
        ? summary.usernameHint.trim()
        : null,
  };
}
