"use client";

import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { isLocalFileRef, getBlobFromLocalFileRef } from "@/lib/localPendingFiles";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import {
  ATTACHMENT_HOLD_CLIPBOARD_PREFIX,
  parseAttachmentHoldClipboardText,
} from "@/lib/attachmentHoldClipboard";
import { storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  dedupeVoucherAttachmentUrlList,
  getVoucherAttachmentUrlsForUi,
} from "@/lib/voucherAttachmentNormalize";
import { isFirebaseLedgerDataSyncDisabled } from "@/lib/firebaseLedgerDataSyncDisabled";
import {
  isFirebaseLedgerCompanyAttachmentSyncEnabled,
} from "@/lib/firebaseLedgerCompanySyncPrefs";

/**
 * Form `files` state me `PL_ATTACH_V1:local:uuid` clipboard marker strings ho sakti hain (paste / Reuse).
 * Inko save se pehle underlying `src` ref me normalize karo — warna upload block skip hota tha aur Firestore me `local:` save hota tha.
 */
export function normalizeFormFileUrlsForSave(rawUrls: string[]): string[] {
  return rawUrls
    .map((u) => {
      const s = String(u || "").trim();
      if (!s.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return s;
      const payload = parseAttachmentHoldClipboardText(s);
      const src = String(payload?.src || "").trim();
      return src || null;
    })
    .filter((u): u is string => Boolean(u));
}

/** Standard web (non-Electron/APK/static) — production jaisa Firebase HTTPS upload path. */
export function isStandardWebBrowserClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return !isElectronDesktopApp() && !isCapacitorNativeApp() && !isStaticAppBuild();
}

/** Local / Drive sync company — web par Firebase materialize mat karo (syncPendingFiles / Drive cycle). */
async function shouldSkipWebFirebaseMaterializeForCompany(companyId: string): Promise<boolean> {
  if (isFirebaseLedgerDataSyncDisabled()) return true;
  if (!isFirebaseLedgerCompanyAttachmentSyncEnabled(companyId)) return true;
  const cid = String(companyId || "").trim();
  if (!cid) return true;
  const { apkCloudCompanyUsesSqliteFirstWrites } = await import("@/lib/apkOnlineFirestoreWritePolicy");
  if (await apkCloudCompanyUsesSqliteFirstWrites(cid)) return true;
  const { shouldUseLocalCloudSync } = await import("@/lib/localCloudSync/companyConfig");
  if (await shouldUseLocalCloudSync(cid)) return true;
  return false;
}

/**
 * `saveVoucher` Firestore path: form se aaye `local:` / `PL_ATTACH_V1:` ko save se pehle HTTPS me badlo.
 * Har voucher type par kaam kare (sirf Payment In/Out forms par depend na ho).
 */
