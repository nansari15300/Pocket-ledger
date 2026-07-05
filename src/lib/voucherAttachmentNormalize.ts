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

/** Voucher edit form `files` state — UI + save dono ke liye ek source. */
export function voucherAttachmentUrlsForFormState(
  row: { fileUrls?: unknown; unassignedFile?: unknown } | null | undefined
): string[] {
  return dedupeVoucherAttachmentUrlList(getVoucherAttachmentUrlsForUi(row));
}

/** Voucher list rows — table / filters ke liye hamesha `fileUrls: string[]`. */
export function normalizeVoucherRowAttachmentsForUi<T extends Record<string, unknown>>(row: T): T {
  const urls = getVoucherAttachmentUrlsForUi(row);
  const prev = normalizeFileUrlsField(row.fileUrls);
  if (urls.length === prev.length && urls.every((u, i) => u === prev[i])) {
    if (Array.isArray(row.fileUrls)) return row;
    if (row.fileUrls === undefined || row.fileUrls === null) return row;
  }
  return { ...row, fileUrls: urls };
}
