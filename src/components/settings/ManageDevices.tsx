"use client";

import { useEffect, useState, useMemo } from "react";
import {
  collection,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone, Loader2, Trash2, Monitor, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import { getPlanFromPlans, useLivePlans } from "@/hooks/useLivePlans";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
// batch kick = turant-feel optimistic UI + Firestore writes ek hi burst me — pehle N× trim hang karta tha
import { getOrCreateDeviceId, removeThisDevice, trimDeviceHistoryToLimit, kickOutDevicesBatch } from "@/lib/deviceLimitClient";
import { useDeviceLimitContext } from "@/contexts/DeviceLimitContext";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  canPickWebBackupFolder,
  clearWebBackupDirectoryHandle,
  ensureNativeBackupStoragePermission,
  isNativeRuntime,
  readBackupSaveLocationPrefs,
  saveBackupSaveLocationPrefs,
  storeWebBackupDirectoryHandle,
  type BackupNativeDirectory,
} from "@/lib/backupSaveLocation";

type DeviceRow = {
  id: string;
  userId: string;
  lastActive: Date | null;
  deviceType?: "mobile" | "desktop";
  deviceLabel?: string;
};

type DeviceHistoryRow = {
  id: string;
  deviceId: string;
  userId: string;
  lastActive: Date | null;
  deviceType?: "mobile" | "desktop";
  deviceLabel?: string;
  createdAt: Date | null;
};

const userNamesCache: Record<string, string> = {};
const DEFAULT_HISTORY_LIMIT = 50;

/** Normalize device label for display (e.g. "Chrome (K)" → "Chrome (Mobile)"). */
function displayDeviceLabel(label: string | undefined, deviceType?: "mobile" | "desktop"): string {
  if (label === "Chrome (K)") return "Chrome (Mobile)";
  return label || (deviceType === "mobile" ? "Mobile" : deviceType === "desktop" ? "Desktop" : "Device");
}

