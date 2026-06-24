"use client";

import {
  PL_ENCRYPTED_IV_FIELD,
  PL_ENCRYPTED_PAYLOAD_FIELD,
  PL_ENCRYPTED_V1_FIELD,
  decryptServerBackupPayloadJson,
  encryptServerBackupPayloadJson,
  generateEncryptServerBackupSaltBase64,
  getBackupEncryptionPassphraseFromSession,
} from "@/lib/serverBackupEncryption";
import type { LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import { getLocalCompanyById } from "@/lib/localCompanyStore";

/** Sync/upload block — user ko Company Profile ya login se key deni hoti hai. */
export const CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG =
  "Drive encryption is on. Set a company password in Company Profile, or sign in to this company with your username and password.";

export const CLOUD_SYNC_DECRYPT_PASSPHRASE_REQUIRED_MSG =
  "Cannot decrypt Drive data. Set a company password in Company Profile, or sign in with your username and password.";

/** Join / download — manifest me salt nahi (owner ne abhi Force sync nahi kiya). */
export const CLOUD_SYNC_DRIVE_SALT_MISSING_MSG =
  "Encrypted Drive data but encryption salt is missing. Ask the owner to open Cloud sync and click Force sync now, then try Join again.";

/** Toast / status me purani Hindi error strings bhi match karein. */
export function isCloudSyncEncryptionKeyRequiredError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  const m = message.trim();
  return (
    m === CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG ||
    m.includes("Drive encryption ON") ||
    m.includes("Drive encryption is on") ||
    m.includes("company password set karo")
  );
}

export type CloudSyncDriveEncryptionFlags = {
  encryptData: boolean;
  encryptFiles: boolean;
  /** Legacy single checkbox — data ya files koi bhi ON. */
  encryptAny: boolean;
  salt: string | null;
};

/** Legacy `cloudSyncEncryptDrive` + naye alag flags — purani companies migrate. */
export function readCloudSyncDriveEncryptionFromCompany(
  company: Record<string, unknown> | null | undefined
): CloudSyncDriveEncryptionFlags {
  const c = company ?? {};
  const legacy = c.cloudSyncEncryptDrive === true;
  const encryptData = c.cloudSyncEncryptDriveData === true || (legacy && c.cloudSyncEncryptDriveData !== false);
  const encryptFiles = c.cloudSyncEncryptDriveFiles === true || (legacy && c.cloudSyncEncryptDriveFiles !== false);
  const saltRaw = String(c.cloudSyncDriveEncryptionSalt ?? c.encryptServerBackupSalt ?? "").trim();
  return {
    encryptData,
    encryptFiles,
    encryptAny: encryptData || encryptFiles,
    salt: saltRaw || null,
  };
}

/** @deprecated use readCloudSyncDriveEncryptionFromCompany */
export function readCloudSyncEncryptDriveFromCompany(
  company: Record<string, unknown> | null | undefined
): { enabled: boolean; salt: string | null } {
  const f = readCloudSyncDriveEncryptionFromCompany(company);
  return { enabled: f.encryptAny, salt: f.salt };
}

/** Drive delta op file me encrypted marker — plain JSON legacy ops bhi read ho sakein. */
export type DriveEncryptedOpFile = {
  [PL_ENCRYPTED_V1_FIELD]?: boolean;
  [PL_ENCRYPTED_IV_FIELD]?: string;
  [PL_ENCRYPTED_PAYLOAD_FIELD]?: string;
};

/** Encrypted attachment wrapper — Drive par `.plenc.json` body. */
export type DriveEncryptedFileWrapper = {
  [PL_ENCRYPTED_V1_FIELD]: true;
  [PL_ENCRYPTED_IV_FIELD]: string;
  [PL_ENCRYPTED_PAYLOAD_FIELD]: string;
  contentType?: string;
  originalName?: string;
};

