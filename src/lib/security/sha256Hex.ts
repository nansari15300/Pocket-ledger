"use client";

/**
 * Browser Web Crypto SHA-256 → lowercase hex — attachment integrity + outbox payload hashing.
 */
export async function computeSha256HexFromBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToLowerHex(digest);
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
