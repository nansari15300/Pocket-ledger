"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useGate } from "@/contexts/GateContext";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { filterSharedOnlyCompaniesForSuperAdminInMainApp } from "@/lib/companySuperAdminFilter";
import {
  mergePlServerSharedCompaniesIntoRegistry,
  filterCompaniesForPlServerAccess,
  PL_SERVER_ACCESS_CONTEXT_EVENT,
  buildPlServerGatePreviewCompanyList,
} from "@/lib/plServerAccessContext";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { gateTypeLabel } from "@/lib/gates/gateStore";
import {
  filterCompaniesForActiveGate,
  isLocalServerGate,
  refreshActiveLocalServerGateContext,
  resolveLocalServerGateAccessToken,
  activateLocalServerGateOnBundledClient,
  activateLocalServerGateOnWebClient,
} from "@/lib/gates/gateRuntime";
import { normalizeServerUrl } from "@/lib/gates/gateStore";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import {
  Check,
  DoorOpen,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Server,
  Smartphone,
  Trash2,
  Cloud,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appNavHref } from "@/lib/appNavHref";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { localAuthLoginForCompanyContext } from "@/lib/localCompanyUsers";
import { setLocalAuthToken } from "@/lib/localApiClient";
import {
  readAnyStoredOfflineUnlockSessionForCompany,
  readOfflineUnlockPreferenceDays,
  readStoredOfflineUnlockSession,
  saveOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { RememberCompanyPasswordDurationSelect } from "@/components/company/RememberCompanyPasswordDurationSelect";
import { mirrorPlServerGateToLocalSqlite, mirrorPlServerSharedCompanyById } from "@/lib/plServerClientCompanyMirror";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerMirrorGate";
import { readAndStripPlGatePrefillFromLocation } from "@/lib/plServerGateInviteLink";
import { persistDevClientAccessToken } from "@/lib/plServerAccessContext";
import {
  grantOpenLocalCompanySession,
  shouldPromptCompanyUnlockAsync,
} from "@/lib/companyUnlockGate";
import { resolveCompanyIsOwnedForUser } from "@/lib/companyOnlineIntegrity";

function gateIcon(type: GateRecord["type"]) {
  switch (type) {
    case "device":
      return Smartphone;
    case "online":
      return Cloud;
    case "local_server":
      return Server;
    default:
      return DoorOpen;
  }
}

function statusBadge(gate: GateRecord) {
  if (gate.type !== "local_server") return null;
  const st = gate.lastStatus;
  if (st === "online")
    return (
      <Badge variant="outline" className="border-emerald-300 text-emerald-800">
        Reachable
      </Badge>
    );
  if (st === "error")
    return (
      <Badge variant="outline" className="border-red-300 text-red-800">
        Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Not tested
    </Badge>
  );
}

export function GatePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const { allCompaniesRegistry, setCompanyId, companyId, reloadLocalCompanyRegistry } = useCompany();
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isSuperAdminUser = customUser?.role === "SuperAdmin" || isSuperAdminByEmail;
  const {
    gates,
    activeGateId,
    setActiveGateId,
    addLocalServerGate,
    updateLocalServerGate,
    removeGate,
    testLocalServerGate,
    connectLocalServerGate,
    backToDeviceGate,
    canCreateCompanyOnActiveGate,
    activeGateCreateHintText,
    selectedGateIdForDetail,
    setSelectedGateIdForDetail,
  } = useGate();

  const [showAdd, setShowAdd] = useState(false);
  const [editingGateId, setEditingGateId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editServerUrl, setEditServerUrl] = useState("");
  const [editAccessToken, setEditAccessToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [serverAccessEpoch, setServerAccessEpoch] = useState(0);
  const [refreshingServerCompanies, setRefreshingServerCompanies] = useState(false);
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [unlockServerGate, setUnlockServerGate] = useState<GateRecord | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUnlockDays, setRememberUnlockDays] = useState(0);

  const useBundledLocalServerGate =
    isElectronDesktopApp() || isCapacitorNativeApp();

  const detailGate = useMemo(
    () => gates.find((g) => g.id === selectedGateIdForDetail) ?? null,
    [gates, selectedGateIdForDetail]
  );

  useEffect(() => {
    const onCtx = () => setServerAccessEpoch((n) => n + 1);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
  }, []);

  useEffect(() => {
    const prefill = readAndStripPlGatePrefillFromLocation();
    if (!prefill) return;
    setShowAdd(true);
    setLabel(prefill.gateLabel || "Shared server");
    setServerUrl(prefill.serverUrl);
    setAccessToken(prefill.accessToken);
    persistDevClientAccessToken(prefill.accessToken);
    toast.message("Server invite loaded", {
      description: "Review the prefilled gate and tap Add to connect.",
    });
  }, []);

  useEffect(() => {
    if (!detailGate || !isLocalServerGate(detailGate)) return;
    let cancelled = false;
    setRefreshingServerCompanies(true);
    void refreshActiveLocalServerGateContext(detailGate)
      .then((ctx) => {
        if (!cancelled && ctx?.error) {
          toast.error("Could not load server companies", { description: ctx.error });
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshingServerCompanies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailGate?.id]);

  const detailCompanies = useMemo(() => {
    if (!detailGate) return { owned: [] as typeof allCompaniesRegistry, shared: [] as typeof allCompaniesRegistry };
    const registryForGate = filterSharedOnlyCompaniesForSuperAdminInMainApp(
      allCompaniesRegistry,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      pathname
    );
    const filtered = filterCompaniesForPlServerAccess(
      filterCompaniesForActiveGate(
        mergePlServerSharedCompaniesIntoRegistry(registryForGate),
        detailGate
      )
    );
    const owned = filtered.filter((c) => c.isOwned !== false);
    const shared = filtered.filter((c) => c.isOwned === false);
    return { owned, shared };
  }, [allCompaniesRegistry, detailGate, user, isSuperAdminUser, pathname, serverAccessEpoch]);

  const localServerGateCompanies = useMemo(() => {
    if (!detailGate || !isLocalServerGate(detailGate)) return [];
    const registryForGate = filterSharedOnlyCompaniesForSuperAdminInMainApp(
      allCompaniesRegistry,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      pathname
    );
    return buildPlServerGatePreviewCompanyList(registryForGate, detailGate.id);
  }, [allCompaniesRegistry, detailGate, user, isSuperAdminUser, pathname, serverAccessEpoch]);

  const cancelEdit = () => {
    setEditingGateId(null);
    setEditLabel("");
    setEditServerUrl("");
    setEditAccessToken("");
  };

  const startEdit = (gate: GateRecord) => {
    if (!isLocalServerGate(gate)) return;
    setShowAdd(false);
    setEditingGateId(gate.id);
    setEditLabel(gate.label);
    setEditServerUrl(gate.serverUrl || "");
    setEditAccessToken("");
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      const gate = addLocalServerGate({
        label: label.trim() || "Local server",
        serverUrl,
        accessToken,
      });
      const test = await testLocalServerGate(gate.id);
      if (test.ok && useBundledLocalServerGate && !isPlRemoteServerClientMode()) {
        const mirror = await mirrorPlServerGateToLocalSqlite(gate, { pullFullLedger: false });
        await reloadLocalCompanyRegistry();
        if (mirror.mirrored > 0) {
          toast.success("Gate added", {
            description: `${mirror.mirrored} companies mirrored to this device.`,
          });
        } else if (mirror.error) {
          toast.warning("Gate saved", { description: mirror.error });
        } else {
          toast.success("Gate added", { description: test.message });
        }
      } else if (test.ok) {
        toast.success("Gate added", { description: test.message });
      } else {
        toast.warning("Gate saved", { description: test.message });
      }
      setLabel("");
      setServerUrl("");
      setAccessToken("");
      setShowAdd(false);
      setSelectedGateIdForDetail(gate.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add gate");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingGateId) return;
    setSavingEdit(true);
    try {
      const gate = updateLocalServerGate(editingGateId, {
        label: editLabel,
        serverUrl: editServerUrl,
        accessToken: editAccessToken.trim() || undefined,
      });
      const test = await testLocalServerGate(editingGateId);
      if (test.ok && useBundledLocalServerGate && !isPlRemoteServerClientMode()) {
        const mirror = await mirrorPlServerGateToLocalSqlite(gate, { pullFullLedger: false });
        await reloadLocalCompanyRegistry();
        if (mirror.mirrored > 0) {
          toast.success("Gate updated", {
            description: `${mirror.mirrored} companies mirrored to this device.`,
          });
        } else if (mirror.error) {
          toast.warning("Gate saved", { description: mirror.error });
        } else {
          toast.success("Gate updated", { description: test.message });
        }
      } else if (test.ok) {
        toast.success("Gate updated", { description: test.message });
      } else {
        toast.warning("Gate saved", { description: test.message });
      }
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update gate");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSelectGate = (gate: GateRecord) => {
    if (editingGateId && editingGateId !== gate.id) cancelEdit();
    setSelectedGateIdForDetail(gate.id);
    setActiveGateId(gate.id);
  };

  const handleUseGate = (gate: GateRecord) => {
    if (isLocalServerGate(gate)) {
      void (async () => {
        setTestingId(gate.id);
        const test = await testLocalServerGate(gate.id);
        setTestingId(null);
        if (!test.ok) {
          toast.error("Cannot connect", { description: test.message });
          return;
        }
        if (useBundledLocalServerGate && !isPlRemoteServerClientMode()) {
          setActiveGateId(gate.id);
          const activated = await activateLocalServerGateOnBundledClient(gate);
          if (!activated.ok) {
            toast.error("Could not use gate on this device", { description: activated.message });
            return;
          }
          toast.success(`Using gate: ${gate.label}`, {
            description: "Server companies are available on this device (SQLite).",
          });
          return;
        }
        if (!isElectronDesktopApp() && !isCapacitorNativeApp()) {
          setActiveGateId(gate.id);
          const activated = await activateLocalServerGateOnWebClient(gate);
          if (!activated.ok) {
            toast.error("Could not connect", { description: activated.message });
            return;
          }
          toast.success(`Connected to ${gate.label}`, {
            description: "Pick a company below to open it on this browser.",
          });
          return;
        }
        setActiveGateId(gate.id);
        connectLocalServerGate(gate.id);
      })();
      return;
    }
    setActiveGateId(gate.id);
    toast.success(`Using gate: ${gate.label}`);
  };

  const handlePickCompany = (id: string, gate: GateRecord) => {
    if (isLocalServerGate(gate)) {
      void (async () => {
        const token = resolveLocalServerGateAccessToken(gate);
        if (!token) {
          toast.error("Missing access token", {
            description: "Edit this gate and paste the token from the server owner (Settings → Server).",
          });
          return;
        }
        if (gate.serverUrl) {
          try {
            const gateOrigin = new URL(normalizeServerUrl(gate.serverUrl)).origin;
            if (isPlRemoteServerClientMode() && window.location.origin === gateOrigin) {
              setActiveGateId(gate.id);
              setCompanyId(id);
              router.push(appNavHref("/dashboard"));
              toast.success("Opened company on server");
              return;
            }
          } catch {
            /* fall through */
          }
        }
        if (useBundledLocalServerGate && !isPlRemoteServerClientMode()) {
          setTestingId(gate.id);
          const test = await testLocalServerGate(gate.id);
          if (!test.ok) {
            setTestingId(null);
            toast.error("Cannot open company", { description: test.message });
            return;
          }
          setActiveGateId(gate.id);
          const activated = await activateLocalServerGateOnBundledClient(gate);
          setTestingId(null);
          if (!activated.ok) {
            toast.error("Could not open company", { description: activated.message });
            return;
          }
          const picked = localServerGateCompanies.find((c) => c.id === id);
          const companyRow: CompanyData =
            picked ??
            ({
              id,
              name: id,
              ownerId: "",
              storageOption: "local",
              plServerShared: true,
              isOwned: false,
            } as CompanyData);
          const remembered =
            readStoredOfflineUnlockSession(user?.uid, id, user?.email) ||
            readAnyStoredOfflineUnlockSessionForCompany(id);
          if (remembered) {
            try {
              if (await plServerCompanyLedgerNeedsFullPull(id)) {
                await mirrorPlServerSharedCompanyById(id, { pullFullLedger: true });
              }
              setLocalAuthToken(id, remembered.token, remembered.user);
              setCompanyId(id);
              router.push(appNavHref("/dashboard"));
              toast.success("Opened company on this device");
            } catch (e) {
              toast.error("Could not sync company", {
                description: e instanceof Error ? e.message : "Mirror failed.",
              });
            }
            return;
          }
          const needsUnlock = await shouldPromptCompanyUnlockAsync(
            companyRow,
            user?.email,
            user?.uid
          );
          if (!needsUnlock) {
            try {
              if (await plServerCompanyLedgerNeedsFullPull(id)) {
                await mirrorPlServerSharedCompanyById(id, { pullFullLedger: true });
              }
              grantOpenLocalCompanySession(id, {
                role: resolveCompanyIsOwnedForUser(companyRow, {
                  uid: user?.uid || "",
                  email: user?.email ?? null,
                })
                  ? "owner"
                  : "viewer",
              });
              setCompanyId(id);
              router.push(appNavHref("/dashboard"));
              toast.success("Opened company on this device");
            } catch (e) {
              toast.error("Could not sync company", {
                description: e instanceof Error ? e.message : "Mirror failed.",
              });
            }
            return;
          }
          setCompanyToUnlock(companyRow);
          setUnlockServerGate(gate);
          setUsernameInput("");
          setPasswordInput("");
          setRememberUnlockDays(readOfflineUnlockPreferenceDays(user?.uid, id, user?.email));
          return;
        }
        if (!isElectronDesktopApp() && !isCapacitorNativeApp()) {
          setTestingId(gate.id);
          const test = await testLocalServerGate(gate.id);
          if (!test.ok) {
            setTestingId(null);
            toast.error("Cannot open company", { description: test.message });
            return;
          }
          setActiveGateId(gate.id);
          const activated = await activateLocalServerGateOnWebClient(gate);
          setTestingId(null);
          if (!activated.ok) {
            toast.error("Could not open company", { description: activated.message });
            return;
          }
          const picked = localServerGateCompanies.find((c) => c.id === id);
          const companyRow: CompanyData =
            picked ??
            ({
              id,
              name: id,
              ownerId: "",
              storageOption: "local",
              plServerShared: true,
              isOwned: false,
            } as CompanyData);
          const remembered =
            readStoredOfflineUnlockSession(user?.uid, id, user?.email) ||
            readAnyStoredOfflineUnlockSessionForCompany(id);
          if (remembered) {
            setLocalAuthToken(id, remembered.token, remembered.user);
            setCompanyId(id);
            const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
            const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
            if (isPlServerThinStaffClient()) {
              void preparePlServerStaffCompanyConnect(id, { pullFullLedger: true, background: true });
            }
            router.push(appNavHref("/dashboard"));
            toast.success("Opened company");
            return;
          }
          const needsUnlock = await shouldPromptCompanyUnlockAsync(
            companyRow,
            user?.email,
            user?.uid
          );
          if (!needsUnlock) {
            grantOpenLocalCompanySession(id, {
              role: resolveCompanyIsOwnedForUser(companyRow, {
                uid: user?.uid || "",
                email: user?.email ?? null,
              })
                ? "owner"
                : "viewer",
            });
            setCompanyId(id);
            const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
            const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
            if (isPlServerThinStaffClient()) {
              void preparePlServerStaffCompanyConnect(id, { pullFullLedger: true, background: true });
            }
            router.push(appNavHref("/dashboard"));
            toast.success("Opened company");
            return;
          }
          setCompanyToUnlock(companyRow);
          setUnlockServerGate(gate);
          setUsernameInput("");
          setPasswordInput("");
          setRememberUnlockDays(readOfflineUnlockPreferenceDays(user?.uid, id, user?.email));
          return;
        }
        connectLocalServerGate(gate.id, id);
      })();
      return;
    }
    setActiveGateId(gate.id);
    setCompanyId(id);
    router.push("/dashboard");
  };

  const handleServerCompanyUnlock = async () => {
    if (!companyToUnlock) return;
    const u = usernameInput.trim();
    const p = passwordInput.trim();
    if (!u || !p) {
      toast.error("Company access", { description: "Enter both login username and password." });
      return;
    }
    setIsVerifying(true);
    try {
      toast.message("Syncing company data…", {
        description: "Verifying login and downloading ledger from server.",
      });
      const unlockGate =
        unlockServerGate ?? (detailGate && isLocalServerGate(detailGate) ? detailGate : null);
      const { token, user: localUser } = await localAuthLoginForCompanyContext(companyToUnlock.id, u, p, {
        plServerGate: unlockGate,
        forcePlServerRemote: Boolean(unlockGate),
        appUser: { uid: user?.uid, email: user?.email },
      });
      setLocalAuthToken(companyToUnlock.id, token, localUser);
      saveOfflineUnlockSession(
        user?.uid,
        companyToUnlock.id,
        rememberUnlockDays,
        token,
        localUser,
        user?.email
      );
      const openedId = companyToUnlock.id;
      const openedName = companyToUnlock.name;
      setCompanyId(openedId);
      setCompanyToUnlock(null);
      setUnlockServerGate(null);
      setUsernameInput("");
      setPasswordInput("");
      const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
      const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
      if (isPlServerThinStaffClient()) {
        void preparePlServerStaffCompanyConnect(openedId, {
          pullFullLedger: true,
          background: true,
        });
      }
      router.push(appNavHref("/dashboard"));
      toast.success(`Welcome to ${openedName}`);
    } catch (e) {
      toast.error("Company access", {
        description: e instanceof Error ? e.message : "Login failed.",
      });
      setPasswordInput("");
    } finally {
      setIsVerifying(false);
    }
  };

  const [onRemoteOrigin, setOnRemoteOrigin] = useState(false);
  useEffect(() => {
    setOnRemoteOrigin(
      !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname.toLowerCase())
    );
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-8">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Gate</h1>
          <p className="text-sm text-muted-foreground">
            Choose where this app loads companies from. New companies are created on the{" "}
            <strong>active gate</strong> only.
          </p>
        </div>
      </div>

      {onRemoteOrigin && isCapacitorNativeApp() ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 text-sm text-amber-950">
            You are connected to a remote server.{" "}
            <Button type="button" variant="link" className="h-auto p-0" onClick={backToDeviceGate}>
              Back to this device
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active gate</CardTitle>
          <CardDescription>{activeGateCreateHintText}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {gates.find((g) => g.id === activeGateId)?.label ?? "—"}
          {user?.email ? (
            <span className="text-muted-foreground"> · signed in as {user.email}</span>
          ) : null}
        </CardContent>
      </Card>

      {!showAdd ? (
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            cancelEdit();
            setShowAdd(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add local server gate
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add local server</CardTitle>
            <CardDescription>
              Server IP/URL + access token from the PC owner (Settings → Server). Works on LAN and WAN
              (port forward).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gate-label">Local name</Label>
              <Input
                id="gate-label"
                placeholder="Office PC"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gate-url">Server address</Label>
              <Input
                id="gate-url"
                placeholder="http://110.34.23.84:3001"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                IP and port only — do not add a path (e.g. <span className="font-mono">http://192.168.1.5:3001</span>, not
                /__pl_access_context).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gate-token">Access token</Label>
              <Input
                id="gate-token"
                type="password"
                autoComplete="off"
                placeholder="From server owner"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={adding} onClick={() => void handleAdd()}>
                {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium">All gates</h2>
        <ul className="space-y-2">
          {gates.map((gate) => {
            const Icon = gateIcon(gate.type);
            const isActive = gate.id === activeGateId;
            const isDetail = gate.id === selectedGateIdForDetail;
            return (
              <li key={gate.id}>
                <button
                  type="button"
                  onClick={() => handleSelectGate(gate)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    isDetail ? "border-primary bg-secondary/40" : "hover:bg-muted/40",
                    isActive && "ring-1 ring-primary/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{gate.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {gateTypeLabel(gate.type)}
                          {gate.serverUrl ? ` · ${gate.serverUrl}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isActive ? (
                        <Badge className="bg-primary/90">Active</Badge>
                      ) : null}
                      {statusBadge(gate)}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {detailGate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{detailGate.label}</CardTitle>
            <CardDescription>
              {isLocalServerGate(detailGate)
                ? "Test connection to load companies allowed by your token."
                : "Owned and shared companies on this gate."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingGateId === detailGate.id && isLocalServerGate(detailGate) ? (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">Edit server gate</p>
                <div className="space-y-1">
                  <Label htmlFor="edit-gate-label">Local name</Label>
                  <Input
                    id="edit-gate-label"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-gate-url">Server address</Label>
                  <Input
                    id="edit-gate-url"
                    placeholder="http://110.34.23.84:3001"
                    value={editServerUrl}
                    onChange={(e) => setEditServerUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    IP and port only — do not add a path.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-gate-token">Access token</Label>
                  <Input
                    id="edit-gate-token"
                    type="password"
                    autoComplete="off"
                    placeholder="Leave blank to keep current token"
                    value={editAccessToken}
                    onChange={(e) => setEditAccessToken(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={savingEdit} onClick={() => void handleSaveEdit()}>
                    {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
            <div className="flex flex-wrap gap-2">
              {isLocalServerGate(detailGate) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingId === detailGate.id}
                    onClick={() => {
                      setTestingId(detailGate.id);
                      void testLocalServerGate(detailGate.id).then((r) => {
                        setTestingId(null);
                        if (r.ok) toast.success(r.message);
                        else toast.error(r.message);
                      });
                    }}
                  >
                    {testingId === detailGate.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="mr-2 h-4 w-4" />
                    )}
                    Test
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={testingId === detailGate.id}
                    onClick={() => handleUseGate(detailGate)}
                  >
                    {useBundledLocalServerGate && !isPlRemoteServerClientMode()
                      ? "Use on this device"
                      : "Connect & open"}
                  </Button>
                  {useBundledLocalServerGate && !isPlRemoteServerClientMode() ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingId === detailGate.id}
                      onClick={() => connectLocalServerGate(detailGate.id)}
                    >
                      Connect &amp; open in browser
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button type="button" size="sm" onClick={() => handleUseGate(detailGate)}>
                  <Check className="mr-2 h-4 w-4" />
                  Use this gate
                </Button>
              )}
              {detailGate.type === "local_server" ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(detailGate)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteId(detailGate.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </>
              ) : null}
            </div>

            {!isLocalServerGate(detailGate) ? (
              <>
                <CompanySection
                  title="Owned companies"
                  empty="No owned companies on this gate."
                  companies={detailCompanies.owned}
                  activeCompanyId={companyId}
                  onPick={(id) => handlePickCompany(id, detailGate)}
                />
                <CompanySection
                  title="Shared companies"
                  empty="No shared companies on this gate."
                  companies={detailCompanies.shared}
                  activeCompanyId={companyId}
                  onPick={(id) => handlePickCompany(id, detailGate)}
                />
                {canCreateCompanyOnActiveGate && detailGate.id === activeGateId ? (
                  <Button type="button" variant="outline" asChild>
                    <a href={appNavHref("/company/create")}>Create company on this gate</a>
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {refreshingServerCompanies ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading companies from server…
                  </p>
                ) : null}
                <CompanySection
                  title="Shared companies"
                  empty="No companies yet. Tap Test to check your token, or assign local companies on the server PC."
                  companies={localServerGateCompanies}
                  activeCompanyId={companyId}
                  onPick={(id) => handlePickCompany(id, detailGate)}
                />
                <p className="text-sm text-muted-foreground">
                  {useBundledLocalServerGate && !isPlRemoteServerClientMode()
                    ? "Tap a company to sign in and sync it on this device, or use Use on this device above."
                    : "Tap a company to open it on the server, or use Connect & open above."}
                </p>
              </>
            )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={!!companyToUnlock}
        onOpenChange={(open) => {
          if (!open) {
            const closing = companyToUnlock;
            setCompanyToUnlock(null);
            setUnlockServerGate(null);
            setUsernameInput("");
            setPasswordInput("");
            if (closing) {
              setRememberUnlockDays(
                readOfflineUnlockPreferenceDays(user?.uid, closing.id, user?.email)
              );
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter your credentials</AlertDialogTitle>
            <AlertDialogDescription>
              {companyToUnlock ? (
                <>
                  Open{" "}
                  <span className="font-medium text-foreground">&quot;{companyToUnlock.name}&quot;</span>{" "}
                  using this company&apos;s local username and password on the server. After login, full
                  company data will sync to this device.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gate-unlock-login-user">Login username</Label>
              <Input
                id="gate-unlock-login-user"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                autoComplete="username"
                disabled={isVerifying}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gate-unlock-password">Password</Label>
              <div className="relative">
                <Input
                  id="gate-unlock-password"
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoComplete="current-password"
                  disabled={isVerifying}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleServerCompanyUnlock();
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isVerifying}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <RememberCompanyPasswordDurationSelect
              id="gate-remember-days"
              value={rememberUnlockDays}
              onChange={setRememberUnlockDays}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVerifying}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={isVerifying} onClick={() => void handleServerCompanyUnlock()}>
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                "Sign in & sync"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove gate?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved server address and token from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  removeGate(deleteId);
                  if (editingGateId === deleteId) cancelEdit();
                  setSelectedGateIdForDetail(null);
                  setDeleteId(null);
                  toast.success("Gate removed");
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompanySection({
  title,
  empty,
  companies,
  activeCompanyId,
  onPick,
}: {
  title: string;
  empty: string;
  companies: { id: string; name?: string; isOwned?: boolean }[];
  activeCompanyId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {companies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50",
                  c.id === activeCompanyId && "bg-secondary/50 font-medium"
                )}
                onClick={() => onPick(c.id)}
              >
                <span className="truncate">{c.name || c.id}</span>
                {c.id === activeCompanyId ? (
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    Current
                  </Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
