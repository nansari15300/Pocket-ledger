
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
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { auth, firestore, signOutWithFirestoreTeardown } from "@/lib/firebase";
import { pruneRememberedLoginEmailIfDisabled } from "@/lib/loginRememberEmail";
import { useToast } from "@/hooks/use-toast";
import { MobileFloatingButton } from "@/components/layout/MobileFloatingButton";
import { CompanyDemotedBanner } from "@/components/company/CompanyDemotedBanner";
import { PlanAuthoritativeSyncBanner } from "@/components/company/PlanAuthoritativeSyncBanner";
import { FileHoverPreviewProvider } from "@/contexts/FileHoverPreviewContext";
import { ReportPartyViewProvider } from "@/contexts/ReportPartyViewContext";
import { ReportListProvider } from "@/contexts/ReportListContext";
import { SettingsListProvider } from "@/contexts/SettingsListContext";
import { useSidebar } from "@/components/ui/sidebar";
import { useEdgeSwipeTrigger } from "@/hooks/useMobileEdgeSwipe";
import { AlarmPopup } from "@/components/messages/AlarmPopup";
import { DeviceLimitProvider, useDeviceLimitContext } from "@/contexts/DeviceLimitContext";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { DEFAULT_PLANS, type PlanId } from "@/config/plans";
import { getPlanFromPlans, useLivePlans } from "@/hooks/useLivePlans";
import { useMarkMessagesDelivered } from "@/hooks/useMarkMessagesDelivered";
import { useCompany } from "@/hooks/useCompany";
import { getOrCreateDeviceId, getDeviceLabel, removeThisDevice } from "@/lib/deviceLimitClient";
import { collection, doc, getDocs, getDoc, onSnapshot, deleteDoc, setDoc, serverTimestamp, query, where } from "firebase/firestore";
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

