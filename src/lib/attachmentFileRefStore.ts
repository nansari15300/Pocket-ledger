"use client";

import { getBrowserDbForNamespace } from "@/lib/localSqlite";
import { SQLITE_STORAGE_NAMESPACES } from "@/lib/sqliteStorageNamespace";

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

/** Device-level attachment index lives in the local SQLite folder. */
async function getAttachmentIndexDb() {
  return getBrowserDbForNamespace("local");
}

/** SQLite row upsert: binary bytes alag DataDirectory me, yahan stable path+meta only. */
export async function upsertAttachmentFileRef(
  row: AttachmentFileRefRow,
  options?: { required?: boolean }
): Promise<void> {
  const db = await getAttachmentIndexDb();
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

/** Single lookup by (scope,id) — scan all folders for legacy rows. */
export async function getAttachmentFileRef(
  scope: AttachmentRefScope,
  id: string
): Promise<AttachmentFileRefRow | null> {
  for (const ns of SQLITE_STORAGE_NAMESPACES) {
    const db = await getBrowserDbForNamespace(ns);
    if (!db) continue;
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
    if (!row) continue;
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
  return null;
}

/** Scope list (pending sync loop, budget cleanup, diagnostics). */
export async function listAttachmentFileRefs(scope: AttachmentRefScope): Promise<AttachmentFileRefRow[]> {
  const seen = new Set<string>();
  const out: AttachmentFileRefRow[] = [];
  for (const ns of SQLITE_STORAGE_NAMESPACES) {
    const db = await getBrowserDbForNamespace(ns);
    if (!db) continue;
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
    for (const r of rows) {
      const key = `${r.scope}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        scope: r.scope,
        id: r.id,
        filePath: r.file_path,
        contentType: r.content_type ?? null,
        size: Number(r.size || 0),
        metaJson: r.meta_json ?? null,
        updatedAt: Number(r.updatedAt || 0),
        sha256Hex: r.sha256_hex ? String(r.sha256_hex) : null,
      });
    }
  }
  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Delete one ref (caller disk file cleanup alag se kare). */
export async function deleteAttachmentFileRef(scope: AttachmentRefScope, id: string): Promise<void> {
  for (const ns of SQLITE_STORAGE_NAMESPACES) {
    const db = await getBrowserDbForNamespace(ns);
    if (!db) continue;
    db.prepare("DELETE FROM attachment_file_refs WHERE scope = ? AND id = ?").run(scope, id);
  }
}
