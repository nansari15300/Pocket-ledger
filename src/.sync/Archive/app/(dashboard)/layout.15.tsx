
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
import { useState, useEffect } from "react";
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
import { getOrCreateDeviceId } from "@/lib/deviceLimitClient";
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

type DeviceItem = { id: string; lastActive: string; ts: number };

function DeviceLimitOverlay() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { deviceLimitReached, deviceCount, maxDevices } = useDeviceLimitContext();
  const [deviceIdShort, setDeviceIdShort] = useState("");
  const [activeDevices, setActiveDevices] = useState<DeviceItem[]>([]);
  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceIdShort(id ? `...${id.slice(-8)}` : "");
  }, []);

  useEffect(() => {
    if (!companyId || !isCompanyOwner) {
      setActiveDevices([]);
      return;
    }
    const devicesRef = collection(firestore, "companies", companyId, "devices");
    getDocs(devicesRef).then((snap) => {
      const list: DeviceItem[] = snap.docs.map((d) => {
        const data = d.data();
        const la = data?.lastActive;
        const ts = la && typeof la.toMillis === "function" ? la.toMillis() : 0;
        const lastActive = ts ? new Date(ts).toLocaleString() : "—";
        return { id: d.id, lastActive, ts };
      });
      list.sort((a, b) => b.ts - a.ts);
      setActiveDevices(list);
    });
  }, [companyId, isCompanyOwner]);

  if (!deviceLimitReached) return null;
  if (pathname?.startsWith("/billing") || pathname?.startsWith("/settings")) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm p-6 overflow-y-auto">
      <Smartphone className="h-12 w-12 text-amber-500 shrink-0" />
      {isCompanyOwner && activeDevices.length > 0 && (
        <div className="w-full max-w-sm rounded-lg border bg-muted/30 px-3 py-2 text-left">
          <p className="text-xs font-semibold text-foreground mb-2">Active devices ({activeDevices.length})</p>
          <ul className="text-xs text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
            {activeDevices.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="font-mono truncate">...{d.id.slice(-8)}</span>
                <span className="shrink-0">{d.lastActive}</span>
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
      {isCompanyOwner && activeDevices.length === 0 && (
        <Link
          href="/settings?view=devices"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Settings className="h-4 w-4" />
          Device settings
        </Link>
      )}
      <p className="text-center font-medium text-lg">
        Device limit reached ({deviceCount}/{maxDevices})
      </p>
      <div className="w-full max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground space-y-1">
        <p><span className="font-medium text-foreground">User:</span> {user?.email || user?.displayName || "—"}</p>
        <p><span className="font-medium text-foreground">Company:</span> {company?.name || "—"}</p>
        <p><span className="font-medium text-foreground">This device:</span> {deviceIdShort || "—"}</p>
      </div>
      {isCompanyOwner ? (
        <>
          <p className="text-center text-muted-foreground text-sm max-w-sm">
            This device is not allowed for this company. Switch to another company or upgrade your plan.
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
      ) : (
        <>
          <p className="text-center text-muted-foreground text-sm max-w-sm">
            This device is not allowed for this company. Contact your company admin to add more devices or switch to another company.
          </p>
          <Link
            href="/company"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Switch company
          </Link>
        </>
      )}
      <button
        type="button"
        onClick={() => signOut(auth)}
        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        Logout
      </button>
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
