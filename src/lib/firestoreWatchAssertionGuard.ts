/**
 * Firestore JS SDK 12.x watch/network internal asserts (ca9 / b815 / da08).
 * These are SDK bugs — not app logic errors — and can take down the Next client shell.
 */

export function isFirestoreWatchTeardownAssertionMessage(message: string): boolean {
  if (!message) return false;
  const m = message;
  if (!m.includes("INTERNAL ASSERTION FAILED") && !m.includes("internal assertion failed")) {
    return false;
  }
  return (
    m.includes("ca9") ||
    m.includes("b815") ||
    m.includes("da08") ||
    m.includes('"ve":-1') ||
    m.includes("'ve':-1") ||
    m.includes("Unexpected state") ||
    m.includes("FIRESTORE")
  );
}
