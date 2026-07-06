"use client";

import { FirestorePermissionError } from "@/firebase/errors";
import { isLocalOnlyMode } from "@/lib/localMode";
import {
  markSuppressFirestorePermissionForCompany,
  shouldSuppressFirestorePermissionConsole,
} from "@/lib/firestorePermissionSuppress";

export {
  isExpectedFirestoreSnapshotPermissionDenial,
  markSuppressFirestorePermissionForCompany,
} from "@/lib/firestorePermissionSuppress";

/** Firestore / Firebase permission error — runtime overlay ke bajay popup dikhane ke liye. */
export function isFirestorePermissionLikeError(reason: unknown): boolean {
  if (reason instanceof FirestorePermissionError) return true;
  const code = String((reason as { code?: string })?.code ?? "");
  const message = String((reason as { message?: string })?.message ?? "");
  const name = String((reason as { name?: string })?.name ?? "");
  return (
    code === "permission-denied" ||
    code === "PERMISSION_DENIED" ||
    (name === "FirebaseError" && message.toLowerCase().includes("missing or insufficient permissions")) ||
    message.toLowerCase().includes("missing or insufficient permissions")
  );
}

/**
 * Local-only mode: Firestore deny expected (data SQLite se) — red error overlay / popup spam mat karo.
 * Drive-shared local company: Firestore me row nahi — listener deny bhi expected.
 */
export function shouldSuppressFirestorePermissionPopup(): boolean {
  return shouldSuppressFirestorePermissionConsole() || isLocalOnlyMode();
}

export const FIRESTORE_NO_PERMISSION_TITLE = "No permission";

export const FIRESTORE_NO_PERMISSION_DESCRIPTION_LOCAL =
  "You do not have permission for this action on this local company. Ask the company admin to update your role in Manage Share.";

export const FIRESTORE_NO_PERMISSION_DESCRIPTION_CLOUD =
  "You do not have permission for this action. Contact your company admin if you need access.";