export function isDriveEncryptedFileWrapper(raw: unknown): raw is DriveEncryptedFileWrapper {
  const o = raw as DriveEncryptedFileWrapper;
  return o?.[PL_ENCRYPTED_V1_FIELD] === true && !!o?.[PL_ENCRYPTED_PAYLOAD_FIELD];
}

/** Company protect password sab shared users ke liye; warna is tab ka local login (username+password). */
export async function resolveCloudSyncEncryptionPassphrase(
  companyId: string,
  company?: Record<string, unknown> | null
): Promise<string | null> {
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  const reg = company ?? (await getLocalCompanyById(cid, { includeDeleted: true }));
  const companyPw = String((reg as { password?: string } | null)?.password ?? "").trim();
  if (companyPw) {
    const enc = new TextEncoder();
    const raw = enc.encode(`${cid}|cloud_sync_company|${companyPw}`);
    const buf = await crypto.subtle.digest("SHA-256", raw);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return getBackupEncryptionPassphraseFromSession(cid);
}

export async function isCloudSyncEncryptionReady(companyId: string): Promise<boolean> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!flags.encryptAny) return true;
  if (!flags.salt) return false;
  const phrase = await resolveCloudSyncEncryptionPassphrase(companyId, reg as Record<string, unknown>);
  return Boolean(phrase);
}

async function requirePassphrase(
  companyId: string,
  company?: Record<string, unknown> | null
): Promise<{ phrase: string; salt: string }> {
  const reg = company ?? (await getLocalCompanyById(companyId, { includeDeleted: true }));
  const { salt } = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!salt) throw new Error(CLOUD_SYNC_DRIVE_SALT_MISSING_MSG);
  const phrase = await resolveCloudSyncEncryptionPassphrase(companyId, reg as Record<string, unknown>);
  if (!phrase) throw new Error(CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG);
  return { phrase, salt };
}

/** Upload se pehle: poora op JSON encrypt karke Drive file body banao. */
export async function encryptCloudSyncOpForDrive(
  companyId: string,
  op: LocalCloudSyncOperation,
  company?: Record<string, unknown> | null
): Promise<LocalCloudSyncOperation | DriveEncryptedOpFile> {
  const reg = company ?? (await getLocalCompanyById(companyId, { includeDeleted: true }));
  const { encryptData, salt } = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!encryptData || !salt) return op;

  const { phrase } = await requirePassphrase(companyId, reg as Record<string, unknown>);
  const plainJson = JSON.stringify(op);
  const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(plainJson, phrase, salt);
  return {
    opSeq: op.opSeq,
    companyId: op.companyId,
    [PL_ENCRYPTED_V1_FIELD]: true,
    [PL_ENCRYPTED_IV_FIELD]: ivBase64,
    [PL_ENCRYPTED_PAYLOAD_FIELD]: cipherTextBase64,
  };
}

/** Download ke baad: encrypted file → plain op; legacy plain JSON bhi chalega. */
export async function decryptCloudSyncOpFromDrive(
  companyId: string,
  raw: LocalCloudSyncOperation | DriveEncryptedOpFile,
  company?: Record<string, unknown> | null
): Promise<LocalCloudSyncOperation> {
  const file = raw as DriveEncryptedOpFile & LocalCloudSyncOperation;
  if (file[PL_ENCRYPTED_V1_FIELD] !== true) {
    return raw as LocalCloudSyncOperation;
  }

  const { phrase, salt } = await requirePassphrase(companyId, company);
  const iv = String(file[PL_ENCRYPTED_IV_FIELD] ?? "");
  const payload = String(file[PL_ENCRYPTED_PAYLOAD_FIELD] ?? "");
  const json = await decryptServerBackupPayloadJson(iv, payload, phrase, salt);
  return JSON.parse(json) as LocalCloudSyncOperation;
}

