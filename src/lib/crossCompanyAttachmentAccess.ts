"use client";

import type { AttachmentHoldPayloadV1 } from "@/lib/attachmentHoldClipboard";
import { persistableAttachmentRefFromHoldPayload } from "@/lib/attachmentHoldClipboard";
import { tryGetStoragePathFromFirebaseDownloadUrl, normalizeFirebaseStorageObjectPathForSdk, looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";

/** Active company + same-login accessible companies — FilePreview / warm sync / save filter. */
let attachmentAccessPolicy: {
  activeCompanyId: string | null;
  accessibleCompanyIds: Set<string>;
} = {
  activeCompanyId: null,
  accessibleCompanyIds: new Set(),
};

/** Registry `id` + Firestore `authoritativeCompanyId` — Storage folder match dono se ho. */
export function collectAccessibleCompanyIdsForAttachmentPolicy(
  companies: Iterable<{ id?: string | null; authoritativeCompanyId?: string | null }>,
  extraIds?: Iterable<string | null | undefined>
): Set<string> {
  const s = new Set<string>();
  for (const c of companies) {
    const id = String(c.id || "").trim();
    if (id) s.add(id);
    const auth = String(c.authoritativeCompanyId || "").trim();
    if (auth) s.add(auth);
  }
  if (extraIds) {
    for (const raw of extraIds) {
      const id = String(raw || "").trim();
      if (id) s.add(id);
    }
  }
  return s;
}

export function syncCrossCompanyAttachmentAccessPolicy(
  activeCompanyId: string | null | undefined,
  accessibleCompanyIds: Iterable<string>
): void {
  attachmentAccessPolicy = {
    activeCompanyId: String(activeCompanyId || "").trim() || null,
    accessibleCompanyIds: new Set(
      [...accessibleCompanyIds].map((id) => String(id || "").trim()).filter(Boolean)
    ),
  };
}

export function getCrossCompanyAttachmentAccessPolicy(): Readonly<{
  activeCompanyId: string | null;
  accessibleCompanyIds: ReadonlySet<string>;
}> {
  return attachmentAccessPolicy;
}

/** Storage path folder (`voucher-files/{folder}/…`) ↔ full company id (`slug_folder`). */
export function storageFolderMatchesCompanyId(storageFolder: string, companyId: string): boolean {
  const folder = String(storageFolder || "").trim();
  const cid = String(companyId || "").trim();
  if (!folder || !cid) return false;
  if (folder === cid) return true;
  if (cid.endsWith(`_${folder}`)) return true;
  if (folder.endsWith(`_${cid}`)) return true;
  return false;
}

/** Firebase `voucher-files` / `companies` / `entity-files` path se company folder nikaalo. */
export function extractStorageCompanyFolderFromAttachmentRef(
  ref: string,
  hintCompanyId?: string
): string | null {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return null;
  let path = tryGetStoragePathFromFirebaseDownloadUrl(trimmed);
  if (!path && looksLikeFirebaseStorageObjectPath(trimmed)) {
    path = normalizeFirebaseStorageObjectPathForSdk(trimmed, { companyId: hintCompanyId });
  }
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (
    (parts[0] === "voucher-files" || parts[0] === "companies" || parts[0] === "entity-files") &&
    parts[1]
  ) {
    return parts[1]!;
  }
  return null;
}

export function resolveAttachmentStorageOwnerAmongAccessibleCompanies(
  ref: string,
  accessibleCompanyIds: ReadonlySet<string>,
  hintCompanyId?: string
): string | null {
  const folder = extractStorageCompanyFolderFromAttachmentRef(ref, hintCompanyId);
  if (!folder) return null;
  for (const cid of accessibleCompanyIds) {
    if (storageFolderMatchesCompanyId(folder, cid)) return cid;
  }
  return null;
}

/**
 * Cross-company copy/paste: Company B me Company A ka Storage link tabhi dikhao / prefetch karo
 * jab same login par Company A bhi user ki list (owned/shared) me ho.
 */
export function isCrossCompanyAttachmentVisibleToUser(
  ref: string,
  activeCompanyId: string | null | undefined,
  accessibleCompanyIds: ReadonlySet<string>
): boolean {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return false;
  if (isLocalFileRef(trimmed) || isDriveFileRef(trimmed)) return true;

  const activeId = String(activeCompanyId || "").trim();
  const folder = extractStorageCompanyFolderFromAttachmentRef(trimmed, activeId || undefined);
  if (!folder) return true;

  const accessible =
    accessibleCompanyIds.size > 0
      ? accessibleCompanyIds
      : activeId
        ? new Set([activeId])
        : new Set<string>();

  if (activeId && storageFolderMatchesCompanyId(folder, activeId)) return true;

  const ownerAmongAccessible = resolveAttachmentStorageOwnerAmongAccessibleCompanies(
    trimmed,
    accessible,
    activeId || undefined
  );
  return ownerAmongAccessible != null;
}

export function filterAttachmentsForCompanyContext(
  urls: readonly string[],
  activeCompanyId: string | null | undefined,
  accessibleCompanyIds?: ReadonlySet<string>
): string[] {
  const policy = accessibleCompanyIds ?? getCrossCompanyAttachmentAccessPolicy().accessibleCompanyIds;
  return urls.filter((u) => typeof u === "string" && isCrossCompanyAttachmentVisibleToUser(u, activeCompanyId, policy));
}

/** Voucher `fileUrls` / `unassignedFile` — foreign Storage links hatao jab user ke paas source company access na ho. */
export function filterVoucherAttachmentsForCompanyContext<T extends Record<string, unknown>>(
  voucher: T,
  activeCompanyId: string | null | undefined,
  accessibleCompanyIds?: ReadonlySet<string>
): T {
  const policy = accessibleCompanyIds ?? getCrossCompanyAttachmentAccessPolicy().accessibleCompanyIds;
  const out: Record<string, unknown> = { ...voucher };
  const raw = out.fileUrls;
  if (Array.isArray(raw)) {
    out.fileUrls = raw.filter(
      (u) => typeof u !== "string" || isCrossCompanyAttachmentVisibleToUser(u, activeCompanyId, policy)
    );
  }
  const uf = out.unassignedFile;
  if (uf && typeof uf === "object") {
    const url = String((uf as { url?: unknown }).url || "").trim();
    if (url && !isCrossCompanyAttachmentVisibleToUser(url, activeCompanyId, policy)) {
      out.unassignedFile = null;
    }
  }
  return out as T;
}

export function shouldSkipAttachmentPrefetchForAccessPolicy(
  ref: string,
  mirrorCompanyId: string
): boolean {
  const policy = getCrossCompanyAttachmentAccessPolicy();
  const accessible =
    policy.accessibleCompanyIds.size > 0 ? policy.accessibleCompanyIds : new Set([mirrorCompanyId]);
  return !isCrossCompanyAttachmentVisibleToUser(ref, mirrorCompanyId, accessible);
}

/** Hold-clipboard payload se policy check ke liye ref (`src` ya Storage path `p`). */
export function attachmentRefFromHoldPayloadForAccessCheck(
  payload: AttachmentHoldPayloadV1
): string | null {
  const reuseRef = persistableAttachmentRefFromHoldPayload(payload);
  if (reuseRef) return reuseRef;
  const p = String(payload.p || "").trim();
  if (p && !p.includes("://")) return p;
  return null;
}

/** Paste chip / hold-paste: foreign Storage link tabhi allow jab source company same login par accessible ho. */
export function isAttachmentHoldPayloadVisibleInCompanyContext(
  payload: AttachmentHoldPayloadV1,
  activeCompanyId: string | null | undefined,
  accessibleCompanyIds?: ReadonlySet<string>
): boolean {
  if (payload.sid && !String(payload.src || "").trim() && !String(payload.p || "").trim()) {
    return true;
  }
  const ref = attachmentRefFromHoldPayloadForAccessCheck(payload);
  if (!ref) return true;
  const policy = accessibleCompanyIds ?? getCrossCompanyAttachmentAccessPolicy().accessibleCompanyIds;
  return isCrossCompanyAttachmentVisibleToUser(ref, activeCompanyId, policy);
}
