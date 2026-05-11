/**
 * 2s hold copy/paste: clipboard me compact marker + optional same-tab blob sid.
 * Paste par naya File banake form me add — save par dubara upload (shared URL risky nahi).
 */
import { storage } from "@/lib/firebase";
import { ref, getBlob } from "firebase/storage";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
import {
  getRemoteAttachmentBlobPreferOfflineCache,
} from "@/lib/offlineAttachmentUrlCache";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";
export const ATTACHMENT_HOLD_CLIPBOARD_PREFIX = "PL_ATTACH_V1:";

export type AttachmentHoldPayloadV1 = {
  v: 1;
  /** HTTPS / http / data: / local: ref */
  src?: string;
  /** Firebase Storage object path (optional; speeds up SDK read) */
  p?: string;
  /** Original filename hint */
  n?: string;
  /** MIME hint */
  t?: string;
  /** Same-tab only: in-memory blob entry id */
  sid?: string;
};

const SESSION_BACKUP_KEY = "pl_attach_hold_clip_backup";
const SAME_TAB_TTL_MS = 15 * 60 * 1000;
const SAME_TAB_MAX = 8;

const sameTabBlobs = new Map<string, { blob: Blob; createdAt: number }>();

function pruneSameTab() {
  const now = Date.now();
  for (const [k, v] of sameTabBlobs) {
    if (now - v.createdAt > SAME_TAB_TTL_MS) sameTabBlobs.delete(k);
  }
  while (sameTabBlobs.size > SAME_TAB_MAX) {
    const first = sameTabBlobs.keys().next().value as string | undefined;
    if (first === undefined) break;
    sameTabBlobs.delete(first);
  }
}

export function putSameTabBlobForHoldCopy(blob: Blob): string {
  pruneSameTab();
  const sid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sameTabBlobs.set(sid, { blob, createdAt: Date.now() });
  return sid;
}

function takeSameTabBlob(sid: string): Blob | null {
  pruneSameTab();
  const e = sameTabBlobs.get(sid);
  if (!e) return null;
  sameTabBlobs.delete(sid);
  return e.blob;
}

function encodePayload(p: AttachmentHoldPayloadV1): string {
  const json = JSON.stringify(p);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
  return `${ATTACHMENT_HOLD_CLIPBOARD_PREFIX}${b64}`;
}

export function parseAttachmentHoldClipboardText(raw: string): AttachmentHoldPayloadV1 | null {
  const s = String(raw || "").trim();
  if (!s.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return null;
  const b64 = s.slice(ATTACHMENT_HOLD_CLIPBOARD_PREFIX.length);
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const o = JSON.parse(json) as AttachmentHoldPayloadV1;
    if (o?.v !== 1) return null;
    return o;
  } catch {
    return null;
  }
}

export async function writeAttachmentHoldClipboard(payload: AttachmentHoldPayloadV1): Promise<boolean> {
  const text = encodePayload(payload);
  try {
    sessionStorage.setItem(SESSION_BACKUP_KEY, text);
  } catch {
    /* private mode */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission / insecure context */
  }
  return false;
}

export async function readAttachmentHoldClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      const t = await navigator.clipboard.readText();
      if (t && t.includes(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return t.trim();
    }
  } catch {
    /* denied */
  }
  try {
    const fb = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (fb && fb.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return fb;
  } catch {
    /* */
  }
  return null;
}

/** Copy source se Blob — paste ke liye naya File banane me (dubara upload ho). */
export async function fetchBlobForAttachmentHoldPaste(
  payload: AttachmentHoldPayloadV1,
  signal?: AbortSignal
): Promise<{ blob: Blob; fileName: string; contentType: string } | null> {
  if (payload.sid) {
    const blob = takeSameTabBlob(payload.sid);
    if (!blob || blob.size === 0) return null;
    const fileName = payload.n || "attachment";
    const contentType = payload.t || blob.type || "application/octet-stream";
    return { blob, fileName, contentType };
  }

  const src = String(payload.src || "").trim();
  const path = String(payload.p || "").trim();

  if (src && isLocalFileRef(src)) {
    const b = await getBlobFromLocalFileRef(src);
    if (!b || b.size === 0) return null;
    return {
      blob: b,
      fileName: payload.n || "attachment",
      contentType: payload.t || b.type || "application/octet-stream",
    };
  }

  if (path && !path.includes("://")) {
    try {
      const storageRef = ref(storage, path);
      const blob = await getBlob(storageRef);
      if (signal?.aborted || !blob || blob.size === 0) return null;
      return {
        blob,
        fileName: payload.n || path.split("/").pop() || "attachment",
        contentType: payload.t || blob.type || "application/octet-stream",
      };
    } catch {
      /* fall through to URL */
    }
  }

  if (src.startsWith("data:")) {
    const res = await fetch(src, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return {
      blob,
      fileName: payload.n || "attachment",
      contentType: payload.t || blob.type || "application/octet-stream",
    };
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    let blob: Blob | null = await getRemoteAttachmentBlobPreferOfflineCache(src, signal);
    if ((!blob || blob.size === 0) && !signal?.aborted) {
      const res = await fetch(src, { mode: "cors", credentials: "omit", signal });
      if (res.ok) blob = await res.blob();
    }
    if (!blob || blob.size === 0) return null;
    const inferredPath = path || tryGetStoragePathFromFirebaseDownloadUrl(src) || "";
    if (!path && inferredPath) {
      try {
        const storageRef = ref(storage, inferredPath);
        const b2 = await getBlob(storageRef);
        if (b2 && b2.size > 0) {
          return {
            blob: b2,
            fileName: payload.n || src.split("/").pop()?.split("?")[0] || "attachment",
            contentType: payload.t || b2.type || blob.type || "application/octet-stream",
          };
        }
      } catch {
        /* use fetched blob */
      }
    }
    return {
      blob,
      fileName: payload.n || src.split("/").pop()?.split("?")[0] || "attachment",
      contentType: payload.t || blob.type || "application/octet-stream",
    };
  }

  return null;
}

export function blobToFile(blob: Blob, fileName: string, contentType: string): File {
  const type = contentType || blob.type || "application/octet-stream";
  return new File([blob], fileName, { type });
}

/** FilePreview / avatar se hold-copy payload banana */
export function buildHoldPayloadFromPreviewSource(params: {
  file: File | string;
  storagePath?: string;
}): AttachmentHoldPayloadV1 | null {
  const { file, storagePath } = params;
  if (typeof file === "string") {
    const src = file.trim();
    if (!src) return null;
    let p = storagePath?.trim() || "";
    if (!p && (src.startsWith("http://") || src.startsWith("https://"))) {
      p = tryGetStoragePathFromFirebaseDownloadUrl(src) || "";
    }
    let n = "";
    try {
      n = decodeURIComponent(src.split("/").pop()?.split("?")[0] || "");
    } catch {
      n = src.split("/").pop()?.split("?")[0] || "";
    }
    return {
      v: 1,
      src,
      p: p || undefined,
      n: n || undefined,
    };
  }
  // Unsaved File: same-tab sid + clipboard (clipboard text still works cross-action same tab)
  const sid = putSameTabBlobForHoldCopy(file);
  return {
    v: 1,
    sid,
    n: file.name,
    t: file.type || undefined,
  };
}
