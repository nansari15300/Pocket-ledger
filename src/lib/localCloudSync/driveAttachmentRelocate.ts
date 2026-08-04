"use client";

import { startOfDay } from "date-fns";
import { fetchAttachmentRefBlob } from "@/lib/attachmentRefBlobFetch";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  buildVoucherAttachmentDriveRemotePath,
} from "@/lib/localCloudSync/driveAttachmentPath";
import { deleteDriveAttachmentRef } from "@/lib/localCloudSync/driveAttachmentDelete";
import {
  downloadDriveAttachmentBlob,
  uploadAttachmentBytesToDrive,
} from "@/lib/localCloudSync/driveCloudSyncClient";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import {
  isDriveFileRef,
  remotePathFromDriveFileRef,
  sanitizePocketLedgerDriveFileNamePart,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { isCloudSyncTrackableFileRef } from "@/lib/localCloudSync/syncSummaryAttachments";
import {
  parseFirestoreDateFieldToJsDate,
  parseLikelyBsVoucherDate,
} from "@/lib/voucherDateNormalize";

function voucherDateDayKey(raw: unknown): number | null {
  const d = parseFirestoreDateFieldToJsDate(raw) ?? parseLikelyBsVoucherDate(raw);
  if (!d || isNaN(d.getTime())) return null;
  return startOfDay(d).getTime();
}

function didVoucherDateChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const beforeKey = voucherDateDayKey(before.date ?? before.voucherDate);
  const afterKey = voucherDateDayKey(after.date ?? after.voucherDate);
  if (beforeKey == null || afterKey == null) return false;
  return beforeKey !== afterKey;
}

function collectDriveRefFieldPaths(
  value: unknown,
  topField: string,
  out: Array<{ field: string; ref: string; arrayIndex?: number }>
): void {
  if (typeof value === "string" && isDriveFileRef(value)) {
    out.push({ field: topField, ref: value.trim() });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      if (typeof item === "string" && isDriveFileRef(item)) {
        out.push({ field: topField, ref: item.trim(), arrayIndex: idx });
      } else {
        collectDriveRefFieldPaths(item, topField, out);
      }
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectDriveRefFieldPaths(v, topField ? `${topField}.${k}` : k, out);
    }
  }
}

function driveRefUnchanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  field: string,
  ref: string,
  arrayIndex?: number
): boolean {
  const b = before[field];
  const a = after[field];
  if (arrayIndex != null) {
    return (
      Array.isArray(b) &&
      Array.isArray(a) &&
      String(b[arrayIndex] ?? "").trim() === ref &&
      String(a[arrayIndex] ?? "").trim() === ref
    );
  }
  return String(b ?? "").trim() === ref && String(a ?? "").trim() === ref;
}

function originalFileNameFromDrivePath(remotePath: string, voucherNumber: unknown): string {
  const fileName = remotePath.split("/").pop() || "file";
  const vno = sanitizePocketLedgerDriveFileNamePart(String(voucherNumber ?? "V"));
  const prefix = `${vno}_`;
  if (fileName.startsWith(prefix)) return fileName.slice(prefix.length) || "file";
  const underscore = fileName.indexOf("_");
  if (underscore > 0 && underscore < fileName.length - 1) {
    return fileName.slice(underscore + 1) || "file";
  }
  return fileName || "file";
}

async function resolveBlobForDriveRef(ref: string, companyId: string): Promise<Blob | null> {
  let blob = await downloadDriveAttachmentBlob(ref, companyId);
  if (blob && blob.size > 0) return blob;
  blob = await fetchAttachmentRefBlob(ref, { companyId });
  if (blob && blob.size > 0) return blob;
  try {
    const { tryOfflineCachedAttachmentBlobMultiKey, getAttachmentBlobForBackupEmbed } = await import(
      "@/lib/offlineAttachmentUrlCache"
    );
    blob = await tryOfflineCachedAttachmentBlobMultiKey(ref);
    if (blob && blob.size > 0) return blob;
    blob = await getAttachmentBlobForBackupEmbed(ref, { skipDiskWrite: true });
    if (blob && blob.size > 0) return blob;
  } catch {
    /* optional caches */
  }
  return null;
}

