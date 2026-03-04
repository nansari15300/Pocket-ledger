"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, getDoc, deleteDoc, doc, onSnapshot, query, where, updateDoc, orderBy } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import { getOrCreateDeviceId, getDeviceLabel, removeThisDevice, trimDeviceHistoryToLimit } from "@/lib/deviceLimitClient";
import { useDeviceLimitContext } from "@/contexts/DeviceLimitContext";

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
  createdAt: Date | null;
};

const userNamesCache: Record<string, string> = {};
const DEFAULT_HISTORY_LIMIT = 50;

export function ManageDevices() {
  const { company, companyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const livePlans = useLivePlans();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>(() => ({ ...userNamesCache }));
  const [loading, setLoading] = useState(true);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState<DeviceRow | null>(null);
  const [updatingMultiDevice, setUpdatingMultiDevice] = useState(false);
  const [removingThisDevice, setRemovingThisDevice] = useState(false);
  const currentDeviceId = typeof window !== "undefined" ? getOrCreateDeviceId() : "";
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryRow[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(DEFAULT_HISTORY_LIMIT);
  const [savingHistoryLimit, setSavingHistoryLimit] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [confirmDeleteAllHistory, setConfirmDeleteAllHistory] = useState(false);
  const [historyLimitInput, setHistoryLimitInput] = useState<string>(String(DEFAULT_HISTORY_LIMIT));

  const { refreshDeviceCheck } = useDeviceLimitContext();
  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company?.ownerEmail === user.email));
  const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;
  const plan = getPlanFromPlans(livePlans, company?.planId as any);
  const maxDevices = Math.max(1, Number(plan?.entitlements?.maxDevices) || 1);

  useEffect(() => {
    if (!companyId) {
      setDevices([]);
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
  }, [companyId]);

  const ownerId = company?.ownerId ?? "";
  const companyHistoryLimit = (company as { deviceHistoryLimit?: number } | null)?.deviceHistoryLimit ?? DEFAULT_HISTORY_LIMIT;

  useEffect(() => {
    setHistoryLimit(companyHistoryLimit);
    setHistoryLimitInput(String(companyHistoryLimit));
  }, [companyHistoryLimit]);

  useEffect(() => {
    if (!companyId) {
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
        return {
          id: d.id,
          deviceId: data?.deviceId ?? "",
          userId: data?.userId ?? "",
          lastActive,
          deviceType,
          createdAt,
        };
      });
      setDeviceHistory(rows);
    });
    return () => unsub();
  }, [companyId]);

  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      const aOwner = a.userId === ownerId;
      const bOwner = b.userId === ownerId;
      if (aOwner && !bOwner) return -1;
      if (!aOwner && bOwner) return 1;
      return (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0);
    });
  }, [devices, ownerId]);

  const userIdsKey = useMemo(
    () => [...new Set([...devices.map((d) => d.userId), ...deviceHistory.map((h) => h.userId)].filter(Boolean))].sort().join(","),
    [devices, deviceHistory]
  );

  useEffect(() => {
    const userIds = [...new Set(devices.map((d) => d.userId).filter(Boolean))];
    if (userIds.length === 0) return;
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
      if (!cancelled) {
        Object.assign(userNamesCache, map);
        setUserNames((prev) => ({ ...prev, ...map }));
      }
    });
    return () => { cancelled = true; };
  }, [userIdsKey]);

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

  const handleKickOut = async (device: DeviceRow) => {
    if (!companyId) return;
    setKickingId(device.id);
    try {
      await deleteDoc(doc(firestore, "companies", companyId, "devices", device.id));
      toast({ title: "Device removed", description: "That device will see slot full and can switch company or remove that device." });
      setConfirmKick(null);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to remove device", variant: "destructive" });
    } finally {
      setKickingId(null);
    }
  };

  const handleSaveHistoryLimit = async () => {
    if (!companyId) return;
    const num = Math.max(1, Math.min(1000, parseInt(historyLimitInput, 10) || DEFAULT_HISTORY_LIMIT));
    setSavingHistoryLimit(true);
    try {
      await updateDoc(doc(firestore, "companies", companyId), { deviceHistoryLimit: num });
      await trimDeviceHistoryToLimit(companyId, num);
      setHistoryLimit(num);
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
    setConfirmDeleteAllHistory(false);
    try {
      const snap = await getDocs(collection(firestore, "companies", companyId, "device_history"));
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
      toast({ title: "History cleared", description: "All device history entries removed." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to delete all", variant: "destructive" });
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
                <p className="text-sm text-muted-foreground">{getDeviceLabel() || "—"} <span className="font-mono">...{currentDeviceId.slice(-8)}</span></p>
              </div>
              <Button
                variant="destructive"
                onClick={handleRemoveThisDevice}
                disabled={removingThisDevice}
              >
                {removingThisDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-2">Remove this device</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Synced devices
          </CardTitle>
          <CardDescription>
            Devices that have signed in to this company. Limit: {devices.length} / {maxDevices}. Remove a device to free a slot (e.g. for another device to sign in).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="user-multi-device" className="text-base font-medium">User Can Use Multi Device</Label>
              <p className="text-sm text-muted-foreground">
                Yes: shared users can use multiple devices (within plan limit); over limit shows replace-offer. No: only the device(s) already registered can use this company; new user sees device limit reached; existing user on new device sees no permission by company admin.
              </p>
            </div>
            <Switch
              id="user-multi-device"
              checked={userCanUseMultiDevice}
              onCheckedChange={handleUserCanUseMultiDeviceChange}
              disabled={updatingMultiDevice}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border p-4 bg-muted/30">
            <div>
              <p className="font-medium">This device</p>
              <p className="text-sm text-muted-foreground">{getDeviceLabel() || "—"} <span className="font-mono">...{currentDeviceId.slice(-8)}</span></p>
            </div>
            <Button
              variant="outline"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              onClick={handleRemoveThisDevice}
              disabled={removingThisDevice}
            >
              {removingThisDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-2">Remove this device</span>
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No devices registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>User name</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Device type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDevices.map((device) => {
                  const isAdmin = device.userId === ownerId;
                  const displayName = isAdmin ? "Admin" : (userNames[device.userId] ?? "—");
                  const isUid = !isAdmin && (displayName === device.userId || /^[a-zA-Z0-9]{20,32}$/.test(displayName));
                  return (
                  <TableRow key={device.id}>
                    <TableCell className="text-sm">
                      <span className="font-medium">{device.deviceLabel || (device.deviceType === "mobile" ? "Mobile" : device.deviceType === "desktop" ? "Desktop" : "—")}</span>
                      <span className="font-mono text-xs text-muted-foreground ml-1">...{device.id.slice(-8)}</span>
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmKick(device)}
                        disabled={!!kickingId}
                      >
                        {kickingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        <span className="ml-1">Kick out</span>
                      </Button>
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
            Log of device usage (same device can appear multiple times). Set how many entries to keep; oldest are removed when over limit.
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
            <p className="text-sm text-muted-foreground">{deviceHistory.length} entries (keeping up to {historyLimit})</p>
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
            <p className="text-sm text-muted-foreground py-4">No history yet. Device usage is logged when devices open this company.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device ID</TableHead>
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
                      <TableCell className="font-mono text-xs">...{row.deviceId.slice(-8)}</TableCell>
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

      <AlertDialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove this device?</AlertDialogTitle>
          <AlertDialogDescription>
            This will sign out the device from this company. The user can sign in again from that device if the plan allows. Device: ...{confirmKick?.id.slice(-8)}.
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
