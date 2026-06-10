"use client";

import { offlineCacheKeyForAttachmentRef } from "@/lib/attachmentRefBlobFetch";
import { appNavHref } from "@/lib/appNavHref";
import {
  looksLikeFirebaseStorageObjectPath,
  normalizeFirebaseStorageObjectPathForSdk,
  tryGetStoragePathFromFirebaseDownloadUrl,
} from "@/lib/firebaseStorageDownloadUrl";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";

export type AttachmentVoucherHit = {
  id: string;
  voucherNumber: string;
  type: string;
  companyId: string;
};

export type AttachmentPathFingerprint = {
  objectPath: string | null;
  storageCompanyFolder: string | null;
  voucherFolder: string | null;
  fileTail: string | null;
  fileDisplay: string | null;
};

/** Same attachment — signed URL, raw path, cache key variants. */
export function normalizeAttachmentRefCompareKeys(
  ref: string,
  mirrorCompanyId?: string
): string[] {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  const cacheKey = offlineCacheKeyForAttachmentRef(trimmed);
  if (cacheKey) keys.add(cacheKey);

  const pathFromUrl = tryGetStoragePathFromFirebaseDownloadUrl(trimmed);
  if (pathFromUrl) {
    keys.add(pathFromUrl);
    keys.add(`firebase-object:${pathFromUrl}`);
  }
  if (looksLikeFirebaseStorageObjectPath(trimmed)) {
    const norm = normalizeFirebaseStorageObjectPathForSdk(trimmed, { companyId: mirrorCompanyId });
    if (norm) {
      keys.add(norm);
      keys.add(`firebase-object:${norm}`);
    }
  }
  const normWithCompany = normalizeFirebaseStorageObjectPathForSdk(trimmed, { companyId: mirrorCompanyId });
  if (normWithCompany) keys.add(normWithCompany);
  return [...keys];
}

export function attachmentPathFingerprint(
  ref: string,
  mirrorCompanyId?: string
): AttachmentPathFingerprint {
  const keys = normalizeAttachmentRefCompareKeys(ref, mirrorCompanyId);
  let objectPath: string | null = null;
  for (const k of keys) {
    if (/^voucher-files\//i.test(k)) {
      objectPath = k;
      break;
    }
  }
  if (!objectPath) {
    objectPath = tryGetStoragePathFromFirebaseDownloadUrl(ref);
  }
  if (!objectPath) return { objectPath: null, storageCompanyFolder: null, voucherFolder: null, fileTail: null, fileDisplay: null };

  const parts = objectPath.split("/").filter(Boolean);
  if (parts[0] !== "voucher-files" || parts.length < 4) {
    return { objectPath, storageCompanyFolder: null, voucherFolder: null, fileTail: null, fileDisplay: null };
  }
  const fileTail = parts.slice(3).join("/");
  const decoded = decodeURIComponent(fileTail.replace(/\+/g, " "));
  return {
    objectPath,
    storageCompanyFolder: parts[1] ?? null,
    voucherFolder: parts[2] ?? null,
    fileTail: decoded,
    fileDisplay: decoded.replace(/^\d+_/, ""),
  };
}

export function attachmentRefsLikelySame(
  a: string,
  b: string,
  mirrorCompanyId?: string
): boolean {
  const keysB = new Set(normalizeAttachmentRefCompareKeys(b, mirrorCompanyId));
  if (keysB.size === 0) return false;
  if (normalizeAttachmentRefCompareKeys(a, mirrorCompanyId).some((k) => keysB.has(k))) return true;

  const fpA = attachmentPathFingerprint(a, mirrorCompanyId);
  const fpB = attachmentPathFingerprint(b, mirrorCompanyId);
  if (!fpA.fileTail || !fpB.fileTail) return false;
  if (fpA.voucherFolder && fpB.voucherFolder && fpA.voucherFolder !== fpB.voucherFolder) return false;
  if (fpA.fileTail === fpB.fileTail) return true;
  if (fpA.fileDisplay && fpB.fileDisplay && fpA.fileDisplay === fpB.fileDisplay) return true;
  return false;
}

export function registerAttachmentVoucherLookupKeys(
  index: Map<string, AttachmentVoucherHit>,
  attachmentRef: string,
  hit: AttachmentVoucherHit,
  mirrorCompanyId?: string
): void {
  for (const key of normalizeAttachmentRefCompareKeys(attachmentRef, mirrorCompanyId)) {
    index.set(key, hit);
  }
  const cacheKey = offlineCacheKeyForAttachmentRef(attachmentRef);
  if (cacheKey) index.set(cacheKey, hit);
}

