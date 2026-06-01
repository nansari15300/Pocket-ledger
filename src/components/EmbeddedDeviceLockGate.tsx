"use client";

/**
 * EXE = 6-digit PIN required; APK = backup PIN pehle, phir optional biometric (Settings / setup gate).
 * Firebase restore ke baad bhi pura UI tab tak block jab tak session unlock na ho — logout par session flag clear.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  embeddedPinLength,
  getEmbeddedLockShellKind,
  hasEmbeddedLockConfigured,
  hasEmbeddedLockSetupSkipped,
  hasEmbeddedPinConfigured,
  hasUserChosenEmbeddedPin,
  isEmbeddedDeviceLockShell,
  isEmbeddedSessionUnlocked,
  isSixDigitNumericPin,
  markEmbeddedSessionUnlocked,
  readBiometricUnlockEnabled,
  saveEmbeddedPinHash,
  setBiometricUnlockEnabled,
  setEmbeddedLockSetupSkipped,
  setUserChosenEmbeddedPin,
  verifyEmbeddedPin,
} from "@/lib/embeddedDeviceLock";
import {
  nativeBiometricLockAvailable,
  saveNativeBiometricLockPin,
  tryNativeBiometricUnlockReadPin,
} from "@/lib/embeddedDeviceLockBiometric";

export function EmbeddedDeviceLockGate() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const shellKind = useMemo(() => getEmbeddedLockShellKind(), []);
  const isApk = shellKind === "apk";
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioOffer, setBioOffer] = useState(false);
  /** APK unlock: backup PIN tab dikhane ke liye (default biometric-only). */
  const [showOptionalPinUnlock, setShowOptionalPinUnlock] = useState(false);
  /** `sessionStorage` / localStorage change par React dubara paint kare — unlock ke baad overlay hataane ke liye. */
  const [unlockBump, setUnlockBump] = useState(0);
  /** Biometric success ke turant baad overlay hatao — async storage + auth `loading` flicker se pehle. */
  const [unlockedNow, setUnlockedNow] = useState(false);

  const uid = user?.uid ?? "";
  const localSynthetic = uid.startsWith("local:");
  const sessionUnlocked = unlockedNow || isEmbeddedSessionUnlocked();
  const setupSkipped = hasEmbeddedLockSetupSkipped(uid);
  const needsGate = useMemo(() => {
    void unlockBump;
    const lockConfigured = hasEmbeddedLockConfigured(uid);
    return (
      !loading &&
      Boolean(user) &&
      !localSynthetic &&
      isEmbeddedDeviceLockShell() &&
      // Setup-mode only: user ne skip choose kiya ho to gate force mat karo; lock configured ho to unlock required rahe.
      (lockConfigured ? !sessionUnlocked : !setupSkipped)
    );
  }, [loading, user, localSynthetic, uid, unlockBump, sessionUnlocked, setupSkipped]);

  const setupMode = !hasEmbeddedLockConfigured(uid);
  const bioEnabled = uid ? readBiometricUnlockEnabled(uid) : false;
  /** APK unlock: backup PIN optional — link se, user ne PIN set kiya ho, ya biometric band. */
  const showPinUnlock =
    !isApk ||
    showOptionalPinUnlock ||
    hasUserChosenEmbeddedPin(uid) ||
    (hasEmbeddedPinConfigured(uid) && !bioEnabled);

  useEffect(() => {
    if (!isEmbeddedDeviceLockShell() || !uid || localSynthetic) return;
    let cancelled = false;
    void (async () => {
      const ok = await nativeBiometricLockAvailable();
      if (!cancelled) setBioOffer(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, localSynthetic]);

  const finishUnlock = useCallback(() => {
    setUnlockedNow(true);
    markEmbeddedSessionUnlocked();
    setPin("");
    setPin2("");
    setUnlockBump((b) => b + 1);
  }, []);

  /** Account / cold resume: pehle se unlock ho to overlay mat dikhao. */
  useEffect(() => {
    if (!uid || localSynthetic) {
      setUnlockedNow(false);
      return;
    }
    if (isEmbeddedSessionUnlocked()) {
      setUnlockedNow(true);
    }
  }, [uid, localSynthetic]);

  useEffect(() => {
    if (!isApk || !uid || localSynthetic) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("resume", () => {
        if (isEmbeddedSessionUnlocked()) {
          setUnlockedNow(true);
          setUnlockBump((b) => b + 1);
        }
      }).then((h) => {
        remove = () => void h.remove();
      });
    });
    return () => remove?.();
  }, [isApk, uid, localSynthetic]);

  const bioUnlockInFlightRef = useRef(false);

  const onUnlockBiometric = useCallback(async () => {
    if (!user) return;
    if (bioUnlockInFlightRef.current) return;
    if (!readBiometricUnlockEnabled(user.uid)) {
      toast({ title: "Biometric off", description: "Use your backup PIN or reset app lock in Settings." });
      return;
    }
    bioUnlockInFlightRef.current = true;
    setBusy(true);
    try {
      const bio = await tryNativeBiometricUnlockReadPin(user.uid);
      // `bio.ok === false` — discriminated union narrow; `!bio.ok` se TS `reason` access reject karta hai.
      if (bio.ok === false) {
        if (bio.reason === "cancelled" || bio.reason === "busy") return;
        if (bio.reason === "no_credentials" || bio.reason === "decrypt_failed") {
          toast({
            variant: "destructive",
            title: "Biometric data missing",
            description: "Reset app lock in Settings, then enable fingerprint again.",
          });
          return;
        }
        if (bio.reason === "user_mismatch") {
          toast({
            variant: "destructive",
            title: "Wrong account",
            description: "Biometric was saved for another user. Reset app lock in Settings.",
          });
          return;
        }
        toast({ variant: "destructive", title: "Biometric failed", description: "Try backup PIN or try again." });
        return;
      }
      /* OS biometric pass = unlock; keystore PIN se local hash sync (purana hash mismatch par bhi gate hatao) */
      try {
        await saveEmbeddedPinHash(user.uid, bio.pin);
      } catch {
        toast({
          variant: "destructive",
          title: "Could not save lock",
          description: "Free storage or reset app lock in Settings.",
        });
        return;
      }
      finishUnlock();
    } finally {
      setBusy(false);
      bioUnlockInFlightRef.current = false;
    }
  }, [user, toast, finishUnlock]);

  /** APK unlock: gate khulte hi ek hi baar auto biometric — WebView ready + double-prompt avoid. */
  const autoBioAttempted = useRef(false);
  useEffect(() => {
    if (!needsGate) {
      autoBioAttempted.current = false;
      return;
    }
    if (setupMode || !isApk || !bioEnabled || busy || !uid || autoBioAttempted.current) return;
    autoBioAttempted.current = true;
    const t = window.setTimeout(() => {
      void onUnlockBiometric();
    }, 400);
    return () => window.clearTimeout(t);
  }, [needsGate, setupMode, isApk, bioEnabled, busy, uid, onUnlockBiometric]);

  /** APK: pehle user PIN verify, phir biometric keystore — bina PIN ke fingerprint/face band. */
  const validateSetupPinFields = (): boolean => {
    const n = embeddedPinLength();
    if (!isSixDigitNumericPin(pin) || !isSixDigitNumericPin(pin2)) {
      toast({
        variant: "destructive",
        title: "PIN",
        description: `Enter exactly ${n} digits (numbers only).`,
      });
      return false;
    }
    if (pin !== pin2) {
      toast({ variant: "destructive", title: "PIN mismatch", description: "Both PIN fields must match." });
      return false;
    }
    return true;
  };

  const onSetupApkBiometric = async (userPin: string) => {
    if (!user) return;
    if (!isSixDigitNumericPin(userPin)) {
      toast({
        variant: "destructive",
        title: "PIN required",
        description: `Set a ${embeddedPinLength()}-digit PIN before enabling fingerprint or face unlock.`,
      });
      return;
    }
    if (!bioOffer) {
      toast({
        variant: "destructive",
        title: "Biometric unavailable",
        description: "Enable fingerprint or face unlock in device settings, or continue with PIN only.",
      });
      return;
    }
    setBusy(true);
    try {
      await saveEmbeddedPinHash(user.uid, userPin);
      // Biometric setup bhi lock-enabled state hai; skip flag clear rakho.
      setEmbeddedLockSetupSkipped(user.uid, false);
      await saveNativeBiometricLockPin(user.uid, userPin);
      setBiometricUnlockEnabled(user.uid, true);
      setUserChosenEmbeddedPin(user.uid, true);
      finishUnlock();
      toast({
        title: "App lock ready",
        description: "Fingerprint or face unlock is on. You can also use your backup PIN.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: "Could not save biometric unlock. Check device security settings.",
      });
    } finally {
      setBusy(false);
    }
  };

  const onSetup = async () => {
    if (!user) return;
    if (isApk) {
      if (!validateSetupPinFields()) return;
      setBusy(true);
      try {
        await saveEmbeddedPinHash(user.uid, pin);
        // PIN setup complete: skip preference hatao, ab startup lock enabled maana jaaye.
        setEmbeddedLockSetupSkipped(user.uid, false);
        setUserChosenEmbeddedPin(user.uid, true);
        finishUnlock();
        toast({ title: "App lock ready", description: "Your backup PIN is set. Enable biometric in Settings if you want." });
      } finally {
        setBusy(false);
      }
      return;
    }

    const n = embeddedPinLength();
    if (!isSixDigitNumericPin(pin) || !isSixDigitNumericPin(pin2)) {
      toast({
        variant: "destructive",
        title: "PIN",
        description: `Enter exactly ${n} digits (numbers only).`,
      });
      return;
    }
    if (pin !== pin2) {
      toast({ variant: "destructive", title: "PIN mismatch", description: "Both PIN fields must match." });
      return;
    }
    setBusy(true);
    try {
      await saveEmbeddedPinHash(user.uid, pin);
      // PIN setup complete: skip preference hatao, ab startup lock enabled maana jaaye.
      setEmbeddedLockSetupSkipped(user.uid, false);
      setUserChosenEmbeddedPin(user.uid, true);
      finishUnlock();
      toast({ title: "App lock ready", description: "Your device is secured with a PIN." });
    } finally {
      setBusy(false);
    }
  };

  const onUnlockPin = async () => {
    if (!user) return;
    if (!isSixDigitNumericPin(pin)) {
      toast({
        variant: "destructive",
        title: "PIN",
        description: `Enter your ${embeddedPinLength()}-digit PIN.`,
      });
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyEmbeddedPin(user.uid, pin);
      if (!ok) {
        toast({ variant: "destructive", title: "Wrong PIN", description: "Try again." });
        setPin("");
        return;
      }
      finishUnlock();
    } finally {
      setBusy(false);
    }
  };

  const onSkipSetup = () => {
    if (!user) return;
    // User preference: startup par compulsory gate band karo; settings se kabhi bhi lock re-enable ho sakta hai.
    setEmbeddedLockSetupSkipped(user.uid, true);
    finishUnlock();
    toast({
      title: "PIN skipped",
      description: "App lock setup skipped for now. You can enable it later from Settings > App Lock.",
    });
  };

  if (!needsGate) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[10050] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="App lock"
    >
      {/* APK: card ko screen center se ~20vh neeche — one-hand thumb reach */}
      <Card className={cn("w-full max-w-md shadow-lg", isApk && "translate-y-[20vh]")}>
        <CardHeader>
          <CardTitle>{setupMode ? (isApk ? "Set up app lock" : "Set app PIN") : "Unlock app"}</CardTitle>
          <CardDescription>
            {setupMode
              ? isApk
                ? "Choose a 6-digit backup PIN first. After that you can enable fingerprint or face unlock."
                : "Windows app: choose a 6-digit PIN. Until you log out, you will not be asked for your cloud password again for this session."
              : isApk
                ? "Unlock with fingerprint or face. Data loads from local storage first; account checks run in the background."
                : "Enter your PIN to continue. Data loads from local storage first; account checks run in the background."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setupMode ? (
            <>
              {isApk ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pl-embed-pin1">Backup PIN ({embeddedPinLength()} digits)</Label>
                    <Input
                      id="pl-embed-pin1"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={embeddedPinLength()}
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, embeddedPinLength()))
                      }
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pl-embed-pin2">Confirm backup PIN</Label>
                    <Input
                      id="pl-embed-pin2"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={embeddedPinLength()}
                      value={pin2}
                      onChange={(e) =>
                        setPin2(e.target.value.replace(/\D/g, "").slice(0, embeddedPinLength()))
                      }
                      disabled={busy}
                    />
                  </div>
                  <Button type="button" className="w-full" disabled={busy} onClick={() => void onSetup()}>
                    {busy ? "Saving…" : "Save PIN and continue"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={busy || !bioOffer}
                    onClick={() => {
                      if (!validateSetupPinFields()) return;
                      void onSetupApkBiometric(pin);
                    }}
                  >
                    {busy ? "Setting up…" : "Save PIN and enable fingerprint / face unlock"}
                  </Button>
                  {!bioOffer ? (
                    <p className="text-xs text-muted-foreground">
                      Biometric hardware not detected. Save PIN above, or enable biometrics in Android settings.
                    </p>
                  ) : null}
                  <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onSkipSetup}>
                    Skip PIN for now
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pl-embed-pin1">PIN ({embeddedPinLength()} digits)</Label>
                    <Input
                      id="pl-embed-pin1"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={embeddedPinLength()}
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, embeddedPinLength()))
                      }
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pl-embed-pin2">Confirm PIN</Label>
                    <Input
                      id="pl-embed-pin2"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={embeddedPinLength()}
                      value={pin2}
                      onChange={(e) =>
                        setPin2(e.target.value.replace(/\D/g, "").slice(0, embeddedPinLength()))
                      }
                      disabled={busy}
                    />
                  </div>
                  <Button type="button" className="w-full" disabled={busy} onClick={() => void onSetup()}>
                    Save and continue
                  </Button>
                  <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onSkipSetup}>
                    Skip PIN for now
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              {showPinUnlock ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pl-embed-unlock">{isApk ? "Backup PIN (optional)" : "PIN"}</Label>
                    <Input
                      id="pl-embed-unlock"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={embeddedPinLength()}
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, embeddedPinLength()))
                      }
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void onUnlockPin();
                      }}
                    />
                  </div>
                  <Button type="button" className="w-full" disabled={busy} onClick={() => void onUnlockPin()}>
                    Unlock
                  </Button>
                </>
              ) : isApk && bioEnabled ? (
                <p className="text-center text-sm text-muted-foreground">Waiting for biometric…</p>
              ) : null}

              {isApk && bioEnabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onUnlockBiometric()}
                >
                  Unlock with biometric
                </Button>
              ) : null}

              {isApk && bioEnabled && !showPinUnlock ? (
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-sm"
                  disabled={busy}
                  onClick={() => setShowOptionalPinUnlock(true)}
                >
                  Use backup PIN instead
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
