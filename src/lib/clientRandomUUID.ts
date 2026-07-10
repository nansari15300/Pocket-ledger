"use client";

function randomUUIDv4FromGetRandomValues(): string | null {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!c || typeof c.getRandomValues !== "function") return null;
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomUUIDFallback(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

/** RFC4122 v4 — HTTP LAN dev (non-secure context) me `crypto.randomUUID` missing ho sakta hai. */
export function clientRandomUUID(): string {
  return randomUUIDv4FromGetRandomValues() ?? randomUUIDFallback();
}

/** App boot par ek baar — purane call sites bina guard ke bhi chal jayein. */
export function ensureClientRandomUUIDPolyfill(): void {
  if (typeof globalThis === "undefined") return;
  const c = globalThis.crypto;
  if (!c || typeof c.randomUUID === "function") return;
  if (typeof c.getRandomValues !== "function") return;
  const impl = () => clientRandomUUID();
  try {
    Object.defineProperty(c, "randomUUID", {
      configurable: true,
      writable: true,
      value: impl,
    });
  } catch {
    try {
      (c as Crypto).randomUUID = impl as Crypto["randomUUID"];
    } catch {
      /* ignore */
    }
  }
}