function signOutWithLoginCleanup() {
  pruneRememberedLoginEmailIfDisabled();
  return signOutWithFirestoreTeardown(auth);
}

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
  const { company, companyId, allCompanies } = useCompany();
  const livePlansForDeviceUi = useLivePlans();
  /** Header profile jaisa effective plan — overlay par limit explain karne ke liye */
  const deviceOverlayAccountPlanId = useMemo(
    () =>
      user?.uid && company
        ? resolveEffectiveAccountPlanId(allCompanies, user.uid, company.planId)
        : ("basic" as PlanId),
    [allCompanies, user?.uid, company?.planId, company]
  );
  const deviceOverlayPlan = useMemo(
    () => getPlanFromPlans(livePlansForDeviceUi, deviceOverlayAccountPlanId),
    [livePlansForDeviceUi, deviceOverlayAccountPlanId]
  );
  const deviceOverlayPlanName =
    DEFAULT_PLANS[deviceOverlayAccountPlanId]?.name ?? String(deviceOverlayAccountPlanId);
  const { toast } = useToast();
  const router = useRouter();
  const { deviceLimitReached, singleDeviceOnly, replaceOffer, noPermissionNewDevice, kickedAndBlocked, deviceCount, maxDevices, refreshDeviceCheck, performReplaceAndRefresh, clearKickedAndRefresh } = useDeviceLimitContext();
  const [replacing, setReplacing] = useState(false);
  const [deviceIdShort, setDeviceIdShort] = useState("");
  const [thisDeviceLabel, setThisDeviceLabel] = useState("");
  const [activeDevices, setActiveDevices] = useState<DeviceItem[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState<DeviceItem | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const [showReplaceDeviceSelect, setShowReplaceDeviceSelect] = useState(false);

  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));
  const ownerId = company?.ownerId ?? "";
  const currentDeviceId = typeof window !== "undefined" ? getOrCreateDeviceId() : "";

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceIdShort(id ? `...${id.slice(-8)}` : "");
    setThisDeviceLabel(typeof window !== "undefined" ? getDeviceLabel() : "");
  }, []);

  useEffect(() => {
    if (!companyId || (!deviceLimitReached && !kickedAndBlocked)) {
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
  }, [companyId, deviceLimitReached, kickedAndBlocked, ownerId]);

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

  if (!deviceLimitReached && !kickedAndBlocked) return null;
  if (pathname?.startsWith("/billing") || pathname?.startsWith("/settings")) return null;

  if (kickedAndBlocked && !isCompanyOwner) {
    const myDevicesHere = activeDevices.filter((d) => d.userId === user?.uid);
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm p-6 overflow-y-auto">
        <Smartphone className="h-12 w-12 text-amber-500 shrink-0" />
        <p className="text-center font-medium text-lg">You were removed from this company&apos;s devices List.</p>
        <p className="text-center text-muted-foreground text-sm font-medium"><span className="font-semibold text-foreground">Company:</span> {company?.name || "—"}</p>
        <p className="text-center text-muted-foreground text-sm max-w-sm">
          Kick one of your devices below; this device will be added in its place.
        </p>
        {myDevicesHere.length > 0 && (
          <div className="w-full max-w-md rounded-lg border bg-muted/30 px-3 py-2 text-left">
            <p className="text-xs font-semibold text-foreground mb-2">Your devices in this company — kick one to add this device in its place</p>
            <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
              {myDevicesHere.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-medium text-foreground">{d.deviceType === "mobile" ? "Mobile" : "Desktop"}</span>
                    <span className="shrink-0 text-muted-foreground">{d.lastActive}</span>
                  </span>
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
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={async () => {
              setRejoining(true);
              try {
                await clearKickedAndRefresh();
              } finally {
                setRejoining(false);
              }
            }}
            disabled={rejoining}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {rejoining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className={rejoining ? "ml-2" : ""}>{rejoining ? "Rejoining…" : "Use this device again"}</span>
          </Button>
          <Link href="/company" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
            Switch company
          </Link>
          <Button variant="outline" onClick={() => void signOutWithLoginCleanup()} className="rounded-md px-4 py-2 text-sm">
            Logout
          </Button>
        </div>
        <AlertDialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
          <AlertDialogContent>
            <AlertDialogTitle>Kick out this device?</AlertDialogTitle>
            <AlertDialogDescription>
              That device will be removed from the company. You can then use this device again to rejoin.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => confirmKick && handleKickOut(confirmKick)}
              >
                Kick out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  const showReplaceOfferDialog = replaceOffer && !isCompanyOwner;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm p-6 overflow-y-auto">
      <Smartphone className="h-12 w-12 text-amber-500 shrink-0" />
      <p className="text-center font-medium text-lg">
        Device limit reached ({deviceCount}/{maxDevices})
      </p>
      {/* `maxDevices` hook se = profile wala effective account plan (highest owned tier) */}
      <p className="text-center text-xs text-muted-foreground max-w-md px-2">
        Account plan (header profile jaisa):{" "}
        <span className="font-medium text-foreground">{deviceOverlayPlanName}</span>
        {deviceOverlayPlan.entitlements.hasMultiDeviceSync ? (
          <span> — {maxDevices} device slot{maxDevices !== 1 ? "s" : ""} for this account</span>
        ) : (
          <span> — multi-device sync is off for this plan (1 device)</span>
        )}
      </p>
      <div className="w-full max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground space-y-1">
        <p><span className="font-medium text-foreground">User name:</span> {(user?.displayName ?? "").toString().trim() || (user?.email ? user.email.split("@")[0] : "") || "—"}</p>
        <p><span className="font-medium text-foreground">User email:</span> {user?.email || "—"}</p>
        <p><span className="font-medium text-foreground">Company:</span> {company?.name || "—"}</p>
        <p><span className="font-medium text-foreground">This device:</span> {thisDeviceLabel || "—"}</p>
      </div>

      {showReplaceOfferDialog && (
        <div className="w-full max-w-md space-y-4">
          {!showReplaceDeviceSelect ? (
            <>
              {myDevices.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-left">
                  <p className="text-xs font-semibold text-foreground mb-2">Your devices in this company — kick one to free a slot, or click Yes to choose which device to replace</p>
                  <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
                    {myDevices.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                          <span className="font-medium text-foreground">{d.deviceType === "mobile" ? "Mobile" : "Desktop"}</span>
                          <span className="shrink-0 text-muted-foreground">{d.lastActive}</span>
                        </span>
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
              <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-4">
                <p className="text-sm font-medium text-foreground">
                  To use this device instead? Click Yes to choose which device to remove, or kick one above. This device will be added in its place.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={() => setShowReplaceDeviceSelect(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Yes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/company")}
                  >
                    No
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">No: you will be taken to company selection.</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-left">
              <p className="text-xs font-semibold text-foreground mb-2">Select which device to remove. This device will be added in its place and this company will open.</p>
              <ul className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
                {myDevices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {d.deviceType === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
                      <span className="font-medium text-foreground">{d.deviceType === "mobile" ? "Mobile" : "Desktop"}</span>
                      <span className="shrink-0 text-muted-foreground">{d.lastActive}</span>
                    </span>
                    <Button
                      size="sm"
                      className="shrink-0 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleKickOut(d, () => refreshDeviceCheck())}
                      disabled={!!kickingId}
                    >
                      {kickingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      <span className={kickingId === d.id ? "ml-1" : ""}>Replace with this device</span>
                    </Button>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowReplaceDeviceSelect(false)}>
                Back
              </Button>
            </div>
          )}
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

      {!showReplaceOfferDialog && !noPermissionNewDevice && !isCompanyOwner && myDevices.length > 0 && !singleDeviceOnly && (
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

      {!showReplaceOfferDialog && !noPermissionNewDevice && singleDeviceOnly && !isCompanyOwner && myDevices.length > 0 && (
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

      {!showReplaceOfferDialog && noPermissionNewDevice && !isCompanyOwner ? (
        <>
          <p className="text-center text-muted-foreground text-sm max-w-sm">
            No permission to use multi device. You can only use one device. Join this device to kick the previous one, or contact company admin or switch company.
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
              <span className={replacing ? "ml-2" : ""}>Join this device</span>
            </Button>
            <Link
              href="/company"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Switch company
            </Link>
            <Button
              variant="outline"
              onClick={() => void signOutWithLoginCleanup()}
              className="rounded-md px-4 py-2 text-sm"
            >
              Logout
            </Button>
          </div>
        </>
      ) : !showReplaceOfferDialog && isCompanyOwner ? (
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
              onClick={() => void signOutWithLoginCleanup()}
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

      {!showReplaceOfferDialog && !noPermissionNewDevice && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={async () => {
              setRejoining(true);
              try {
                await clearKickedAndRefresh();
              } finally {
                setRejoining(false);
              }
            }}
            disabled={rejoining}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {rejoining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className={rejoining ? "ml-2" : ""}>{rejoining ? "Rejoining…" : "Rejoin"}</span>
          </Button>
          <Button variant="outline" onClick={() => void signOutWithLoginCleanup()} className="rounded-md px-4 py-2 text-sm">
            Logout
          </Button>
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

/** Mobile: left edge se swipe right → app sidebar Sheet khule (menu) */
function DashboardMainWithEdgeSwipe({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isMobile, isOpen, setIsOpen } = useSidebar();
  const openMenu = useCallback(() => setIsOpen(true), [setIsOpen]);
  const swipe = useEdgeSwipeTrigger(Boolean(isMobile && !isOpen), "left", openMenu);
  return (
    <main
      // touch-pan-y: horizontal swipe JS ko mile, vertical scroll page par rahe
      className={cn(isMobile && "touch-pan-y", className)}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      {children}
    </main>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const { user } = useAuth();

    // Settings / gallery: body scroll bandho — andar list ya grid khud scroll kare
    useEffect(() => {
        if (pathname?.startsWith("/settings") || pathname?.startsWith("/gallery")) {
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
            return () => {
                document.documentElement.style.overflow = "";
                document.body.style.overflow = "";
            };
        }
    }, [pathname]);
    useMarkMessagesDelivered();

    const noLayoutPages = ["/company", "/company/create"];
    const isEmbedRoute = pathname?.startsWith("/embed");

    if (noLayoutPages.includes(pathname)) {
        return <>{children}</>;
    }

    // Embed routes: content only (no app sidebar/header) — used when shown inside reports iframe
    if (isEmbedRoute) {
        return (
            <div className="h-full w-full overflow-hidden bg-background">
                {children}
            </div>
        );
    }

    return (
         <>
            <AlarmPopup />
            <ReportListProvider>
              <SettingsListProvider>
              <ReportPartyViewProvider>
                <DeviceLimitProvider>
                  <div
                    id="app-container"
                    className={cn(
                      "relative flex bg-background",
                      /** Mobile: dvh = browser chrome / gesture bar; desktop: h-screen */
                      isMobile ? "h-dvh max-h-dvh min-h-0" : "h-screen min-h-0",
                      (pathname?.startsWith("/settings") || pathname?.startsWith("/gallery")) && "overflow-hidden"
                    )}
                  >
                    <AppSidebar />
                    <div
                      className={cn(
                        "flex min-h-0 flex-1 flex-col overflow-hidden",
                        !isMobile && "border-l app-main-border",
                        /** Sirf system safe-area — extra 1rem hata: mobile par page home button ke zyada qareeb */
                        isMobile && "pb-[env(safe-area-inset-bottom,0px)]"
                      )}
                    >
                      <AppHeader />
                      <CompanyDemotedBanner />
                      <PlanAuthoritativeSyncBanner />
                      <DashboardMainWithEdgeSwipe
                        className={cn(
                          "flex-1 min-h-0",
                          pathname?.startsWith("/settings") || pathname?.startsWith("/gallery")
                            ? "overflow-hidden"
                            : "overflow-y-auto"
                        )}
                      >
                        {children}
                      </DashboardMainWithEdgeSwipe>
                      <MobileFloatingButton />
                    </div>
                    <DeviceLimitOverlay />
                  </div>
                </DeviceLimitProvider>
              </ReportPartyViewProvider>
              </SettingsListProvider>
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
          {/* Global file + avatar hover preview — header pill se ON/OFF (AttachmentHoverPortal). */}
          <FileHoverPreviewProvider>
            <LayoutContent>{children}</LayoutContent>
          </FileHoverPreviewProvider>
        </DashboardProvider>
      </SidebarProvider>
    </MobileViewProvider>
  );
}
