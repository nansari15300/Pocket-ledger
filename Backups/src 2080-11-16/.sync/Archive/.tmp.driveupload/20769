
'use client';

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { useIsMobile, MobileViewProvider } from "@/hooks/use-mobile";
import { DashboardProvider } from "@/hooks/useDashboard";
import { usePathname, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { DisclaimerDialog } from "@/components/layout/DisclaimerDialog";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { MobileFloatingButton } from "@/components/layout/MobileFloatingButton";
import { ReportPartyViewProvider } from "@/contexts/ReportPartyViewContext";
import { ReportListProvider } from "@/contexts/ReportListContext";
import { AlarmPopup } from "@/components/messages/AlarmPopup";
import { DeviceLimitProvider, useDeviceLimitContext } from "@/contexts/DeviceLimitContext";
import { useMarkMessagesDelivered } from "@/hooks/useMarkMessagesDelivered";
import { useCompany } from "@/hooks/useCompany";
import { getOrCreateDeviceId, removeThisDevice } from "@/lib/deviceLimitClient";
import { collection, doc, getDocs, getDoc, onSnapshot, deleteDoc, setDoc, serverTimestamp, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Settings, Monitor, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function DeviceLimitBanner() {
  const { deviceLimitReached, deviceCount, maxDevices } = useDeviceLimitContext();
  if (!deviceLimitReached) return null;
  return (
    <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
      <Smartphone className="h-4 w-4 shrink-0" />
      <span>Device limit reached ({deviceCount}/{maxDevices}). Sync from this device is blocked.</span>
      <Link href="/billing" className="underline font-semibold hover:no-underline">Upgrade to add more devices</Link>
    </div>
  );
}

type DeviceItem = { id: string; userId: string; lastActive: string; ts: number; deviceType?: "mobile" | "desktop" };

function DeviceLimitOverlay() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { toast } = useToast();
  const router = useRouter();
  const { deviceLimitReached, singleDeviceOnly, replaceOffer, deviceCount, maxDevices, refreshDeviceCheck, performReplaceAndRefresh } = useDeviceLimitContext();
  const [replacing, setReplacing] = useState(false);
  const [deviceIdShort, setDeviceIdShort] = useState("");
  const [activeDevices, setActiveDevices] = useState<DeviceItem[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState<DeviceItem | null>(null);
  const [removingThisDevice, setRemovingThisDevice] = useState(false);

  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));
  const ownerId = company?.ownerId ?? "";
  const currentDeviceId = typeof window !== "undefined" ? getOrCreateDeviceId() : "";

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceIdShort(id ? `...${id.slice(-8)}` : "");
  }, []);

  useEffect(() => {
    if (!companyId || !deviceLimitReached) {
      setActiveDevices([]);
      return;
    }
    const devicesRef = collection(firestore, "companies", companyId, "devices");
    const unsub = onSnapshot(devicesRef, (snap) => {
      const list: DeviceItem[] = snap.docs.map((d) => {
        const data = d.data();
        const la = data?.lastActive;
        const ts = la && typeof la.toMillis === "function" ? la.toMillis() : 0;
        const lastActive = ts ? new Date(ts).toLocaleString() : "—";
        const deviceType = (data?.deviceType === "mobile" || data?.deviceType === "desktop" ? data.deviceType : undefined) as DeviceItem["deviceType"];
        return { id: d.id, userId: data?.userId ?? "", lastActive, ts, deviceType };
      });
      list.sort((a, b) => {
        const aOwner = a.userId === ownerId;
        const bOwner = b.userId === ownerId;
        if (aOwner && !bOwner) return -1;
        if (!aOwner && bOwner) return 1;
        return b.ts - a.ts;
      });
      setActiveDevices(list);
    });
    return () => unsub();
  }, [companyId, deviceLimitReached, ownerId]);

  const userIdsKey = useMemo(() => activeDevices.map((d) => d.userId).filter(Boolean).sort().join(","), [activeDevices]);

  useEffect(() => {
    if (!isCompanyOwner || activeDevices.length === 0) return;
    const userIds = [...new Set(activeDevices.map((d) => d.userId).filter(Boolean))];
    let cancelled = false;
    const map: Record<string, string> = {};
    Promise.all(
      userIds.map(async (uid) => {
        if (cancelled) return;
        const byId = await getDoc(doc(firestore, "users", uid));
        let d: Record<string, unknown> | null = byId.exists() ? byId.data() : null;
        if (!d) {
          const byUid = await getDocs(query(collection(firestore, "users"), where("uid", "==", uid)));
          d = byUid.docs[0]?.data() ?? null;
        }
        if (cancelled) return;
        if (d) {
          const raw = (d.displayName as string)?.trim() || (d.name as string)?.trim() || (d.email as string) || "";
          map[uid] = raw && raw !== uid && !/^[a-zA-Z0-9]{20,32}$/.test(raw) ? raw : "—";
        } else {
          map[uid] = "—";
        }
      })
    ).then(() => {
      if (!cancelled) setUserNames((prev) => ({ ...prev, ...map }));
    });
    return () => { cancelled = true; };
  }, [isCompanyOwner, userIdsKey]);

  const handleKickOut = async (device: DeviceItem, onSuccess?: () => void) => {
    if (!companyId) return;
    setKickingId(device.id);
    try {
      await deleteDoc(doc(firestore, "companies", companyId, "devices", device.id));
      toast({ title: "Device removed", description: "That device will see slot full and can switch company or remove that device." });
      setConfirmKick(null);
      onSuccess?.();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to remove device", variant: "destructive" });
    } finally {
      setKickingId(null);
    }
  };

  const isAdminDevice = (d: DeviceItem) => d.userId === ownerId;
  const myDevices = activeDevices.filter((d) => d.userId === user?.uid);
  const isNewUserNoSlot = !isCompanyOwner && myDevices.length === 0;

  if (!deviceLimitReached) return null;
  if (pathname?.startsWith("/billing") || pathname?.startsWith("/settings")) return null;

  const showReplaceOfferDialog = replaceOffer && !isCompanyOwner;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm p-6 overflow-y-auto">
      <Smartphone className="h-12 w-12 text-amber-500 shrink-0" />
      <p className="text-center font-medium text-lg">
        Device limit reached ({deviceCount}/{maxDevices})
      </p>
      <div className="w-full max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground space-y-1">
        <p><span className="font-medium text-foreground">User:</span> {user?.email || user?.displayName || "—"}</p>
        <p><span className="font-medium text-foreground">Company:</span> {company?.name || "—"}</p>
        <p><span className="font-medium text-foreground">This device:</span> {deviceIdShort || "—"}</p>
      </div>

      {showReplaceOfferDialog && (
        <div className="w-full max-w-sm rounded-lg border bg-muted/30 p-4 text-center space-y-4">
          <p className="text-sm font-medium text-foreground">
            Use this device instead? The other device will see &quot;slot full&quot; and can switch company or remove that device (no logout).
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={async () => {
                setReplacing(true);
                try {
                  await performReplaceAndRefresh();
                } finally {
                  setReplacing(false);
                }
              }}
              disabled={replacing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {replacing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={replacing ? "ml-2" : ""}>Yes</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/company")}
              disabled={replacing}
            >
              No
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">No: you will be taken to company selection.</p>
        </div>
      )}

      {!showReplaceOfferDialog && isCompanyOwner && activeDevices.length > 0 && (
        <div className="w-full max-w-md rounded-lg border bg-muted/30 px-3 py-2 text-left">
          <p className="text-xs font-semibold text-foreground mb-2">All synced devices — remove one to free a slot</p>
          <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
            {activeDevices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                  <span className="font-medium text-foreground truncate">{isAdminDevice(d) ? "Admin" : (userNames[d.userId] ?? "—")}</span>
                  <span className="font-mono truncate text-muted-foreground">...{d.id.slice(-8)}</span>
                </span>
                <span className="shrink-0 hidden sm:inline">{d.lastActive}</span>
                {isAdminDevice(d) && d.id === currentDeviceId ? (
                  <span className="text-muted-foreground shrink-0">(this device)</span>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="shrink-0 h-7 text-xs"
                    onClick={() => setConfirmKick(d)}
                    disabled={!!kickingId}
                  >
                    {kickingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    <span className="ml-1">Kick out</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/settings?view=devices"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-primary hover:underline"
          >
            <Settings className="h-3.5 w-3.5" />
            Device settings
          </Link>
        </div>
      )}

      {!showReplaceOfferDialog && !isCompanyOwner && myDevices.length > 0 && !singleDeviceOnly && (
        <div className="w-full max-w-md rounded-lg border bg-muted/30 px-3 py-2 text-left">
          <p className="text-xs font-semibold text-foreground mb-2">Your device(s) using the limit — kick one to free a slot for this device</p>
          <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
            {myDevices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                  <span className="font-mono truncate">...{d.id.slice(-8)}</span>
                </span>
                <span className="shrink-0">{d.lastActive}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => setConfirmKick(d)}
                  disabled={!!kickingId}
                >
                  {kickingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  <span className="ml-1">Kick out</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showReplaceOfferDialog && singleDeviceOnly && !isCompanyOwner && myDevices.length > 0 && (
        <div className="w-full max-w-md rounded-lg border bg-muted/30 px-3 py-2 text-left">
          <p className="text-xs font-semibold text-foreground mb-2">You can only use one device. The following device is already signed in. Please log out from this device, or replace it with this device.</p>
          <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
            {myDevices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                  <span className="font-mono truncate">...{d.id.slice(-8)}</span>
                </span>
                <span className="shrink-0">{d.lastActive}</span>
                <Button
                  size="sm"
                  className="shrink-0 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setConfirmKick(d)}
                  disabled={!!kickingId}
                >
                  {kickingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span className="ml-1">Replace with this device</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showReplaceOfferDialog && isCompanyOwner && activeDevices.length === 0 && (
        <Link
          href="/settings?view=devices"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Settings className="h-4 w-4" />
          Device settings
        </Link>
      )}

      {!showReplaceOfferDialog && isCompanyOwner ? (
        <>
          <p className="text-center text-muted-foreground text-sm max-w-sm">
            This device is not allowed for this company. Remove a device above or switch company or upgrade your plan.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/company"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Switch company
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Upgrade to add more devices
            </Link>
            <Link
              href="/settings?view=devices"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Device settings
            </Link>
          </div>
        </>
      ) : !showReplaceOfferDialog && singleDeviceOnly ? (
        <p className="text-center text-muted-foreground text-sm max-w-sm">
          Log out from this device or use &quot;Replace with this device&quot; above to use this device instead.
        </p>
      ) : !showReplaceOfferDialog && isNewUserNoSlot ? (
        <>
          <p className="text-center text-muted-foreground text-sm max-w-sm">
            Slot full for this company. Change company or logout.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/company"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Change company
            </Link>
            <Button
              variant="outline"
              onClick={() => signOut(auth)}
              className="rounded-md px-4 py-2 text-sm"
            >
              Logout
            </Button>
          </div>
        </>
      ) : !showReplaceOfferDialog ? (
        <p className="text-center text-muted-foreground text-sm max-w-sm">
          Kick out one of your devices above to free a slot for this device.
        </p>
      ) : null}

      {!showReplaceOfferDialog && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
            onClick={async () => {
              if (!companyId) return;
              setRemovingThisDevice(true);
              try {
                await removeThisDevice(companyId);
                refreshDeviceCheck();
              } finally {
                setRemovingThisDevice(false);
              }
            }}
            disabled={removingThisDevice}
          >
            {removingThisDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <span className="ml-2">Remove this device (free slot, stay logged in)</span>
          </Button>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Logout
          </button>
        </div>
      )}

      <AlertDialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{singleDeviceOnly && myDevices.some((d) => d.id === confirmKick?.id) ? "Replace with this device?" : "Remove device?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {singleDeviceOnly && myDevices.some((d) => d.id === confirmKick?.id)
              ? "The other device will be signed out. This device will then be used for this company."
              : "This device will be signed out and removed from the list. The user can sign in again if within the device limit."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmKick && handleKickOut(confirmKick, singleDeviceOnly && myDevices.some((d) => d.id === confirmKick.id) ? refreshDeviceCheck : undefined)}
              className={singleDeviceOnly && myDevices.some((d) => d.id === confirmKick?.id) ? undefined : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {singleDeviceOnly && myDevices.some((d) => d.id === confirmKick?.id) ? "Replace with this device" : "Kick out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const { user, loading } = useAuth();
    useMarkMessagesDelivered();
    const { toast } = useToast();
    const [showDisclaimer, setShowDisclaimer] = useState(false);

    // Disclaimer logic: show once per day AND on every new login session
    useEffect(() => {
        if (loading) return;

        const today = new Date().toISOString().split('T')[0];
        const lastShownDate = localStorage.getItem('lastDisclaimerShownDate');
        const sessionLoginMarker = sessionStorage.getItem('disclaimerShownForSession');

        const showForNewDay = lastShownDate !== today;
        const showForNewSession = !sessionLoginMarker;
        
        if (user && (showForNewDay || showForNewSession)) {
            setShowDisclaimer(true);
            sessionStorage.setItem('disclaimerShownForSession', 'true');
        } else if (!user) {
            // When user logs out, clear the session marker to trigger on next login
            sessionStorage.removeItem('disclaimerShownForSession');
        }
    }, [user, loading]);

    // Auto-logout only after inactivity: 20 min on mobile and desktop; activity resets the timer
    const INACTIVITY_LOGOUT_MS = 20 * 60 * 1000; // 20 minutes
    const logoutDesc = "20 minutes";

    useEffect(() => {
        if (!user) return;

        let activityTimer: ReturnType<typeof setTimeout>;

        const resetTimer = () => {
            clearTimeout(activityTimer);
            activityTimer = setTimeout(() => {
                import("@/lib/navigation-memory").then(({ clearNavigationMemory }) => clearNavigationMemory());
                signOut(auth).then(() => {
                    toast({ title: "Session Expired", description: `You have been logged out due to inactivity (${logoutDesc}).` });
                });
            }, INACTIVITY_LOGOUT_MS);
        };

        // Include touch events for mobile - any activity resets the timer
        const activityEvents: (keyof WindowEventMap)[] = [
            'mousemove', 'keydown', 'click', 'scroll',
            'touchstart', 'touchmove', 'touchend', 'touchcancel',
            'pointerdown', 'pointermove', 'wheel'
        ];

        const onActivity = () => resetTimer();

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') resetTimer(); // User came back - reset timer
        };

        activityEvents.forEach(event => window.addEventListener(event, onActivity, { passive: true }));
        document.addEventListener('visibilitychange', onVisibilityChange);
        resetTimer();

        return () => {
            clearTimeout(activityTimer);
            activityEvents.forEach(event => window.removeEventListener(event, onActivity));
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [user, toast, INACTIVITY_LOGOUT_MS, logoutDesc]);

    const handleDisclaimerClose = () => {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('lastDisclaimerShownDate', today);
        setShowDisclaimer(false);
    };

    const noLayoutPages = ["/company", "/company/create"];
    const isEmbedRoute = pathname?.startsWith("/embed");

    if (noLayoutPages.includes(pathname)) {
        return (
            <>
                <DisclaimerDialog isOpen={showDisclaimer} onClose={handleDisclaimerClose} />
                {children}
            </>
        );
    }

    // Embed routes: content only (no app sidebar/header) — used when shown inside reports iframe
    if (isEmbedRoute) {
        return (
            <>
                <DisclaimerDialog isOpen={showDisclaimer} onClose={handleDisclaimerClose} />
                <div className="h-full w-full overflow-hidden bg-background">
                    {children}
                </div>
            </>
        );
    }

    return (
         <>
            <DisclaimerDialog isOpen={showDisclaimer} onClose={handleDisclaimerClose} />
            <AlarmPopup />
            <ReportListProvider>
              <ReportPartyViewProvider>
                <DeviceLimitProvider>
                  <div id="app-container" className="relative flex h-screen bg-background">
                    <AppSidebar />
                    <div className={cn("flex flex-1 flex-col overflow-hidden", !isMobile && "border-l")}>
                      <AppHeader />
                      <main className={cn("flex-1 overflow-y-auto")}>{children}</main>
                      <MobileFloatingButton />
                    </div>
                    <DeviceLimitOverlay />
                  </div>
                </DeviceLimitProvider>
              </ReportPartyViewProvider>
            </ReportListProvider>
        </>
    )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileViewProvider>
      <SidebarProvider>
        <DashboardProvider>
          <LayoutContent>{children}</LayoutContent>
        </DashboardProvider>
      </SidebarProvider>
    </MobileViewProvider>
  );
}
