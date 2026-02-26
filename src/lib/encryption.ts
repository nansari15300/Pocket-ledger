
"use client";

// --- HELPERS ---
const getPasswordKey = (password: string) =>
  window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);

const deriveKey = (passwordKey: CryptoKey, salt: Uint8Array) =>
  window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 250000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

const bytesToBase64 = (bytes: Uint8Array): string => {
  // Use chunked conversion to avoid stack/memory spikes on large backups.
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const CHUNK_SIZE = 256 * 1024;
const MAGIC = new Uint8Array([80, 76, 66, 50]); // "PLB2"

const ivForChunk = (baseIv: Uint8Array, chunkIndex: number): Uint8Array => {
  const iv = new Uint8Array(baseIv);
  const view = new DataView(iv.buffer);
  view.setUint32(8, (view.getUint32(8) + chunkIndex) >>> 0);
  return iv;
};

const readUint32 = (buf: Uint8Array, offset: number): number => {
  return new DataView(buf.buffer, buf.byteOffset + offset, 4).getUint32(0);
};

const SECURE_CONTEXT_MSG =
  "Backup encryption requires a secure connection (HTTPS or localhost). Please open this app via https:// or http://localhost.";

// --- MAIN FUNCTIONS ---
export async function encryptData(secretData: string, password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(SECURE_CONTEXT_MSG);
  }
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt);
    const plainBytes = new TextEncoder().encode(secretData);
    try {
      // Legacy one-shot format (keep as first preference for full backward compatibility).
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        plainBytes
      );

      const encryptedContentArr = new Uint8Array(encryptedContent);
      const buff = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContentArr.byteLength);
      buff.set(salt, 0);
      buff.set(iv, salt.byteLength);
      buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
      return bytesToBase64(buff);
    } catch {
      // Fallback for large payloads: chunked binary format, still base64 in .plbp file.
      const encryptedChunks: Uint8Array[] = [];
      for (let offset = 0, idx = 0; offset < plainBytes.length; offset += CHUNK_SIZE, idx++) {
        const chunk = plainBytes.subarray(offset, offset + CHUNK_SIZE);
        const enc = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv: ivForChunk(iv, idx) },
          aesKey,
          chunk
        );
        encryptedChunks.push(new Uint8Array(enc));
      }

      const headerLen = MAGIC.length + 16 + 12 + 4;
      const chunksMetaLen = encryptedChunks.length * 4;
      const payloadLen = encryptedChunks.reduce((s, c) => s + c.length, 0);
      const totalLen = headerLen + chunksMetaLen + payloadLen;
      const out = new Uint8Array(totalLen);
      let ptr = 0;

      out.set(MAGIC, ptr); ptr += MAGIC.length;
      out.set(salt, ptr); ptr += 16;
      out.set(iv, ptr); ptr += 12;
      new DataView(out.buffer).setUint32(ptr, encryptedChunks.length); ptr += 4;

      encryptedChunks.forEach((chunk) => {
        new DataView(out.buffer).setUint32(ptr, chunk.length);
        ptr += 4;
      });
      encryptedChunks.forEach((chunk) => {
        out.set(chunk, ptr);
        ptr += chunk.length;
      });

      return bytesToBase64(out);
    }
  } catch (error) {
    console.error("Encryption failed:", error);
    const msg = (error as Error)?.message ?? String(error);
    const name = (error as Error)?.name ?? "";
    throw new Error(msg.includes("encrypt") ? msg : `Could not encrypt data. ${name ? name + ": " : ""}${msg}`);
  }
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(SECURE_CONTEXT_MSG);
  }
  try {
    const trimmedPayload = (encryptedData || "").trim();

    const sanitizedPayload = trimmedPayload.replace(/\s+/g, "");
    const encryptedDataBuff = base64ToBytes(sanitizedPayload);

    // Fallback chunked binary format detection via magic header.
    if (
      encryptedDataBuff.length > 36 &&
      encryptedDataBuff[0] === MAGIC[0] &&
      encryptedDataBuff[1] === MAGIC[1] &&
      encryptedDataBuff[2] === MAGIC[2] &&
      encryptedDataBuff[3] === MAGIC[3]
    ) {
      let ptr = 4;
      const salt = encryptedDataBuff.slice(ptr, ptr + 16); ptr += 16;
      const baseIv = encryptedDataBuff.slice(ptr, ptr + 12); ptr += 12;
      const chunkCount = readUint32(encryptedDataBuff, ptr); ptr += 4;

      const lengths: number[] = [];
      for (let i = 0; i < chunkCount; i++) {
        lengths.push(readUint32(encryptedDataBuff, ptr));
        ptr += 4;
      }

      const passwordKey = await getPasswordKey(password);
      const aesKey = await deriveKey(passwordKey, salt);

      const plainChunks: Uint8Array[] = [];
      let totalPlainLen = 0;
      for (let i = 0; i < chunkCount; i++) {
        const len = lengths[i];
        const encChunk = encryptedDataBuff.slice(ptr, ptr + len);
        ptr += len;
        const decChunk = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ivForChunk(baseIv, i) },
          aesKey,
          encChunk
        );
        const decBytes = new Uint8Array(decChunk);
        totalPlainLen += decBytes.length;
        plainChunks.push(decBytes);
      }

      const merged = new Uint8Array(totalPlainLen);
      let writePtr = 0;
      plainChunks.forEach((c) => {
        merged.set(c, writePtr);
        writePtr += c.length;
      });
      return new TextDecoder().decode(merged);
    }

    const salt = encryptedDataBuff.slice(0, 16);
    const iv = encryptedDataBuff.slice(16, 16 + 12);
    const data = encryptedDataBuff.slice(16 + 12);

    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      data
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (error: any) {
    console.error("Decryption failed:", error);
    // When the password is wrong, the browser throws an OperationError.
    // We catch it and throw a more specific, user-friendly error.
    if (error.name === 'OperationError') {
        throw new Error("INVALID_PASSWORD");
    }
    // For other decryption issues, throw a generic decryption failure error.
    throw new Error("DECRYPTION_FAILED");
  }
}
