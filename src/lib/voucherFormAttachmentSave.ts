"use client";

import { tryResolveRemoteUrlForStaleLocalAttachment } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { isLocalFileRef, getBlobFromLocalFileRef } from "@/lib/localPendingFiles";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import {
  ATTACHMENT_HOLD_CLIPBOARD_PREFIX,
  parseAttachmentHoldClipboardText,
} from "@/lib/attachmentHoldClipboard";
import { storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

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

/** Parent `voucher.fileUrls` outbox lag — sirf EXE/desktop par stale ignore; web listener updates hamesha apply. */
export function incomingVoucherFileUrlsLookStaleVersusSaved(
  saved: readonly string[],
  incoming: readonly string[]
): boolean {
  if (!isElectronDesktopApp()) return false;
  const snap = saved.map((u) => String(u || "").trim()).filter(Boolean);
  const inc = incoming.map((u) => String(u || "").trim()).filter(Boolean);
  if (snap.length === 0 && inc.length === 0) return false;
  if (JSON.stringify(snap) === JSON.stringify(inc)) return false;
  if (isLocalToRemoteAttachmentUpgrade(snap, inc)) return false;
  // User ne replace kiya: saved me naya `local:`/HTTPS hai par parent ab bhi purana URL bhej raha hai.
  if (snap.length > 0 && inc.length > 0 && snap.length === inc.length) {
    const overlap = snap.filter((u) => inc.includes(u)).length;
    if (overlap === 0) return true;
  }
  if (snap.length < inc.length && snap.every((u) => inc.includes(u))) return true;
  if (snap.length > inc.length && snap.some((u) => !inc.includes(u))) return true;
  return false;
}
