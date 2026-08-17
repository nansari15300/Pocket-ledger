"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { CloudOff, Download, Loader2, LogOut, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { webAppBasePath } from "@/lib/webAppBasePath";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { Button } from "@/components/ui/button";

/**
 * Hosted browser use is reserved for Firebase Online plan holders and users who
 * were invited to an online company. APK/EXE retain local-company access.
 */
export function WebAppOnlineAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [checkNonce, setCheckNonce] = useState(0);

  const isEmbeddedApp = useMemo(
    () => isStaticAppBuild() || isCapacitorNativeApp() || isElectronDesktopApp(),
    []
  );
  // Billing must remain reachable so an ineligible browser account can upgrade.
  const billingRoute = pathname === "/billing" || Boolean(pathname?.startsWith("/billing/"));

  useEffect(() => {
    if (isEmbeddedApp || billingRoute) {
      setChecking(false);
      setAllowed(true);
      return;
    }
    if (authLoading) {
      setChecking(true);
      return;
    }
    if (!user) {
      setChecking(false);
      setAllowed(true);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setAllowed(false);

    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${webAppBasePath()}/api/auth/web-access`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as { allowed?: boolean };
        if (cancelled) return;
        setAllowed(res.ok && data.allowed === true);
      } catch {
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, billingRoute, checkNonce, isEmbeddedApp, user]);

  const retry = useCallback(() => setCheckNonce((value) => value + 1), []);

  if (isEmbeddedApp || billingRoute || !user) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking web access…
        </div>
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/25 p-4">
      <section className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <CloudOff className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Web access is not available for this account</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your current plan does not include Online Company access, and no Online Company has been
          shared with this account. The Pocket Ledger web app is available only to users with an
          active Online Company plan or a shared Online Company invitation.
        </p>
        <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          To continue with a local company, please download the Windows desktop app or Android app.
          To use the web app, upgrade to a plan that includes Online Company access, or ask your
          company administrator to share an Online Company with your account.
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <a href="/downloads/">
              <Download className="mr-2 h-4 w-4" />
              Download EXE or APK
            </a>
          </Button>
          <Button variant="outline" onClick={() => router.push("/billing")}>
            <TrendingUp className="mr-2 h-4 w-4" />
            View upgrade plans
          </Button>
          <Button variant="ghost" size="sm" onClick={retry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Check again
          </Button>
        </div>
        <Button
          variant="link"
          className="mt-5 h-auto px-0 text-muted-foreground"
          onClick={() => void signOut(auth)}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out and use another account
        </Button>
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Your existing local company data remains available in the desktop and mobile apps.
        </p>
      </section>
    </main>
  );
}
