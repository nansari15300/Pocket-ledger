
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

// --- MAIN FUNCTIONS ---
export async function encryptData(secretData: string, password: string): Promise<string> {
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt);

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      new TextEncoder().encode(secretData)
    );

    const encryptedContentArr = new Uint8Array(encryptedContent);
    const buff = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContentArr.byteLength);
    buff.set(salt, 0);
    buff.set(iv, salt.byteLength);
    buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
    
    // Robust Base64 encoding
    const base64String = btoa(
      Array.from(buff, (byte) => String.fromCharCode(byte)).join('')
    );
    
    return base64String;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Could not encrypt data.");
  }
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  try {
    const encryptedDataBuff = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
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