export async function materializeVoucherAttachmentsInSavePayload(params: {
  companyId: string;
  voucherId?: string | null;
  data: Record<string, unknown>;
}): Promise<void> {
  if (isFirebaseLedgerDataSyncDisabled()) return;
  const cid = String(params.companyId || "").trim();
  if (!cid) return;
  if (!isFirebaseLedgerCompanyAttachmentSyncEnabled(cid)) return;
  if (!isStandardWebBrowserClient()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const rawUrls = Array.isArray(params.data.fileUrls)
    ? params.data.fileUrls.filter((u): u is string => typeof u === "string")
    : [];
  if (rawUrls.length === 0) return;
  const storageFolder = String(params.data.type || "attachments").trim() || "attachments";
  params.data.fileUrls = await materializeVoucherFileUrlsForWebSave({
    companyId: cid,
    voucherIdHint: params.voucherId ?? null,
    storageFolder,
    rawUrls: normalizeFormFileUrlsForSave(rawUrls),
  });
}

/**
 * Web save path: payload banne se pehle `local:` refs ko Firebase HTTPS me promote karo.
 * Isse Firestore row me `PL/local` marker persist hone ke chances kam hote hain.
 */
export async function materializeVoucherFileUrlsForWebSave(params: {
  companyId: string;
  voucherIdHint?: string | null;
  storageFolder: string;
  rawUrls: string[];
}): Promise<string[]> {
  const cid = String(params.companyId || "").trim();
  const storageFolder = String(params.storageFolder || "attachments").trim() || "attachments";
  const voucherIdHint = String(params.voucherIdHint || "").trim() || "web";
  const normalized = normalizeFormFileUrlsForSave(params.rawUrls);
  if (!cid) return normalized;
  // Embedded/offline clients par existing pending-sync flow hi source of truth hai.
  if (isElectronDesktopApp() || isCapacitorNativeApp() || isStaticAppBuild()) return normalized;
  if (typeof navigator !== "undefined" && !navigator.onLine) return normalized;
  if (await shouldSkipWebFirebaseMaterializeForCompany(cid)) return normalized;

  const out: string[] = [];
  for (const raw of normalized) {
    const u = String(raw || "").trim();
    if (!u) continue;
    if (!isLocalFileRef(u)) {
      out.push(u);
      continue;
    }
    // Web online: `local:` ref ke bytes read karke save se pehle direct HTTPS URL banao.
    const uploaded = await uploadLocalRefToFirebaseIfWebOnline(cid, voucherIdHint, u, storageFolder);
    out.push(uploaded || u);
  }
  return out.filter((u, i) => out.indexOf(u) === i);
}

/** Save payload: stale `files[]` metadata EXE par removed attachment dubara na dikhaye. */
export function voucherAttachmentFieldsForSave(fileUrls: string[]): {
  fileUrls: string[];
  files: [];
  unassignedFile: null;
} {
  return {
    fileUrls,
    files: [],
    unassignedFile: null,
  };
}

/**
 * Web online par `local:uuid` → IndexedDB se blob read karke Firebase Storage pe directly upload karo.
 * EXE/APK/static par skip (syncPendingFiles background me karta hai).
 */
async function uploadLocalRefToFirebaseIfWebOnline(
  companyId: string,
  voucherId: string,
  localUrl: string,
  storageFolder: string
): Promise<string | null> {
  if (isFirebaseLedgerDataSyncDisabled()) return null;
  if (isElectronDesktopApp() || isCapacitorNativeApp() || isStaticAppBuild()) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const blob = await getBlobFromLocalFileRef(localUrl);
    if (!blob) return null;
    // Filename: UUID se ya fallback
    const uuidPart = localUrl.replace("local:", "").replace(/[^a-z0-9-]/gi, "");
    const ext = blob.type ? `.${blob.type.split("/")[1] || "bin"}` : "";
    const fileName = `${uuidPart}${ext}`;
    const path = `voucher-files/${companyId}/${storageFolder}/${voucherId}_${Date.now()}_${fileName}`;
    const sRef = storageRef(storage, path);
    const snap = await uploadBytes(sRef, blob);
    return await getDownloadURL(snap.ref);
  } catch {
    return null;
  }
}

/** `saveVoucher` ke baad `local:` → HTTPS upgrade. Web online: IndexedDB blob → Firebase upload; fallback: Firestore lookup. */
export async function resolvePersistedVoucherFileUrlsAfterSave(
  companyId: string,
  voucherId: string,
  urls: readonly string[],
  storageFolder = "attachments"
): Promise<string[]> {
  const cid = String(companyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid) return [...urls];
  const out: string[] = [];
  for (const raw of urls) {
    const u = String(raw || "").trim();
    if (!u) continue;
    if (isLocalFileRef(u)) {
      // Web online: blob seedha Firebase pe upload karo taaki HTTPS turant mile
      const uploaded = await uploadLocalRefToFirebaseIfWebOnline(cid, vid, u, storageFolder);
      if (uploaded) {
        out.push(uploaded);
        continue;
      }
      // Fallback: Firestore me already sync hua HTTPS URL check karo
      const remote = await tryResolveRemoteUrlForStaleLocalAttachment(cid, vid, u, urls);
      out.push(remote && !isLocalFileRef(remote) ? remote : u);
    } else {
      out.push(u);
    }
  }
  return out;
}

/** Parent `voucher.fileUrls` outbox/Firestore lag se purani list bheje to form state mat overwrite karo. */
export function isLocalToRemoteAttachmentUpgrade(saved: readonly string[], incoming: readonly string[]): boolean {
  if (saved.length !== incoming.length) return false;
  return saved.every((u, i) => {
    const inc = incoming[i];
    if (!inc) return false;
    return u === inc || (isLocalFileRef(u) && !isLocalFileRef(inc));
  });
}

/** Voucher row fingerprint — `fileUrls`/`files` change par vouchers context live update. */
export function voucherAttachmentUiFingerprint(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const urls = getVoucherAttachmentUrlsForUi(row).join("\x1e");
  const filesMeta = Array.isArray(row.files) ? row.files.length : 0;
  const uf =
    row.unassignedFile && typeof row.unassignedFile === "object"
      ? String((row.unassignedFile as { url?: string }).url || "").trim()
      : "";
  return `${urls}\x1d${filesMeta}\x1d${uf}`;
}