/** Voucher date change — `drive:` attachments naye date folder me move (purani Drive file delete). */
export async function relocateDriveAttachmentsForVoucherDateChange(input: {
  companyId: string;
  docId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<{ relocated: number; after: Record<string, unknown> }> {
  const cid = String(input.companyId || "").trim();
  const docId = String(input.docId || "").trim();
  if (!cid || !docId) return { relocated: 0, after: input.after };
  if (!(await shouldUseLocalCloudSync(cid))) return { relocated: 0, after: input.after };
  if (!didVoucherDateChange(input.before, input.after)) return { relocated: 0, after: input.after };

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const companyName = typeof reg?.name === "string" ? reg.name : undefined;
  const after = { ...input.after };
  const voucherType = after.voucherType ?? after.type;
  const voucherNumber = after.voucherNumber ?? after.id ?? docId;
  const voucherDate = after.date ?? after.voucherDate ?? after.createdAt;
  const driveRef = { companyId: cid, companyName };

  const candidates: Array<{ field: string; ref: string; arrayIndex?: number }> = [];
  for (const [k, v] of Object.entries(after)) {
    if (k === "id") continue;
    collectDriveRefFieldPaths(v, k, candidates);
  }

  let relocated = 0;
  for (const { field, ref, arrayIndex } of candidates) {
    if (!isCloudSyncTrackableFileRef(ref) || !isDriveFileRef(ref)) continue;
    if (!driveRefUnchanged(input.before, input.after, field, ref, arrayIndex)) continue;

    const oldLogicalPath = remotePathFromDriveFileRef(ref);
    if (!oldLogicalPath) continue;

    const originalFileName = originalFileNameFromDrivePath(oldLogicalPath, voucherNumber);
    const newLogicalPath = buildVoucherAttachmentDriveRemotePath({
      ref: driveRef,
      categoryFolder: "vouchers",
      voucherType,
      voucherNumber,
      voucherDate,
      originalFileName,
      company: (reg ?? null) as Record<string, unknown> | null,
    });
    if (oldLogicalPath === newLogicalPath) continue;

    const blob = await resolveBlobForDriveRef(ref, cid);
    if (!blob || blob.size <= 0) {
      warnLocalCloudSync("Drive attachment relocate skipped — bytes missing", {
        companyId: cid,
        docId,
        field,
        ref,
      });
      continue;
    }

    let newDriveRef: string;
    try {
      newDriveRef = await uploadAttachmentBytesToDrive({
        companyId: cid,
        companyName,
        remotePath: newLogicalPath,
        bytes: blob,
        contentType: blob.type || "application/octet-stream",
      });
    } catch (e) {
      warnLocalCloudSync("Drive attachment relocate upload failed", {
        companyId: cid,
        docId,
        field,
        msg: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    try {
      await deleteDriveAttachmentRef(cid, ref);
    } catch (e) {
      warnLocalCloudSync("Drive attachment relocate delete old failed", {
        companyId: cid,
        docId,
        ref,
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    const cur = after[field];
    if (Array.isArray(cur) && arrayIndex != null && arrayIndex >= 0) {
      const arr = [...cur];
      if (String(arr[arrayIndex] ?? "").trim() === ref) arr[arrayIndex] = newDriveRef;
      after[field] = arr;
    } else if (cur === ref) {
      after[field] = newDriveRef;
    } else {
      continue;
    }
    relocated += 1;
  }

  if (relocated > 0) {
    logLocalCloudSync("Drive attachments relocated for voucher date change", {
      companyId: cid,
      docId,
      relocated,
    });
  }

  return { relocated, after };
}
