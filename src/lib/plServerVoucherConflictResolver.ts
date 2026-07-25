"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { formatVoucherNumber, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";

type VoucherRow = Record<string, unknown> & { id?: string };

type ConflictEntry = {
  id: string;
  row: VoucherRow;
  source: "existing" | "incoming";
  sourceOrder: number;
};

const SYSTEM_USER_ID = "system";
const SYSTEM_USER_NAME = "System";

const VOLATILE_COMPARE_KEYS = new Set([
  "id",
  "history",
  "createdAt",
  "updatedAt",
  "lastEditedAt",
  "deletedAt",
  "movedToAdminRecycleAt",
  "lastEditedBy",
  "lastEditedByUserName",
  "changedBy",
  "changedByName",
  "userId",
  "createdBy",
  "createdByUserId",
  "__plClientOfflineFirstPersistMs",
  "__plServerConfirmedAt",
  "__plConflictResolvedAt",
  "__plConflictResolution",
]);

function isDeletedVoucher(row: VoucherRow): boolean {
  return row.isDeleted === true || row.deleted === true || row.movedToAdminRecycleAt != null;
}

function timestampMs(raw: unknown): number {
  if (raw == null) return 0;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof raw === "object") {
    const o = raw as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
      __fsTs?: boolean;
    };
    if (typeof o.toMillis === "function") {
      try {
        const ms = o.toMillis();
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    }
    if (typeof o.toDate === "function") {
      try {
        const ms = o.toDate().getTime();
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    }
    const seconds = typeof o.seconds === "number" ? o.seconds : o._seconds;
    if (typeof seconds === "number") {
      const ns =
        typeof o.nanoseconds === "number"
          ? o.nanoseconds
          : typeof o._nanoseconds === "number"
            ? o._nanoseconds
            : 0;
      return seconds * 1000 + Math.floor(ns / 1e6);
    }
  }
  return 0;
}

function editTimeMs(row: VoucherRow): number {
  let max = 0;
  for (const key of ["lastEditedAt", "updatedAt", "deletedAt", "movedToAdminRecycleAt", "createdAt"] as const) {
    max = Math.max(max, timestampMs(row[key]));
  }
  const offlineMs = row.__plClientOfflineFirstPersistMs;
  if (typeof offlineMs === "number" && Number.isFinite(offlineMs)) max = Math.max(max, offlineMs);
  return max;
}

function canonicalValue(value: unknown): unknown {
  const ts = timestampMs(value);
  if (ts > 0 && (value instanceof Date || (typeof value === "object" && value != null))) return `ts:${ts}`;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_COMPARE_KEYS.has(key) || key.startsWith("__pl")) continue;
      out[key] = canonicalValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value ?? null;
}

function businessFingerprint(row: VoucherRow): string {
  return JSON.stringify(canonicalValue(row));
}

function voucherNumberKey(row: VoucherRow): string {
  const voucherNumber = String(row.voucherNumber || row.voucherNo || "").trim();
  if (!voucherNumber || isDeletedVoucher(row)) return "";
  return `${String(row.type || "").trim().toLowerCase()}|${voucherNumber.toLowerCase().replace(/\s+/g, " ")}`;
}

function parseNumberShape(voucherNumber: string): { prefix: string; num: number } {
  const text = String(voucherNumber || "").trim();
  const match = text.match(/^(.*?)(\d+)\s*$/);
  if (!match) return { prefix: text.replace(/[\s-]+$/, "") || "V", num: 0 };
  const prefix = String(match[1] || "").replace(/[\s-]+$/, "") || "V";
  const num = parseVoucherNumberPart(text, prefix);
  return { prefix, num: Number.isFinite(num) ? num : Number(match[2]) || 0 };
}

function numberSetKey(type: unknown, voucherNumber: string): string {
  const shape = parseNumberShape(voucherNumber);
  return `${String(type || "").trim().toLowerCase()}|${shape.prefix.toLowerCase()}|${shape.num}`;
}

function nextSerializedVoucherNumber(type: unknown, voucherNumber: string, used: Set<string>): string {
  const shape = parseNumberShape(voucherNumber);
  let next = Math.max(1, shape.num + 1);
  while (used.has(`${String(type || "").trim().toLowerCase()}|${shape.prefix.toLowerCase()}|${next}`)) {
    next += 1;
  }
  const out = formatVoucherNumber(shape.prefix, next);
  used.add(numberSetKey(type, out));
  return out;
}

function compareByEditTimeAsc(a: ConflictEntry, b: ConflictEntry): number {
  const ta = editTimeMs(a.row);
  const tb = editTimeMs(b.row);
  if (ta !== tb) return ta - tb;
  if (a.source !== b.source) return a.source === "existing" ? -1 : 1;
  return a.sourceOrder - b.sourceOrder;
}

