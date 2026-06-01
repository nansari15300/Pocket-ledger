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
  clearEmbeddedSessionUnlock,
  embeddedPinLength,
  getEmbeddedLockShellKind,
  hasEmbeddedLockConfigured,
  hasEmbeddedLockSetupSkipped,
  hasEmbeddedPinConfigured,
  hasUserChosenEmbeddedPin,
  isEmbeddedDeviceLockShell,
  isSixDigitNumericPin,
  markEmbeddedSessionUnlocked,
  readBiometricUnlockEnabled,
  saveEmbeddedPinHash,
  setBiometricUnlockEnabled,
  setEmbeddedLockSetupSkipped,
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
  const [setupSkipped, setSetupSkipped] = useState(false);
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
    setSetupSkipped(hasEmbeddedLockSetupSkipped(uid));
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
    setSetupSkipped(hasEmbeddedLockSetupSkipped(uid));
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

  const n = embeddedPinLength();

  const onSetBackupPin = async () => {
    if (!isSixDigitNumericPin(newPin) || !isSixDigitNumericPin(newPin2)) {
      toast({ variant: "destructive", title: "PIN", description: `Enter a ${n}-digit PIN and confirmation.` });
      return;
    }
    if (newPin !== newPin2) {
      toast({ variant: "destructive", title: "Mismatch", description: "PIN and confirmation must match." });
      return;
    }
    setPinBusy(true);
    try {
      await saveEmbeddedPinHash(uid, newPin);
      setUserChosenEmbeddedPin(uid, true);
      if (readBiometricUnlockEnabled(uid)) {
        try {
          await saveNativeBiometricLockPin(uid, newPin);
        } catch {
          setBiometricUnlockEnabled(uid, false);
          toast({
            title: "Biometric updated",
            description: "Backup PIN set. Biometric was turned off — enable it again below if you want.",
          });
        }
      }
      markEmbeddedSessionUnlocked();
      setNewPin("");
      setNewPin2("");
      refreshLocalState();
      toast({ title: "Backup PIN set", description: "You can change this PIN anytime below." });
    } finally {
      setPinBusy(false);
    }
  };

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
      if (!hasEmbeddedPinConfigured(uid) || !hasUserChosenEmbeddedPin(uid)) {
        toast({
          variant: "destructive",
          title: "PIN required",
          description: `Set a ${embeddedPinLength()}-digit backup PIN above before enabling biometric unlock.`,
        });
        return;
      }
      if (!isSixDigitNumericPin(bioPinForEnable)) {
        toast({
          variant: "destructive",
          title: "PIN required",
          description: `Enter your ${embeddedPinLength()}-digit backup PIN to enable biometric unlock.`,
        });
        return;
      }
      setBioBusy(true);
      try {
        const ok = await verifyEmbeddedPin(uid, bioPinForEnable);
        if (!ok) {
          toast({ variant: "destructive", title: "Wrong PIN", description: "Cannot enable biometric unlock." });
          return;
        }
        await saveNativeBiometricLockPin(uid, bioPinForEnable);
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

  const onEnableSetupNow = () => {
    // User ne skip kiya ho to settings se turant gate wapas laane ka manual re-enable path.
    setEmbeddedLockSetupSkipped(uid, false);
    clearEmbeddedSessionUnlock();
    refreshLocalState();
    toast({
      title: "App lock setup enabled",
      description: "You will now be asked to set a PIN before continuing.",
    });
  };

  return (
    <div className="space-y-6 p-1">
      <Card>
        <CardHeader>
          <CardTitle>App Lock</CardTitle>
          <CardDescription>
            {shellKind === "exe"
              ? "Windows app: a 6-digit PIN protects this installation. Until you log out, you are not asked again for the same session."
              : "Android app: set a backup PIN first, then optionally enable fingerprint or face unlock in Settings."}
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
                  : setupSkipped
                    ? "PIN setup skipped on this device"
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

      {!lockConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle>Set up app lock</CardTitle>
            <CardDescription>
              App lock is optional for static startup. If you want PIN protection again, re-enable setup now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={onEnableSetupNow}>
              Require PIN setup now
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {shellKind === "apk" && lockConfigured && !userPinChosen ? (
        <Card>
          <CardHeader>
            <CardTitle>Set backup PIN</CardTitle>
            <CardDescription>
              Choose a {n}-digit backup PIN. Required before fingerprint or face unlock can be turned on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="pl-al-setpin">Backup PIN</Label>
              <Input
                id="pl-al-setpin"
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
              <Label htmlFor="pl-al-setpin2">Confirm backup PIN</Label>
              <Input
                id="pl-al-setpin2"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={n}
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, n))}
                disabled={pinBusy}
              />
            </div>
            <Button type="button" disabled={pinBusy} onClick={() => void onSetBackupPin()}>
              {pinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save backup PIN"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {(shellKind === "exe" && pinConfigured) || (shellKind === "apk" && pinConfigured && userPinChosen) ? (
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
            <CardDescription>
              Turn fingerprint or face unlock on or off. Your backup PIN must be set and verified before enabling.
            </CardDescription>
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
            {!bioOn && bioHardware && userPinChosen ? (
              <div className="space-y-2">
                <Label htmlFor="pl-al-biopin">Your backup PIN ({n} digits)</Label>
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
            {!bioOn && bioHardware && !userPinChosen ? (
              <p className="text-xs text-muted-foreground">Set a backup PIN above before enabling biometric unlock.</p>
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
