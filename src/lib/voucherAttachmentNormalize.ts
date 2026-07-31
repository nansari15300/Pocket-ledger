"use client";

/** Backup / restore / Firestore — `fileUrls` kabhi string, kabhi array; UI hamesha array expect karta hai. */
export function normalizeFileUrlsField(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter((u): u is string => Boolean(u));
  }
  if (typeof val === "string") {
    const s = val.trim();
    return s ? [s] : [];
  }
  return [];
}

/**
 * EXE/PL restore kabhi `entries` / `lineItems` ko object bana deta hai.
 * `x?.some(...)` phir bhi crash: truthy object pe `.some is not a function`.
 */
export function normalizeVoucherArrayField<T = unknown>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val == null) return [];
  if (typeof val === "object") {
    // Firestore-ish map / sparse object → values if they look like row objects
    const values = Object.values(val as Record<string, unknown>);
    if (values.length > 0 && values.every((v) => v != null && typeof v === "object")) {
      return values as T[];
    }
  }
  return [];
}

/** Ledger File column + edit dialog — `fileUrls` array/string + legacy `unassignedFile.url`. */
export function getVoucherAttachmentUrlsForUi(
  row: { fileUrls?: unknown; unassignedFile?: unknown } | null | undefined
): string[] {
  if (!row) return [];
  const urls = normalizeFileUrlsField(row.fileUrls);
  if (urls.length > 0) return urls;
  const uf = row.unassignedFile;
  if (uf && typeof uf === "object" && uf !== null) {
    const url = String((uf as { url?: string }).url || "").trim();
    if (url) return [url];
  }
  return [];
}

/** Duplicate `fileUrls` / double-upload race se bachne ke liye stable unique list. */
export function dedupeVoucherAttachmentUrlList(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = String(raw || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Voucher edit form `files` state — UI + save dono ke liye ek source (string URL ya copy-draft `File`). */
export function voucherAttachmentUrlsForFormState(
  row: { fileUrls?: unknown; unassignedFile?: unknown } | null | undefined
): (File | string)[] {
  if (!row) return [];
  const mixed: (File | string)[] = [];
  if (Array.isArray(row.fileUrls)) {
    for (const u of row.fileUrls) {
      if (typeof File !== "undefined" && u instanceof File) {
        mixed.push(u);
        continue;
      }
      if (typeof u === "string" && u.trim()) mixed.push(u.trim());
    }
  }
  if (mixed.length > 0) {
    const seen = new Set<string>();
    const out: (File | string)[] = [];
    for (const entry of mixed) {
      if (typeof File !== "undefined" && entry instanceof File) {
        out.push(entry);
        continue;
      }
      const s = String(entry || "").trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }
  return dedupeVoucherAttachmentUrlList(getVoucherAttachmentUrlsForUi(row));
}

const VOUCHER_COLLECTION_FIELDS = [
  "entries",
  "lineItems",
  "items",
  "allocations",
  "files",
] as const;

/**
 * Voucher list rows — table / filters / staff calendar:
 * - `fileUrls: string[]`
 * - `entries` / `lineItems` / … hamesha arrays (EXE restore object crash avoid)
 */
export function normalizeVoucherRowAttachmentsForUi<T extends Record<string, unknown>>(row: T): T {
  let next: Record<string, unknown> = row;
  let changed = false;

  const urls = getVoucherAttachmentUrlsForUi(row);
  const prevUrls = normalizeFileUrlsField(row.fileUrls);
  const urlsSame =
    urls.length === prevUrls.length && urls.every((u, i) => u === prevUrls[i]) && Array.isArray(row.fileUrls);
  if (!urlsSame && (urls.length > 0 || row.fileUrls != null)) {
    next = { ...next, fileUrls: urls };
    changed = true;
  }

  for (const key of VOUCHER_COLLECTION_FIELDS) {
    const raw = next[key] ?? row[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) continue;
    const normalized = normalizeVoucherArrayField(raw);
    if (!changed) next = { ...next };
    next[key] = normalized;
    changed = true;
  }

  return (changed ? next : row) as T;
}
