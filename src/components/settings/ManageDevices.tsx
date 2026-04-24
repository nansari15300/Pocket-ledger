"use client";

import { useEffect, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs, getDoc, deleteDoc, doc, onSnapshot, query, where, updateDoc, orderBy } from "firebase/firestore";
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
import { getOrCreateDeviceId, removeThisDevice, trimDeviceHistoryToLimit, addDeviceHistoryEntryWhenRemoved } from "@/lib/deviceLimitClient";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const [historyLimitInput, setHistoryLimitInput] = useState<string>(String(DEFAULT_HISTORY_LIMIT));
  const [savingHistoryLimit, setSavingHistoryLimit] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [confirmDeleteAllHistory, setConfirmDeleteAllHistory] = useState(false);
  const [webUseSelectedFolder, setWebUseSelectedFolder] = useState(false);
  const [webFolderLabel, setWebFolderLabel] = useState<string | null>(null);
  const [nativeDirectory, setNativeDirectory] = useState<BackupNativeDirectory>("DOCUMENTS");
  const [nativeSubfolder, setNativeSubfolder] = useState("PocketLedgerBackups");
  const [nativeFolderPath, setNativeFolderPath] = useState<string | null>(null);
  const [savingBackupLocation, setSavingBackupLocation] = useState(false);
  const [requestingStoragePermission, setRequestingStoragePermission] = useState(false);
  const [backupLocationDialogOpen, setBackupLocationDialogOpen] = useState(false);

  const { refreshDeviceCheck } = useDeviceLimitContext();
  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company?.ownerEmail === user.email));
  const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;
  const plan = getPlanFromPlans(livePlans, company?.planId as any);
  const maxDevices = Math.max(1, Number(plan?.entitlements?.maxDevices) || 1);
  const supportsWebFolderPicker = canPickWebBackupFolder();
  const nativeRuntime = isNativeRuntime();

  useEffect(() => {
    // Device-local backup destination preference hydrate for mobile/PC static builds.
    const prefs = readBackupSaveLocationPrefs();
    setWebUseSelectedFolder(prefs.webUseSelectedFolder);
    setWebFolderLabel(prefs.webFolderLabel);
    setNativeDirectory(prefs.nativeDirectory);
    setNativeSubfolder(prefs.nativeSubfolder);
    setNativeFolderPath(prefs.nativeFolderPath ?? null);
  }, []);

  useEffect(() => {
    // Sidebar quick link (`dialog=backup-location`) should open device backup location as popup.
    if (searchParams.get("dialog") === "backup-location") {
      setBackupLocationDialogOpen(true);
    }
  }, [searchParams]);

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
  }, [companyId]);

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

  const handleKickOut = async (device: DeviceRow) => {
    if (!companyId) return;
    setKickingId(device.id);
    try {
      await addDeviceHistoryEntryWhenRemoved(companyId, { id: device.id, userId: device.userId, deviceType: device.deviceType, deviceLabel: device.deviceLabel });
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

  const handlePickWebFolder = async () => {
    if (!supportsWebFolderPicker) return;
    try {
      const picker = (window as any).showDirectoryPicker;
      const handle = await picker({ mode: "readwrite" });
      const ok = await storeWebBackupDirectoryHandle(handle);
      if (!ok) {
        toast({ variant: "destructive", title: "Failed", description: "Could not store selected folder on this device." });
        return;
      }
      const nextLabel = String(handle?.name || "Selected folder");
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        webUseSelectedFolder: true,
        webFolderLabel: nextLabel,
      });
      setWebUseSelectedFolder(true);
      setWebFolderLabel(nextLabel);
      // Show a clear confirmation so user knows backup will now save to this folder.
      toast({ title: "Backup location saved", description: `Folder set to ${nextLabel}.` });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast({ variant: "destructive", title: "Failed", description: "Could not select backup folder." });
    }
  };

  const handleClearWebFolder = async () => {
    await clearWebBackupDirectoryHandle();
    const prev = readBackupSaveLocationPrefs();
    saveBackupSaveLocationPrefs({
      ...prev,
      webUseSelectedFolder: false,
      webFolderLabel: null,
    });
    setWebUseSelectedFolder(false);
    setWebFolderLabel(null);
    // Reset makes future backup fall back to Save As picker.
    toast({ title: "Backup location cleared", description: "Backup will ask location again." });
  };

  const handleSaveNativeLocation = async () => {
    setSavingBackupLocation(true);
    try {
      const prev = readBackupSaveLocationPrefs();
      const cleanSubfolder = String(nativeSubfolder || "").trim().replace(/^[\\/]+|[\\/]+$/g, "");
      saveBackupSaveLocationPrefs({
        ...prev,
        nativeDirectory,
        nativeSubfolder: cleanSubfolder || "PocketLedgerBackups",
        nativeFolderPath: nativeFolderPath && nativeFolderPath.trim() ? nativeFolderPath.trim() : null,
      });
      setNativeSubfolder(cleanSubfolder || "PocketLedgerBackups");
      toast({ title: "Backup location saved", description: "Default backup folder updated for this device." });
    } finally {
      setSavingBackupLocation(false);
    }
  };

  const handlePickNativeFolder = async () => {
    try {
      // Native APK: open system folder picker from Device location menu.
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      // Some Android builds require runtime storage permission handshake before SAF picker.
      const fpRequest = (FilePicker as unknown as { requestPermissions?: (opts?: { permissions?: string[] }) => Promise<unknown> }).requestPermissions;
      if (typeof fpRequest === "function") {
        try {
          await fpRequest({ permissions: ["readExternalStorage"] });
        } catch {
          /* picker may still work without explicit grant */
        }
      }
      const result = await FilePicker.pickDirectory();
      const pickedPath = String((result as { path?: string })?.path || "").trim();
      if (!pickedPath) {
        toast({ variant: "destructive", title: "No folder selected", description: "Please select a folder." });
        return;
      }
      setNativeFolderPath(pickedPath);
      // Keep subfolder clean: when full path chosen, backups save directly there.
      setNativeSubfolder("");
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        nativeFolderPath: pickedPath,
        nativeSubfolder: "",
      });
      toast({ title: "Folder selected", description: "Backup will try to save in this selected folder." });
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("canceled")) return;
      const details = String(e?.message || e?.errorMessage || e || "").trim();
      toast({
        variant: "destructive",
        title: "Browse failed",
        description: details ? `Could not open native folder browser: ${details}` : "Could not open native folder browser.",
      });
    }
  };

  const closeBackupLocationDialog = () => {
    setBackupLocationDialogOpen(false);
    if (searchParams.get("dialog") !== "backup-location") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("dialog");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const handleGrantNativeStoragePermission = async () => {
    setRequestingStoragePermission(true);
    try {
      // Static/native: give users a direct button to grant storage permission in advance.
      const granted = await ensureNativeBackupStoragePermission();
      if (!granted) {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Storage permission is required to save backup files on device.",
        });
        return;
      }
      toast({ title: "Permission granted", description: "Device storage permission is ready for backup save." });
    } finally {
      setRequestingStoragePermission(false);
    }
  };

  const handleSaveWebLocation = async () => {
    if (!webFolderLabel) {
      toast({ variant: "destructive", title: "Location not set", description: "Use Browse folder first, then save location." });
      return;
    }
    setSavingBackupLocation(true);
    try {
      const prev = readBackupSaveLocationPrefs();
      // Web/app build: once folder is saved, use it by default for backup writes.
      saveBackupSaveLocationPrefs({
        ...prev,
        webUseSelectedFolder: true,
        webFolderLabel,
      });
      setWebUseSelectedFolder(true);
      toast({ title: "Backup location saved", description: `Backups will save to ${webFolderLabel}.` });
    } finally {
      setSavingBackupLocation(false);
    }
  };

  const backupLocationDialog = (
    <Dialog
      open={backupLocationDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeBackupLocationDialog();
          return;
        }
        setBackupLocationDialogOpen(true);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Device backup location</DialogTitle>
          <DialogDescription>
            Choose where backup files should be saved on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!nativeRuntime && supportsWebFolderPicker ? (
            <>
              <div className="text-sm text-muted-foreground">
                Current folder: <span className="font-medium text-foreground">{webFolderLabel || "Not set"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Auto save to selected folder: <span className="font-medium text-foreground">{webUseSelectedFolder ? "On" : "Off"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handlePickWebFolder}>
                  Browse folder
                </Button>
                <Button type="button" onClick={handleSaveWebLocation} disabled={!webFolderLabel || savingBackupLocation}>
                  {savingBackupLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span className={savingBackupLocation ? "ml-2" : ""}>Save location</span>
                </Button>
                <Button type="button" variant="ghost" onClick={handleClearWebFolder} disabled={!webFolderLabel}>
                  Clear
                </Button>
              </div>
            </>
          ) : nativeRuntime ? (
            <>
              <Button type="button" variant="outline" onClick={handlePickNativeFolder}>
                Browse folder
              </Button>
              <div className="text-xs text-muted-foreground break-all">
                Selected folder: <span className="font-medium text-foreground">{nativeFolderPath || "Not set"}</span>
              </div>
              <Button type="button" variant="outline" onClick={handleGrantNativeStoragePermission} disabled={requestingStoragePermission}>
                {requestingStoragePermission ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={requestingStoragePermission ? "ml-2" : ""}>Grant storage permission</span>
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="native-backup-dir-popup">Directory</Label>
                <select
                  id="native-backup-dir-popup"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={nativeDirectory}
                  onChange={(e) => setNativeDirectory(e.target.value === "EXTERNAL" ? "EXTERNAL" : "DOCUMENTS")}
                >
                  <option value="DOCUMENTS">Documents</option>
                  <option value="EXTERNAL">External storage</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="native-backup-subfolder-popup">Subfolder</Label>
                <Input
                  id="native-backup-subfolder-popup"
                  value={nativeSubfolder}
                  onChange={(e) => setNativeSubfolder(e.target.value)}
                  placeholder="PocketLedgerBackups"
                />
              </div>
              <Button type="button" onClick={handleSaveNativeLocation} disabled={savingBackupLocation}>
                {savingBackupLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={savingBackupLocation ? "ml-2" : ""}>Save location</span>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This browser does not support fixed folder permission. Backup will ask location each time.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeBackupLocationDialog}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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
            {/* Keep backup location controls in popup only, not inline in the page body. */}
            <div className="mb-4">
              <Button type="button" variant="outline" onClick={() => setBackupLocationDialogOpen(true)}>
                Backup location
              </Button>
            </div>
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
        {backupLocationDialog}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Synced devices
            </CardTitle>
            {/* Keep backup location controls in popup only, not inline in the page body. */}
            <Button type="button" variant="outline" onClick={() => setBackupLocationDialogOpen(true)}>
              Backup location
            </Button>
          </div>
          <CardDescription>
            Devices that have signed in to this company. Limit: {devices.length} / {maxDevices}. Remove a device to free a slot (e.g. for another device to sign in).
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
                  const isThisDevice = device.id === currentDeviceId;
                  return (
                  <TableRow
                    key={device.id}
                    className={isThisDevice ? "cursor-default pointer-events-none" : undefined}
                  >
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
                            disabled={removingThisDevice}
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
                            disabled={!!kickingId}
                          >
                            {kickingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
      {backupLocationDialog}
    </div>
  );
}
