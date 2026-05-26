"use client";

import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

/** Fast local unlock synthetic uid — Firebase token nahi deta, Drive API ke liye invalid. */
export const LOCAL_SYNTHETIC_AUTH_UID_PREFIX = "local:";

export const FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG =
  "Google account sign-in required for Drive sync";

export const LOCAL_UNLOCK_ONLY_DRIVE_MSG =
  "Local company unlock is not enough — sign in with your Google account, then Connect account for Drive.";

export class DriveAuthRequiredError extends Error {
  readonly code = "drive_auth_required" as const;

  constructor(message: string) {
    super(message);
    this.name = "DriveAuthRequiredError";
  }
}

export function isLocalSyntheticAuthUid(uid: string | null | undefined): boolean {
  return !!uid && uid.startsWith(LOCAL_SYNTHETIC_AUTH_UID_PREFIX);
}

/** IndexedDB session restore hone tak wait — startup par turant null mat mano. */
export async function waitForFirebaseAuthReady(): Promise<void> {
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
}

/** Real Firebase session (local synthetic `local:*` nahi). */
export function hasRealFirebaseAuthSession(): boolean {
  const user = auth.currentUser;
  return !!user && !isLocalSyntheticAuthUid(user.uid);
}

/** Drive / billing hosted API — real Firebase user + fresh ID token. */
export async function getFirebaseAuthUserForApi(): Promise<User> {
  await waitForFirebaseAuthReady();
  const user = auth.currentUser;
  if (!user) {
    throw new DriveAuthRequiredError(FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG);
  }
  if (isLocalSyntheticAuthUid(user.uid)) {
    throw new DriveAuthRequiredError(LOCAL_UNLOCK_ONLY_DRIVE_MSG);
  }
  return user;
}

export async function getFirebaseIdTokenForApi(): Promise<{ user: User; token: string }> {
  const user = await getFirebaseAuthUserForApi();
  const token = await user.getIdToken();
  return { user, token };
}

/** Purana / naya auth error text — stale registry error clear karne ke liye. */
export function isStoredDriveAuthError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("sign in required") ||
    m.includes("google account sign-in required") ||
    m.includes("local company unlock is not enough")
  );
}

export function isDriveAuthRequiredError(e: unknown): boolean {
  if (e instanceof DriveAuthRequiredError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return isStoredDriveAuthError(msg);
}