/** Opening JSON / manifest — data encryption flag se. */
export async function encryptCloudSyncJsonForDrive(
  companyId: string,
  plainJson: string,
  company?: Record<string, unknown> | null
): Promise<string | DriveEncryptedOpFile> {
  const reg = company ?? (await getLocalCompanyById(companyId, { includeDeleted: true }));
  const { encryptData, salt } = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!encryptData || !salt) return plainJson;

  const { phrase } = await requirePassphrase(companyId, reg as Record<string, unknown>);
  const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(plainJson, phrase, salt);
  return {
    [PL_ENCRYPTED_V1_FIELD]: true,
    [PL_ENCRYPTED_IV_FIELD]: ivBase64,
    [PL_ENCRYPTED_PAYLOAD_FIELD]: cipherTextBase64,
  };
}

export async function decryptCloudSyncJsonFromDrive(
  companyId: string,
  raw: string | DriveEncryptedOpFile,
  company?: Record<string, unknown> | null
): Promise<string> {
  if (typeof raw === "string") return raw;
  const file = raw as DriveEncryptedOpFile;
  if (file[PL_ENCRYPTED_V1_FIELD] !== true) return JSON.stringify(raw);
  const { phrase, salt } = await requirePassphrase(companyId, company);
  const iv = String(file[PL_ENCRYPTED_IV_FIELD] ?? "");
  const payload = String(file[PL_ENCRYPTED_PAYLOAD_FIELD] ?? "");
  return decryptServerBackupPayloadJson(iv, payload, phrase, salt);
}

/** File bytes → `.plenc.json` wrapper JSON string. */
export async function encryptDriveFileBytesForUpload(
  companyId: string,
  bytes: ArrayBuffer,
  meta: { contentType?: string; originalName?: string },
  company?: Record<string, unknown> | null
): Promise<string> {
  const reg = company ?? (await getLocalCompanyById(companyId, { includeDeleted: true }));
  const { encryptFiles, salt } = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!encryptFiles || !salt) {
    const u8 = new Uint8Array(bytes);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
    return JSON.stringify({ plainBase64: btoa(bin), contentType: meta.contentType, originalName: meta.originalName });
  }

  const { phrase } = await requirePassphrase(companyId, reg as Record<string, unknown>);
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  const plainJson = btoa(bin);
  const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(plainJson, phrase, salt);
  const wrapper: DriveEncryptedFileWrapper = {
    [PL_ENCRYPTED_V1_FIELD]: true,
    [PL_ENCRYPTED_IV_FIELD]: ivBase64,
    [PL_ENCRYPTED_PAYLOAD_FIELD]: cipherTextBase64,
    contentType: meta.contentType,
    originalName: meta.originalName,
  };
  return JSON.stringify(wrapper);
}

/** Download: `.plenc.json` / plain base64 wrapper → Blob bytes. */
export async function decryptDriveFilePayloadFromDownload(
  companyId: string,
  rawText: string,
  company?: Record<string, unknown> | null
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const bin = atob(rawText);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return { bytes: buf.buffer, contentType: "application/octet-stream" };
  }

  if (isDriveEncryptedFileWrapper(parsed)) {
    const { phrase, salt } = await requirePassphrase(companyId, company);
    const b64 = await decryptServerBackupPayloadJson(
      parsed[PL_ENCRYPTED_IV_FIELD],
      parsed[PL_ENCRYPTED_PAYLOAD_FIELD],
      phrase,
      salt
    );
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return {
      bytes: buf.buffer,
      contentType: parsed.contentType || "application/octet-stream",
    };
  }

  const legacy = parsed as { plainBase64?: string; contentType?: string };
  if (legacy.plainBase64) {
    const bin = atob(legacy.plainBase64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return { bytes: buf.buffer, contentType: legacy.contentType || "application/octet-stream" };
  }

  return { bytes: new TextEncoder().encode(rawText).buffer, contentType: "application/json" };
}

/** Pehli baar encrypt ON — random salt company registry me save. */
export function ensureCloudSyncDriveEncryptionSalt(existing?: string | null): string {
  const s = String(existing ?? "").trim();
  return s || generateEncryptServerBackupSaltBase64();
}
