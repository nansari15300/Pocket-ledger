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

/** APK native Google + web popup/redirect — LoginForm aur saved-account switch dono use karte hain. */
export async function signInWithGoogleForApp(): Promise<UserCredential | null> {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  // User ne dusra Google account choose karna ho to chooser force karo; last signed account auto-select na ho.
  provider.setCustomParameters({ prompt: "select_account" });

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

  try {
    return await signInWithPopup(auth, provider);
  } catch (popupError: unknown) {
    const code =
      typeof popupError === "object" && popupError != null && "code" in popupError
        ? String((popupError as { code?: string }).code)
        : "";
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw popupError;
  }
}