export function indexVoucherRowsForAttachmentLookup(
  rows: unknown[],
  mirrorCompanyId: string,
  index: Map<string, AttachmentVoucherHit>
): void {
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    if (!id) continue;
    const voucherNumber = String(r.voucherNumber || "").trim();
    const hit: AttachmentVoucherHit = {
      id,
      voucherNumber: voucherNumber || id,
      type: String(r.type || "").trim(),
      companyId: mirrorCompanyId,
    };
    const fileUrls = r.fileUrls;
    if (!Array.isArray(fileUrls)) continue;
    for (const raw of fileUrls) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      registerAttachmentVoucherLookupKeys(index, raw, hit, mirrorCompanyId);
    }
  }
}

export function lookupVoucherInAttachmentPrefetchIndex(
  index: Map<string, AttachmentVoucherHit> | null | undefined,
  ref: string,
  mirrorCompanyId?: string
): AttachmentVoucherHit | null {
  if (!index?.size) return null;
  for (const key of normalizeAttachmentRefCompareKeys(ref, mirrorCompanyId)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

/** SQLite mirror: `fileUrls` me attachment ref dhundho → voucher id + number. */
export async function findVoucherInLocalMirrorByAttachmentRef(
  companyId: string,
  attachmentRef: string,
  mirrorCompanyId?: string
): Promise<AttachmentVoucherHit | null> {
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  const fp = attachmentPathFingerprint(attachmentRef, mirrorCompanyId || cid);
  try {
    const rows = await listCompanyDocsFromBrowserDb(cid, "vouchers");
    let filenameFallback: AttachmentVoucherHit | null = null;
    for (const row of rows) {
      const urls = (row as { fileUrls?: unknown }).fileUrls;
      if (!Array.isArray(urls)) continue;
      const matched = urls.some(
        (u) => typeof u === "string" && attachmentRefsLikelySame(attachmentRef, u, mirrorCompanyId || cid)
      );
      if (!matched) continue;
      const id = String((row as { id?: string }).id || "").trim();
      if (!id) continue;
      const voucherNumber = String((row as { voucherNumber?: unknown }).voucherNumber || "").trim();
      const type = String((row as { type?: unknown }).type || "").trim();
      return {
        id,
        voucherNumber: voucherNumber || id,
        type,
        companyId: cid,
      };
    }

    if (fp.fileTail || fp.fileDisplay) {
      for (const row of rows) {
        const type = String((row as { type?: unknown }).type || "").trim();
        if (fp.voucherFolder && type && type !== fp.voucherFolder) continue;
        const urls = (row as { fileUrls?: unknown }).fileUrls;
        if (!Array.isArray(urls)) continue;
        const fileHit = urls.some((u) => {
          if (typeof u !== "string") return false;
          const ufp = attachmentPathFingerprint(u, mirrorCompanyId || cid);
          if (fp.fileTail && ufp.fileTail === fp.fileTail) return true;
          if (fp.fileDisplay && ufp.fileDisplay === fp.fileDisplay) return true;
          return u.includes(fp.fileTail || "") || u.includes(fp.fileDisplay || "");
        });
        if (!fileHit) continue;
        const id = String((row as { id?: string }).id || "").trim();
        if (!id) continue;
        const voucherNumber = String((row as { voucherNumber?: unknown }).voucherNumber || "").trim();
        filenameFallback = {
          id,
          voucherNumber: voucherNumber || id,
          type,
          companyId: cid,
        };
        break;
      }
    }
    return filenameFallback;
  } catch {
    /* mirror optional */
  }
  return null;
}

/** Scrape-time index + mirror lookup + path company id retry. */
export async function resolveVoucherForAttachmentPrefetchFailure(args: {
  attachmentRef: string;
  mirrorCompanyId?: string | null;
  pathCompanyId?: string | null;
  voucherIndex?: Map<string, AttachmentVoucherHit> | null;
}): Promise<AttachmentVoucherHit | null> {
  const mirrorCompanyId = String(args.mirrorCompanyId || "").trim();
  const pathCompanyId = String(args.pathCompanyId || "").trim();

  const fromIndex = lookupVoucherInAttachmentPrefetchIndex(
    args.voucherIndex,
    args.attachmentRef,
    mirrorCompanyId || pathCompanyId || undefined
  );
  if (fromIndex) return fromIndex;

  const companyIds = [...new Set([mirrorCompanyId, pathCompanyId].filter(Boolean))];
  for (const cid of companyIds) {
    const hit = await findVoucherInLocalMirrorByAttachmentRef(
      cid,
      args.attachmentRef,
      mirrorCompanyId || cid
    );
    if (hit) return hit;
  }
  return null;
}

export function voucherEditHref(companyId: string, voucherId: string): string {
  return appNavHref(
    `/dashboard?editVoucher=${encodeURIComponent(voucherId)}&companyId=${encodeURIComponent(companyId)}`
  );
}

export function openVoucherEditFromPrefetchNotice(companyId: string, voucherId: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(voucherEditHref(companyId, voucherId));
}
