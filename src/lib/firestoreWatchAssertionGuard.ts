/**
 * Firestore JS SDK 12.x watch/network/internal persistence noise (ca9 / b815 / da08 / canonifyTarget).
 * These are SDK bugs — not app logic errors — and can take down the Next client shell.
 */

function isFirestoreCanonifyTargetUnhandledError(message: string): boolean {
  if (!message.includes("@firebase/firestore") && !message.includes("Firestore (")) return false;
  if (!message.includes("INTERNAL UNHANDLED ERROR") && !message.includes("canonifyTarget")) {
    return false;
  }
  return (
    message.includes("canonifyTarget") ||
    message.includes("IndexedDbTargetCache") ||
    message.includes("Cannot read properties of null")
  );
}

export function isFirestoreWatchTeardownAssertionMessage(message: string): boolean {
  if (!message) return false;
  if (isFirestoreCanonifyTargetUnhandledError(message)) return true;
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
