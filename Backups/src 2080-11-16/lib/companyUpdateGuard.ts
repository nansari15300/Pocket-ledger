"use client";

/** Message shown when update fails because company exists only locally (not yet synced to Firestore). */
export const COMPANY_NOT_SYNCED_MESSAGE =
  "This company hasn't synced to the server yet. Connect to the internet and wait for sync, then try again.";

/** Returns true if the error is Firestore NOT_FOUND (e.g. updating a document that doesn't exist). */
export function isCompanyNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "not-found" ||
    (typeof e.message === "string" && e.message.includes("No document to update"))
  );
}