function systemHistoryEntry(from: string, to: string, reason: string): Record<string, unknown> {
  return {
    changedAt: new Date(),
    changedBy: SYSTEM_USER_ID,
    changedByName: SYSTEM_USER_NAME,
    changes: {
      voucherNumber: { from, to },
      conflictResolution: { from: "Duplicate voucher number", to: reason },
    },
  };
}

function withSystemRenumber(row: VoucherRow, nextVoucherNumber: string): VoucherRow {
  const previous = String(row.voucherNumber || row.voucherNo || "").trim();
  const existingHistory = Array.isArray(row.history) ? row.history : [];
  const now = new Date();
  return {
    ...row,
    voucherNumber: nextVoucherNumber,
    lastEditedAt: now,
    updatedAt: now,
    lastEditedBy: SYSTEM_USER_ID,
    lastEditedByUserName: SYSTEM_USER_NAME,
    history: [
      systemHistoryEntry(previous, nextVoucherNumber, "PLServer auto serialized duplicate voucher number"),
      ...existingHistory,
    ].slice(0, 100),
    __plConflictResolvedAt: now.toISOString(),
    __plConflictResolution: "renumber_duplicate_voucher_number",
  };
}

function withSystemTombstone(row: VoucherRow, keptId: string): VoucherRow {
  const now = new Date();
  return {
    ...row,
    isDeleted: true,
    deleted: true,
    deletedAt: now,
    lastEditedAt: now,
    updatedAt: now,
    lastEditedBy: SYSTEM_USER_ID,
    lastEditedByUserName: SYSTEM_USER_NAME,
    __plConflictResolvedAt: now.toISOString(),
    __plConflictResolution: `duplicate_identical_replaced_by:${keptId}`,
  };
}

export async function resolvePlServerIncomingVoucherNumberConflicts(
  companyId: string,
  collection: string,
  docs: unknown[]
): Promise<{ docs: unknown[]; resolved: number }> {
  if (collection !== "vouchers" || !companyId || !Array.isArray(docs) || docs.length === 0) {
    return { docs, resolved: 0 };
  }

  const incoming = docs
    .filter((row): row is VoucherRow => Boolean(row && typeof row === "object"))
    .map((row, index) => ({ id: String((row as VoucherRow).id || "").trim(), row: row as VoucherRow, source: "incoming" as const, sourceOrder: index }))
    .filter((entry) => entry.id);
  if (incoming.length === 0) return { docs, resolved: 0 };

  const existingRows = await listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
  const incomingIds = new Set(incoming.map((entry) => entry.id));
  const byId = new Map<string, ConflictEntry>();
  existingRows.forEach((row, index) => {
    const id = String((row as VoucherRow).id || "").trim();
    if (id && !incomingIds.has(id)) byId.set(id, { id, row: row as VoucherRow, source: "existing", sourceOrder: index });
  });
  incoming.forEach((entry) => byId.set(entry.id, entry));

  const all = Array.from(byId.values());
  const groups = new Map<string, ConflictEntry[]>();
  const usedNumbers = new Set<string>();
  for (const entry of all) {
    if (isDeletedVoucher(entry.row)) continue;
    const no = String(entry.row.voucherNumber || entry.row.voucherNo || "").trim();
    if (no) usedNumbers.add(numberSetKey(entry.row.type, no));
    const key = voucherNumberKey(entry.row);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(entry);
    groups.set(key, arr);
  }

  const patches = new Map<string, VoucherRow>();
  let resolved = 0;
  for (const entries of groups.values()) {
    if (entries.length <= 1) continue;

    const byFingerprint = new Map<string, ConflictEntry[]>();
    for (const entry of entries) {
      const fp = businessFingerprint(entry.row);
      const arr = byFingerprint.get(fp) || [];
      arr.push(entry);
      byFingerprint.set(fp, arr);
    }

    const survivors: ConflictEntry[] = [];
    for (const bucket of byFingerprint.values()) {
      if (bucket.length === 1) {
        survivors.push(bucket[0]);
        continue;
      }
      const sorted = [...bucket].sort(compareByEditTimeAsc);
      const keep = sorted[sorted.length - 1];
      survivors.push(keep);
      for (const duplicate of sorted.slice(0, -1)) {
        patches.set(duplicate.id, withSystemTombstone(duplicate.row, keep.id));
        resolved += 1;
      }
    }

    if (survivors.length <= 1) continue;
    const sortedSurvivors = [...survivors].sort(compareByEditTimeAsc);
    for (const duplicate of sortedSurvivors.slice(1)) {
      const currentNo = String(duplicate.row.voucherNumber || duplicate.row.voucherNo || "").trim();
      const nextNo = nextSerializedVoucherNumber(duplicate.row.type, currentNo, usedNumbers);
      patches.set(duplicate.id, withSystemRenumber(duplicate.row, nextNo));
      resolved += 1;
    }
  }

  if (patches.size === 0) return { docs, resolved: 0 };
  const output = incoming.map((entry) => patches.get(entry.id) || entry.row);
  for (const [id, patch] of patches) {
    if (!incomingIds.has(id)) output.push(patch);
  }
  return { docs: output, resolved };
}
