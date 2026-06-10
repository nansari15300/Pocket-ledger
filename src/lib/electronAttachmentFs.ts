"use client";

import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

type PlElectronAttachmentsApi = {
  writeFile: (args: {
    relativePath: string;
    base64: string;
  }) => Promise<{ ok?: boolean; error?: string }>;
  readFile: (args: {
    relativePath: string;
  }) => Promise<{ ok?: boolean; base64?: string; error?: string }>;
  deleteFile: (relativePath: string) => Promise<{ ok?: boolean; error?: string }>;
  exists: (relativePath: string) => Promise<{ ok?: boolean; exists?: boolean; error?: string }>;
};

function electronAttachmentsApi(): PlElectronAttachmentsApi | null {
  if (typeof window === "undefined" || !isElectronDesktopApp()) return null;
  const api = (window as unknown as { plElectronAttachments?: PlElectronAttachmentsApi })
    .plElectronAttachments;
  if (!api?.writeFile || !api?.readFile) return null;
  return api;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result || "");
      resolve(dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl);
    };
    r.onerror = () => reject(r.error ?? new Error("blob read failed"));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(base64Raw: string, contentType?: string | null): Blob {
  const bin = atob(base64Raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

/** EXE userData/pl-attachments/... — renderer IPC via preload. */
export async function electronWriteAttachmentBlob(relativePath: string, blob: Blob): Promise<boolean> {
  const api = electronAttachmentsApi();
  if (!api) return false;
  const rel = String(relativePath || "").trim();
  if (!rel) return false;
  try {
    const base64 = await blobToBase64(blob);
    const resp = await api.writeFile({ relativePath: rel, base64 });
    return resp.ok === true;
  } catch {
    return false;
  }
}

export async function electronReadAttachmentBlob(
  relativePath: string,
  contentType?: string | null
): Promise<Blob | null> {
  const api = electronAttachmentsApi();
  if (!api) return null;
  const rel = String(relativePath || "").trim();
  if (!rel) return null;
  try {
    const resp = await api.readFile({ relativePath: rel });
    if (!resp.ok || !resp.base64) return null;
    const blob = base64ToBlob(resp.base64, contentType);
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export async function electronDeleteAttachmentBlob(relativePath: string): Promise<void> {
  const api = electronAttachmentsApi();
  if (!api) return;
  const rel = String(relativePath || "").trim();
  if (!rel) return;
  try {
    await api.deleteFile(rel);
  } catch {
    /* ignore */
  }
}

export async function electronAttachmentBlobExists(relativePath: string): Promise<boolean> {
  const api = electronAttachmentsApi();
  if (!api) return false;
  const rel = String(relativePath || "").trim();
  if (!rel) return false;
  try {
    const resp = await api.exists(rel);
    return resp.ok === true && resp.exists === true;
  } catch {
    return false;
  }
}

const ELECTRON_DISPLAY_URL_MAX = 120;
const electronDisplayUrlByPath = new Map<string, string>();
const electronDisplayUrlLru: string[] = [];

/** Voucher thumbnail / preview: disk read → stable session `blob:` (revoke on replace only). */
export async function electronAttachmentDisplayUrlFromPath(
  relativePath: string,
  contentType?: string | null
): Promise<string | null> {
  const rel = String(relativePath || "").trim();
  if (!rel) return null;
  const cached = electronDisplayUrlByPath.get(rel);
  if (cached) return cached;
  const blob = await electronReadAttachmentBlob(rel, contentType);
  if (!blob || blob.size <= 0) return null;
  const url = URL.createObjectURL(blob);
  const prev = electronDisplayUrlByPath.get(rel);
  if (prev && prev !== url) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      /* ignore */
    }
  }
  electronDisplayUrlByPath.set(rel, url);
  const idx = electronDisplayUrlLru.indexOf(rel);
  if (idx >= 0) electronDisplayUrlLru.splice(idx, 1);
  electronDisplayUrlLru.push(rel);
  while (electronDisplayUrlLru.length > ELECTRON_DISPLAY_URL_MAX) {
    const drop = electronDisplayUrlLru.shift();
    if (!drop) break;
    const ou = electronDisplayUrlByPath.get(drop);
    electronDisplayUrlByPath.delete(drop);
    if (ou) {
      try {
        URL.revokeObjectURL(ou);
      } catch {
        /* ignore */
      }
    }
  }
  return url;
}
