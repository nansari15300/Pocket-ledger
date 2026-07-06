"use client";

/**
 * Browser Web Crypto SHA-256 → lowercase hex — attachment integrity + outbox payload hashing.
 * HTTP LAN (non-secure context): `crypto.subtle` missing ho to pure JS fallback.
 */

import { sha256PureBytes, sha256PureHex } from "@/lib/security/sha256Pure";

function subtleDigestAvailable(): boolean {
  return typeof globalThis !== "undefined" && !!globalThis.crypto?.subtle?.digest;
}

export async function digestSha256Bytes(input: Uint8Array): Promise<ArrayBuffer> {
  if (subtleDigestAvailable()) {
    return crypto.subtle.digest("SHA-256", input as BufferSource);
  }
  const pure = sha256PureBytes(input);
  return pure.buffer.slice(pure.byteOffset, pure.byteOffset + pure.byteLength);
}

export async function computeSha256HexFromBytes(bytes: ArrayBuffer): Promise<string> {
  if (subtleDigestAvailable()) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bufferToLowerHex(digest);
  }
  return sha256PureHex(new Uint8Array(bytes));
}

export async function computeSha256HexFromStringUtf8(text: string): Promise<string> {
  const enc = new TextEncoder();
  return computeSha256HexFromBytes(enc.encode(text).buffer);
}

export async function computeSha256HexFromBlob(blob: Blob): Promise<string> {
  return computeSha256HexFromBytes(await blob.arrayBuffer());
}

function bufferToLowerHex(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 1) {
    s += u[i]!.toString(16).padStart(2, "0");
  }
  return s;
}
