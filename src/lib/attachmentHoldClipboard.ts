/**
 * 2s hold copy/paste: clipboard me compact marker + optional same-tab blob sid.
 * Paste (voucher forms): saved `src` ref ho to wahi URL reuse; sirf unsaved File / sid-only → naya File upload.
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

/** Paste par blob mat hatao — jab tak naya copy na ho, bar-bar paste same file se ho sake */
function getSameTabBlob(sid: string): Blob | null {
  pruneSameTab();
  const e = sameTabBlobs.get(sid);
  if (!e || e.blob.size === 0) return null;
  e.createdAt = Date.now();
  return e.blob;
}

/** Session backup dubara likho — multi-paste ke baad bhi last copy readable rahe */
export function refreshAttachmentHoldSessionBackup(payload: AttachmentHoldPayloadV1): void {
  try {
    sessionStorage.setItem(SESSION_BACKUP_KEY, encodePayload(payload));
  } catch {
    /* private mode */
  }
}

function encodePayload(p: AttachmentHoldPayloadV1): string {
  const json = JSON.stringify(p);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
  return `${ATTACHMENT_HOLD_CLIPBOARD_PREFIX}${b64}`;
}

/** Voucher / hover preview: clipboard marker ko asli `local:` / `drive:` / https ref me karo. */
export function normalizeAttachmentUrlForDevicePreview(raw: string): string {
  const s = String(raw || "").trim();
  if (!s.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return s;
  const payload = parseAttachmentHoldClipboardText(s);
  const src = String(payload?.src || "").trim();
  return src || s;
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

export type WriteAttachmentHoldClipboardOpts = {
  /**
   * Clipboard line user ko dikhe (HTTPS link); session me hamesha PL marker — `readText` URL ho to bhi paste session se chal sakta hai.
   */
  clipboardDisplayUrl?: string | null;
};

export async function writeAttachmentHoldClipboard(
  payload: AttachmentHoldPayloadV1,
  opts?: WriteAttachmentHoldClipboardOpts
): Promise<boolean> {
  const encoded = encodePayload(payload);
  try {
    sessionStorage.setItem(SESSION_BACKUP_KEY, encoded);
  } catch {
    /* private mode */
  }
  const raw = String(opts?.clipboardDisplayUrl || "").trim();
  const usePlain =
    raw.length > 0 &&
    !raw.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX) &&
    !raw.startsWith("blob:") &&
    !raw.startsWith("data:") &&
    (raw.startsWith("http://") || raw.startsWith("https://"));
  const toWrite = usePlain ? raw : encoded;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(toWrite);
      return true;
    }
  } catch {
    /* permission / insecure context */
  }
  return false;
}

export async function readAttachmentHoldClipboardText(): Promise<string | null> {
  /* Pehle session — OS clipboard paste/clear ke baad bhi last PL copy */
  try {
    const fb = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (fb && fb.startsWith(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return fb;
  } catch {
    /* */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      const t = await navigator.clipboard.readText();
      if (t && t.includes(ATTACHMENT_HOLD_CLIPBOARD_PREFIX)) return t.trim();
    }
  } catch {
    /* denied */
  }
  return null;
}

/** Copy source se Blob — paste ke liye naya File banane me (dubara upload ho). */
export async function fetchBlobForAttachmentHoldPaste(
  payload: AttachmentHoldPayloadV1,
  signal?: AbortSignal
): Promise<{ blob: Blob; fileName: string; contentType: string } | null> {
  if (payload.sid) {
    const blob = getSameTabBlob(payload.sid);
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

/** Paste / reuse: voucher `fileUrls` me save ho sakne wala ref (`https`, `local:`, `drive:`, …). */
export function persistableAttachmentRefFromHoldPayload(
  payload: AttachmentHoldPayloadV1
): string | null {
  const src = normalizeAttachmentUrlForDevicePreview(String(payload.src || "").trim());
  if (!src || src.startsWith("blob:")) return null;
  return src;
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
