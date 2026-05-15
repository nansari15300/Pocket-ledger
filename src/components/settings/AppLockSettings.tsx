"use client";

/**
 * Settings → App Lock: EXE/APK par 6-digit PIN badalna, Android biometric on/off, pura lock reset.
 * `EmbeddedDeviceLockGate` alag full-screen gate hai — yahan maintenance / user control.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  embeddedPinLength,
  getEmbeddedLockShellKind,
  generateInternalDeviceLockPin,
  hasEmbeddedLockConfigured,
  hasEmbeddedPinConfigured,
  hasUserChosenEmbeddedPin,
  isEmbeddedDeviceLockShell,
  isSixDigitNumericPin,
  markEmbeddedSessionUnlocked,
  readBiometricUnlockEnabled,
  saveEmbeddedPinHash,
  setBiometricUnlockEnabled,
  setUserChosenEmbeddedPin,
  verifyEmbeddedPin,
  wipeEmbeddedDeviceLockForUser,
} from "@/lib/embeddedDeviceLock";
import {
  nativeBiometricLockAvailable,
  saveNativeBiometricLockPin,
  wipeNativeBiometricLockCredentials,
} from "@/lib/embeddedDeviceLockBiometric";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

export function AppLockSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const uid = user?.uid ?? "";
  const localSynthetic = uid.startsWith("local:");
  const [shellKind, setShellKind] = useState<ReturnType<typeof getEmbeddedLockShellKind>>("none");
  const [pinConfigured, setPinConfigured] = useState(false);
  const [lockConfigured, setLockConfigured] = useState(false);
  const [userPinChosen, setUserPinChosen] = useState(false);
  const [bioHardware, setBioHardware] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const [bioPinForEnable, setBioPinForEnable] = useState("");
  const [bioBusy, setBioBusy] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    setShellKind(getEmbeddedLockShellKind());
    if (!uid || localSynthetic) return;
    setPinConfigured(hasEmbeddedPinConfigured(uid));
    setLockConfigured(hasEmbeddedLockConfigured(uid));
    setUserPinChosen(hasUserChosenEmbeddedPin(uid));
    setBioOn(readBiometricUnlockEnabled(uid));
    let cancelled = false;
    void (async () => {
      const ok = await nativeBiometricLockAvailable();
      if (!cancelled) setBioHardware(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, localSynthetic]);

  const refreshLocalState = () => {
    if (!uid || localSynthetic) return;
    setPinConfigured(hasEmbeddedPinConfigured(uid));
    setLockConfigured(hasEmbeddedLockConfigured(uid));
    setUserPinChosen(hasUserChosenEmbeddedPin(uid));
    setBioOn(readBiometricUnlockEnabled(uid));
  };

  if (!isEmbeddedDeviceLockShell()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App Lock</CardTitle>
          <CardDescription>App lock is only available in the Windows desktop app or the Android app.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!uid || localSynthetic) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App Lock</CardTitle>
          <CardDescription>Sign in with your online account to manage the app lock on this device.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const onChangePin = async () => {
    if (!isSixDigitNumericPin(currentPin)) {
      toast({ variant: "destructive", title: "Current PIN", description: `Enter your current ${embeddedPinLength()}-digit PIN.` });
      return;
    }
    if (!isSixDigitNumericPin(newPin) || !isSixDigitNumericPin(newPin2)) {
      toast({ variant: "destructive", title: "New PIN", description: `New PIN must be exactly ${embeddedPinLength()} digits.` });
      return;
    }
    if (newPin !== newPin2) {
      toast({ variant: "destructive", title: "Mismatch", description: "New PIN and confirmation must match." });
      return;
    }
    setPinBusy(true);
    try {
      const ok = await verifyEmbeddedPin(uid, currentPin);
      if (!ok) {
        toast({ variant: "destructive", title: "Wrong PIN", description: "Current PIN is incorrect." });
        return;
      }
      await saveEmbeddedPinHash(uid, newPin);
      setUserChosenEmbeddedPin(uid, true);
      if (shellKind === "apk" && readBiometricUnlockEnabled(uid)) {
        try {
          await saveNativeBiometricLockPin(uid, newPin);
        } catch {
          setBiometricUnlockEnabled(uid, false);
          toast({
            title: "Biometric updated",
            description: "PIN changed. Biometric unlock was turned off — enable it again below if you want.",
          });
        }
      }
      markEmbeddedSessionUnlocked();
      setCurrentPin("");
      setNewPin("");
      setNewPin2("");
      refreshLocalState();
      toast({ title: "PIN updated", description: "Your app lock PIN has been changed." });
    } finally {
      setPinBusy(false);
    }
  };

  const onBiometricSwitch = async (next: boolean) => {
    if (next) {
      if (!bioHardware) {
        toast({ title: "Not available", description: "This device does not report fingerprint or face unlock." });
        return;
      }
      setBioBusy(true);
      try {
        let pinForBio = bioPinForEnable;
        if (isSixDigitNumericPin(bioPinForEnable)) {
          const ok = await verifyEmbeddedPin(uid, bioPinForEnable);
          if (!ok) {
            toast({ variant: "destructive", title: "Wrong PIN", description: "Cannot enable biometric unlock." });
            return;
          }
        } else if (!hasEmbeddedPinConfigured(uid)) {
          // APK: pehli baar sirf biometric — andar hidden PIN, user ko PIN optional
          pinForBio = generateInternalDeviceLockPin();
          await saveEmbeddedPinHash(uid, pinForBio);
          setUserChosenEmbeddedPin(uid, false);
        } else {
          toast({
            variant: "destructive",
            title: "PIN required",
            description: `Enter your ${embeddedPinLength()}-digit backup PIN to enable biometric, or set up lock from the unlock screen.`,
          });
          return;
        }
        await saveNativeBiometricLockPin(uid, pinForBio);
        setBiometricUnlockEnabled(uid, true);
        setBioOn(true);
        setBioPinForEnable("");
        refreshLocalState();
        toast({ title: "Biometric enabled", description: "You can unlock the app with fingerprint or face where supported." });
      } catch {
        toast({ variant: "destructive", title: "Failed", description: "Could not save biometric data. Check device security settings." });
      } finally {
        setBioBusy(false);
      }
      return;
    }
    setBioBusy(true);
    try {
      await wipeNativeBiometricLockCredentials();
      setBiometricUnlockEnabled(uid, false);
      setBioOn(false);
      toast({ title: "Biometric disabled", description: "Use your PIN to unlock the app." });
    } finally {
      setBioBusy(false);
    }
  };

  const onResetConfirm = async () => {
    setResetBusy(true);
    try {
      await wipeEmbeddedDeviceLockForUser(uid);
      setResetOpen(false);
      refreshLocalState();
      toast({
        title: "App lock reset",
        description: "PIN and biometric data were removed on this device. You will be asked to set a new PIN when you continue.",
      });
    } finally {
      setResetBusy(false);
    }
  };

  const n = embeddedPinLength();

  return (
    <div className="space-y-6 p-1">
      <Card>
        <CardHeader>
          <CardTitle>App Lock</CardTitle>
          <CardDescription>
            {shellKind === "exe"
              ? "Windows app: a 6-digit PIN protects this installation. Until you log out, you are not asked again for the same session."
              : "Android app: fingerprint or face unlock is primary; a backup PIN is optional. Data can show from local storage while the account is verified in the background."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Status:{" "}
            <span className="font-medium text-foreground">
              {shellKind === "apk"
                ? lockConfigured
                  ? bioOn
                    ? userPinChosen
                      ? "Biometric on · backup PIN set"
                      : "Biometric on (no backup PIN)"
                    : userPinChosen
                      ? "Backup PIN only"
                      : "No app lock yet"
                  : "No app lock yet"
                : pinConfigured
                  ? "PIN is set on this device"
                  : "No PIN set yet"}
            </span>
            {shellKind === "apk" ? (
              <>
                {" · "}
                <span className="font-medium text-foreground">
                  Biometric: {bioOn ? "on" : "off"}
                  {!bioHardware && bioOn === false ? " (hardware not reported)" : ""}
                </span>
              </>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {pinConfigured && userPinChosen ? (
        <Card>
          <CardHeader>
            <CardTitle>Change PIN</CardTitle>
            <CardDescription>Enter your current PIN, then choose a new {n}-digit PIN.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="pl-al-cur">Current PIN</Label>
              <Input
                id="pl-al-cur"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={n}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, n))}
                disabled={pinBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pl-al-new">New PIN</Label>
              <Input
                id="pl-al-new"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={n}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, n))}
                disabled={pinBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pl-al-new2">Confirm new PIN</Label>
              <Input
                id="pl-al-new2"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={n}
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, n))}
                disabled={pinBusy}
              />
            </div>
            <Button type="button" disabled={pinBusy} onClick={() => void onChangePin()}>
              {pinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {shellKind === "apk" ? (
        <Card>
          <CardHeader>
            <CardTitle>Biometric unlock</CardTitle>
            <CardDescription>Primary unlock on Android. Backup PIN is optional in Settings or on first setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Unlock with biometric</p>
                <p className="text-xs text-muted-foreground">{bioHardware ? "Supported on this device." : "Not available on this device."}</p>
              </div>
              <Switch
                checked={bioOn}
                disabled={bioBusy || (!bioOn && !bioHardware)}
                onCheckedChange={(v) => void onBiometricSwitch(v === true)}
              />
            </div>
            {!bioOn && bioHardware ? (
              <div className="space-y-2">
                <Label htmlFor="pl-al-biopin">
                  {userPinChosen ? `Your backup PIN (${n} digits)` : "Backup PIN (optional — leave blank for biometric only)"}
                </Label>
                <Input
                  id="pl-al-biopin"
                  type="password"
                  inputMode="numeric"
                  maxLength={n}
                  value={bioPinForEnable}
                  onChange={(e) => setBioPinForEnable(e.target.value.replace(/\D/g, "").slice(0, n))}
                  disabled={bioBusy}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Reset app lock</CardTitle>
          <CardDescription>
            Removes the PIN and biometric data stored on this device for your account. You will set a new PIN the next time the app asks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" disabled={resetBusy || !lockConfigured} onClick={() => setResetOpen(true)}>
            Reset app lock on this device
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset app lock?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your saved PIN and biometric unlock for Pocket Ledger on this device only. You can set them again afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetBusy}
              onClick={(e) => {
                e.preventDefault();
                void onResetConfirm();
              }}
            >
              {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