export function ManageDevices() {
  const { company, companyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const livePlans = useLivePlans();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>(() => ({ ...userNamesCache }));
  const [loading, setLoading] = useState(true);
  /** Firestore commit ke daur selective kick buttons band */
  const [kickInFlight, setKickInFlight] = useState(false);
  /** Sirf toolbar “Kick selected” spinner — ek-off kick par toolbar spin na ho */
  const [bulkKickBusy, setBulkKickBusy] = useState(false);
  /** Turant rows hataane ke liye local set — authoritative list ab bhi Firestore snapshot */
  const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(() => new Set());
  const [selectedKickIds, setSelectedKickIds] = useState<Set<string>>(() => new Set());
  const [confirmKick, setConfirmKick] = useState<DeviceRow | null>(null);
  const [confirmBulkKick, setConfirmBulkKick] = useState(false);
  const [updatingMultiDevice, setUpdatingMultiDevice] = useState(false);
  const [removingThisDevice, setRemovingThisDevice] = useState(false);
  const currentDeviceId = typeof window !== "undefined" ? getOrCreateDeviceId() : "";
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryRow[]>([]);
  const [historyLimitInput, setHistoryLimitInput] = useState<string>(String(DEFAULT_HISTORY_LIMIT));
  const [savingHistoryLimit, setSavingHistoryLimit] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [confirmDeleteAllHistory, setConfirmDeleteAllHistory] = useState(false);
  const [deletingAllHistory, setDeletingAllHistory] = useState(false);

  const { refreshDeviceCheck } = useDeviceLimitContext();
  // Local company: device list should not depend on Firestore listeners.
  const isLocalCompany = String((company as { storageOption?: string } | null)?.storageOption || "local").toLowerCase() === "local";
  // Local company behaves as owner-managed on this device (no cloud owner doc check required).
  const isCompanyOwner = isLocalCompany || (!!company && (company.ownerId === user?.uid || (user?.email && company?.ownerEmail === user.email)));
  const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;
  const plan = getPlanFromPlans(livePlans, company?.planId as any);
  const maxDevices = Math.max(1, Number(plan?.entitlements?.maxDevices) || 1);

  useEffect(() => {
    if (!companyId) {
      setDevices([]);
      setLoading(false);
      return;
    }
    if (isLocalCompany) {
      // Local-only: show this selected company as using one current device slot instantly.
      setDevices([
        {
          id: currentDeviceId || "local-device",
          userId: user?.uid || "local-user",
          lastActive: new Date(),
          deviceType: isNativeRuntime() ? "mobile" : "desktop",
          deviceLabel: isNativeRuntime() ? "This mobile device" : "This desktop device",
        },
      ]);
      setLoading(false);
      return;
    }
    const devicesRef = collection(firestore, "companies", companyId, "devices");
    const unsub = onSnapshot(devicesRef, (snap) => {
      const rows: DeviceRow[] = snap.docs.map((d) => {
        const data = d.data();
        const la = data?.lastActive;
        const lastActive = la && typeof la.toMillis === "function" ? new Date(la.toMillis()) : null;
        const deviceType = (data?.deviceType === "mobile" || data?.deviceType === "desktop" ? data.deviceType : undefined) as DeviceRow["deviceType"];
        const deviceLabel = typeof data?.deviceLabel === "string" ? data.deviceLabel : undefined;
        return { id: d.id, userId: data?.userId ?? "", lastActive, deviceType, deviceLabel };
      });
      rows.sort((a, b) => (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0));
      setDevices(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [companyId, currentDeviceId, isLocalCompany, user?.uid]);

  const ownerId = company?.ownerId ?? "";
  const companyHistoryLimit = (company as { deviceHistoryLimit?: number } | null)?.deviceHistoryLimit ?? DEFAULT_HISTORY_LIMIT;

  useEffect(() => {
    setHistoryLimitInput(String(companyHistoryLimit));
  }, [companyHistoryLimit]);

  useEffect(() => {
    if (!companyId) {
      setDeviceHistory([]);
      return;
    }
    if (isLocalCompany) {
      // Local-only: no Firestore device history stream, so avoid spinner/waits.
      setDeviceHistory([]);
      return;
    }
    const historyRef = collection(firestore, "companies", companyId, "device_history");
    const q = query(historyRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: DeviceHistoryRow[] = snap.docs.map((d) => {
        const data = d.data();
        const la = data?.lastActive;
        const ca = data?.createdAt;
        const lastActive = la && typeof (la as { toMillis?: () => number })?.toMillis === "function" ? new Date((la as { toMillis: () => number }).toMillis()) : null;
        const createdAt = ca && typeof (ca as { toMillis?: () => number })?.toMillis === "function" ? new Date((ca as { toMillis: () => number }).toMillis()) : null;
        const deviceType = (data?.deviceType === "mobile" || data?.deviceType === "desktop" ? data.deviceType : undefined) as DeviceHistoryRow["deviceType"];
        const deviceLabel = typeof data?.deviceLabel === "string" ? data.deviceLabel : undefined;
        return {
          id: d.id,
          deviceId: data?.deviceId ?? "",
          userId: data?.userId ?? "",
          lastActive,
          deviceType,
          deviceLabel,
          createdAt,
        };
      });
      setDeviceHistory(rows);
    });
    return () => unsub();
  }, [companyId, isLocalCompany]);

  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      const aThis = a.id === currentDeviceId;
      const bThis = b.id === currentDeviceId;
      if (aThis && !bThis) return -1;
      if (!aThis && bThis) return 1;
      const aOwner = a.userId === ownerId;
      const bOwner = b.userId === ownerId;
      if (aOwner && !bOwner) return -1;
      if (!aOwner && bOwner) return 1;
      return (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0);
    });
  }, [devices, ownerId, currentDeviceId]);

  // Snapshot + optimistic filtered table + bulk tick target list
  const visibleSortedDevices = useMemo(
    () => sortedDevices.filter((d) => !optimisticRemovedIds.has(d.id)),
    [sortedDevices, optimisticRemovedIds]
  );
  const kickableVisibleIds = useMemo(
    () => visibleSortedDevices.filter((d) => d.id !== currentDeviceId).map((d) => d.id),
    [visibleSortedDevices, currentDeviceId]
  );
  const kickableIdsKey = useMemo(() => kickableVisibleIds.join(","), [kickableVisibleIds]);

  /** Server row delete hone par stale optimistic id hataao */
  useEffect(() => {
    setOptimisticRemovedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (!devices.some((d) => d.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [devices]);

  /** Kickable list shrink (refresh / optimistic) → tick state invalid IDs saaf */
  useEffect(() => {
    const allowed = new Set(kickableVisibleIds);
    setSelectedKickIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next.size === prev.size && [...prev].every((x) => next.has(x)) ? prev : next;
    });
  }, [kickableIdsKey]);

  const userIdsKey = useMemo(
    () => [...new Set([...devices.map((d) => d.userId), ...deviceHistory.map((h) => h.userId)].filter(Boolean))].sort().join(","),
    [devices, deviceHistory]
  );

  useEffect(() => {
    const userIds = [...new Set([...devices.map((d) => d.userId), ...deviceHistory.map((h) => h.userId)].filter(Boolean))];
    if (userIds.length === 0) return;
    let cancelled = false;
    const map: Record<string, string> = {};
    const sharedWith = (company?.sharedWith || []) as Array<{ uid?: string; name?: string; email?: string }>;
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
          const name = (d.name as string)?.trim();
          const displayName = (d.displayName as string)?.trim();
          const email = (d.email as string)?.trim();
          const raw = name || displayName || email || "";
          const isUidLike = raw === uid || /^[a-zA-Z0-9_-]{20,}$/.test(raw);
          map[uid] = raw && !isUidLike ? raw : "—";
        } else {
          map[uid] = "—";
        }
        if (map[uid] === "—" && sharedWith.length > 0) {
          const shared = sharedWith.find((u) => u.uid === uid);
          if (shared) map[uid] = (shared.name as string)?.trim() || (shared.email as string)?.trim() || "—";
        }
      })
    ).then(() => {
      if (!cancelled) {
        Object.assign(userNamesCache, map);
        setUserNames((prev) => ({ ...prev, ...map }));
      }
    });
    return () => { cancelled = true; };
  }, [userIdsKey, company?.sharedWith]);

  const handleUserCanUseMultiDeviceChange = async (checked: boolean) => {
    if (!companyId) return;
    setUpdatingMultiDevice(true);
    try {
      await updateDoc(doc(firestore, "companies", companyId), { userCanUseMultiDevice: checked });
      toast({ title: "Setting saved", description: checked ? "Shared users can use multiple devices (within plan limit)." : "Shared users can use only one device at a time." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setUpdatingMultiDevice(false);
    }
  };

  /** Ek / zyada rows: optimistic hide + ek batch trim — UI freeze kam */
  const confirmAndKickDevices = (rows: DeviceRow[]) => {
    if (!companyId || rows.length === 0) return;
    setConfirmKick(null);
    setConfirmBulkKick(false);
    const ids = rows.map((r) => r.id);
    setOptimisticRemovedIds((prev) => new Set([...prev, ...ids]));
    setSelectedKickIds((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => n.delete(id));
      return n;
    });
    setKickInFlight(true);
    if (rows.length > 1) setBulkKickBusy(true);
    void (async () => {
      try {
        await kickOutDevicesBatch(
          companyId,
          rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            deviceType: r.deviceType,
            deviceLabel: r.deviceLabel,
          }))
        );
        refreshDeviceCheck();
        toast({
          title: rows.length > 1 ? "Devices removed" : "Device removed",
          description:
            rows.length > 1
              ? `${rows.length} slot(s) freed. Those sessions will hit the limit or need sign-in again.`
              : "That device will see slot full and can switch company or remove that device.",
        });
      } catch (e: unknown) {
        setOptimisticRemovedIds((prev) => {
          const n = new Set(prev);
          ids.forEach((id) => n.delete(id));
          return n;
        });
        const msg = e instanceof Error ? e.message : "Failed to remove device";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setKickInFlight(false);
        setBulkKickBusy(false);
      }
    })();
  };

  const handleSaveHistoryLimit = async () => {
    if (!companyId) return;
    const num = Math.max(1, Math.min(1000, parseInt(historyLimitInput, 10) || DEFAULT_HISTORY_LIMIT));
    setSavingHistoryLimit(true);
    try {
      await updateDoc(doc(firestore, "companies", companyId), { deviceHistoryLimit: num });
      await trimDeviceHistoryToLimit(companyId, num);
      setHistoryLimitInput(String(num));
      toast({ title: "Saved", description: `Device history will keep up to ${num} entries.` });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingHistoryLimit(false);
    }
  };

  const handleDeleteHistoryEntry = async (entryId: string) => {
    if (!companyId) return;
    setDeletingHistoryId(entryId);
    try {
      await deleteDoc(doc(firestore, "companies", companyId, "device_history", entryId));
      toast({ title: "Entry removed", description: "History entry deleted." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to delete", variant: "destructive" });
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const handleDeleteAllHistory = async () => {
    if (!companyId) return;
    setDeletingAllHistory(true);
    try {
      const snap = await getDocs(collection(firestore, "companies", companyId, "device_history"));
      const docs = snap.docs;
      const chunk = 450;
      for (let i = 0; i < docs.length; i += chunk) {
        const batch = writeBatch(firestore);
        docs.slice(i, i + chunk).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      toast({ title: "History cleared", description: "All device history entries removed." });
      setConfirmDeleteAllHistory(false);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete all",
        variant: "destructive",
      });
    } finally {
      setDeletingAllHistory(false);
    }
  };

  if (!companyId || !company) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Synced devices</CardTitle>
          <CardDescription>Select a company to view and manage devices.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleRemoveThisDevice = async () => {
    if (!companyId) return;
    setRemovingThisDevice(true);
    try {
      await removeThisDevice(companyId);
      refreshDeviceCheck();
      toast({ title: "Device removed", description: "This device no longer uses a slot. You can open the company again to use a slot if available." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to remove device", variant: "destructive" });
    } finally {
      setRemovingThisDevice(false);
    }
  };

  if (!isCompanyOwner) {
    return (
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Synced devices
            </CardTitle>
            <CardDescription>
              Remove this device from the company to free a slot. You stay logged in; this device will need to use a slot again when you open the company.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">This device</p>
                <p className="text-sm text-muted-foreground font-mono">...{currentDeviceId.slice(-8)}</p>
              </div>
              <Button
                variant="destructive"
                onClick={handleRemoveThisDevice}
                disabled={removingThisDevice}
              >
                {removingThisDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-2">Remove</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Header checkbox state: all kickable / partial / none selected
  const bulkHeadCheckboxChecked: boolean | "indeterminate" =
    kickableVisibleIds.length === 0
      ? false
      : kickableVisibleIds.every((id) => selectedKickIds.has(id))
        ? true
        : kickableVisibleIds.some((id) => selectedKickIds.has(id))
          ? "indeterminate"
          : false;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Synced devices
            </CardTitle>
          </div>
          <CardDescription>
            {/* Always show selected company device count, including local single-device mode. */}
            Devices for selected company. Count: {visibleSortedDevices.length} / {maxDevices}. Tick rows and “Kick selected” for bulk remove; removes feel instant locally.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="user-multi-device" className="text-base font-medium">User Can Use Multi Device</Label>
              <p className="text-sm text-muted-foreground">
                Yes: shared users can sign in on multiple devices (within plan limit). No: each shared user can use only one device; on a new device they must log out from this device or replace the old one.
              </p>
            </div>
            <Switch
              id="user-multi-device"
              checked={userCanUseMultiDevice}
              onCheckedChange={handleUserCanUseMultiDeviceChange}
              disabled={updatingMultiDevice}
            />
          </div>
          {!loading && visibleSortedDevices.length > 0 && kickableVisibleIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedKickIds.size === 0 || kickInFlight}
                onClick={() => setConfirmBulkKick(true)}
              >
                {bulkKickBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={bulkKickBusy ? "ml-2" : ""}>
                  Kick selected ({selectedKickIds.size})
                </span>
              </Button>
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No devices registered yet.</p>
          ) : visibleSortedDevices.length === 0 && optimisticRemovedIds.size > 0 ? (
            <p className="text-sm text-muted-foreground py-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing removals…
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px] pt-2">
                    <Checkbox
                      checked={bulkHeadCheckboxChecked}
                      disabled={kickInFlight || kickableVisibleIds.length === 0}
                      onCheckedChange={(c) => {
                        if (c === true) setSelectedKickIds(new Set(kickableVisibleIds));
                        else setSelectedKickIds(new Set());
                      }}
                      aria-label="Select all devices you can kick"
                    />
                  </TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>User name</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Device type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSortedDevices.map((device) => {
                  const isAdmin = device.userId === ownerId;
                  const displayName = isAdmin ? "Admin" : (userNames[device.userId] ?? "—");
                  const isUid = !isAdmin && (displayName === device.userId || /^[a-zA-Z0-9]{20,32}$/.test(displayName));
                  const isThisDevice = device.id === currentDeviceId;
                  return (
                  <TableRow
                    key={device.id}
                    className={isThisDevice ? "cursor-default pointer-events-none" : undefined}
                  >
                    <TableCell className="w-[48px] pointer-events-auto align-middle">
                      {isThisDevice ? (
                        <span className="inline-block w-4" aria-hidden />
                      ) : (
                        <Checkbox
                          checked={selectedKickIds.has(device.id)}
                          disabled={kickInFlight}
                          onCheckedChange={(c) => {
                            setSelectedKickIds((prev) => {
                              const n = new Set(prev);
                              if (c) n.add(device.id);
                              else n.delete(device.id);
                              return n;
                            });
                          }}
                          aria-label={`Select device ${device.id.slice(-6)} for bulk kick`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm" title={device.id}>
                      {displayDeviceLabel(device.deviceLabel, device.deviceType)}
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]" title={isAdmin ? "Admin" : (isUid ? undefined : displayName)}>
                      {isAdmin ? "Admin" : (isUid ? "—" : displayName)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {device.lastActive ? device.lastActive.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {device.deviceType === "mobile" ? (
                        <span title="Mobile"><Smartphone className="h-4 w-4 inline" /></span>
                      ) : device.deviceType === "desktop" ? (
                        <span title="PC"><Monitor className="h-4 w-4 inline" /></span>
                      ) : (
                        <span title="Device"><Monitor className="h-4 w-4 inline" /></span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right", isThisDevice && "pointer-events-auto")}>
                      <div className="flex items-center justify-end gap-2">
                        {isThisDevice && <span className="text-sm font-medium text-muted-foreground">This device</span>}
                        {isThisDevice ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleRemoveThisDevice}
                            disabled={removingThisDevice || kickInFlight}
                          >
                            {removingThisDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            <span className="ml-1">Remove</span>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmKick(device)}
                            disabled={kickInFlight}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-1">Kick out</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );})}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Device history
          </CardTitle>
          <CardDescription>
            Log of devices that were kicked or removed. Set how many entries to keep; oldest are removed when over limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="history-limit">Max history entries to save</Label>
              <Input
                id="history-limit"
                type="number"
                min={1}
                max={1000}
                value={historyLimitInput}
                onChange={(e) => setHistoryLimitInput(e.target.value)}
                className="w-28"
              />
            </div>
            <Button onClick={handleSaveHistoryLimit} disabled={savingHistoryLimit}>
              {savingHistoryLimit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={savingHistoryLimit ? "ml-2" : ""}>Save</span>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{deviceHistory.length} entries (keeping up to {companyHistoryLimit})</p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteAllHistory(true)}
              disabled={deviceHistory.length === 0}
            >
              <Trash2 className="h-4 w-4" />
              <span className="ml-2">Delete all history</span>
            </Button>
          </div>
          {deviceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No history yet. Entries are added when a device is kicked or removed.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>User name</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Recorded at</TableHead>
                  <TableHead>Device type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviceHistory.map((row) => {
                  const isAdmin = row.userId === ownerId;
                  const displayName = isAdmin ? "Admin" : (userNames[row.userId] ?? "—");
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm" title={row.deviceId}>
                        {displayDeviceLabel(row.deviceLabel, row.deviceType)}
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-[140px]">{displayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.lastActive ? row.lastActive.toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.createdAt ? row.createdAt.toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.deviceType === "mobile" ? <Smartphone className="h-4 w-4 inline" /> : row.deviceType === "desktop" ? <Monitor className="h-4 w-4 inline" /> : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteHistoryEntry(row.id)}
                          disabled={deletingHistoryId === row.id}
                        >
                          {deletingHistoryId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          <span className="ml-1">Delete</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Kick in-flight par dialog accidental close band — UX clear */}
      <AlertDialog open={!!confirmKick} onOpenChange={(open) => { if (!open && !kickInFlight) setConfirmKick(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove this device?</AlertDialogTitle>
          <AlertDialogDescription>
            This will sign out the device from this company. The user can sign in again from that device if the plan allows. Device: ...{confirmKick?.id.slice(-8)}.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickInFlight}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={kickInFlight}
              onClick={(e) => {
                e.preventDefault();
                const row = confirmKick;
                if (row) confirmAndKickDevices([row]);
              }}
            >
              Kick out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi tick ke baad ek hi Firestore batch — bulk confirm */}
      <AlertDialog
        open={confirmBulkKick}
        onOpenChange={(open) => {
          if (!open && !kickInFlight) setConfirmBulkKick(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kick selected devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {selectedKickIds.size} device slot(s). Those sessions lose this company until they connect again within plan limits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickInFlight}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={kickInFlight || selectedKickIds.size === 0}
              onClick={(e) => {
                e.preventDefault();
                const ids = [...selectedKickIds];
                const rows = visibleSortedDevices.filter((d) => ids.includes(d.id));
                if (rows.length) confirmAndKickDevices(rows);
              }}
            >
              Kick {selectedKickIds.size} device(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pehle sirf `setConfirmDeleteAllHistory(true)` tha — koi AlertDialog nahi tha, isliye "Delete all history" dead tha */}
      <AlertDialog
        open={confirmDeleteAllHistory}
        onOpenChange={(open) => {
          if (!deletingAllHistory) setConfirmDeleteAllHistory(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all device history?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every history row for this company. Active synced devices are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAllHistory}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingAllHistory}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteAllHistory();
              }}
            >
              {deletingAllHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={deletingAllHistory ? "ml-2" : ""}>Delete all</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
