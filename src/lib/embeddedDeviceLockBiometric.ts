/**
 * APK-only: `@capgo/capacitor-native-biometric` — PIN OS secure storage + `verifyIdentity` prompt.
 * Web/Electron bundle me dynamic import fail ho to silently skip (typecheck ke liye module installed).
 */

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

const BIO_SERVER = "pocket-ledger-embedded-lock-v1";

/** Do concurrent `verifyIdentity` (auto-prompt + button) se Android activity clash na ho */
let bioUnlockInFlight = false;

export type BiometricUnlockReadResult =
  | { ok: true; pin: string }
  | { ok: false; reason: "unavailable" | "cancelled" | "no_credentials" | "user_mismatch" | "decrypt_failed" | "busy" | "unknown" };

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
  /* Purani corrupt entry hatao — naya encrypt same KEY_ALIAS par clean slate */
  try {
    await NativeBiometric.deleteCredentials({ server: BIO_SERVER });
  } catch {
    /* pehli setup */
  }
  await NativeBiometric.setCredentials({
    server: BIO_SERVER,
    username: firebaseUid,
    password: pin,
  });
}

type BiometricFailReason = Extract<BiometricUnlockReadResult, { ok: false }>["reason"];

function mapVerifyIdentityError(err: unknown): BiometricFailReason {
  const code = String((err as { code?: string })?.code ?? "").toUpperCase();
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  if (code === "16" || msg.includes("user cancel") || msg.includes("cancel")) return "cancelled";
  if (code === "10" || msg.includes("authentication failed") || msg.includes("failed")) return "unknown";
  if (msg.includes("no credentials")) return "no_credentials";
  if (msg.includes("failed to get credentials") || msg.includes("decrypt")) return "decrypt_failed";
  return "unknown";
}

/** Unlock: OS biometric → keystore se PIN; gate par hash verify / resync. */
export async function tryNativeBiometricUnlockReadPin(
  firebaseUid: string
): Promise<BiometricUnlockReadResult> {
  if (!isCapacitorNativeApp()) return { ok: false, reason: "unavailable" };
  if (bioUnlockInFlight) return { ok: false, reason: "busy" };
  bioUnlockInFlight = true;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Pocket Ledger",
      title: "Biometric unlock",
      subtitle: "Confirm your fingerprint",
      /* Plugin default maxAttempts=1 — ek galat read par dialog band; 5 tak retry */
      maxAttempts: 5,
      useFallback: true,
    });
    const cred = await NativeBiometric.getCredentials({ server: BIO_SERVER });
    if (!cred?.password) return { ok: false, reason: "no_credentials" };
    if (cred.username !== firebaseUid) return { ok: false, reason: "user_mismatch" };
    return { ok: true, pin: cred.password };
  } catch (err) {
    return { ok: false, reason: mapVerifyIdentityError(err) };
  } finally {
    bioUnlockInFlight = false;
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