/** Post-save vouchers cache patch — `files: []` taaki purani metadata UI me na dikhe. */
export function buildVoucherAttachmentLivePatch(fileUrls: readonly string[]): {
  fileUrls: string[];
  files: [];
  unassignedFile: null;
} {
  return voucherAttachmentFieldsForSave(
    fileUrls.filter((u): u is string => typeof u === "string" && Boolean(String(u).trim()))
  );
}

export const VOUCHER_ATTACHMENT_SAVED_EVENT = "pocket-ledger-voucher-attachment-saved";

/** Save / link ke turant baad `useVouchers` cache patch — ledger + dialogs bina refresh. */
export function dispatchVoucherLivePatch(
  companyId: string,
  voucherId: string,
  patch: Record<string, unknown>
): void {
  if (typeof window === "undefined" || !companyId?.trim() || !voucherId?.trim()) return;
  window.dispatchEvent(
    new CustomEvent(VOUCHER_ATTACHMENT_SAVED_EVENT, {
      detail: {
        companyId: companyId.trim(),
        voucherId: voucherId.trim(),
        patch,
      },
    })
  );
}

/** Save ke turant baad `useVouchers` cache update — har voucher form se (Payment/Sale/Journal…). */
export function dispatchVoucherAttachmentSaved(
  companyId: string,
  voucherId: string,
  fileUrls: readonly string[]
): void {
  dispatchVoucherLivePatch(companyId, voucherId, buildVoucherAttachmentLivePatch(fileUrls));
}

/**
 * Form save ke baad: `local:` → resolve + vouchers cache patch + UI ke liye persisted URL list.
 * EXE/static par pehli create par cache me row na ho to bhi `dispatchVoucherAttachmentSaved` stub append karta hai.
 */
export async function applyVoucherAttachmentsAfterFormSave(params: {
  companyId: string;
  voucherId: string;
  rawFileUrls: readonly string[];
  storageFolder: string;
}): Promise<string[]> {
  const cid = String(params.companyId || "").trim();
  const vid = String(params.voucherId || "").trim();
  let raw = params.rawFileUrls.filter(
    (u): u is string => typeof u === "string" && Boolean(String(u).trim())
  );
  if (!cid || !vid) return dedupeVoucherAttachmentUrlList(raw);

  // Local / Drive / EXE / APK — Firebase duplicate upload mat; mirror + background sync source of truth.
  if (
    isElectronDesktopApp() ||
    isCapacitorNativeApp() ||
    isStaticAppBuild() ||
    (await shouldSkipWebFirebaseMaterializeForCompany(cid))
  ) {
    let urls = dedupeVoucherAttachmentUrlList(raw);
    try {
      const row = (await getCompanyDocFromBrowserDb(cid, "vouchers", vid)) as Record<string, unknown> | null;
      const fromDb = getVoucherAttachmentUrlsForUi(row);
      if (fromDb.length > 0) urls = dedupeVoucherAttachmentUrlList(fromDb);
    } catch {
      /* mirror miss — form raw */
    }
    dispatchVoucherAttachmentSaved(cid, vid, urls);
    return urls;
  }

  const persisted = dedupeVoucherAttachmentUrlList(
    await resolvePersistedVoucherFileUrlsAfterSave(cid, vid, raw, params.storageFolder)
  );
  dispatchVoucherAttachmentSaved(cid, vid, persisted);
  return persisted;
}

/**
 * Post-save snapshot authoritative: parent `voucher.fileUrls` listener lag se purani zyada list form/ledger overwrite na kare.
 * Web + EXE dono — delete+add ke baad refresh ki zarurat kam.
 */
export function incomingVoucherFileUrlsLookStaleVersusSaved(
  saved: readonly string[],
  incoming: readonly string[]
): boolean {
  const snap = saved.map((u) => String(u || "").trim()).filter(Boolean);
  const inc = incoming.map((u) => String(u || "").trim()).filter(Boolean);
  if (snap.length === 0 && inc.length === 0) return false;
  if (JSON.stringify(snap) === JSON.stringify(inc)) return false;
  if (isLocalToRemoteAttachmentUpgrade(snap, inc)) return false;
  // User ne file hata kar nayi add ki: parent ab bhi purani URLs ke saath aata hai.
  if (snap.length > 0 && inc.length > snap.length && snap.every((u) => inc.includes(u))) return true;
  if (snap.length > 0 && inc.length > 0) {
    const overlap = snap.filter((u) => inc.includes(u)).length;
    if (overlap === 0) return true;
    if (snap.length !== inc.length && snap.some((u) => !inc.includes(u)) && inc.some((u) => !snap.includes(u))) {
      return true;
    }
  }
  if (snap.length < inc.length && snap.every((u) => inc.includes(u))) return true;
  if (snap.length > inc.length && snap.some((u) => !inc.includes(u))) return true;
  return false;
}
