"use client";

/**
 * Offline local companies: company users sirf browser SQLite company row me (localCompanyUsers).
 * Local Node API (127.0.0.1:3001) optional — baad me sync add ho sakta hai.
 */

import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { setBackupEncryptionSessionFromLogin } from "@/lib/serverBackupEncryption";

/** Company user row — password local blob me (device pe hi), server jaisa trust model. */
export type LocalCompanyUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  password: string;
};

/** UI list ke liye password field hata do. */
export function localCompanyUsersToPublicList(
  rows: LocalCompanyUserRecord[]
): Array<{ id: string; username: string; displayName?: string; role?: string }> {
  return rows.map(({ id, username, displayName, role }) => ({
    id,
    username,
    displayName,
    role,
  }));
}

/** Firestore/local JSON se users array normalize karo (Edit + create flow). */
export function parseLocalCompanyUserRows(raw: unknown): LocalCompanyUserRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalCompanyUserRecord[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const username = typeof o.username === "string" ? o.username : "";
    const displayName = typeof o.displayName === "string" ? o.displayName : "";
    const role = typeof o.role === "string" ? o.role : "manager";
    const password = typeof o.password === "string" ? o.password : "";
    if (!id || !username) continue;
    out.push({ id, username, displayName, role, password });
  }
  return out;
}

/** Same username par naya password/display update; naya user ho to push. */
export function upsertUserInList(
  list: LocalCompanyUserRecord[],
  entry: { username: string; displayName: string; role: string; password: string }
): LocalCompanyUserRecord[] {
  const u = entry.username.trim().toLowerCase();
  const idx = list.findIndex((x) => x.username.toLowerCase() === u);
  const id = idx >= 0 ? list[idx].id : `lcu_${crypto.randomUUID()}`;
  const row: LocalCompanyUserRecord = {
    id,
    username: entry.username.trim(),
    displayName: entry.displayName.trim(),
    role: entry.role.trim().toLowerCase() || "manager",
    password: entry.password,
  };
  const next = [...list];
  if (idx >= 0) next[idx] = row;
  else next.push(row);
  return next;
}

/** SQLite company doc se users array read (validated). */
export async function getLocalCompanyUsersRecords(companyId: string): Promise<LocalCompanyUserRecord[]> {
  const doc = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!doc) return [];
  return parseLocalCompanyUserRows((doc as LocalCompanyDoc & { localCompanyUsers?: unknown }).localCompanyUsers);
}

/**
 * Ek naya user add karo — duplicate username par error throw.
 */
/** Saved user row hatao (Edit Company → Existing users list). */
export async function removeLocalCompanyUserByIdClient(companyId: string, userId: string): Promise<void> {
  const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!existing) throw new Error("Local company not found");
  const prev = parseLocalCompanyUserRows((existing as LocalCompanyDoc & { localCompanyUsers?: unknown }).localCompanyUsers);
  const next = prev.filter((x) => x.id !== userId);
  await upsertLocalCompany({
    ...existing,
    id: companyId,
    localCompanyUsers: next,
    updatedAt: Date.now(),
  } as LocalCompanyDoc);
}

/** Display name / role / password update — password khali chhodo to purana hi rahe. */
export async function updateLocalCompanyUserClient(
  companyId: string,
  userId: string,
  patch: { displayName?: string; role?: string; password?: string }
): Promise<void> {
  const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!existing) throw new Error("Local company not found");
  const prev = parseLocalCompanyUserRows((existing as LocalCompanyDoc & { localCompanyUsers?: unknown }).localCompanyUsers);
  const idx = prev.findIndex((x) => x.id === userId);
  if (idx < 0) throw new Error("User not found");
  const row = { ...prev[idx] };
  if (patch.displayName !== undefined) row.displayName = patch.displayName.trim();
  if (patch.role !== undefined) row.role = patch.role.trim().toLowerCase() || "manager";
  if (patch.password !== undefined && patch.password.length > 0) row.password = patch.password;
  const next = [...prev];
  next[idx] = row;
  await upsertLocalCompany({
    ...existing,
    id: companyId,
    localCompanyUsers: next,
    updatedAt: Date.now(),
  } as LocalCompanyDoc);
}

export async function appendLocalCompanyUserClient(
  companyId: string,
  entry: { username: string; displayName: string; role: string; password: string }
): Promise<void> {
  const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!existing) throw new Error("Local company not found");
  const prev = parseLocalCompanyUserRows((existing as LocalCompanyDoc & { localCompanyUsers?: unknown }).localCompanyUsers);
  const u = entry.username.trim().toLowerCase();
  if (prev.some((x) => x.username.toLowerCase() === u)) {
    throw new Error("Username already exists for this company.");
  }
  const next = upsertUserInList(prev, entry);
  await upsertLocalCompany({
    ...existing,
    id: companyId,
    localCompanyUsers: next,
    updatedAt: Date.now(),
  } as LocalCompanyDoc);
}

/**
 * Username/password se session — bina local API ke (static / offline admin flow).
 * Pehle `localCompanyUsers` rows; match na ho to company doc ka adminUsername + root company password (purana / bina row data).
 */
export async function localAuthLoginClientOnly(
  companyId: string,
  username: string,
  password: string
): Promise<{ token: string; user: { id: string; username: string; displayName?: string; role?: string } }> {
  const u = username.trim().toLowerCase();
  const p = password.trim();

  const users = await getLocalCompanyUsersRecords(companyId);
  const match = users.find((x) => x.username.toLowerCase() === u && x.password === p);
  if (match) {
    const token = `local_client_${companyId}_${match.id}_${Date.now()}`;
    if (typeof window !== "undefined") {
      void setBackupEncryptionSessionFromLogin(companyId, username, password);
    }
    return {
      token,
      user: {
        id: match.id,
        username: match.username,
        displayName: match.displayName,
        role: match.role,
      },
    };
  }

  const doc = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!doc) throw new Error("Invalid username or password");

  const companyPw = String((doc as { password?: string | null }).password ?? "");
  if (!companyPw || p !== companyPw) throw new Error("Invalid username or password");

  let adminLogin = String((doc as { adminUsername?: string | null }).adminUsername ?? "").trim();
  if (!adminLogin) {
    const oe = String((doc as { ownerEmail?: string | null }).ownerEmail ?? "");
    adminLogin = oe.includes("@") ? oe.split("@")[0].trim() : "";
  }

  if (adminLogin && u === adminLogin.toLowerCase()) {
    const token = `local_client_${companyId}_admin_fallback_${Date.now()}`;
    if (typeof window !== "undefined") {
      void setBackupEncryptionSessionFromLogin(companyId, username, password);
    }
    return {
      token,
      user: {
        id: "local_admin_fallback",
        username: adminLogin,
        displayName: "Admin",
        role: "manager",
      },
    };
  }

  throw new Error("Invalid username or password");
}
