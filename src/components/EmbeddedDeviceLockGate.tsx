"use client";

/**
 * EXE = 6-digit PIN required; APK = biometric primary, optional backup PIN.
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
  generateInternalDeviceLockPin,
  getEmbeddedLockShellKind,
  hasEmbeddedLockConfigured,
  hasEmbeddedPinConfigured,
  hasUserChosenEmbeddedPin,
  isEmbeddedDeviceLockShell,
  isEmbeddedSessionUnlocked,
  isSixDigitNumericPin,
  markEmbeddedSessionUnlocked,
  readBiometricUnlockEnabled,
  saveEmbeddedPinHash,
  setBiometricUnlockEnabled,
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
  /** APK setup: optional backup PIN fields dikhane ke liye. */
  const [showOptionalPinSetup, setShowOptionalPinSetup] = useState(false);
  /** APK unlock: backup PIN tab dikhane ke liye (default biometric-only). */
  const [showOptionalPinUnlock, setShowOptionalPinUnlock] = useState(false);
  /** `sessionStorage` change par React dubara paint kare — unlock ke baad overlay hataane ke liye. */
  const [unlockBump, setUnlockBump] = useState(0);

  const uid = user?.uid ?? "";
  const localSynthetic = uid.startsWith("local:");
  const needsGate = useMemo(() => {
    void unlockBump;
    return (
      !loading &&
      Boolean(user) &&
      !localSynthetic &&
      isEmbeddedDeviceLockShell() &&
      (!hasEmbeddedLockConfigured(uid) || !isEmbeddedSessionUnlocked())
    );
  }, [loading, user, localSynthetic, uid, unlockBump]);

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
    markEmbeddedSessionUnlocked();
    setPin("");
    setPin2("");
    setUnlockBump((b) => b + 1);
  }, []);

  const onUnlockBiometric = useCallback(async () => {
    if (!user) return;
    if (!readBiometricUnlockEnabled(user.uid)) {
      toast({ title: "Biometric off", description: "Use your backup PIN or reset app lock in Settings." });
      return;
    }
    setBusy(true);
    try {
      const recovered = await tryNativeBiometricUnlockReadPin(user.uid);
      if (!recovered) {
        toast({ variant: "destructive", title: "Biometric failed", description: "Try backup PIN or try again." });
        return;
      }
      const ok = await verifyEmbeddedPin(user.uid, recovered);
      if (!ok) {
        toast({ variant: "destructive", title: "Lock data mismatch", description: "Reset app lock in Settings." });
        return;
      }
      finishUnlock();
    } finally {
      setBusy(false);
    }
  }, [user, toast, finishUnlock]);

  /** APK unlock: gate khulte hi ek hi baar auto biometric — cancel par dubara button se. */
  const autoBioAttempted = useRef(false);
  useEffect(() => {
    if (!needsGate) {
      autoBioAttempted.current = false;
      return;
    }
    if (setupMode || !isApk || !bioEnabled || busy || !uid || autoBioAttempted.current) return;
    autoBioAttempted.current = true;
    void onUnlockBiometric();
  }, [needsGate, setupMode, isApk, bioEnabled, busy, uid, onUnlockBiometric]);

  /** APK: biometric + andar hidden PIN hash; optional user PIN overwrite. */
  const onSetupApkBiometric = async (userPin?: string) => {
    if (!user) return;
    if (!bioOffer) {
      toast({
        variant: "destructive",
        title: "Biometric unavailable",
        description: "Enable fingerprint or face unlock in device settings, or set a backup PIN.",
      });
      return;
    }
    setBusy(true);
    try {
      const lockPin = userPin && isSixDigitNumericPin(userPin) ? userPin : generateInternalDeviceLockPin();
      await saveEmbeddedPinHash(user.uid, lockPin);
      await saveNativeBiometricLockPin(user.uid, lockPin);
      setBiometricUnlockEnabled(user.uid, true);
      setUserChosenEmbeddedPin(user.uid, Boolean(userPin && isSixDigitNumericPin(userPin)));
      finishUnlock();
      toast({
        title: "App lock ready",
        description: userPin
          ? "Fingerprint or face unlock is on. You can also use your backup PIN."
          : "This device unlocks with fingerprint or face.",
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
      if (showOptionalPinSetup) {
        const n = embeddedPinLength();
        if (!isSixDigitNumericPin(pin) || !isSixDigitNumericPin(pin2)) {
          toast({
            variant: "destructive",
            title: "PIN",
            description: `Enter exactly ${n} digits (numbers only) or skip backup PIN.`,
          });
          return;
        }
        if (pin !== pin2) {
          toast({ variant: "destructive", title: "PIN mismatch", description: "Both PIN fields must match." });
          return;
        }
        await onSetupApkBiometric(pin);
        return;
      }
      await onSetupApkBiometric();
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
                ? "Use fingerprint or face to lock this app. A backup PIN is optional."
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
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy || !bioOffer}
                    onClick={() => void onSetupApkBiometric()}
                  >
                    {busy ? "Setting up…" : "Enable fingerprint / face unlock"}
                  </Button>
                  {!bioOffer ? (
                    <p className="text-xs text-muted-foreground">
                      Biometric hardware not detected. Set a backup PIN below or enable biometrics in Android settings.
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-sm"
                    disabled={busy}
                    onClick={() => setShowOptionalPinSetup((v) => !v)}
                  >
                    {showOptionalPinSetup ? "Hide backup PIN" : "Set backup PIN (optional)"}
                  </Button>
                  {showOptionalPinSetup ? (
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
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={busy}
                        onClick={() => void onSetup()}
                      >
                        Save backup PIN and enable biometric
                      </Button>
                    </>
                  ) : null}
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
