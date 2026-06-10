"use client";

import { useCallback, useMemo, useState } from "react";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import { Loader2, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { signInWithGoogleForApp } from "@/lib/googleFirebaseSignIn";
import { resolvePostAuthCompanyRoute } from "@/lib/postAuthCompanyRoute";
import { isFeatureEnabled } from "@/config/plans";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import {
  decryptSavedLoginPassword,
  listSavedLoginAccounts,
  removeSavedLoginAccount,
  type SavedLoginAccountRecord,
} from "@/lib/savedLoginAccounts";

type Props = {
  onBack: () => void;
};

/** APK/EXE login: saved accounts list — tap se bina email/password field ke sign-in. */
export function SavedAccountsLoginPanel({ onBack }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const livePlans = useLivePlans();
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rows, setRows] = useState(() => listSavedLoginAccounts());

  const entitledRows = useMemo(
    () =>
      rows.filter((row) => {
        const plan = getPlanFromPlans(livePlans, row.planIdAtSave);
        return isFeatureEnabled(plan.id, "savedAccountSwitchEnabled");
      }),
    [rows, livePlans]
  );

  const navigateAfterAuth = useCallback(
    (firebaseUid: string | undefined, userEmail?: string | null) => {
      router.replace(resolvePostAuthCompanyRoute(firebaseUid, userEmail));
    },
    [router]
  );

  const switchTo = async (record: SavedLoginAccountRecord) => {
    setBusyUid(record.uid);
    try {
      if (record.authMethod === "password") {
        const password = await decryptSavedLoginPassword(record);
        if (!password) {
          toast({
            variant: "destructive",
            title: "Could not unlock saved account",
            description: "Saved password missing or corrupted. Remove and sign in normally.",
          });
          return;
        }
        await signInWithEmailAndPassword(auth, record.email, password);
        navigateAfterAuth(auth.currentUser?.uid, auth.currentUser?.email);
        return;
      }
      const result = await signInWithGoogleForApp();
      if (result?.user) {
        navigateAfterAuth(result.user.uid, result.user.email);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      toast({ variant: "destructive", title: "Could not switch account", description: msg });
    } finally {
      setBusyUid(null);
    }
  };

  const removeRow = (uid: string) => {
    removeSavedLoginAccount(uid);
    setRows(listSavedLoginAccounts());
  };

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Change account</h2>
        <p className="text-sm text-muted-foreground">Choose a saved account on this device.</p>
      </div>
      {entitledRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved accounts. Sign in and save one on logout.</p>
      ) : (
        <ul className="space-y-2">
          {entitledRows.map((row) => {
            const label = row.displayName?.trim() || row.email;
            const busy = busyUid === row.uid;
            return (
              <li key={row.uid} className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 justify-start h-auto py-3"
                  disabled={busyUid != null}
                  onClick={() => void switchTo(row)}
                >
                  <span className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate font-medium">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.email}</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={busyUid != null}
                  aria-label={`Remove ${row.email}`}
                  onClick={() => removeRow(row.uid)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="link" className="w-full" onClick={onBack}>
        Back to sign in
      </Button>
    </div>
  );
}

/** Login page par saved rows + plan entitlement check (client mount). */
export function hasSavedAccountsForLoginPanel(livePlans: ReturnType<typeof useLivePlans>): boolean {
  return listSavedLoginAccounts().some((row) => {
    const plan = getPlanFromPlans(livePlans, row.planIdAtSave);
    return isFeatureEnabled(plan.id, "savedAccountSwitchEnabled");
  });
}
