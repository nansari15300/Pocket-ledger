/**
 * APK-only: `@capgo/capacitor-native-biometric` — PIN OS secure storage + `verifyIdentity` prompt.
 * Web/Electron bundle me dynamic import fail ho to silently skip (typecheck ke liye module installed).
 */

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

const BIO_SERVER = "pocket-ledger-embedded-lock-v1";

export async function nativeBiometricLockAvailable(): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;
  try {
    const { NativeBiometric, BiometryType } = await import("@capgo/capacitor-native-biometric");
    const r = await NativeBiometric.isAvailable({ useFallback: false });
    return Boolean(r.isAvailable && r.biometryType !== BiometryType.NONE);
  } catch {
    return false;
  }
}

/** Setup: current 6-digit PIN ko keystore me bandho taaki baad mein biometric se read ho sake. */
export async function saveNativeBiometricLockPin(firebaseUid: string, pin: string): Promise<void> {
  if (!isCapacitorNativeApp()) return;
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  await NativeBiometric.setCredentials({
    server: BIO_SERVER,
    username: firebaseUid,
    password: pin,
  });
}

/** Unlock: pehle OS biometric, phir JS mein PIN hash verify (gate component). */
export async function tryNativeBiometricUnlockReadPin(firebaseUid: string): Promise<string | null> {
  if (!isCapacitorNativeApp()) return null;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Pocket Ledger",
      title: "Biometric unlock",
    });
    const cred = await NativeBiometric.getCredentials({ server: BIO_SERVER });
    if (cred?.username === firebaseUid && cred.password) return cred.password;
    return null;
  } catch {
    return null;
  }
}

export async function wipeNativeBiometricLockCredentials(): Promise<void> {
  if (!isCapacitorNativeApp()) return;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.deleteCredentials({ server: BIO_SERVER });
  } catch {
    /* ignore */
  }
}
