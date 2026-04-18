"use client";

/**
 * Local-only company registry in browser SQLite.
 * App static/offline mode me company CRUD isi store se karega.
 */

import { getBrowserDb } from "@/lib/localSqlite";

export type LocalCompanyDoc = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string | null;
  isDeleted?: boolean;
  /** Offline login users (username/password) — `src/lib/localCompanyUsers.ts` */
  localCompanyUsers?: Array<{
    id: string;
    username: string;
    displayName: string;
    role: string;
    password: string;
  }>;
  [key: string]: unknown;
};

function safeParseCompany(json: string): LocalCompanyDoc | null {
  try {
    return JSON.parse(json) as LocalCompanyDoc;
  } catch {
    return null;
  }
}

export async function upsertLocalCompany(company: LocalCompanyDoc): Promise<void> {
  const db = await getBrowserDb();
  if (!db || !company?.id) return;
  const now = Date.now();
  // companies table keeps root company docs for local-only selector/context.
  db.prepare(
    `INSERT INTO companies(id, data, updatedAt)
     VALUES(?,?,?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
  ).run(company.id, JSON.stringify(company), now);
}

export async function getLocalCompanyById(
  companyId: string,
  options?: { includeDeleted?: boolean }
): Promise<LocalCompanyDoc | null> {
  const db = await getBrowserDb();
  if (!db || !companyId) return null;
  const row = db.prepare(`SELECT id, data FROM companies WHERE id = ?`).get(companyId) as { id: string; data: string } | undefined;
  if (!row?.data) return null;
  const parsed = safeParseCompany(row.data);
  if (!parsed) return null;
  if (options?.includeDeleted !== true && parsed.isDeleted === true) return null;
  return { ...parsed, id: row.id };
}

export async function listLocalCompanies(options?: { includeDeleted?: boolean }): Promise<LocalCompanyDoc[]> {
  const db = await getBrowserDb();
  if (!db) return [];
  const rows = db.prepare(`SELECT id, data FROM companies ORDER BY updatedAt DESC`).all() as Array<{ id: string; data: string }>;
  const out: LocalCompanyDoc[] = [];
  const includeDeleted = options?.includeDeleted === true;
  for (const row of rows) {
    const parsed = safeParseCompany(row.data);
    if (!parsed) continue;
    if (!includeDeleted && parsed.isDeleted === true) continue;
    out.push({ ...parsed, id: row.id });
  }
  return out;
}

export async function removeLocalCompanyById(companyId: string): Promise<void> {
  const db = await getBrowserDb();
  if (!db || !companyId) return;
  // Permanent delete: local company registry se row remove karo.
  db.prepare(`DELETE FROM companies WHERE id = ?`).run(companyId);
}
