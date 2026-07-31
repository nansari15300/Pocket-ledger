"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  resolvePlServerGateCompanyDisplayName,
} from "@/lib/plServerAccessContext";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { gateTypeLabel, normalizeServerUrl, writeGateTransportUrl, resolveGateServerTransportUrl } from "@/lib/gates/gateStore";
import {
  filterCompaniesForActiveGate,
  isLocalServerGate,
  refreshActiveLocalServerGateContext,
  activateLocalServerGateOnBundledClient,
  activateLocalServerGateOnWebClient,
} from "@/lib/gates/gateRuntime";
import { resolvePlSharingServerUrlForGate, resolvePlSharingTransportUrl } from "@/lib/gates/gateServerFetch";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerDeltaGate";
import { registerPlServerCompanyTransportHint } from "@/lib/plServerClientDeltaSync";
import { isPlRemoteServerClientMode, isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";
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
  Loader2,
  Pencil,
  Plus,
  Server,
  Smartphone,
  Trash2,
  Cloud,
  Wifi,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutFromCompanyOnThisDevice } from "@/lib/logoutFromCompany";
import { appNavHref } from "@/lib/appNavHref";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { getLocalAuthToken, setLocalAuthToken } from "@/lib/localApiClient";
import { grantOpenLocalCompanySession } from "@/lib/companyUnlockGate";
import {
  readAnyStoredOfflineUnlockSessionForCompany,
  readStoredOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { CompanyUnlockDialog } from "@/components/company/CompanyUnlockDialog";
import {
  stampCompanyRowForServerGateUnlock,
  finalizePlServerGateCompanyOpen,
  refreshPlServerStaffCompanyUiAfterOpen,
} from "@/lib/companyUnlockDialogFlow";
import { syncPlServerGateToLocalSqlite } from "@/lib/plServerClientCompanyDelta";
import { readAndStripPlGatePrefillFromLocation } from "@/lib/plServerGateInviteLink";
import { removeLocalServerGateCompanies, finalizeLocalServerGateRemoval, purgeOrphanPlServerMirrorCompanies } from "@/lib/plServerGateCleanup";
import { fetchPlServerCompanyLoginMeta } from "@/lib/plServerRemoteCompanyLogin";
import { loginMetaFromSharedSummary } from "@/lib/plServerCompanyLoginMeta";
import {
  openPlServerCompanyFromGateList,
  openPlServerGatePage,
  shouldOpenPlServerCompanyInNewTab,
  tryNavigateBackToAppHubForLocalOnlineCompany,
} from "@/lib/plServerCompanySelectNavigate";
import {
  shouldHideLocalServerGateDetailOnHub,
  describePlGateTestFailure,
} from "@/lib/plGatePageOrigin";
import { plGateTrace } from "@/lib/plGateTrace";

const SERVER_COMPANIES_AUTO_REFRESH_MS = 60 * 60 * 1000;
const SERVER_COMPANIES_REFRESH_STORAGE_PREFIX = "pl_gate_server_companies_checked_at:";

function serverCompaniesRefreshStorageKey(gate: GateRecord): string {
  return `${SERVER_COMPANIES_REFRESH_STORAGE_PREFIX}${gate.id}`;
}

function readServerCompaniesLastRefreshMs(gate: GateRecord): number {
  try {
    const raw = localStorage.getItem(serverCompaniesRefreshStorageKey(gate));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeServerCompaniesLastRefreshMs(gate: GateRecord, atMs = Date.now()): void {
  try {
    localStorage.setItem(serverCompaniesRefreshStorageKey(gate), String(atMs));
  } catch {
    /* ignore */
  }
}

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

function splitServerAddress(value: string): { host: string; port: string } {
  const raw = String(value || "").trim();
  if (!raw) return { host: "", port: "" };
  const normalized = normalizeServerUrl(raw) || normalizeServerUrl(`http://${raw}`);
  try {
    const parsed = new URL(normalized || raw);
    return {
      host: parsed.hostname || raw.replace(/^https?:\/\//i, "").split(":")[0] || "",
      port: parsed.port || "",
    };
  } catch {
    const withoutScheme = raw.replace(/^https?:\/\//i, "").split("/")[0] || "";
    const lastColon = withoutScheme.lastIndexOf(":");
    if (lastColon > 0) {
      return {
        host: withoutScheme.slice(0, lastColon),
        port: withoutScheme.slice(lastColon + 1),
      };
    }
    return { host: withoutScheme, port: "" };
  }
}

function buildServerAddress(host: string, port: string): string {
  const cleanHost = String(host || "").trim().replace(/^https?:\/\//i, "").split("/")[0] || "";
  const cleanPort = String(port || "").trim();
  if (!cleanHost || !cleanPort) return "";
  return `http://${cleanHost.replace(/:\d+$/, "")}:${cleanPort}`;
}

type LocalServerGateEditFieldsProps = {
  fieldKey: string;
  editLabel: string;
  setEditLabel: (value: string) => void;
  editServerHost: string;
  setEditServerHost: (value: string) => void;
  editServerPort: string;
  setEditServerPort: (value: string) => void;
  savingEdit: boolean;
  onSave: () => void;
  onCancel: () => void;
};

function LocalServerGateEditFields({
  fieldKey,
  editLabel,
  setEditLabel,
  editServerHost,
  setEditServerHost,
  editServerPort,
  setEditServerPort,
  savingEdit,
  onSave,
  onCancel,
}: LocalServerGateEditFieldsProps) {
  const labelId = `edit-gate-label-${fieldKey}`;
  const hostId = `edit-gate-host-${fieldKey}`;
  const portId = `edit-gate-port-${fieldKey}`;
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">Edit server gate</p>
      <div className="space-y-1">
        <Label htmlFor={labelId}>Local name</Label>
        <Input id={labelId} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="space-y-1">
          <Label htmlFor={hostId}>Server IP / host</Label>
          <Input
            id={hostId}
            placeholder="110.34.23.84"
            value={editServerHost}
            onChange={(e) => {
              const value = e.target.value;
              if (/^https?:\/\//i.test(value) || value.includes(":")) {
                const parsed = splitServerAddress(value);
                setEditServerHost(parsed.host);
                if (parsed.port) setEditServerPort(parsed.port);
                return;
              }
              setEditServerHost(value);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={portId}>Port</Label>
          <Input
            id={portId}
            inputMode="numeric"
            placeholder="3001"
            value={editServerPort}
            onChange={(e) => setEditServerPort(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          IP/host aur port alag enter karein. Path mat add karein.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={savingEdit} onClick={onSave}>
          {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

async function awaitStaffCompanyLedgerPull(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    if (await plServerCompanyLedgerNeedsFullPull(id)) {
      toast.message("Loading masters & vouchers…", {
        description: "SQLite ledger from server — attachments sync in background after open.",
      });
    }
    plGateTrace("gate_company_ledger_pull_start", { companyId: id });
    const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
    const pulled = await preparePlServerStaffCompanyConnect(id, {
      pullFullLedger: true,
      timeoutMs: 120_000,
    });
    plGateTrace("gate_company_ledger_pull_done", { companyId: id, ok: pulled.ok, fullPull: pulled.fullPull });
    if (!pulled.ok) {
      toast.error("Could not sync ledger", {
        description:
          "Use the host sharing port (usually 3001), not the app UI port (3000). Keep Server sharing ON on the host PC.",
      });
      return false;
    }
    return true;
  } catch (e) {
    toast.error("Could not sync ledger", {
      description: e instanceof Error ? e.message : "Sync failed.",
    });
    return false;
  }
}

export function GatePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const { allCompaniesRegistry, setCompanyId, clearCompanyId, companyId, reloadLocalCompanyRegistry } = useCompany();

  const handleLogoutCompany = (id: string) => {
    logoutFromCompanyOnThisDevice(id, user);
    if (companyId === id) clearCompanyId({ force: true });
    toast.success("Logged out from company");
  };
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
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editServerHost, setEditServerHost] = useState("");
  const [editServerPort, setEditServerPort] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pickingCompanyId, setPickingCompanyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingGateId, setDeletingGateId] = useState<string | null>(null);
  const [serverAccessEpoch, setServerAccessEpoch] = useState(0);
  const [refreshingServerCompanies, setRefreshingServerCompanies] = useState(false);
  const serverCompaniesRefreshInFlightRef = useRef<string | null>(null);
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [unlockPreferredGate, setUnlockPreferredGate] = useState<GateRecord | null>(null);

  const useBundledLocalServerGate =
    isElectronDesktopApp() || isCapacitorNativeApp();
  const shouldMirrorLocalServerGateOnThisClient = !isPlRemoteServerClientMode();
  const gateHubMode = shouldHideLocalServerGateDetailOnHub();

  const handleOpenPlGate = (gate: GateRecord) => {
    void (async () => {
      plGateTrace("open_gate_click", { gateId: gate.id, serverUrl: gate.serverUrl });
      setActiveGateId(gate.id);
      setSelectedGateIdForDetail(gate.id);
      if (gateHubMode) {
        const activated = await activateLocalServerGateOnWebClient(gate);
        if (!activated.ok) {
          toast.error("Could not open gate", { description: activated.message });
          return;
        }
        toast.success(`Connected to ${gate.label}`, {
          description: "Companies load here on this tab — server runs in the background via relay.",
        });
        return;
      }
      const result = await openPlServerGatePage(gate);
      if (result === "popup_blocked") {
        toast.error("Popup blocked", {
          description: "Allow popups, then tap Open gate again.",
        });
      }
    })();
  };

  const handleTestPlGateFromHub = (gate: GateRecord) => {
    setTestingId(gate.id);
    void (async () => {
      try {
        const r = await testLocalServerGate(gate.id);
        if (r.ok) {
          toast.success("Server reachable", { description: r.message });
        } else {
          toast.error("Connection test failed", {
            description: describePlGateTestFailure(r.message),
          });
        }
      } finally {
        setTestingId(null);
      }
    })();
  };

  const syncLocalServerGateCompanyListToThisClient = async (gate: GateRecord) => {
    const mirror = await syncPlServerGateToLocalSqlite(gate, { pullFullLedger: false });
    writeServerCompaniesLastRefreshMs(gate);
    await reloadLocalCompanyRegistry();
    return mirror;
  };

  const detailGate = useMemo(
    () => gates.find((g) => g.id === selectedGateIdForDetail) ?? null,
    [gates, selectedGateIdForDetail]
  );
  const showGateDetailPanel = Boolean(
    detailGate && (!isLocalServerGate(detailGate) || !gateHubMode)
  );

  useEffect(() => {
    const onCtx = () => setServerAccessEpoch((n) => n + 1);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onCtx);
  }, []);

  /** Sharing port / remote staff: auto-open gate detail + company list (Open gate landing). */
  useEffect(() => {
    if (!isPlRemoteServerClientMode() && !isPlSharingServerPortOrigin()) return;
    const active = gates.find((g) => g.id === activeGateId && isLocalServerGate(g));
    if (!active) return;
    if (selectedGateIdForDetail !== active.id) {
      setSelectedGateIdForDetail(active.id);
    }
  }, [activeGateId, gates, selectedGateIdForDetail, setSelectedGateIdForDetail]);

  useEffect(() => {
    void purgeOrphanPlServerMirrorCompanies({ firebaseUid: user?.uid ?? null }).then((result) => {
      if (result.removedIds.length > 0) {
        reloadLocalCompanyRegistry();
      }
    });
  }, [user?.uid, reloadLocalCompanyRegistry]);

  useEffect(() => {
    const prefill = readAndStripPlGatePrefillFromLocation();
    if (!prefill) return;
    window.queueMicrotask(() => {
      setShowAdd(true);
      setLabel(prefill.gateLabel || "Shared server");
      const parsed = splitServerAddress(prefill.serverUrl);
      setServerHost(parsed.host);
      setServerPort(parsed.port);
      toast.message("Server invite loaded", {
        description: "Review the prefilled gate and tap Add to connect.",
      });
    });
  }, []);

  const refreshServerCompaniesForGate = useCallback(
    async (
      gate: GateRecord,
      options?: { force?: boolean; showSpinner?: boolean; toastErrors?: boolean }
    ) => {
      if (!isLocalServerGate(gate) || gateHubMode) return;
      const key = `${gate.id}:${normalizeServerUrl(gate.serverUrl || "")}`;
      if (serverCompaniesRefreshInFlightRef.current === key) return;
      if (!options?.force) {
        const last = readServerCompaniesLastRefreshMs(gate);
        if (Date.now() - last < SERVER_COMPANIES_AUTO_REFRESH_MS) return;
      }
      serverCompaniesRefreshInFlightRef.current = key;
      if (options?.showSpinner) setRefreshingServerCompanies(true);
      try {
        const ctx = await refreshActiveLocalServerGateContext(gate);
        if (ctx?.error) {
          if (options?.toastErrors) {
            toast.error("Could not load server companies", { description: ctx.error });
          }
          return;
        }
        writeServerCompaniesLastRefreshMs(gate);
        await reloadLocalCompanyRegistry();
      } finally {
        if (serverCompaniesRefreshInFlightRef.current === key) {
          serverCompaniesRefreshInFlightRef.current = null;
        }
        if (options?.showSpinner) setRefreshingServerCompanies(false);
      }
    },
    [gateHubMode, reloadLocalCompanyRegistry]
  );

  useEffect(() => {
    if (!detailGate || !isLocalServerGate(detailGate)) return;
    if (gateHubMode) return;
    let cancelled = false;
    const runSilentRefresh = () => {
      if (cancelled) return;
      void refreshServerCompaniesForGate(detailGate, {
        force: false,
        showSpinner: false,
        toastErrors: false,
      });
    };
    const initialTimerId = window.setTimeout(runSilentRefresh, 0);
    const intervalId = window.setInterval(runSilentRefresh, SERVER_COMPANIES_AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
    };
  }, [detailGate?.id, detailGate?.serverUrl, gateHubMode, refreshServerCompaniesForGate]);

  const detailCompanies = useMemo(() => {
    void serverAccessEpoch;
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
    void serverAccessEpoch;
    if (!detailGate || !isLocalServerGate(detailGate)) return [];
    const registryForGate = filterSharedOnlyCompaniesForSuperAdminInMainApp(
      allCompaniesRegistry,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      pathname
    );
    return buildPlServerGatePreviewCompanyList(registryForGate, detailGate.id);
  }, [allCompaniesRegistry, detailGate, user, isSuperAdminUser, pathname, serverAccessEpoch]);

  const unlockPickerCompanies = useMemo(() => {
    void serverAccessEpoch;
    const registryForGate = filterSharedOnlyCompaniesForSuperAdminInMainApp(
      allCompaniesRegistry,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      pathname
    );
    const merged = mergePlServerSharedCompaniesIntoRegistry(registryForGate);
    if (!detailGate || !isLocalServerGate(detailGate)) return merged;
    const preview = buildPlServerGatePreviewCompanyList(registryForGate, detailGate.id);
    const byId = new Map(merged.map((c) => [c.id, c]));
    for (const row of preview) {
      const stamped = stampCompanyRowForServerGateUnlock(row, detailGate);
      const prev = byId.get(stamped.id);
      byId.set(stamped.id, prev ? ({ ...prev, ...stamped } as CompanyData) : stamped);
    }
    return [...byId.values()];
  }, [allCompaniesRegistry, detailGate, user, isSuperAdminUser, pathname, serverAccessEpoch]);

  const cancelEdit = () => {
    setEditingGateId(null);
    setEditLabel("");
    setEditServerHost("");
    setEditServerPort("");
  };

  const startEdit = (gate: GateRecord) => {
    if (!isLocalServerGate(gate)) return;
    setShowAdd(false);
    setEditingGateId(gate.id);
    setEditLabel(gate.label);
    const parsed = splitServerAddress(gate.serverUrl || "");
    setEditServerHost(parsed.host);
    setEditServerPort(parsed.port);
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      const rawUrl = buildServerAddress(serverHost, serverPort);
      const resolved = await resolvePlSharingServerUrlForGate(rawUrl, "", { timeoutMs: 8_000 });
      const gate = addLocalServerGate({
        label: label.trim() || "Local server",
        serverUrl: rawUrl,
        accessToken: "",
      });
      writeGateTransportUrl(
        gate.id,
        resolvePlSharingTransportUrl(resolved, rawUrl) || rawUrl
      );
      setActiveGateId(gate.id);
      if (!resolved.capable) {
        toast.warning("Checking server…", {
          description:
            "Sharing port probe skipped — continuing with company list. Use port 3001 if vouchers stay empty.",
        });
      }
      const test = await testLocalServerGate(gate.id);
      if (test.ok && shouldMirrorLocalServerGateOnThisClient && !gateHubMode) {
        const mirror = await syncLocalServerGateCompanyListToThisClient(gate);
        if (mirror.synced > 0) {
          toast.success("Gate added", {
            description: `${mirror.synced} companies synced to this device.`,
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
      setServerHost("");
      setServerPort("");
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
      const rawUrl = buildServerAddress(editServerHost, editServerPort);
      const resolved = await resolvePlSharingServerUrlForGate(rawUrl, "", { timeoutMs: 8_000 });
      const gate = updateLocalServerGate(editingGateId, {
        label: editLabel,
        serverUrl: rawUrl,
        accessToken: "",
      });
      writeGateTransportUrl(
        gate.id,
        resolvePlSharingTransportUrl(resolved, rawUrl) || rawUrl
      );
      setActiveGateId(gate.id);
      if (!resolved.capable) {
        toast.warning("Checking server…", {
          description:
            "Sharing port probe skipped — continuing with company list. Use port 3001 if vouchers stay empty.",
        });
      }
      const test = await testLocalServerGate(editingGateId);
      if (test.ok && shouldMirrorLocalServerGateOnThisClient) {
        const mirror = await syncLocalServerGateCompanyListToThisClient(gate);
        if (mirror.synced > 0) {
          toast.success("Gate updated", {
            description: `${mirror.synced} companies synced to this device.`,
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
        if (shouldOpenPlServerCompanyInNewTab()) {
          setActiveGateId(gate.id);
          toast.success(`Connected to ${gate.label}`, {
            description: "Pick a company below — it opens on the server in a new tab.",
          });
          return;
        }
        setActiveGateId(gate.id);
        setSelectedGateIdForDetail(gate.id);
        connectLocalServerGate(gate.id);
        toast.success(`Connected to ${gate.label}`, {
          description: "Pick a company below — same tab, server via relay.",
        });
      })();
      return;
    }
    setActiveGateId(gate.id);
    toast.success(`Using gate: ${gate.label}`);
  };

  const handlePickCompany = (id: string, gate: GateRecord) => {
    if (isLocalServerGate(gate)) {
      void (async () => {
        setPickingCompanyId(id);
        try {
          let alreadyOnSharingGate = false;
          if (gate.serverUrl) {
            try {
              const gateOrigin = new URL(normalizeServerUrl(gate.serverUrl)).origin;
              alreadyOnSharingGate =
                isPlRemoteServerClientMode() && window.location.origin === gateOrigin;
            } catch {
              alreadyOnSharingGate = false;
            }
          }

          setActiveGateId(gate.id);
          const transportUrl = resolveGateServerTransportUrl(gate) || gate.serverUrl || "";
          if (transportUrl) {
            registerPlServerCompanyTransportHint(id, transportUrl);
            writeGateTransportUrl(gate.id, transportUrl);
          }

          const shouldUseLocalMirrorSameTab =
            useBundledLocalServerGate && !isPlRemoteServerClientMode();

          if (!alreadyOnSharingGate && !shouldUseLocalMirrorSameTab && shouldOpenPlServerCompanyInNewTab()) {
            const result = await openPlServerCompanyFromGateList(id, gate);
            if (result === "popup_blocked") {
              toast.error("Popup blocked", {
                description: "Allow popups for this site, then tap the company again.",
              });
            }
            return;
          }

          if (!alreadyOnSharingGate && isPlRemoteServerClientMode()) {
            const mobileNav = await openPlServerCompanyFromGateList(id, gate);
            if (mobileNav === "navigated_same_window") return;
          }

          const picked = localServerGateCompanies.find((c) => c.id === id);
          const displayName = resolvePlServerGateCompanyDisplayName(
            id,
            gate.id,
            allCompaniesRegistry
          );
          const companyRow: CompanyData =
            picked ??
            stampCompanyRowForServerGateUnlock(
              {
                id,
                name: displayName,
                ownerId: "",
                storageOption: "local",
                plServerShared: true,
                isOwned: false,
              } as CompanyData,
              gate
            );

          plGateTrace("gate_company_pick", { companyId: id, alreadyOnSharingGate });

          const openMirroredCompany = async () => {
            const pulled = await awaitStaffCompanyLedgerPull(id);
            if (!pulled) return;
            await finalizePlServerGateCompanyOpen(id, companyRow, {
              preferredGate: gate,
              reloadLocalCompanyRegistry,
            });
            setCompanyId(id);
            router.push(appNavHref("/dashboard"));
            toast.success(`Opened ${displayName}`);
          };

          const remembered =
            readStoredOfflineUnlockSession(user?.uid, id, user?.email) ||
            readAnyStoredOfflineUnlockSessionForCompany(id);

          if (remembered) {
            setLocalAuthToken(id, remembered.token, remembered.user);
            await openMirroredCompany();
            return;
          }

          if (getLocalAuthToken(id)) {
            await openMirroredCompany();
            return;
          }

          const quickRequiresLogin =
            picked != null ? loginMetaFromSharedSummary(picked)?.requiresLogin : undefined;
          if (quickRequiresLogin === false) {
            grantOpenLocalCompanySession(id, { role: "viewer" });
            await openMirroredCompany();
            return;
          }

          setUnlockPreferredGate(gate);
          setCompanyToUnlock(stampCompanyRowForServerGateUnlock(companyRow, gate));

          void fetchPlServerCompanyLoginMeta(id, {
            gate,
            appEmail: user?.email,
            appUid: user?.uid,
          }).then(async (loginMeta) => {
            if (loginMeta.requiresLogin !== false) return;
            setCompanyToUnlock(null);
            setUnlockPreferredGate(null);
            grantOpenLocalCompanySession(id, { role: "viewer" });
            await openMirroredCompany();
          });
        } finally {
          setPickingCompanyId(null);
        }
      })();
      return;
    }
    setActiveGateId(gate.id);
    setCompanyId(id);
    router.push("/dashboard");
  };

  const handleGateCompanyUnlocked = async (openedId: string, openedName: string) => {
    const wasServerGateUnlock = unlockPreferredGate?.type === "local_server";
    if (wasServerGateUnlock) {
      setActiveGateId(unlockPreferredGate.id);
    }
    setCompanyToUnlock(null);
    setUnlockPreferredGate(null);
    // Server gate: dialog already finalize + navigate on ledger pull start — duplicate refresh/nav avoid.
    if (wasServerGateUnlock) return;
    await reloadLocalCompanyRegistry();
    await refreshPlServerStaffCompanyUiAfterOpen(openedId);
    setCompanyId(openedId);
    router.push(appNavHref("/dashboard"));
    toast.success(`Welcome to ${openedName}`);
  };

  const [onRemoteOrigin] = useState(() =>
    typeof window !== "undefined"
      ? !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname.toLowerCase())
      : false
  );

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

      {!gateHubMode && isPlRemoteServerClientMode() ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm text-sky-950">
            <span>Server gate page — Test and companies run on this sharing URL.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => tryNavigateBackToAppHubForLocalOnlineCompany()}
            >
              Back to app UI
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
              Server IP/URL from the PC owner (Settings / Server). Works on LAN and WAN (port forward).
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
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1">
                <Label htmlFor="gate-host">Server IP / host</Label>
                <Input
                  id="gate-host"
                  placeholder="110.34.23.84"
                  value={serverHost}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^https?:\/\//i.test(value) || value.includes(":")) {
                      const parsed = splitServerAddress(value);
                      setServerHost(parsed.host);
                      if (parsed.port) setServerPort(parsed.port);
                      return;
                    }
                    setServerHost(value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gate-port">Port</Label>
                <Input
                  id="gate-port"
                  inputMode="numeric"
                  placeholder="3001"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                IP/host aur port alag enter karein. Path mat add karein.
              </p>
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
            const hubLocalServer = gateHubMode && isLocalServerGate(gate);
            const rowClass = cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              isDetail && !hubLocalServer ? "border-primary bg-secondary/40" : "hover:bg-muted/40",
              isActive && "ring-1 ring-primary/40"
            );
            return (
              <li key={gate.id}>
                {hubLocalServer ? (
                  <div className={rowClass}>
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
                        {isActive ? <Badge className="bg-primary/90">Active</Badge> : null}
                        {statusBadge(gate)}
                      </div>
                    </div>
                    {editingGateId === gate.id ? (
                      <div className="mt-3">
                        <LocalServerGateEditFields
                          fieldKey={gate.id}
                          editLabel={editLabel}
                          setEditLabel={setEditLabel}
                          editServerHost={editServerHost}
                          setEditServerHost={setEditServerHost}
                          editServerPort={editServerPort}
                          setEditServerPort={setEditServerPort}
                          savingEdit={savingEdit}
                          onSave={() => void handleSaveEdit()}
                          onCancel={cancelEdit}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingId === gate.id}
                            onClick={() => handleTestPlGateFromHub(gate)}
                          >
                            {testingId === gate.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Wifi className="mr-2 h-4 w-4" />
                            )}
                            Test
                          </Button>
                          <Button type="button" size="sm" onClick={() => handleOpenPlGate(gate)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open gate
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => startEdit(gate)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteId(gate.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Open gate connects here on this tab — Google sign-in stays on localhost; server data loads via
                          relay in the background.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => handleSelectGate(gate)} className={rowClass}>
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
                        {isActive ? <Badge className="bg-primary/90">Active</Badge> : null}
                        {statusBadge(gate)}
                      </div>
                    </div>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {showGateDetailPanel && detailGate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{detailGate.label}</CardTitle>
            <CardDescription>
              {isLocalServerGate(detailGate)
                ? "Test connection to load shared companies from this server."
                : "Owned and shared companies on this gate."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingGateId === detailGate.id && isLocalServerGate(detailGate) ? (
              <LocalServerGateEditFields
                fieldKey={`detail-${detailGate.id}`}
                editLabel={editLabel}
                setEditLabel={setEditLabel}
                editServerHost={editServerHost}
                setEditServerHost={setEditServerHost}
                editServerPort={editServerPort}
                setEditServerPort={setEditServerPort}
                savingEdit={savingEdit}
                onSave={() => void handleSaveEdit()}
                onCancel={cancelEdit}
              />
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
                      void (async () => {
                        const r = await testLocalServerGate(detailGate.id);
                        if (!r.ok) {
                          toast.error(r.message);
                          return;
                        }
                        if (shouldMirrorLocalServerGateOnThisClient) {
                          const mirror = await syncLocalServerGateCompanyListToThisClient(detailGate);
                          if (mirror.error) {
                            toast.warning("Server reachable", { description: mirror.error });
                          } else {
                            toast.success("Server reachable", {
                              description: `${mirror.synced} companies loaded from this server.`,
                            });
                          }
                          return;
                        }
                        toast.success(r.message);
                      })().finally(() => setTestingId(null));
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
                  onLogout={handleLogoutCompany}
                />
                <CompanySection
                  title="Shared companies"
                  empty="No shared companies on this gate."
                  companies={detailCompanies.shared}
                  activeCompanyId={companyId}
                  onPick={(id) => handlePickCompany(id, detailGate)}
                  onLogout={handleLogoutCompany}
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
                  empty="No companies yet. Tap Test to check this server, or assign local companies on the server PC."
                  companies={localServerGateCompanies}
                  activeCompanyId={companyId}
                  pickingCompanyId={pickingCompanyId}
                  onPick={(id) => handlePickCompany(id, detailGate)}
                  onLogout={handleLogoutCompany}
                />
                <p className="text-sm text-muted-foreground">
                  {useBundledLocalServerGate && !isPlRemoteServerClientMode()
                    ? "Tap a company to sign in and sync it on this device, or use Use on this device above."
                    : shouldOpenPlServerCompanyInNewTab() && !(useBundledLocalServerGate && !isPlRemoteServerClientMode())
                      ? "Tap a company to open it on the server in a new tab, or use Connect & open above."
                      : "Tap a company to sign in here — same tab, server data via relay."}
                </p>
              </>
            )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <CompanyUnlockDialog
        company={companyToUnlock}
        companies={unlockPickerCompanies}
        preferredGate={unlockPreferredGate}
        pinCompanyId={companyToUnlock?.id ?? null}
        reloadLocalCompanyRegistry={reloadLocalCompanyRegistry}
        onOpenChange={(open) => {
          if (!open) {
            setCompanyToUnlock(null);
            setUnlockPreferredGate(null);
          }
        }}
        onUnlocked={handleGateCompanyUnlocked}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && deletingGateId == null && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove gate?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved server address and locally cached companies from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGateId != null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingGateId != null}
              onClick={async () => {
                if (!deleteId) return;
                const gateToDelete = gates.find((g) => g.id === deleteId) ?? null;
                setDeletingGateId(deleteId);
                try {
                  const removed =
                    gateToDelete?.type === "local_server"
                      ? await removeLocalServerGateCompanies(gateToDelete, {
                          firebaseUid: user?.uid ?? null,
                          firebaseEmail: user?.email ?? null,
                        })
                      : { removedIds: [] as string[] };
                  removeGate(deleteId);
                  if (gateToDelete?.type === "local_server") {
                    await finalizeLocalServerGateRemoval(gateToDelete, removed.removedIds, {
                      clearSelectedCompanyId: setCompanyId,
                      firebaseUid: user?.uid ?? null,
                    });
                    await purgeOrphanPlServerMirrorCompanies({ firebaseUid: user?.uid ?? null });
                  }
                  if (editingGateId === deleteId) cancelEdit();
                  setSelectedGateIdForDetail(null);
                  setDeleteId(null);
                  reloadLocalCompanyRegistry();
                  toast.success("Gate removed", {
                    description:
                      removed.removedIds.length > 0
                        ? `${removed.removedIds.length} server company cache removed from this device.`
                        : "No cached server company rows found for this gate.",
                  });
                } catch (e) {
                  toast.error("Could not remove gate", {
                    description: e instanceof Error ? e.message : "Cleanup failed.",
                  });
                } finally {
                  setDeletingGateId(null);
                }
              }}
            >
              {deletingGateId ? "Removing..." : "Remove"}
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
  pickingCompanyId,
  onPick,
  onLogout,
}: {
  title: string;
  empty: string;
  companies: { id: string; name?: string; isOwned?: boolean }[];
  activeCompanyId: string | null;
  pickingCompanyId?: string | null;
  onPick: (id: string) => void;
  onLogout: (id: string) => void;
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
              <div className={cn("flex items-center", c.id === activeCompanyId && "bg-secondary/50 font-medium")}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                  disabled={pickingCompanyId === c.id}
                  onClick={() => onPick(c.id)}
                >
                <span className="truncate">{c.name || "Company"}</span>
                <span className="ml-2 flex shrink-0 items-center gap-2">
                  {pickingCompanyId === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  {c.id === activeCompanyId ? <Badge variant="secondary">Current</Badge> : null}
                </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mr-1 h-8 w-8 shrink-0"
                  title="Log out from company"
                  aria-label={`Log out from ${c.name || "company"}`}
                  onClick={() => onLogout(c.id)}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
