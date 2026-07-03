"use client";

import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { auth, FIREBASE_WEB_OAUTH_CLIENT_ID } from "@/lib/firebase";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

type PlElectronAuthBridge = {
  signInWithGoogleExternal?: (options?: { loginHint?: string }) => Promise<{ idToken: string }>;
};

export type GoogleSignInForAppOptions = {
  /** Saved account email — EXE browser OAuth me hint; empty = account chooser. */
  loginHint?: string;
};

function getElectronAuthBridge(): PlElectronAuthBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { plElectronAuth?: PlElectronAuthBridge }).plElectronAuth ?? null;
}

/** APK native Google + web popup/redirect — LoginForm aur saved-account switch dono use karte hain. */
export async function signInWithGoogleForApp(
  options?: GoogleSignInForAppOptions
): Promise<UserCredential | null> {
  const loginHint = options?.loginHint?.trim() || undefined;
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  // User ne dusra Google account choose karna ho to chooser force karo; last signed account auto-select na ho.
  provider.setCustomParameters({
    prompt: "select_account",
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  if (Capacitor.isNativePlatform()) {
    const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
    const clientId =
      process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || FIREBASE_WEB_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error("Google Web client ID missing for native GoogleAuth.initialize");
    }
    await GoogleAuth.initialize({ clientId, scopes: ["profile", "email"], grantOfflineAccess: false });
    const nativeUser = await GoogleAuth.signIn();
    const idToken = nativeUser.authentication?.idToken;
    if (!idToken) throw new Error("Google idToken missing from native sign-in");
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  }

  /** EXE: Chrome/Edge system browser — prompt=select_account se naya account choose ho sakta hai. */
  if (isElectronDesktopApp()) {
    const bridge = getElectronAuthBridge();
    if (!bridge?.signInWithGoogleExternal) {
      throw new Error("EXE Google browser sign-in is not available. Rebuild the desktop app.");
    }
    const { idToken } = await bridge.signInWithGoogleExternal(
      loginHint ? { loginHint } : undefined
    );
    if (!idToken?.trim()) throw new Error("Google idToken missing from browser sign-in");
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  }

  const popupBlockedOrRedirect = async (popupError: unknown): Promise<UserCredential | null> => {
    const code =
      typeof popupError === "object" && popupError != null && "code" in popupError
        ? String((popupError as { code?: string }).code)
        : "";
    if (code === "auth/popup-closed-by-user") {
      throw popupError;
    }
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw popupError;
  };

  try {
    return await signInWithPopup(auth, provider);
  } catch (popupError: unknown) {
    return popupBlockedOrRedirect(popupError);
  }
}
