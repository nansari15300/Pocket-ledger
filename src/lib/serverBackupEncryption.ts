"use client";

/**
 * Optional AES-GCM encryption for Firestore company subcollection payloads (static/local-first outbox flush).
 * Same collection paths (`companies/{id}/vouchers/...`); ciphertext lives in `plEncrypted*` fields.
 * PBKDF2 input comes from the **current company login** (username + password) — set in session after successful
 * `localAuthLoginClientOnly` (no separate passphrase field).
 *
 * String in/out only (no import from `localVoucherOutbox`) — avoids circular deps; caller uses `outboxJsonStringify` / `outboxJsonParse`.
 */

import { computeSha256HexFromStringUtf8 } from "@/lib/security/sha256Hex";

/** Firestore marker + payload fields (same doc id / path as plaintext). */
export const PL_ENCRYPTED_V1_FIELD = "plEncryptedV1";
export const PL_ENCRYPTED_IV_FIELD = "plEncryptedIv";
export const PL_ENCRYPTED_PAYLOAD_FIELD = "plEncryptedPayload";

const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_BITS = 256;

/** sessionStorage: hex SHA-256 of `companyId|username|password` — PBKDF2 password string (tab-scoped). */
function backupSessionKey(localCompanyId: string): string {
  return `pl_enc_sess_${localCompanyId}`;
}

/**
 * Call after successful local company login so flush/decrypt can derive the same key material as encrypt.
 */
export async function setBackupEncryptionSessionFromLogin(
  companyId: string,
  username: string,
  password: string
): Promise<void> {
  if (typeof window === "undefined" || !companyId) return;
  try {
    const hex = await computeSha256HexFromStringUtf8(
      `${companyId}|${username.trim().toLowerCase()}|${password}`
    );
    sessionStorage.setItem(backupSessionKey(companyId), hex);
  } catch {
    /* private mode / crypto unavailable — login must not fail */
  }
}

/** PBKDF2 password input for encrypt/decrypt — null if user has not logged in this tab since load. */
export function getBackupEncryptionPassphraseFromSession(localCompanyId: string): string | null {
  if (typeof window === "undefined" || !localCompanyId) return null;
  try {
    const v = sessionStorage.getItem(backupSessionKey(localCompanyId));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function clearBackupEncryptionSession(localCompanyId: string): void {
  if (typeof window === "undefined" || !localCompanyId) return;
  try {
    sessionStorage.removeItem(backupSessionKey(localCompanyId));
  } catch {
    /* ignore */
  }
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

function base64Decode(s: string): Uint8Array {
  const bin = typeof atob !== "undefined" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      // TS 5.7+ BufferSource narrow — runtime same bytes
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Random salt for new company-level setting (store base64 on `companies/{id}`). */
export function generateEncryptServerBackupSaltBase64(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return base64Encode(salt);
}

/**
 * Encrypt UTF-8 JSON string (caller should use `outboxJsonStringify` for Timestamp-safe payload).
 */
export async function encryptServerBackupPayloadJson(
  plainJsonUtf8: string,
  passphrase: string,
  saltBase64: string
): Promise<{ ivBase64: string; cipherTextBase64: string }> {
  const salt = base64Decode(saltBase64);
  const key = await deriveAesKey(passphrase, salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(plainJsonUtf8);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource);
  const cipherBytes = new Uint8Array(cipherBuf);
  return { ivBase64: base64Encode(iv), cipherTextBase64: base64Encode(cipherBytes) };
}

/** Returns same JSON string shape the caller passed to encrypt (use `outboxJsonParse` on result). */
export async function decryptServerBackupPayloadJson(
  ivBase64: string,
  cipherTextBase64: string,
  passphrase: string,
  saltBase64: string
): Promise<string> {
  const salt = base64Decode(saltBase64);
  const key = await deriveAesKey(passphrase, salt);
  const iv = base64Decode(ivBase64);
  const cipherBytes = base64Decode(cipherTextBase64);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, cipherBytes as BufferSource);
  return new TextDecoder().decode(plainBuf);
}

export function isEncryptedServerBackupDoc(data: Record<string, unknown>): boolean {
  return data[PL_ENCRYPTED_V1_FIELD] === true;
}

/** Salt on company root / local registry — required with passphrase for decrypt. */
export type ServerBackupCryptoContext = {
  encryptServerBackupSalt?: string | null;
};

/**
 * Firestore row → same shape as plaintext doc for app logic; returns null if encrypted but cannot decrypt.
 */
export async function decryptFirestoreCompanyDocIfNeeded(
  doc: Record<string, unknown> & { id: string },
  ctx: ServerBackupCryptoContext | null,
  localCompanyId: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
  if (!isEncryptedServerBackupDoc(doc)) {
    return doc as Record<string, unknown> & { id: string };
  }
  const salt = ctx?.encryptServerBackupSalt;
  if (!salt || typeof salt !== "string") {
    console.warn("[serverBackupEncryption] Encrypted doc but company has no encryptServerBackupSalt");
    return null;
  }
  const phrase = getBackupEncryptionPassphraseFromSession(localCompanyId);
  if (!phrase) {
    console.warn(
      "[serverBackupEncryption] Encrypted doc but no session key — log in again with your company username and password (same tab)."
    );
    return null;
  }
  const iv = String(doc[PL_ENCRYPTED_IV_FIELD] ?? "");
  const payload = String(doc[PL_ENCRYPTED_PAYLOAD_FIELD] ?? "");
  try {
    const { outboxJsonParse } = await import("@/lib/localVoucherOutbox");
    const json = await decryptServerBackupPayloadJson(iv, payload, phrase, salt);
    const plain = outboxJsonParse(json) as Record<string, unknown>;
    return { ...plain, id: doc.id };
  } catch (e) {
    console.warn("[serverBackupEncryption] decrypt failed", e);
    return null;
  }
}
