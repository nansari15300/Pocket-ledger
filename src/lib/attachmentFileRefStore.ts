"use client";

import { getBrowserDb } from "@/lib/localSqlite";

export type AttachmentRefScope = "pending_file" | "offline_cache";

export type AttachmentFileRefRow = {
  scope: AttachmentRefScope;
  id: string;
  filePath: string;
  contentType: string | null;
  size: number;
  metaJson: string | null;
  updatedAt: number;
  /** Native DataDirectory file integrity — open/read par verify. */
  sha256Hex?: string | null;
};

/** SQLite row upsert: binary bytes alag DataDirectory me, yahan stable path+meta only. */
export async function upsertAttachmentFileRef(
  row: AttachmentFileRefRow,
  options?: { required?: boolean }
): Promise<void> {
  const db = await getBrowserDb();
  if (!db) {
    if (options?.required) {
      throw new Error("Local database not ready — could not index restored attachment");
    }
    return;
  }
  db.prepare(
    `INSERT INTO attachment_file_refs(scope, id, file_path, content_type, size, meta_json, updatedAt, sha256_hex)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(scope, id) DO UPDATE SET
       file_path = excluded.file_path,
       content_type = excluded.content_type,
       size = excluded.size,
       meta_json = excluded.meta_json,
       updatedAt = excluded.updatedAt,
       sha256_hex = COALESCE(excluded.sha256_hex, attachment_file_refs.sha256_hex)`
  ).run(
    row.scope,
    row.id,
    row.filePath,
    row.contentType ?? null,
    Math.max(0, Number(row.size || 0)),
    row.metaJson ?? null,
    row.updatedAt || Date.now(),
    row.sha256Hex ?? null
  );
}

/** Single lookup by (scope,id). */
export async function getAttachmentFileRef(
  scope: AttachmentRefScope,
  id: string
): Promise<AttachmentFileRefRow | null> {
  const db = await getBrowserDb();
  if (!db) return null;
  const row = db
    .prepare(
      `SELECT scope, id, file_path, content_type, size, meta_json, updatedAt, sha256_hex
       FROM attachment_file_refs
       WHERE scope = ? AND id = ?`
    )
    .get(scope, id) as
    | {
        scope: AttachmentRefScope;
        id: string;
        file_path: string;
        content_type: string | null;
        size: number | null;
        meta_json: string | null;
        updatedAt: number | null;
        sha256_hex: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    scope: row.scope,
    id: row.id,
    filePath: row.file_path,
    contentType: row.content_type ?? null,
    size: Number(row.size || 0),
    metaJson: row.meta_json ?? null,
    updatedAt: Number(row.updatedAt || 0),
    sha256Hex: row.sha256_hex ? String(row.sha256_hex) : null,
  };
}

/** Scope list (pending sync loop, budget cleanup, diagnostics). */
export async function listAttachmentFileRefs(scope: AttachmentRefScope): Promise<AttachmentFileRefRow[]> {
  const db = await getBrowserDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT scope, id, file_path, content_type, size, meta_json, updatedAt, sha256_hex
       FROM attachment_file_refs
       WHERE scope = ?
       ORDER BY updatedAt ASC`
    )
    .all(scope) as Array<{
    scope: AttachmentRefScope;
    id: string;
    file_path: string;
    content_type: string | null;
    size: number | null;
    meta_json: string | null;
    updatedAt: number | null;
    sha256_hex: string | null;
  }>;
  return rows.map((r) => ({
    scope: r.scope,
    id: r.id,
    filePath: r.file_path,
    contentType: r.content_type ?? null,
    size: Number(r.size || 0),
    metaJson: r.meta_json ?? null,
    updatedAt: Number(r.updatedAt || 0),
    sha256Hex: r.sha256_hex ? String(r.sha256_hex) : null,
  }));
}

/** Delete one ref (caller disk file cleanup alag se kare). */
export async function deleteAttachmentFileRef(scope: AttachmentRefScope, id: string): Promise<void> {
  const db = await getBrowserDb();
  if (!db) return;
  db.prepare("DELETE FROM attachment_file_refs WHERE scope = ? AND id = ?").run(scope, id);
}
