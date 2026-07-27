
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Building2, PlusCircle, Share2, UserPlus, ChevronDown, KeyRound, Eye, EyeOff, Loader2, Check, LogOut, Server, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteCompanyDialog } from "./DeleteCompanyDialog";
import { ShareCompanyDialog } from "./ShareCompanyDialog";
import { PlServerShareUserDialog } from "./PlServerShareUserDialog";
import { PlServerSharedCompanyUrlDialog } from "./PlServerSharedCompanyUrlDialog";
import { useState, useEffect, useMemo, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { logoutFromCompanyOnThisDevice } from "@/lib/logoutFromCompany";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "../ui/input";
import { toast } from "@/hooks/use-toast";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useEmbeddedLogout } from "@/contexts/EmbeddedLogoutContext";
import { isLocalOnlyMode } from "@/lib/localMode";
import { maybeMarkEmbeddedPendingCompanyDataWarm } from "@/lib/embeddedPendingCompanyWarm";
import {
  grantOpenLocalCompanySession,
  shouldPromptCompanyUnlockAsync,
  showCompanyUserNameField,
  verifyCompanyUnlock,
  isOfflineCompanyStorage,
  isOnlineSharedCompany,
  onlineSharedHasPerUserPassword,
} from "@/lib/companyUnlockGate";
import {
  clearRememberedSharedUnlockUsername,
  readRememberedSharedUnlockUsername,
  saveRememberedSharedUnlockUsername,
} from "@/lib/onlineSharedUnlockRememberUsername";
import { localAuthLoginForCompanyContext } from "@/lib/localCompanyUsers";
import { isLocalCompanyVisibleToAppAccount } from "@/lib/localCompanyMembership";
import { syncPlServerGateToLocalSqlite } from "@/lib/plServerClientCompanyDelta";
import { tryNavigateToPlServerCompanyOnSelect, tryNavigateBackToAppHubForLocalOnlineCompany } from "@/lib/plServerCompanySelectNavigate";
import { companyRowMatchesSelectionId } from "@/lib/plServerHostCompanyId";
import { clearLocalAuth, getLocalAuthToken, setLocalAuthToken } from "@/lib/localApiClient";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import {
  OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS,
  readOfflineUnlockPreferenceDays,
  readStoredOfflineUnlockSession,
  saveOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { RememberCompanyPasswordDurationSelect } from "@/components/company/RememberCompanyPasswordDurationSelect";
import { FirebaseLedgerDataSyncInlineSwitch } from "@/components/layout/FirebaseLedgerDataSyncSidebarSwitch";
import { FirebaseLedgerOnlineCompanySyncList } from "@/components/company/FirebaseLedgerOnlineCompanySyncList";
import {
  readCloudCompanyPasswordUnlockPreferenceDays,
  readCloudCompanyPasswordUnlockSession,
  saveCloudCompanyPasswordUnlockSession,
} from "@/lib/cloudCompanyPasswordUnlockRemember";
import { hasAnySelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { filterSharedOnlyCompaniesForSuperAdminInMainApp } from "@/lib/companySuperAdminFilter";
import { resolveCompanyIsOwnedForUser } from "@/lib/companyOnlineIntegrity";
import { usePathname } from "next/navigation";
import { useGate } from "@/contexts/GateContext";
import { pickGateAwareAutoSelectCompanyId } from "@/lib/gates/gateRuntime";
import { useRestoreCloudUploadLock } from "@/hooks/useRestoreCloudUploadLock";
import { isRestoreCloudUploadLocked, readPendingRestoreCloudPush } from "@/lib/restoreCloudBackgroundSync";
import {
  partitionCompaniesForSelector,
  partitionCompaniesForUnlockDialog,
  defaultSelectorTab,
  ensureSelectedInTabList,
  isSharedOnlineCompany,
  isSharedLocalCompany,
  isServerGateCompany,
  isServerSelectorCompanyRow,
  isStrictLocalUnlockTabCompany,
  isLocalSelectorCompanyRow,
  stampPureLocalDeviceCompanyRow,
  type CompanyListTab,
} from "@/lib/companyStorageKind";
import { normalizeRowForLocalDriveSyncUi } from "@/lib/localCloudSync/companyConfig";
import { scheduleLocalCloudSyncInBackground } from "@/lib/localCloudSync/engine";
import type { DriveSharedJoinCompleteSource } from "@/lib/localCloudSync/driveSharedJoinClient";
import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById } from "@/lib/localCompanyStore";
import { JoinSharedLocalCompanyPanel } from "@/components/company/JoinSharedLocalCompanyPanel";
import {
  getPlServerContextGateId,
  mergePlServerSharedCompaniesIntoRegistry,
  PL_SERVER_ACCESS_CONTEXT_EVENT,
} from "@/lib/plServerAccessContext";
import { activateGate } from "@/lib/gates/gateRuntime";
import { normalizeServerUrl, writeActiveGateId } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyUnlockContextPickers } from "@/components/company/CompanyUnlockContextPickers";
import {
  companyUsesRemotePlServerLogin,
  pickCompanyForUnlockTab,
  prefetchCompanyUnlockUsernameHint,
  resolveCompanyUnlockTab,
  resolveServerGateForCompany,
  unlockTabCompanies,
} from "@/lib/companySelectorGateLabel";

/** Company picker visibility: admin-hidden rows (`movedToAdminRecycleAt`) normal app me na dikhao. */
function isCompanyVisibleInSelector(c: CompanyData): boolean {
  return c.isDeleted !== true && (c as CompanyData & { movedToAdminRecycleAt?: unknown }).movedToAdminRecycleAt == null;
}

/** SSR par port detect nahi hota — mount ke baad origin + bucket re-partition. */
function usePlServerSelectorOriginReady(): { onPlServerOrigin: boolean; originReady: boolean } {
  const [originReady, setOriginReady] = useState(false);
  const [onPlServerOrigin, setOnPlServerOrigin] = useState(false);
  useEffect(() => {
    setOnPlServerOrigin(isPlSharingServerPortOrigin());
    setOriginReady(true);
  }, []);
  return { onPlServerOrigin, originReady };
}

function CompanySelectorTabBar({
  value,
  onChange,
  localCount,
  onlineCount,
  serverCount,
  compact,
}: {
  value: CompanyListTab;
  onChange: (tab: CompanyListTab) => void;
  localCount: number;
  onlineCount: number;
  serverCount: number;
  compact?: boolean;
}) {
  const tabBtn = (tab: CompanyListTab, label: string, count: number) => (
    <button
      key={tab}
      type="button"
      className={cn(
        "flex-1 rounded-sm font-medium transition-colors",
        compact ? "px-1.5 py-1.5 text-[11px]" : "px-2 py-2 text-sm",
        value === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onChange(tab);
      }}
    >
      {label}
      {count > 0 ? ` (${count})` : ""}
    </button>
  );
  return (
    <div
      className={cn(
        "flex w-full gap-1 rounded-md bg-muted p-1",
        compact && "mb-1"
      )}
    >
      {tabBtn("local", "Local", localCount)}
      {tabBtn("server", "Server", serverCount)}
      {tabBtn("online", "Online", onlineCount)}
    </div>
  );
}

function activateGateForServerCompanyIfNeeded(company: CompanyData): void {
  if (!isServerGateCompany(company)) return;
  const gate = resolveServerGateForCompany(company as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string });
  if (gate) {
    writeActiveGateId(gate.id);
    activateGate(gate.id);
    return;
  }
  const gateId = getPlServerContextGateId();
  if (gateId) activateGate(gateId);
}

async function unlockServerGateCompanyFromSelector(
  company: CompanyData,
  username: string,
  password: string,
  rememberDays: number,
  appUser: { uid?: string | null; email?: string | null },
  options?: { onLedgerPullStart?: () => void }
): Promise<{ ok: boolean; error?: string }> {
  const { unlockPlServerStaffCompanyWithLedgerPull } = await import("@/lib/plServerStaffCompanyConnect");
  const gate = resolveServerGateForCompany(company as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string });
  return unlockPlServerStaffCompanyWithLedgerPull(company.id, username, password, {
    plServerGate: gate,
    appUser,
    rememberUnlockDays: rememberDays,
    timeoutMs: 120_000,
    onLedgerPullStart: options?.onLedgerPullStart,
  });
}

/** Static build + shared unlock: show username remember option whenever username-based unlock is used. */
function canRememberCompanyUsername(company: CompanyData, userEmail?: string | null): boolean {
  if (!showCompanyUserNameField(company, userEmail)) return false;
  return isOnlineSharedCompany(company as CompanyData & { isOwned?: boolean }) || isLocalOnlyMode();
}

function handleRememberUsernameCheckboxChange(
  checked: boolean,
  typedUsername: string,
  companyId: string,
  firebaseUid: string | undefined,
  userEmail: string | null | undefined,
  setRemember: (v: boolean) => void
): void {
  setRemember(checked);
  const typed = typedUsername.trim();
  if (checked && typed) {
    saveRememberedSharedUnlockUsername(firebaseUid, companyId, typed, userEmail);
  }
}

function rememberUnlockDaysForCompany(
  company: CompanyData,
  firebaseUid: string | undefined,
  userEmail: string | null | undefined
): number {
  return isOfflineCompanyStorage(company)
    ? readOfflineUnlockPreferenceDays(firebaseUid, company.id, userEmail)
    : readCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, company.id, userEmail);
}

/** Credential dialog: sync hint + async server meta when needed. */
function primeCompanyUnlockDialogFields(
  company: CompanyData,
  appUser: { uid?: string | null; email?: string | null },
  setUsernameInput: Dispatch<SetStateAction<string>>,
  setRememberSharedUsername: (value: boolean) => void,
  options?: { gate?: GateRecord | null }
): void {
  const remembered = canRememberCompanyUsername(company, appUser.email)
    ? readRememberedSharedUnlockUsername(appUser.uid, company.id, appUser.email)
    : null;
  const rowHint = String((company as { usernameHint?: string | null }).usernameHint || "").trim();
  setUsernameInput(remembered ?? rowHint);
  setRememberSharedUsername(!!remembered);
  if (companyUsesRemotePlServerLogin(company) || isServerGateCompany(company)) {
    void prefetchCompanyUnlockUsernameHint(company, appUser, {
      gate: options?.gate,
      allowRememberedUsername: true,
    }).then((hint) => {
      if (hint) setUsernameInput((prev) => prev.trim() || hint);
    });
  }
}

function splitServerAddressForSelector(value: string): { host: string; port: string } {
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

function buildServerAddressForSelector(host: string, port: string): string {
  const cleanHost = String(host || "").trim().replace(/^https?:\/\//i, "").split("/")[0] || "";
  const cleanPort = String(port || "").trim();
  if (!cleanHost || !cleanPort) return "";
  return `http://${cleanHost.replace(/:\d+$/, "")}:${cleanPort}`;
}

/** Avoid exposing an internal company UUID while server metadata is warming. */
function companyDisplayName(company: Pick<CompanyData, "id" | "name"> | null | undefined): string {
  if (!company) return "";
  const name = String(company.name || "").trim();
  const id = String(company.id || "").trim();
  return name && name !== id ? name : "Server company";
}

function normalizedEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function serverCompanyOwnerEmail(company: CompanyData, ownerNames: Record<string, string>): string {
  return String(company.ownerEmail || ownerNames[company.ownerId] || "").trim();
}

function isMyServerCompany(company: CompanyData, currentEmail?: string | null): boolean {
  const email = normalizedEmail(currentEmail);
  if (!email) return false;
  return normalizedEmail(company.ownerEmail) === email;
}

function prefillPlServerConnectFieldsFromGate(
  serverUrl: string | null | undefined,
  setServerHost: (v: string) => void,
  setServerPort: (v: string) => void
): void {
  const url = String(serverUrl || "").trim();
  if (!url) return;
  const parsed = splitServerAddressForSelector(url);
  if (!parsed.host) return;
  setServerHost(parsed.host);
  setServerPort(parsed.port || "3001");
}

const GoogleDriveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 512 512">
      <path d="M339 339l-22.5-39h-73l-22.5 39H339zm-10.5-52.5l-40.5-70.5h-45l-40.5 70.5h126z" fill="#26a65b"/>
      <path d="M139.5 286.5l-40.5-70.5-22.5 39-22.5 39 63 111 63-111-22.5-39z" fill="#fcc10a"/>
      <path d="M372.5 216l-63 111 63-111-63-111h126l-63 111z" fill="#1e88e5"/>
  </svg>
);


export function CompanySelector({ companies: initialCompanies }: { companies: CompanyData[] }) {
  const { requestEmbeddedLogout } = useEmbeddedLogout();
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isSuperAdminUser = customUser?.role === "SuperAdmin" || isSuperAdminByEmail;
  // Local mode: list useCompany context se (local DB + mirror) — alag listLocalCompanies se sab ko isOwned true galat tha.
  const {
    setCompanyId,
    clearCompanyId,
    companyId,
    allCompanies: contextCompanies,
    allCompaniesRegistry,
    loading: contextCompanyLoading,
    triggerSync,
    reloadLocalCompanyRegistry,
    localCompanyRegistryEpoch,
  } = useCompany();

  const handleLogoutCompany = useCallback((id: string) => {
    logoutFromCompanyOnThisDevice(id, user);
    if (companyId === id) clearCompanyId({ force: true });
    toast({ title: "Logged out from company", description: "Saved company password was reset on this device." });
  }, [clearCompanyId, companyId, user]);
  const {
    gates,
    activeGate,
    setActiveGateId,
    addLocalServerGate,
    testLocalServerGate,
    connectLocalServerGate,
  } = useGate();
  const hasLocalServerGate = useMemo(() => gates.some((g) => g.type === "local_server"), [gates]);
  const { onPlServerOrigin, originReady } = usePlServerSelectorOriginReady();
  const usePlServerCompanyMerge = hasLocalServerGate || onPlServerOrigin;
  const localServerGates = useMemo(() => gates.filter((g) => g.type === "local_server"), [gates]);
  const [serverGateLabel, setServerGateLabel] = useState("");
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState("3001");
  useEffect(() => {
    if (!originReady || !onPlServerOrigin || serverHost.trim()) return;
    const gate =
      localServerGates.find((g) => g.id === activeGate?.id) ??
      localServerGates[0] ??
      (activeGate?.type === "local_server" ? activeGate : null);
    prefillPlServerConnectFieldsFromGate(
      gate?.serverUrl || (typeof window !== "undefined" ? window.location.origin : ""),
      setServerHost,
      setServerPort
    );
  }, [originReady, onPlServerOrigin, localServerGates, activeGate, serverHost]);
  const [serverGateBusy, setServerGateBusy] = useState(false);
  const [serverGateBusyId, setServerGateBusyId] = useState<string | null>(null);
  const [driveJoinOpen, setDriveJoinOpen] = useState(true);
  const [dialogState, setDialogState] = useState<{
    type: "share" | "addLocalUser" | "delete" | "plServerUrl" | null;
    company: CompanyData | null;
  }>({ type: null, company: null });
  const [companies, setCompanies] = useState<CompanyData[]>(() =>
    (initialCompanies ?? []).filter(isCompanyVisibleInSelector)
  );

  const parentCompaniesListSig = useMemo(
    () =>
      (initialCompanies ?? [])
        .map((c) => {
          const co = c as CompanyData & { storageOption?: string };
          return `${c.id}\0${c.name ?? ""}\0${String(co.storageOption ?? "")}\0${Boolean((c as CompanyData & { isOwned?: boolean }).isOwned)}`;
        })
        .join("|"),
    [initialCompanies]
  );

  // States for password dialog
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** Offline unlock: kitne din tak dubara password mat poochna (localStorage session). */
  const [rememberUnlockDays, setRememberUnlockDays] = useState(0);
  /** Shared cloud unlock: sirf username yaad — `onlineSharedUnlockRememberUsername`. */
  const [rememberSharedUsername, setRememberSharedUsername] = useState(false);
  const [unlockListTab, setUnlockListTab] = useState<CompanyListTab>("local");
  const unlockTabPinnedRef = useRef(false);
  const unlockDialogCompanyIdRef = useRef<string | null>(null);
  const remoteAutoUnlockAttemptedRef = useRef(false);

  const syncServerGateToCompanySelector = useCallback(
    async (gate: GateRecord) => {
      const result = await syncPlServerGateToLocalSqlite(gate, { pullFullLedger: true });
      await reloadLocalCompanyRegistry();
      return result;
    },
    [reloadLocalCompanyRegistry]
  );

  const handleAddServerGateFromSelector = useCallback(async () => {
    const serverUrl = buildServerAddressForSelector(serverHost, serverPort);
    if (!serverUrl) {
      toast({
        variant: "destructive",
        title: "Server gate",
        description: "Enter server IP/host and port.",
      });
      return;
    }
    setServerGateBusy(true);
    try {
      const gate = addLocalServerGate({
        label: serverGateLabel.trim() || "Local server",
        serverUrl,
        accessToken: "",
      });
      setActiveGateId(gate.id);
      const test = await testLocalServerGate(gate.id);
      if (!test.ok) {
        toast({
          variant: "destructive",
          title: "Gate saved, but not reachable",
          description: test.message,
        });
        return;
      }
      const synced = await syncServerGateToCompanySelector(gate);
      toast({
        title: "Server connected",
        description:
          synced.synced > 0
            ? `${synced.synced} companies loaded from server.`
            : test.message,
      });
      setServerGateLabel("");
      setServerHost("");
      setServerPort("3001");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Server gate",
        description: e instanceof Error ? e.message : "Could not connect server.",
      });
    } finally {
      setServerGateBusy(false);
    }
  }, [
    addLocalServerGate,
    serverGateLabel,
    serverHost,
    serverPort,
    setActiveGateId,
    syncServerGateToCompanySelector,
    testLocalServerGate,
  ]);

  const handleUseServerGateFromSelector = useCallback(
    async (gate: GateRecord, openRemotePage: boolean) => {
      setServerGateBusyId(gate.id);
      try {
        setActiveGateId(gate.id);
        const test = await testLocalServerGate(gate.id);
        if (!test.ok) {
          toast({
            variant: "destructive",
            title: "Cannot connect",
            description: test.message,
          });
          return;
        }
        if (openRemotePage) {
          connectLocalServerGate(gate.id);
          return;
        }
        const synced = await syncServerGateToCompanySelector(gate);
        toast({
          title: "Server synced",
          description:
            synced.synced > 0
              ? `${synced.synced} companies loaded from server.`
              : "Pick a server company below.",
        });
        setListTab("server");
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Server gate",
          description: e instanceof Error ? e.message : "Could not connect server.",
        });
      } finally {
        setServerGateBusyId(null);
      }
    },
    [
      connectLocalServerGate,
      setActiveGateId,
      syncServerGateToCompanySelector,
      testLocalServerGate,
    ]
  );

  useEffect(() => {
    if (remoteAutoUnlockAttemptedRef.current) return;
    const preselect = readSelectedCompanyId()?.trim();
    if (!preselect) return;
    const co = companies.find((c) => c.id === preselect);
    if (!co || !isOfflineCompanyStorage(co)) return;
    const remembered = readStoredOfflineUnlockSession(user?.uid, co.id, user?.email);
    if (remembered) {
      if (!getLocalAuthToken(preselect)) {
        setLocalAuthToken(preselect, remembered.token, remembered.user);
      }
      remoteAutoUnlockAttemptedRef.current = true;
      return;
    }
    if (getLocalAuthToken(preselect)) return;
    remoteAutoUnlockAttemptedRef.current = true;
    void (async () => {
      if (await shouldPromptCompanyUnlockAsync(co, user?.email, user?.uid)) {
        setCompanyToUnlock(co);
        setPasswordInput("");
        setRememberUnlockDays(rememberUnlockDaysForCompany(co, user?.uid, user?.email));
        primeCompanyUnlockDialogFields(co, { uid: user?.uid, email: user?.email }, setUsernameInput, setRememberSharedUsername);
      }
    })();
  }, [companies, user?.email, user?.uid]);

  useEffect(() => {
    const shareUser = { uid: user?.uid || "", email: user?.email ?? null };
    const resolveOwned = (c: CompanyData) =>
      user?.uid ? resolveCompanyIsOwnedForUser(c, shareUser) : Boolean(c.isOwned);

    const mergeIntoMap = (map: Map<string, CompanyData>, rows: CompanyData[]) => {
      rows.forEach((c) => {
        if (!isCompanyVisibleInSelector(c)) return;
        map.set(c.id, {
          ...c,
          isOwned: resolveOwned(c),
        });
      });
    };

    const registryRows =
      (allCompaniesRegistry?.length ? allCompaniesRegistry : null) ??
      (contextCompanies?.length ? contextCompanies : null) ??
      [];
    if (!user && registryRows.length === 0 && !(initialCompanies?.length ?? 0)) {
      setCompanies([]);
      return;
    }
    const map = new Map<string, CompanyData>();
    mergeIntoMap(map, (initialCompanies ?? []).filter(isCompanyVisibleInSelector));
    // Picker: gate-filtered `allCompanies` nahi — registry (local + online) taaki APK/tablet PC = EXE.
    registryRows.forEach((c) => {
      if (!isCompanyVisibleInSelector(c)) return;
      if (isLocalSelectorCompanyRow(c)) {
        const driveSharedJoin =
          (c as CompanyData & { driveSharedJoin?: boolean }).driveSharedJoin === true;
        const normalized = normalizeRowForLocalDriveSyncUi({
          ...(c as CompanyData),
          id: c.id,
          name: typeof c.name === "string" ? c.name : c.id,
        });
        map.set(c.id, {
          ...normalized,
          isOwned: driveSharedJoin ? false : resolveOwned(c),
        });
        return;
      }
      map.set(c.id, {
        ...c,
        isOwned: resolveOwned(c),
      });
    });
    setCompanies(Array.from(map.values()));
  }, [user, allCompaniesRegistry, contextCompanies, contextCompanyLoading, parentCompaniesListSig, initialCompanies]);

  /** SQLite registry — Drive restore/join rows Firestore list me na hon to bhi Local tab me dikhao. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await listLocalCompanies();
      if (cancelled) return;
      const shareUser = { uid: user?.uid || "", email: user?.email ?? null };
      const resolveOwned = (c: CompanyData) =>
        user?.uid ? resolveCompanyIsOwnedForUser(c, shareUser) : Boolean(c.isOwned);
      setCompanies((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const row of rows) {
          if (localCompanyRowIsDeleted(row)) continue;
          if (user && !isLocalCompanyVisibleToAppAccount(row, user)) {
            map.delete(row.id);
            continue;
          }
          if (!isLocalSelectorCompanyRow(row as CompanyData)) continue;
          const driveSharedJoin = (row as { driveSharedJoin?: boolean }).driveSharedJoin === true;
          const normalized = normalizeRowForLocalDriveSyncUi({
            ...(row as CompanyData),
            id: row.id,
            name: typeof row.name === "string" ? row.name : row.id,
          });
          const forSelector = {
            ...normalized,
            isOwned: driveSharedJoin ? false : resolveOwned(row as CompanyData),
          };
          if (!isCompanyVisibleInSelector(forSelector)) continue;
          map.set(row.id, forSelector);
        }
        return Array.from(map.values());
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email, localCompanyRegistryEpoch, parentCompaniesListSig]);


  const handleSelectCompany = async (
    company: CompanyData,
    options?: { forceUnlockPrompt?: boolean }
  ) => {
    activateGateForServerCompanyIfNeeded(company);
    if (!isServerGateCompany(company)) {
      if (tryNavigateBackToAppHubForLocalOnlineCompany(company.id)) return;
    }
    if (isServerGateCompany(company)) {
      const navResult = await tryNavigateToPlServerCompanyOnSelect(company);
      if (navResult === "opened_new_tab" || navResult === "navigated_same_window") return;
      if (navResult === "popup_blocked") {
        toast({
          variant: "destructive",
          title: "Popup blocked",
          description: "Allow popups for this site, then select the server company again.",
        });
        return;
      }
    }
    if (isRestoreCloudUploadLocked()) {
      const job = readPendingRestoreCloudPush();
      if (job && job.companyId !== company.id) {
        toast({
          variant: "destructive",
          title: "Cloud upload in progress",
          description: "Wait until the header upload bar reaches 100% before switching to another company.",
        });
        return;
      }
    }
    const forceUnlockPrompt = options?.forceUnlockPrompt === true;
    if (isOfflineCompanyStorage(company) && !forceUnlockPrompt) {
      const remembered =
        readStoredOfflineUnlockSession(user?.uid, company.id, user?.email);
      if (remembered) {
        setLocalAuthToken(company.id, remembered.token, remembered.user);
        setCompanyId(company.id);
        router.push("/dashboard");
        return;
      }
    }
    // Online company: pehle se valid "remember company password" window — dialog skip
    if (isServerGateCompany(company)) {
      if (!forceUnlockPrompt && getLocalAuthToken(company.id)) {
        const gate = resolveServerGateForCompany(
          company as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string }
        );
        const { ensurePlServerHubGateReadyForStaffConnect, preparePlServerStaffCompanyConnect } = await import(
          "@/lib/plServerStaffCompanyConnect"
        );
        const { plServerCompanyLedgerNeedsFullPull } = await import("@/lib/plServerLedgerDeltaGate");
        await ensurePlServerHubGateReadyForStaffConnect(gate);
        if (await plServerCompanyLedgerNeedsFullPull(company.id)) {
          const pulled = await preparePlServerStaffCompanyConnect(company.id, {
            pullFullLedger: true,
            timeoutMs: 120_000,
            plServerGate: gate,
          });
          if (!pulled.ok) {
            toast({
              variant: "destructive",
              title: "Could not load company data",
              description: "Server ledger sync failed. Try Gate → Test, then open the company again.",
            });
            return;
          }
        }
        setCompanyId(company.id);
        router.push("/dashboard");
        return;
      }
      if (
        !forceUnlockPrompt &&
        !(await shouldPromptCompanyUnlockAsync(company, user?.email, user?.uid, false))
      ) {
        setCompanyId(company.id);
        router.push("/dashboard");
        return;
      }
      setCompanyToUnlock(company);
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(company, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(company, { uid: user?.uid, email: user?.email }, setUsernameInput, setRememberSharedUsername);
      return;
    }
    if (
      !isOfflineCompanyStorage(company) &&
      readCloudCompanyPasswordUnlockSession(user?.uid, company.id, user?.email)
    ) {
      // APK/static: data warm overlay queue — `FirstDeviceCompanyHydrationOverlay` session flag.
      maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, company);
      setCompanyId(company.id);
      router.push("/dashboard");
      return;
    }
    if (await shouldPromptCompanyUnlockAsync(company, user?.email, user?.uid, forceUnlockPrompt)) {
      setCompanyToUnlock(company);
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(company, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(company, { uid: user?.uid, email: user?.email }, setUsernameInput, setRememberSharedUsername);
    } else {
      if (isOfflineCompanyStorage(company)) {
        grantOpenLocalCompanySession(company.id, {
          role: isServerGateCompany(company)
            ? "manager"
            : resolveCompanyIsOwnedForUser(company, {
                uid: user?.uid || "",
                email: user?.email ?? null,
              })
              ? "owner"
              : "viewer",
        });
      }
      maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, company);
      setCompanyId(company.id);
      router.push("/dashboard");
    }
  };

  const handlePasswordSubmit = async () => {
    if (!companyToUnlock) return;
    setIsVerifying(true);
    try {
      const row = companyToUnlock as CompanyData & { isOwned?: boolean };
      // Local/offline company: hamesha user identify (username+password) — sirf company password se "koi bhi" unlock nahi.
      if (isOfflineCompanyStorage(row)) {
        const u = usernameInput.trim();
        const p = passwordInput.trim();
        if (!u || !p) {
          toast({
            variant: "destructive",
            title: "Company access",
            description: "Enter both login username and password.",
          });
          return;
        }
        if (isServerGateCompany(row)) {
          const openedId = companyToUnlock.id;
          const openedName = companyDisplayName(companyToUnlock);
          const rememberDays = rememberUnlockDays;
          let ledgerPullStarted = false;
          const closeUnlockOnLoadStart = () => {
            ledgerPullStarted = true;
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberUnlockDays(0);
            setIsVerifying(false);
            grantOpenLocalCompanySession(openedId, { role: "manager" });
            activateGateForServerCompanyIfNeeded(row);
            setCompanyId(openedId);
            router.push("/dashboard");
            toast({
              title: "Loading company",
              description: "Syncing masters & vouchers from server…",
            });
          };
          const unlocked = await unlockServerGateCompanyFromSelector(row, u, p, rememberDays, {
            uid: user?.uid,
            email: user?.email,
          }, { onLedgerPullStart: closeUnlockOnLoadStart });
          if (!unlocked.ok) {
            toast({
              variant: "destructive",
              title: ledgerPullStarted ? "Could not sync company" : "Could not open company",
              description: unlocked.error || "Sync failed.",
            });
            return;
          }
          toast({ title: "Access Granted", description: `Welcome to ${openedName}.` });
          return;
        }
        const { token, user: localUser } = await localAuthLoginForCompanyContext(companyToUnlock.id, u, p, {
          appUser: { uid: user?.uid, email: user?.email },
          forcePlServerRemote: companyUsesRemotePlServerLogin(row),
        });
        setLocalAuthToken(companyToUnlock.id, token, localUser);
        saveOfflineUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays, token, localUser, user?.email);
        try {
          const reg = await getLocalCompanyById(companyToUnlock.id);
          if (reg && (reg as { cloudSyncEnabled?: boolean }).cloudSyncEnabled === true) {
            scheduleLocalCloudSyncInBackground(companyToUnlock.id, { force: true });
          }
        } catch {
          /* ignore */
        }
        toast({ title: "Access Granted", description: `Welcome to ${companyToUnlock.name}.` });
        setCompanyId(companyToUnlock.id);
        setCompanyToUnlock(null);
        setUsernameInput("");
        setPasswordInput("");
        setRememberUnlockDays(0);
        router.push("/dashboard");
        return;
      }

      const result = verifyCompanyUnlock(row, user?.email, usernameInput, passwordInput);
      if (result.ok) {
        if (!isOfflineCompanyStorage(row)) {
          saveCloudCompanyPasswordUnlockSession(
            user?.uid,
            companyToUnlock.id,
            rememberUnlockDays,
            user?.email
          );
        }
        if (canRememberCompanyUsername(companyToUnlock, user?.email)) {
          if (rememberSharedUsername) {
            saveRememberedSharedUnlockUsername(
              user?.uid,
              companyToUnlock.id,
              usernameInput.trim(),
              user?.email
            );
          } else {
            clearRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id, user?.email);
          }
        }
        clearLocalAuth(companyToUnlock.id);
        toast({ title: "Access Granted", description: `Welcome to ${companyToUnlock.name}.` });
        if (!isOfflineCompanyStorage(row)) {
          maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, companyToUnlock);
        }
        setCompanyId(companyToUnlock.id);
        setCompanyToUnlock(null);
        setUsernameInput("");
        setPasswordInput("");
        setRememberSharedUsername(false);
        router.push("/dashboard");
      } else {
        toast({
          variant: "destructive",
          title: "Company access",
          description: "message" in result ? result.message : "Access denied.",
        });
        setPasswordInput("");
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Company access",
        description: e instanceof Error ? e.message : "Login failed.",
      });
      setPasswordInput("");
    } finally {
      setIsVerifying(false);
    }
  };

  const allCompanies = useMemo(() => {
    const companyMap = new Map<string, CompanyData>();
    const shareUser = { uid: user?.uid || "", email: user?.email ?? null };
    companies.forEach(c => {
        if (c.isDeleted) return;
        if (!companyMap.has(c.id)) {
            companyMap.set(c.id, {
              ...c,
              isOwned: user?.uid ? resolveCompanyIsOwnedForUser(c, shareUser) : Boolean(c.isOwned),
            });
        }
    });
    const merged = Array.from(companyMap.values());
    return filterSharedOnlyCompaniesForSuperAdminInMainApp(
      merged,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      pathname
    );
  }, [companies, user, isSuperAdminUser, pathname]);

  const selectorCompanies = useMemo(() => {
    const base = usePlServerCompanyMerge
      ? allCompanies
      : allCompanies.filter((c) => !isServerGateCompany(c));
    return usePlServerCompanyMerge ? mergePlServerSharedCompaniesIntoRegistry(base) : base;
  }, [allCompanies, usePlServerCompanyMerge]);
  const unlockPickerCompanies = useMemo(() => {
    if (selectorCompanies.length > 0) return selectorCompanies;
    if (companyToUnlock) return [companyToUnlock];
    return [];
  }, [selectorCompanies, companyToUnlock]);
  const [serverContextEpoch, setServerContextEpoch] = useState(0);
  useEffect(() => {
    const onServerCtx = () => setServerContextEpoch((n) => n + 1);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
  }, []);
  const buckets = useMemo(
    () => partitionCompaniesForSelector(selectorCompanies),
    [selectorCompanies, serverContextEpoch, originReady]
  );
  const {
    localTabCompanies,
    onlineTabCompanies,
    serverTabCompanies,
  } = buckets;
  const localList = useMemo(
    () =>
      ensureSelectedInTabList(localTabCompanies, companyId, selectorCompanies, "local").filter(
        isStrictLocalUnlockTabCompany
      ),
    [localTabCompanies, companyId, selectorCompanies]
  );
  const onlineList = useMemo(
    () =>
      ensureSelectedInTabList(onlineTabCompanies, companyId, selectorCompanies, "online").filter(
        (c) => !isServerSelectorCompanyRow(c)
      ),
    [onlineTabCompanies, companyId, selectorCompanies]
  );
  const serverList = useMemo(
    () => {
      const rows = ensureSelectedInTabList(serverTabCompanies, companyId, selectorCompanies, "server");
      const byId = new Map(rows.map((c) => [c.id, c]));
      for (const c of selectorCompanies) {
        if (isServerGateCompany(c)) byId.set(c.id, c);
      }
      return Array.from(byId.values());
    },
    [serverTabCompanies, companyId, selectorCompanies]
  );
  const myLocalDisplay = useMemo(() => localList.filter((c) => c.isOwned), [localList]);
  const sharedLocalDisplay = useMemo(
    () => localList.filter((c) => isSharedLocalCompany(c)),
    [localList]
  );
  const myServerDisplay = useMemo(
    () => serverList.filter((c) => isMyServerCompany(c, user?.email)),
    [serverList, user?.email]
  );
  const serverSharedDisplay = useMemo(
    () => serverList.filter((c) => !isMyServerCompany(c, user?.email)),
    [serverList, user?.email]
  );
  const myOnlineDisplay = useMemo(() => onlineList.filter((c) => c.isOwned), [onlineList]);
  const sharedOnlineDisplay = useMemo(
    () => onlineList.filter((c) => isSharedOnlineCompany(c)),
    [onlineList]
  );

  useEffect(() => {
    if (!companyToUnlock) {
      unlockTabPinnedRef.current = false;
      unlockDialogCompanyIdRef.current = null;
      return;
    }
    const openId = companyToUnlock.id;
    if (unlockDialogCompanyIdRef.current !== openId) {
      unlockDialogCompanyIdRef.current = openId;
      unlockTabPinnedRef.current = false;
    }
    if (unlockTabPinnedRef.current) return;
    const unlockBuckets = partitionCompaniesForUnlockDialog(unlockPickerCompanies);
    setUnlockListTab(resolveCompanyUnlockTab(companyToUnlock, unlockBuckets));
  }, [companyToUnlock?.id, unlockPickerCompanies, companyToUnlock]);

  const unlockTabHasSelectedCompany = useMemo(() => {
    if (!companyToUnlock) return false;
    const unlockBuckets = partitionCompaniesForUnlockDialog(unlockPickerCompanies);
    return unlockTabCompanies(unlockBuckets, unlockListTab).some((c) => c.id === companyToUnlock.id);
  }, [companyToUnlock, unlockPickerCompanies, unlockListTab]);

  const closeUnlockDialog = useCallback(() => {
    unlockTabPinnedRef.current = false;
    unlockDialogCompanyIdRef.current = null;
    setCompanyToUnlock(null);
    setUsernameInput("");
    setPasswordInput("");
    setRememberSharedUsername(false);
  }, []);

  const switchUnlockDialogCompany = useCallback(
    (next: CompanyData, tab?: CompanyListTab) => {
      activateGateForServerCompanyIfNeeded(next);
      setCompanyToUnlock(next);
      if (tab) {
        unlockTabPinnedRef.current = true;
        setUnlockListTab(tab);
      }
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(next, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(
        next,
        { uid: user?.uid, email: user?.email },
        setUsernameInput,
        setRememberSharedUsername
      );
    },
    [user?.uid, user?.email]
  );

  const handleUnlockTabChange = useCallback(
    (tab: CompanyListTab) => {
      unlockTabPinnedRef.current = true;
      const next = pickCompanyForUnlockTab(unlockPickerCompanies, tab, companyToUnlock?.id ?? null);
      if (!next) {
        setUnlockListTab(tab);
        return;
      }
      switchUnlockDialogCompany(next, tab);
    },
    [unlockPickerCompanies, companyToUnlock?.id, switchUnlockDialogCompany]
  );

  const handleUnlockCompanyChange = useCallback(
    (next: CompanyData) => {
      unlockTabPinnedRef.current = true;
      switchUnlockDialogCompany(next, unlockListTab);
    },
    [switchUnlockDialogCompany, unlockListTab]
  );

  const [listTab, setListTab] = useState<CompanyListTab>(() => defaultSelectorTab(companyId, buckets));
  const prevCompanyIdForTabRef = useRef(companyId);
  const originTabSyncedRef = useRef(false);
  const manualListTabRef = useRef(false);
  const handleListTabChange = useCallback((tab: CompanyListTab) => {
    manualListTabRef.current = true;
    setListTab(tab);
  }, []);

  useEffect(() => {
    if (!originReady || !onPlServerOrigin || originTabSyncedRef.current || manualListTabRef.current) return;
    originTabSyncedRef.current = true;
    setListTab(defaultSelectorTab(companyId, buckets));
  }, [originReady, onPlServerOrigin, buckets, companyId]);

  useEffect(() => {
    if (prevCompanyIdForTabRef.current === companyId) return;
    prevCompanyIdForTabRef.current = companyId;
    if (manualListTabRef.current) return;
    setListTab(defaultSelectorTab(companyId, buckets));
  }, [companyId, buckets]);

  const handleLogout = () => {
    requestEmbeddedLogout();
  };

  const handleDriveCompanyJoined = async (
    joinedCompanyId: string,
    source?: DriveSharedJoinCompleteSource
  ) => {
    setDriveJoinOpen(false);
    const id = String(joinedCompanyId || "").trim();
    if (!id) return;

    const shareUser = { uid: user?.uid || "", email: user?.email ?? null };
    const buildFromSqlite = async (): Promise<CompanyData | null> => {
      try {
        const row = await getLocalCompanyById(id);
        if (!row) return null;
        const driveSharedJoin = (row as { driveSharedJoin?: boolean }).driveSharedJoin === true;
        const normalized = normalizeRowForLocalDriveSyncUi({
          ...(row as CompanyData),
          id: row.id,
          name: typeof row.name === "string" ? row.name : row.id,
        });
        return {
          ...normalized,
          isOwned: driveSharedJoin
            ? false
            : user?.uid
              ? resolveCompanyIsOwnedForUser(normalized as CompanyData, shareUser)
              : Boolean((normalized as CompanyData).isOwned),
        };
      } catch {
        return null;
      }
    };

    let co =
      companies.find((c) => c.id === id) ??
      selectorCompanies.find((c) => c.id === id) ??
      null;
    if (source === "select" || source === "join" || source === "resync") {
      co = (await buildFromSqlite()) ?? co;
    } else if (!co) {
      co = await buildFromSqlite();
    }
    if (co) {
      await handleSelectCompany(co, { forceUnlockPrompt: source === "select" });
      return;
    }
    setCompanyId(id);
    router.push("/dashboard");
  };

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const activeSharedCompaniesForOwnerLookup = useMemo(() => {
    if (listTab === "local") return sharedLocalDisplay;
    if (listTab === "server") return serverSharedDisplay;
    return sharedOnlineDisplay;
  }, [listTab, sharedLocalDisplay, serverSharedDisplay, sharedOnlineDisplay]);
  const sharedOwnerIdsKey = useMemo(
    () =>
      [...new Set(activeSharedCompaniesForOwnerLookup.map((c) => c.ownerId).filter(Boolean))]
        .sort()
        .join(","),
    [activeSharedCompaniesForOwnerLookup]
  );
  useEffect(() => {
    if (!sharedOwnerIdsKey) return;
    const ownerIds = sharedOwnerIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    const map: Record<string, string> = {};
    Promise.all(
      ownerIds.map(async (ownerId) => {
        try {
          const snap = await getDoc(doc(firestore, "users", ownerId));
          if (cancelled) return;
          const name = snap.exists() ? (snap.data()?.displayName || snap.data()?.email || "") : "";
          if (name) map[ownerId] = name;
        } catch {
          // ignore
        }
      })
    ).then(() => {
      if (!cancelled) setOwnerNames((prev) => ({ ...prev, ...map }));
    });
    return () => { cancelled = true; };
  }, [sharedOwnerIdsKey]);

  const CompanyItem = ({ company }: { company: CompanyData }) => {
    // Offline/local owned: Share ki jagah Add User (local API company user) — online owned par Share = Firestore share
    const offlineOwned = company.isOwned && isOfflineCompanyStorage(company);
    const isSelected = company.id === companyId;
    return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50",
        isSelected && "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
      )}
    >
      <button
        className="flex flex-1 items-center gap-4 text-left"
        onClick={() => handleSelectCompany(company)}
      >
        <Building2 className="h-6 w-6 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-lg font-medium">{companyDisplayName(company)}</span>
        {isSelected ? <Check className="h-5 w-5 shrink-0 text-green-600" aria-label="Selected" /> : null}
      </button>
      <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronDown className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                  {company.isOwned ? <DropdownMenuItem
                    onSelect={() =>
                      offlineOwned
                        ? setDialogState({ type: "addLocalUser", company })
                        : setDialogState({ type: "share", company })
                    }
                  >
                      {offlineOwned ? (
                        <UserPlus className="mr-2 h-4 w-4" />
                      ) : (
                        <Share2 className="mr-2 h-4 w-4"/>
                      )}
                      {offlineOwned ? "Add Person" : "Share"}
                  </DropdownMenuItem> : null}
                  {company.isOwned ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => handleLogoutCompany(company.id)}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out from company
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenu>
    </div>
    );
  };

  return (
    <>
      <div className="flex h-dvh max-h-dvh min-h-0 items-center justify-center overflow-hidden bg-background p-3 sm:p-4">
        <Card className="flex h-[90dvh] max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-1 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="font-headline text-2xl">Select a Company</CardTitle>
                <CardDescription>
                  Choose which company you want to work on, or create a new one.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-end sm:self-start"
                onClick={() => void handleLogout()}
                aria-label="Log out"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <Tabs
              value={listTab}
              onValueChange={(v) => handleListTabChange(v as CompanyListTab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="local">
                  Local{localList.length > 0 ? ` (${localList.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="server">
                  Server{serverList.length > 0 ? ` (${serverList.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="online">
                  Online{onlineList.length > 0 ? ` (${onlineList.length})` : ""}
                </TabsTrigger>
              </TabsList>
              {listTab === "local" ? (
              <TabsContent value="local" className="mt-4 space-y-4">
                {localList.length > 0 ? (
                  <div className="space-y-5">
                    {myLocalDisplay.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground">My local companies</h3>
                        <ul className="space-y-3">
                          {myLocalDisplay.map((company) => (
                            <li key={company.id}>
                              <CompanyItem company={company} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {sharedLocalDisplay.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Shared local companies</h3>
                        <ul className="space-y-3">
                          {sharedLocalDisplay.map((company) => (
                            <li key={company.id} className="space-y-1">
                              <CompanyItem company={company} />
                              {(company.ownerEmail || ownerNames[company.ownerId]) ? (
                                <p className="pl-10 text-xs text-muted-foreground">
                                  Shared by:{" "}
                                  {ownerNames[company.ownerId]
                                    ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})`
                                    : company.ownerEmail || ""}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                    No local company on this device yet. Use Google Drive below to restore or join a shared company.
                  </p>
                )}

                <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-muted/40"
                    onClick={() => setDriveJoinOpen((open) => !open)}
                  >
                    <span className="flex items-center gap-2">
                      <GoogleDriveIcon />
                      Join / restore from Google Drive
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", driveJoinOpen && "rotate-180")} />
                  </button>
                  {driveJoinOpen ? (
                    <JoinSharedLocalCompanyPanel
                      embedded
                      active={listTab === "local"}
                      returnPath="/company"
                      onJoined={handleDriveCompanyJoined}
                      className="border-0 bg-transparent p-0 shadow-none"
                    />
                  ) : null}
                </div>
              </TabsContent>
              ) : null}
              {listTab === "server" ? (
              <TabsContent value="server" className="mt-4 space-y-4">
                <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Connect PL server</h3>
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Server name (optional)"
                      value={serverGateLabel}
                      onChange={(e) => setServerGateLabel(e.target.value)}
                    />
                    <div className="grid grid-cols-[1fr_92px] gap-2">
                      <Input
                        placeholder="110.34.23.84"
                        value={serverHost}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (/^https?:\/\//i.test(value) || value.includes(":")) {
                            const parsed = splitServerAddressForSelector(value);
                            setServerHost(parsed.host);
                            if (parsed.port) setServerPort(parsed.port);
                            return;
                          }
                          setServerHost(value);
                        }}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="3001"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={serverGateBusy}
                      onClick={() => void handleAddServerGateFromSelector()}
                    >
                      {serverGateBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <PlusCircle className="mr-2 h-4 w-4" />
                      )}
                      Add gate & connect
                    </Button>
                  </div>
                  {localServerGates.length > 0 ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Saved server gates</p>
                      {localServerGates.map((gate) => (
                        <div key={gate.id} className="rounded-md border bg-background p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{gate.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{gate.serverUrl}</p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={serverGateBusyId === gate.id}
                              onClick={() => void handleUseServerGateFromSelector(gate, false)}
                            >
                              {serverGateBusyId === gate.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Wifi className="mr-2 h-4 w-4" />
                              )}
                              Sync here
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={serverGateBusyId === gate.id}
                              onClick={() => void handleUseServerGateFromSelector(gate, true)}
                            >
                              <Server className="mr-2 h-4 w-4" />
                              Open server
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {serverList.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {myServerDisplay.length > 0 && serverSharedDisplay.length === 0
                        ? "My companies on server"
                        : "Server companies"}
                    </h3>
                    <ul className="space-y-3">
                      {serverList.map((company) => (
                        <li key={company.id} className="space-y-1">
                          <CompanyItem company={company} />
                          {isMyServerCompany(company, user?.email) ? (
                            <p className="pl-10 text-xs text-muted-foreground">Owned on this server</p>
                          ) : (company.ownerEmail || ownerNames[company.ownerId]) ? (
                            <p className="pl-10 text-xs text-muted-foreground">
                              Shared from server ·{" "}
                              {company.ownerEmail || ownerNames[company.ownerId] || ""}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                    No server-shared companies yet. Add a PL server gate above, then sync here or open the server page.
                  </p>
                )}
              </TabsContent>
              ) : null}
              {listTab === "online" ? (
              <TabsContent value="online" className="mt-4 space-y-4">
                <FirebaseLedgerOnlineCompanySyncList
                  companies={onlineList}
                  activeCompanyId={companyId}
                  onSelectCompany={(c) => void handleSelectCompany(c)}
                  onLogoutCompany={handleLogoutCompany}
                />
              </TabsContent>
              ) : null}
            </Tabs>
          </CardContent>
          <CardFooter className="shrink-0 flex flex-col sm:flex-row gap-2 justify-center border-t bg-card pt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/company/create")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Company
            </Button>
          </CardFooter>
        </Card>
      </div>

      <PlServerShareUserDialog
        companyId={dialogState.type === "addLocalUser" ? dialogState.company?.id : null}
        companyName={dialogState.type === "addLocalUser" ? dialogState.company?.name : null}
        open={dialogState.type === "addLocalUser"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
        onUserAdded={() => {
          reloadLocalCompanyRegistry();
          triggerSync();
        }}
      />
      <PlServerSharedCompanyUrlDialog
        company={dialogState.type === "plServerUrl" ? dialogState.company : null}
        open={dialogState.type === "plServerUrl"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
      />
      {dialogState.company && (
        <>
            <ShareCompanyDialog 
                company={dialogState.company}
                isOpen={dialogState.type === 'share'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            >
                <div/>
            </ShareCompanyDialog>
            <DeleteCompanyDialog
                company={dialogState.company}
                onCompanyDeleted={() => {
                    setDialogState({ type: null, company: null });
                }}
                isOpen={dialogState.type === 'delete'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            />
        </>
      )}

      {/* Offline/local: username+password (per-user role); online: Firebase share flow */}
      <AlertDialog
        open={!!companyToUnlock}
        onOpenChange={(open) => {
          if (!open) {
            const closing = companyToUnlock;
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberSharedUsername(false);
            if (closing) {
              setRememberUnlockDays(
                isOfflineCompanyStorage(closing)
                  ? readOfflineUnlockPreferenceDays(user?.uid, closing.id, user?.email)
                  : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, closing.id, user?.email)
              );
            }
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-8px)] max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {companyToUnlock && isOfflineCompanyStorage(companyToUnlock)
                ? "Enter your credentials"
                : "Company access"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {companyToUnlock && isOfflineCompanyStorage(companyToUnlock) ? (
                <>Choose gate and company, then enter login username and password.</>
              ) : (
                <>
                  Choose gate and company, then enter access details for{" "}
                  <span className="font-medium text-foreground">&quot;{companyToUnlock?.name}&quot;</span>.
                  {companyToUnlock &&
                  isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) ? (
                    onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email) ? (
                      <>
                        {" "}
                        <strong>Shared login:</strong> use your <strong>account email</strong>, <strong>display name</strong>,
                        or your email <strong>prefix (before @)</strong>, then enter the password set for your shared user.
                        {(companyToUnlock as CompanyData & { password?: string }).password ? (
                          <>
                            {" "}
                            Or use <strong>Admin username</strong> + <strong>Protect company</strong> password from Company Profile.
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {" "}
                        Use <strong>Admin username</strong> + <strong>Protect company</strong> password from Company Profile.
                      </>
                    )
                  ) : (
                    <>Enter your company password below.</>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {companyToUnlock ? (
            <CompanyUnlockContextPickers
              companies={unlockPickerCompanies}
              company={companyToUnlock}
              unlockTab={unlockListTab}
              onUnlockTabChange={handleUnlockTabChange}
              onCompanyChange={handleUnlockCompanyChange}
              onOpenGatePage={closeUnlockDialog}
            />
          ) : null}
          <div className="space-y-3">
            {companyToUnlock && isOfflineCompanyStorage(companyToUnlock) ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-unlock-login-user">Login username</Label>
                  <Input
                    id="cs-unlock-login-user"
                    autoComplete="username"
                    placeholder="e.g. sales_user"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmit()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-unlock-user-pw">Password</Label>
                  <div className="relative">
                    <Input
                      id="cs-unlock-user-pw"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmit()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <RememberCompanyPasswordDurationSelect
                  id="cs-remember-days"
                  value={rememberUnlockDays}
                  onChange={setRememberUnlockDays}
                />
              </>
            ) : (
              <>
                {companyToUnlock &&
                !isOfflineCompanyStorage(companyToUnlock) &&
                !isServerGateCompany(companyToUnlock) ? (
                  <FirebaseLedgerDataSyncInlineSwitch />
                ) : null}
                {companyToUnlock && showCompanyUserNameField(companyToUnlock, user?.email) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cs-unlock-username">Company username</Label>
                    <Input
                      id="cs-unlock-username"
                      autoComplete="off"
                      name="pl-company-unlock-username"
                      placeholder={
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Email, display name, or email prefix"
                          : "Company Profile → Admin username"
                      }
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmit()}
                    />
                    {companyToUnlock &&
                      canRememberCompanyUsername(companyToUnlock, user?.email) && (
                        <div className="flex items-center space-x-2 pt-1">
                          <Checkbox
                            id="cs-remember-shared-username"
                            checked={rememberSharedUsername}
                            onCheckedChange={(v) =>
                              handleRememberUsernameCheckboxChange(
                                v === true,
                                usernameInput,
                                companyToUnlock.id,
                                user?.uid,
                                user?.email,
                                setRememberSharedUsername
                              )
                            }
                          />
                          <Label htmlFor="cs-remember-shared-username" className="text-sm font-normal cursor-pointer">
                            Remember username on this device
                          </Label>
                        </div>
                      )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="cs-unlock-password">
                    {companyToUnlock &&
                    isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                    onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                      ? "Password (for your shared access)"
                      : "Company password"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="cs-unlock-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={
                        companyToUnlock &&
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Enter the password set for your shared user"
                          : "Enter company password"
                      }
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmit()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <RememberCompanyPasswordDurationSelect
                  id="cs-remember-cloud-pw"
                  value={rememberUnlockDays}
                  onChange={setRememberUnlockDays}
                />
              </>
            )}
          </div>
          <AlertDialogFooter className="flex-row items-center gap-2 sm:justify-end [&>*]:mt-0">
            {/* Keep both actions on one row (mobile + desktop) with pill-style corners. */}
            {/* Color cue: cancel = blue, primary action = green (requested). */}
            <AlertDialogCancel
              disabled={isVerifying}
              className="mt-0 flex-1 rounded-full border border-blue-600 bg-blue-600 text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-blue-700 hover:text-white hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-1 active:translate-y-0 active:shadow-sm disabled:opacity-60 sm:flex-none"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={isVerifying || !unlockTabHasSelectedCompany}
              onClick={() => void handlePasswordSubmit()}
              className="flex-1 rounded-full border border-green-600 bg-green-600 text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-green-700 hover:shadow-md focus-visible:ring-2 focus-visible:ring-green-400/70 focus-visible:ring-offset-1 active:translate-y-0 active:shadow-sm disabled:opacity-60 sm:flex-none"
            >
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlock
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CompanyActions({
  companies,
  onCompanyCreated,
  /** Header strip: trigger par sirf naam + `truncate` — building/chevron hata diye user request se. */
  triggerLayout = "desktop",
}: {
  companies: CompanyData[];
  onCompanyCreated: () => void;
  triggerLayout?: "mobile" | "desktop";
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { companyId, setCompanyId, clearCompanyId, triggerSync, reloadLocalCompanyRegistry, company: contextCompany, allCompaniesRegistry } = useCompany();
  const handleLogoutCompany = useCallback((id: string) => {
    logoutFromCompanyOnThisDevice(id, user);
    if (companyId === id) clearCompanyId({ force: true });
    toast({ title: "Logged out from company", description: "Saved company password was reset on this device." });
  }, [clearCompanyId, companyId, user]);
  const {
    activeGate,
    gates,
    setActiveGateId,
    addLocalServerGate,
    testLocalServerGate,
    connectLocalServerGate,
  } = useGate();
  const hasLocalServerGate = useMemo(() => gates.some((g) => g.type === "local_server"), [gates]);
  const { onPlServerOrigin, originReady } = usePlServerSelectorOriginReady();
  const usePlServerCompanyMerge = hasLocalServerGate || onPlServerOrigin;
  const localServerGates = useMemo(() => gates.filter((g) => g.type === "local_server"), [gates]);
  const [serverGateLabel, setServerGateLabel] = useState("");
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState("3001");
  useEffect(() => {
    if (!originReady || !onPlServerOrigin || serverHost.trim()) return;
    const gate =
      localServerGates.find((g) => g.id === activeGate?.id) ??
      localServerGates[0] ??
      (activeGate?.type === "local_server" ? activeGate : null);
    prefillPlServerConnectFieldsFromGate(
      gate?.serverUrl || (typeof window !== "undefined" ? window.location.origin : ""),
      setServerHost,
      setServerPort
    );
  }, [originReady, onPlServerOrigin, localServerGates, activeGate, serverHost]);
  const [serverGateBusy, setServerGateBusy] = useState(false);
  const [serverGateBusyId, setServerGateBusyId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<{
    type: "share" | "addLocalUser" | "delete" | "plServerUrl" | null;
    company: CompanyData | null;
  }>({ type: null, company: null });
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** Header dropdown: offline unlock ke liye "remember" — CompanySelector jaisa hi behaviour. */
  const [rememberUnlockDays, setRememberUnlockDays] = useState(0);
  const [rememberSharedUsername, setRememberSharedUsername] = useState(false);
  const [unlockListTab, setUnlockListTab] = useState<CompanyListTab>("local");
  const unlockTabPinnedRefHeader = useRef(false);
  const unlockDialogCompanyIdRefHeader = useRef<string | null>(null);
  const uploadLocked = useRestoreCloudUploadLock();

  const syncServerGateToHeaderSelector = useCallback(
    async (gate: GateRecord) => {
      const result = await syncPlServerGateToLocalSqlite(gate, { pullFullLedger: true });
      await reloadLocalCompanyRegistry();
      return result;
    },
    [reloadLocalCompanyRegistry]
  );

  const handleAddServerGateFromHeader = useCallback(async () => {
    const serverUrl = buildServerAddressForSelector(serverHost, serverPort);
    if (!serverUrl) {
      toast({
        variant: "destructive",
        title: "Server gate",
        description: "Enter server IP/host and port.",
      });
      return;
    }
    setServerGateBusy(true);
    try {
      const gate = addLocalServerGate({
        label: serverGateLabel.trim() || "Local server",
        serverUrl,
        accessToken: "",
      });
      setActiveGateId(gate.id);
      const test = await testLocalServerGate(gate.id);
      if (!test.ok) {
        toast({
          variant: "destructive",
          title: "Gate saved, but not reachable",
          description: test.message,
        });
        return;
      }
      const synced = await syncServerGateToHeaderSelector(gate);
      toast({
        title: "Server connected",
        description:
          synced.synced > 0
            ? `${synced.synced} companies loaded from server.`
            : test.message,
      });
      setServerGateLabel("");
      setServerHost("");
      setServerPort("3001");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Server gate",
        description: e instanceof Error ? e.message : "Could not connect server.",
      });
    } finally {
      setServerGateBusy(false);
    }
  }, [
    addLocalServerGate,
    serverGateLabel,
    serverHost,
    serverPort,
    setActiveGateId,
    syncServerGateToHeaderSelector,
    testLocalServerGate,
  ]);

  const handleUseServerGateFromHeader = useCallback(
    async (gate: GateRecord, openRemotePage: boolean) => {
      setServerGateBusyId(gate.id);
      try {
        setActiveGateId(gate.id);
        const test = await testLocalServerGate(gate.id);
        if (!test.ok) {
          toast({
            variant: "destructive",
            title: "Cannot connect",
            description: test.message,
          });
          return;
        }
        if (openRemotePage) {
          connectLocalServerGate(gate.id);
          return;
        }
        const synced = await syncServerGateToHeaderSelector(gate);
        toast({
          title: "Server synced",
          description:
            synced.synced > 0
              ? `${synced.synced} companies loaded from server.`
              : "Pick a server company from the Server tab.",
        });
        setListTab("server");
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Server gate",
          description: e instanceof Error ? e.message : "Could not connect server.",
        });
      } finally {
        setServerGateBusyId(null);
      }
    },
    [
      connectLocalServerGate,
      setActiveGateId,
      syncServerGateToHeaderSelector,
      testLocalServerGate,
    ]
  );

  const handleSelectCompany = async (selectedCompany: CompanyData) => {
    activateGateForServerCompanyIfNeeded(selectedCompany);
    if (!isServerGateCompany(selectedCompany)) {
      if (tryNavigateBackToAppHubForLocalOnlineCompany(selectedCompany.id)) return;
    }
    if (isServerGateCompany(selectedCompany)) {
      const navResult = await tryNavigateToPlServerCompanyOnSelect(selectedCompany);
      if (navResult === "opened_new_tab" || navResult === "navigated_same_window") return;
      if (navResult === "popup_blocked") {
        toast({
          variant: "destructive",
          title: "Popup blocked",
          description: "Allow popups for this site, then select the server company again.",
        });
        return;
      }
    }
    if (uploadLocked) {
      toast({
        variant: "destructive",
        title: "Cloud upload in progress",
        description: "Wait until the header upload bar reaches 100% before switching company.",
      });
      return;
    }
    if (isOfflineCompanyStorage(selectedCompany)) {
      const remembered =
        readStoredOfflineUnlockSession(user?.uid, selectedCompany.id, user?.email);
      if (remembered) {
        setLocalAuthToken(selectedCompany.id, remembered.token, remembered.user);
        setCompanyId(selectedCompany.id);
        return;
      }
    }
    if (isServerGateCompany(selectedCompany)) {
      if (getLocalAuthToken(selectedCompany.id)) {
        const gate = resolveServerGateForCompany(
          selectedCompany as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string }
        );
        const { ensurePlServerHubGateReadyForStaffConnect, preparePlServerStaffCompanyConnect } = await import(
          "@/lib/plServerStaffCompanyConnect"
        );
        const { plServerCompanyLedgerNeedsFullPull } = await import("@/lib/plServerLedgerDeltaGate");
        await ensurePlServerHubGateReadyForStaffConnect(gate);
        if (await plServerCompanyLedgerNeedsFullPull(selectedCompany.id)) {
          const pulled = await preparePlServerStaffCompanyConnect(selectedCompany.id, {
            pullFullLedger: true,
            timeoutMs: 120_000,
            plServerGate: gate,
          });
          if (!pulled.ok) {
            toast({
              variant: "destructive",
              title: "Could not load company data",
              description: "Server ledger sync failed. Try Gate → Test, then open the company again.",
            });
            return;
          }
        }
        setCompanyId(selectedCompany.id);
        return;
      }
      if (!(await shouldPromptCompanyUnlockAsync(selectedCompany, user?.email, user?.uid, false))) {
        setCompanyId(selectedCompany.id);
        return;
      }
      setCompanyToUnlock(selectedCompany);
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(selectedCompany, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(
        selectedCompany,
        { uid: user?.uid, email: user?.email },
        setUsernameInput,
        setRememberSharedUsername
      );
      return;
    }
    if (
      !isOfflineCompanyStorage(selectedCompany) &&
      readCloudCompanyPasswordUnlockSession(user?.uid, selectedCompany.id, user?.email)
    ) {
      maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, selectedCompany);
      setCompanyId(selectedCompany.id);
      return;
    }
    if (await shouldPromptCompanyUnlockAsync(selectedCompany, user?.email, user?.uid)) {
      setCompanyToUnlock(selectedCompany);
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(selectedCompany, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(
        selectedCompany,
        { uid: user?.uid, email: user?.email },
        setUsernameInput,
        setRememberSharedUsername
      );
    } else {
        if (isOfflineCompanyStorage(selectedCompany)) {
          grantOpenLocalCompanySession(selectedCompany.id, {
            role: isServerGateCompany(selectedCompany)
              ? "manager"
              : resolveCompanyIsOwnedForUser(selectedCompany, {
                  uid: user?.uid || "",
                  email: user?.email ?? null,
                })
                ? "owner"
                : "viewer",
          });
        }
        maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, selectedCompany);
        setCompanyId(selectedCompany.id);
    }
  };
  
  const handlePasswordSubmitHeader = async () => {
    if (!companyToUnlock) return;
    setIsVerifying(true);
    try {
      const row = companyToUnlock as CompanyData & { isOwned?: boolean };
      if (isOfflineCompanyStorage(row)) {
        const u = usernameInput.trim();
        const p = passwordInput.trim();
        if (!u || !p) {
          toast({
            variant: "destructive",
            title: "Company access",
            description: "Enter both login username and password.",
          });
          return;
        }
        if (isServerGateCompany(row)) {
          const openedId = companyToUnlock.id;
          const openedName = companyDisplayName(companyToUnlock);
          const rememberDays = rememberUnlockDays;
          let ledgerPullStarted = false;
          const closeUnlockOnLoadStart = () => {
            ledgerPullStarted = true;
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberUnlockDays(0);
            setIsVerifying(false);
            grantOpenLocalCompanySession(openedId, { role: "manager" });
            activateGateForServerCompanyIfNeeded(row);
            setCompanyId(openedId);
            router.push("/dashboard");
            toast({
              title: "Loading company",
              description: "Syncing masters & vouchers from server…",
            });
          };
          const unlocked = await unlockServerGateCompanyFromSelector(row, u, p, rememberDays, {
            uid: user?.uid,
            email: user?.email,
          }, { onLedgerPullStart: closeUnlockOnLoadStart });
          if (!unlocked.ok) {
            toast({
              variant: "destructive",
              title: ledgerPullStarted ? "Could not sync company" : "Could not open company",
              description: unlocked.error || "Sync failed.",
            });
            return;
          }
          toast({ title: "Access Granted", description: `Welcome to ${openedName}.` });
          return;
        }
        const { token, user: localUser } = await localAuthLoginForCompanyContext(companyToUnlock.id, u, p, {
          appUser: { uid: user?.uid, email: user?.email },
          forcePlServerRemote: companyUsesRemotePlServerLogin(row),
        });
        setLocalAuthToken(companyToUnlock.id, token, localUser);
        saveOfflineUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays, token, localUser, user?.email);
        toast({ title: "Access Granted", description: `Switched to ${companyToUnlock.name}.` });
        setCompanyId(companyToUnlock.id);
        setCompanyToUnlock(null);
        setUsernameInput("");
        setPasswordInput("");
        setRememberUnlockDays(0);
        return;
      }

      const result = verifyCompanyUnlock(row, user?.email, usernameInput, passwordInput);
      if (result.ok) {
        if (!isOfflineCompanyStorage(row)) {
          saveCloudCompanyPasswordUnlockSession(
            user?.uid,
            companyToUnlock.id,
            rememberUnlockDays,
            user?.email
          );
        }
        if (canRememberCompanyUsername(companyToUnlock, user?.email)) {
          if (rememberSharedUsername) {
            saveRememberedSharedUnlockUsername(
              user?.uid,
              companyToUnlock.id,
              usernameInput.trim(),
              user?.email
            );
          } else {
            clearRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id, user?.email);
          }
        }
        clearLocalAuth(companyToUnlock.id);
        toast({ title: "Access Granted", description: `Switched to ${companyToUnlock.name}.` });
        if (!isOfflineCompanyStorage(row)) {
          maybeMarkEmbeddedPendingCompanyDataWarm(user?.uid, companyToUnlock);
        }
        setCompanyId(companyToUnlock.id);
        setCompanyToUnlock(null);
        setUsernameInput("");
        setPasswordInput("");
        setRememberSharedUsername(false);
      } else {
        toast({
          variant: "destructive",
          title: "Company access",
          description: "message" in result ? result.message : "Access denied.",
        });
        setPasswordInput("");
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Company access",
        description: e instanceof Error ? e.message : "Login failed.",
      });
      setPasswordInput("");
    } finally {
      setIsVerifying(false);
    }
  };
  
  const [serverContextEpoch, setServerContextEpoch] = useState(0);
  useEffect(() => {
    const onServerCtx = () => setServerContextEpoch((n) => n + 1);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
  }, []);
  const selectorCompanies = useMemo(() => {
    const base = usePlServerCompanyMerge
      ? companies
      : companies.filter((c) => !isServerGateCompany(c));
    return usePlServerCompanyMerge ? mergePlServerSharedCompaniesIntoRegistry(base) : base;
  }, [companies, usePlServerCompanyMerge, serverContextEpoch]);
  const unlockPickerCompanies = useMemo(() => {
    if (selectorCompanies.length > 0) return selectorCompanies;
    const registry = (allCompaniesRegistry ?? companies).filter(isCompanyVisibleInSelector);
    if (registry.length > 0) return registry;
    if (companyToUnlock) return [companyToUnlock];
    return [];
  }, [selectorCompanies, allCompaniesRegistry, companies, companyToUnlock]);
  const buckets = useMemo(
    () => partitionCompaniesForSelector(selectorCompanies),
    [selectorCompanies, serverContextEpoch, originReady]
  );
  const {
    localTabCompanies,
    onlineTabCompanies,
    serverTabCompanies,
  } = buckets;

  useEffect(() => {
    if (!companyToUnlock) {
      unlockTabPinnedRefHeader.current = false;
      unlockDialogCompanyIdRefHeader.current = null;
      return;
    }
    const openId = companyToUnlock.id;
    if (unlockDialogCompanyIdRefHeader.current !== openId) {
      unlockDialogCompanyIdRefHeader.current = openId;
      unlockTabPinnedRefHeader.current = false;
    }
    if (unlockTabPinnedRefHeader.current) return;
    const unlockBuckets = partitionCompaniesForUnlockDialog(unlockPickerCompanies);
    setUnlockListTab(resolveCompanyUnlockTab(companyToUnlock, unlockBuckets));
  }, [companyToUnlock?.id, unlockPickerCompanies, companyToUnlock]);

  const unlockTabHasSelectedCompanyHeader = useMemo(() => {
    if (!companyToUnlock) return false;
    const unlockBuckets = partitionCompaniesForUnlockDialog(unlockPickerCompanies);
    return unlockTabCompanies(unlockBuckets, unlockListTab).some((c) => c.id === companyToUnlock.id);
  }, [companyToUnlock, unlockPickerCompanies, unlockListTab]);

  const closeUnlockDialogHeader = useCallback(() => {
    unlockTabPinnedRefHeader.current = false;
    unlockDialogCompanyIdRefHeader.current = null;
    setCompanyToUnlock(null);
    setUsernameInput("");
    setPasswordInput("");
    setRememberSharedUsername(false);
  }, []);

  const switchUnlockDialogCompanyHeader = useCallback(
    (next: CompanyData, tab?: CompanyListTab) => {
      activateGateForServerCompanyIfNeeded(next);
      setCompanyToUnlock(next);
      if (tab) {
        unlockTabPinnedRefHeader.current = true;
        setUnlockListTab(tab);
      }
      setPasswordInput("");
      setRememberUnlockDays(rememberUnlockDaysForCompany(next, user?.uid, user?.email));
      primeCompanyUnlockDialogFields(
        next,
        { uid: user?.uid, email: user?.email },
        setUsernameInput,
        setRememberSharedUsername
      );
    },
    [user?.uid, user?.email]
  );

  const handleUnlockTabChangeHeader = useCallback(
    (tab: CompanyListTab) => {
      unlockTabPinnedRefHeader.current = true;
      const next = pickCompanyForUnlockTab(unlockPickerCompanies, tab, companyToUnlock?.id ?? null);
      if (!next) {
        setUnlockListTab(tab);
        return;
      }
      switchUnlockDialogCompanyHeader(next, tab);
    },
    [unlockPickerCompanies, companyToUnlock?.id, switchUnlockDialogCompanyHeader]
  );

  const handleUnlockCompanyChangeHeader = useCallback(
    (next: CompanyData) => {
      unlockTabPinnedRefHeader.current = true;
      switchUnlockDialogCompanyHeader(next, unlockListTab);
    },
    [switchUnlockDialogCompanyHeader, unlockListTab]
  );

  const localList = useMemo(
    () =>
      ensureSelectedInTabList(localTabCompanies, companyId, selectorCompanies, "local").filter(
        isStrictLocalUnlockTabCompany
      ),
    [localTabCompanies, companyId, selectorCompanies]
  );
  const onlineList = useMemo(
    () =>
      ensureSelectedInTabList(onlineTabCompanies, companyId, selectorCompanies, "online").filter(
        (c) => !isServerSelectorCompanyRow(c)
      ),
    [onlineTabCompanies, companyId, selectorCompanies]
  );
  const serverList = useMemo(
    () => {
      const rows = ensureSelectedInTabList(serverTabCompanies, companyId, selectorCompanies, "server");
      const byId = new Map(rows.map((c) => [c.id, c]));
      for (const c of selectorCompanies) {
        if (isServerGateCompany(c)) byId.set(c.id, c);
      }
      return Array.from(byId.values());
    },
    [serverTabCompanies, companyId, selectorCompanies]
  );
  const myLocalDisplay = useMemo(() => localList.filter((c) => c.isOwned), [localList]);
  const sharedLocalDisplay = useMemo(
    () => localList.filter((c) => isSharedLocalCompany(c)),
    [localList]
  );
  const myServerDisplay = useMemo(
    () => serverList.filter((c) => isMyServerCompany(c, user?.email)),
    [serverList, user?.email]
  );
  const serverSharedDisplay = useMemo(
    () => serverList.filter((c) => !isMyServerCompany(c, user?.email)),
    [serverList, user?.email]
  );
  const myOnlineDisplay = useMemo(() => onlineList.filter((c) => c.isOwned), [onlineList]);
  const sharedOnlineDisplay = useMemo(
    () => onlineList.filter((c) => isSharedOnlineCompany(c)),
    [onlineList]
  );
  // `useCompany` bhi selection ko host-id aware fuzzy match se dekhta hai. Yahan strict `c.id === companyId`
  // rehne se PL server / restored row par selector clear karta tha aur context wapas select — clear↔select loop.
  const selectedCompanyIsVisible = useMemo(
    () => Boolean(companyId && selectorCompanies.some((c) => companyRowMatchesSelectionId(c, companyId))),
    [companyId, selectorCompanies]
  );
  const activeCompany =
    (selectedCompanyIsVisible && contextCompany?.id === companyId ? contextCompany : null) ||
    (companyId
      ? (selectorCompanies.find((c) => c.id === companyId) ??
        selectorCompanies.find((c) => companyRowMatchesSelectionId(c, companyId)))
      : null) ||
    (!companyId ? selectorCompanies[0] : null);
  const [listTab, setListTab] = useState<CompanyListTab>(() => defaultSelectorTab(companyId, buckets));
  const [menuOpen, setMenuOpen] = useState(false);
  const originTabSyncedRefHeader = useRef(false);
  const prevMenuOpenForTabRef = useRef(false);
  const manualListTabRef = useRef(false);
  const handleListTabChange = useCallback((tab: CompanyListTab) => {
    manualListTabRef.current = true;
    setListTab(tab);
  }, []);

  useEffect(() => {
    if (!originReady || !onPlServerOrigin || originTabSyncedRefHeader.current || manualListTabRef.current) return;
    originTabSyncedRefHeader.current = true;
    setListTab(defaultSelectorTab(companyId, buckets));
  }, [originReady, onPlServerOrigin, buckets, companyId]);

  useEffect(() => {
    if (uploadLocked) return;
    if (companyId) {
      if (selectedCompanyIsVisible) return;
      const hiddenServerSelection =
        !usePlServerCompanyMerge &&
        ((contextCompany?.id === companyId && isServerGateCompany(contextCompany)) ||
          companies.some((c) => c.id === companyId && isServerGateCompany(c)));
      if (!hiddenServerSelection) {
        clearCompanyId({ force: true });
        return;
      }
      return;
    }
    // Multi-tab: keep tab-specific selection stable; auto-pick first only when no saved company exists anywhere.
    if (selectorCompanies.length > 0 && !hasAnySelectedCompanyId()) {
      const pick = pickGateAwareAutoSelectCompanyId(selectorCompanies, activeGate);
      if (pick) setCompanyId(pick);
    }
  }, [
    activeGate,
    clearCompanyId,
    companies,
    companyId,
    contextCompany,
    hasLocalServerGate,
    usePlServerCompanyMerge,
    selectedCompanyIsVisible,
    selectorCompanies,
    setCompanyId,
    uploadLocked,
  ]);

  useEffect(() => {
    const justOpened = menuOpen && !prevMenuOpenForTabRef.current;
    prevMenuOpenForTabRef.current = menuOpen;
    if (justOpened) {
      manualListTabRef.current = false;
      setListTab(defaultSelectorTab(companyId, buckets));
    }
  }, [menuOpen, companyId, buckets]);

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const activeSharedCompaniesForOwnerLookup = useMemo(() => {
    if (listTab === "local") return sharedLocalDisplay;
    if (listTab === "server") return serverSharedDisplay;
    return sharedOnlineDisplay;
  }, [listTab, sharedLocalDisplay, serverSharedDisplay, sharedOnlineDisplay]);
  const sharedOwnerIdsKey = useMemo(
    () =>
      [...new Set(activeSharedCompaniesForOwnerLookup.map((c) => c.ownerId).filter(Boolean))]
        .sort()
        .join(","),
    [activeSharedCompaniesForOwnerLookup]
  );
  useEffect(() => {
    if (!sharedOwnerIdsKey) return;
    const ownerIds = sharedOwnerIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    const map: Record<string, string> = {};
    Promise.all(
      ownerIds.map(async (ownerId) => {
        try {
          const snap = await getDoc(doc(firestore, "users", ownerId));
          if (cancelled) return;
          const name = snap.exists() ? (snap.data()?.displayName || snap.data()?.email || "") : "";
          if (name) map[ownerId] = name;
        } catch {
          // ignore
        }
      })
    ).then(() => {
      if (!cancelled) setOwnerNames((prev) => ({ ...prev, ...map }));
    });
    return () => { cancelled = true; };
  }, [sharedOwnerIdsKey]);

  const companyTriggerLabel =
    companyDisplayName(activeCompany) ||
    (!companies?.length ? "No company — add one" : "Select company");

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild disabled={uploadLocked}>
          <Button
            variant="outline"
            disabled={uploadLocked}
            className={cn(
              "flex h-9 min-w-0 justify-start gap-0 font-normal",
              uploadLocked && "cursor-not-allowed opacity-60",
              // Mobile header: parent `flex-1` — `w-full` + truncate lambi naam ke liye.
              triggerLayout === "mobile" && "w-full max-w-none px-2",
              // Desktop: baaki controls poori dikhein; company box hi shrink + truncate.
              triggerLayout === "desktop" && "max-w-[min(100%,280px)] shrink px-3"
            )}
            data-theme-header="company-selector"
            title={companyTriggerLabel}
            aria-label={`Company: ${companyTriggerLabel}`}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {activeCompany ? activeCompany.name : "No Company"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
        <DropdownMenuContent className="w-[min(96vw,560px)] max-h-[min(70vh,520px)] overflow-x-auto overflow-y-auto">
          <DropdownMenuGroup className="p-2">
              <CompanySelectorTabBar
                compact
                value={listTab}
                onChange={handleListTabChange}
                localCount={localList.length}
                serverCount={serverList.length}
                onlineCount={onlineList.length}
              />
              {listTab === "local" ? (
                localList.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No local companies on this device.</p>
                ) : (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-1">
                    {myLocalDisplay.length > 0 ? (
                      <div className="mb-2">
                        <DropdownMenuLabel className="pl-2 text-[11px] text-muted-foreground">
                          My local companies
                        </DropdownMenuLabel>
                        {myLocalDisplay.map((company) => (
                          <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                            <Building2 className="mr-2 h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate">{companyDisplayName(company)}</span>
                            {company.id === companyId && (
                              <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="ml-1 h-7 w-7 shrink-0"
                              title="Log out from company"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLogoutCompany(company.id); }}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ) : null}
                    {sharedLocalDisplay.length > 0 ? (
                      <div>
                        <DropdownMenuLabel className="pl-2 text-[11px] text-muted-foreground">
                          Shared local companies
                        </DropdownMenuLabel>
                        {sharedLocalDisplay.map((company) => (
                          <DropdownMenuItem
                            key={company.id}
                            onSelect={() => handleSelectCompany(company)}
                            className="flex flex-col items-stretch py-2 group"
                          >
                            <div className="flex w-full items-center gap-2">
                              <Building2 className="h-4 w-4 shrink-0" />
                              <span className="flex-1 truncate font-medium">{companyDisplayName(company)}</span>
                              {company.id === companyId && (
                                <Check className="h-4 w-4 shrink-0 text-green-600" />
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                title="Log out from company"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLogoutCompany(company.id); }}
                              >
                                <LogOut className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {(company.ownerEmail || ownerNames[company.ownerId]) ? (
                              <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground group-data-[highlighted]:text-white">
                                Shared by:{" "}
                                {ownerNames[company.ownerId]
                                  ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})`
                                  : company.ownerEmail || ""}
                              </div>
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              ) : listTab === "server" ? (
                <>
                  <div className="mt-2 space-y-2 rounded-md border bg-muted/10 p-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />
                      Connect PL server
                    </div>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Server name"
                      value={serverGateLabel}
                      onChange={(e) => setServerGateLabel(e.target.value)}
                    />
                    <div className="grid grid-cols-[1fr_72px] gap-1.5">
                      <Input
                        className="h-8 text-xs"
                        placeholder="110.34.23.84"
                        value={serverHost}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (/^https?:\/\//i.test(value) || value.includes(":")) {
                            const parsed = splitServerAddressForSelector(value);
                            setServerHost(parsed.host);
                            if (parsed.port) setServerPort(parsed.port);
                            return;
                          }
                          setServerHost(value);
                        }}
                      />
                      <Input
                        className="h-8 text-xs"
                        inputMode="numeric"
                        placeholder="3001"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 w-full"
                      disabled={serverGateBusy}
                      onClick={() => void handleAddServerGateFromHeader()}
                    >
                      {serverGateBusy ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="mr-2 h-3.5 w-3.5" />
                      )}
                      Add gate & connect
                    </Button>
                    {localServerGates.length > 0 ? (
                      <div className="space-y-1 border-t pt-2">
                        {localServerGates.map((gate) => (
                          <div key={gate.id} className="rounded border bg-background p-1.5">
                            <p className="truncate text-xs font-medium">{gate.label}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{gate.serverUrl}</p>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-1.5 text-[11px]"
                                disabled={serverGateBusyId === gate.id}
                                onClick={() => void handleUseServerGateFromHeader(gate, false)}
                              >
                                Sync
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-1.5 text-[11px]"
                                disabled={serverGateBusyId === gate.id}
                                onClick={() => void handleUseServerGateFromHeader(gate, true)}
                              >
                                Open
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {serverList.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">No server-shared companies yet.</p>
                  ) : (
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-1">
                      <DropdownMenuLabel className="pl-2 text-[11px] text-muted-foreground">
                        {myServerDisplay.length > 0 && serverSharedDisplay.length === 0
                          ? "My companies on server"
                          : "Server companies"}
                      </DropdownMenuLabel>
                      {serverList.map((company) => (
                        <DropdownMenuItem
                          key={company.id}
                          onSelect={() => handleSelectCompany(company)}
                          className="flex flex-col items-stretch py-2 group"
                        >
                          <div className="flex w-full items-center gap-2">
                            <Server className="h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">{companyDisplayName(company)}</span>
                            {company.id === companyId && (
                              <Check className="h-4 w-4 shrink-0 text-green-600" />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              title="Log out from company"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLogoutCompany(company.id); }}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {isMyServerCompany(company, user?.email) ? (
                            <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground group-data-[highlighted]:text-white">
                              Owned on this server
                            </div>
                          ) : serverCompanyOwnerEmail(company, ownerNames) ? (
                            <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground group-data-[highlighted]:text-white">
                              Shared from server {serverCompanyOwnerEmail(company, ownerNames)}
                            </div>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="mt-2 rounded-md border bg-muted/20 p-2"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <FirebaseLedgerOnlineCompanySyncList
                    compact
                    companies={onlineList}
                    activeCompanyId={companyId}
                    onLogoutCompany={handleLogoutCompany}
                    onSelectCompany={(c) => {
                      setMenuOpen(false);
                      void handleSelectCompany(c);
                    }}
                  />
                </div>
              )}
            </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
             <DropdownMenuItem onSelect={() => router.push("/company/create")}>
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Add Company</span>
             </DropdownMenuItem>
              {activeCompany && activeCompany.isOwned && (
                <DropdownMenuItem
                  onSelect={() =>
                    isOfflineCompanyStorage(activeCompany)
                      ? setDialogState({ type: "addLocalUser", company: activeCompany })
                      : setDialogState({ type: "share", company: activeCompany })
                  }
                >
                  {isOfflineCompanyStorage(activeCompany) ? (
                    <UserPlus className="mr-2 h-4 w-4" />
                  ) : (
                    <Share2 className="mr-2 h-4 w-4" />
                  )}
                  <span>{isOfflineCompanyStorage(activeCompany) ? "Add Person" : "Share"}</span>
                </DropdownMenuItem>
              )}
              {activeCompany && isServerGateCompany(activeCompany) && (
                <DropdownMenuItem
                  onSelect={() => setDialogState({ type: "plServerUrl", company: activeCompany })}
                >
                  <Server className="mr-2 h-4 w-4" />
                  <span>Change server IP</span>
                </DropdownMenuItem>
              )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>

      <PlServerShareUserDialog
        companyId={dialogState.type === "addLocalUser" ? dialogState.company?.id : null}
        companyName={dialogState.type === "addLocalUser" ? dialogState.company?.name : null}
        open={dialogState.type === "addLocalUser"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
        onUserAdded={() => {
          reloadLocalCompanyRegistry();
          triggerSync();
        }}
      />
      <PlServerSharedCompanyUrlDialog
        company={dialogState.type === "plServerUrl" ? dialogState.company : null}
        open={dialogState.type === "plServerUrl"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
      />
      {dialogState.company && (
        <>
            <ShareCompanyDialog 
                company={dialogState.company}
                isOpen={dialogState.type === 'share'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            >
                <div/>
            </ShareCompanyDialog>
            <DeleteCompanyDialog
                company={dialogState.company}
                onCompanyDeleted={onCompanyCreated}
                isOpen={dialogState.type === 'delete'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            />
        </>
      )}

      <AlertDialog
        open={!!companyToUnlock}
        onOpenChange={(open) => {
          if (!open) {
            const closing = companyToUnlock;
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberSharedUsername(false);
            if (closing) {
              setRememberUnlockDays(
                isOfflineCompanyStorage(closing)
                  ? readOfflineUnlockPreferenceDays(user?.uid, closing.id, user?.email)
                  : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, closing.id, user?.email)
              );
            }
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-8px)] max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {companyToUnlock && isOfflineCompanyStorage(companyToUnlock)
                ? "Enter your credentials"
                : "Company access"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {companyToUnlock && isOfflineCompanyStorage(companyToUnlock) ? (
                <>Choose gate and company, then enter login username and password.</>
              ) : (
                <>
                  Choose gate and company, then enter access details for{" "}
                  <span className="font-medium text-foreground">&quot;{companyToUnlock?.name}&quot;</span>.
                  {companyToUnlock &&
                  isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) ? (
                    onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email) ? (
                      <>
                        {" "}
                        <strong>Shared login:</strong> email / display name / email prefix + your shared password.
                        {(companyToUnlock as CompanyData & { password?: string }).password ? (
                          <>
                            {" "}
                            Or <strong>Admin username</strong> + <strong>Protect company</strong> password.
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {" "}
                        Company Profile: <strong>Admin username</strong> + <strong>Protect company</strong> password.
                      </>
                    )
                  ) : (
                    <>Enter your company password below.</>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {companyToUnlock ? (
            <CompanyUnlockContextPickers
              companies={unlockPickerCompanies}
              company={companyToUnlock}
              unlockTab={unlockListTab}
              onUnlockTabChange={handleUnlockTabChangeHeader}
              onCompanyChange={handleUnlockCompanyChangeHeader}
              onOpenGatePage={closeUnlockDialogHeader}
            />
          ) : null}
          <div className="space-y-3">
            {companyToUnlock && isOfflineCompanyStorage(companyToUnlock) ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ca-unlock-login-user">Login username</Label>
                  <Input
                    id="ca-unlock-login-user"
                    autoComplete="username"
                    placeholder="e.g. sales_user"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmitHeader()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ca-unlock-user-pw">Password</Label>
                  <div className="relative">
                    <Input
                      id="ca-unlock-user-pw"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmitHeader()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <RememberCompanyPasswordDurationSelect
                  id="ca-remember-days"
                  value={rememberUnlockDays}
                  onChange={setRememberUnlockDays}
                />
              </>
            ) : (
              <>
                {companyToUnlock &&
                !isOfflineCompanyStorage(companyToUnlock) &&
                !isServerGateCompany(companyToUnlock) ? (
                  <FirebaseLedgerDataSyncInlineSwitch />
                ) : null}
                {companyToUnlock && showCompanyUserNameField(companyToUnlock, user?.email) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ca-unlock-username">Company username</Label>
                    <Input
                      id="ca-unlock-username"
                      autoComplete="off"
                      name="pl-company-unlock-username-header"
                      placeholder={
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Email, display name, or email prefix"
                          : "Company Profile → Admin username"
                      }
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmitHeader()}
                    />
                    {companyToUnlock &&
                      canRememberCompanyUsername(companyToUnlock, user?.email) && (
                        <div className="flex items-center space-x-2 pt-1">
                          <Checkbox
                            id="ca-remember-shared-username"
                            checked={rememberSharedUsername}
                            onCheckedChange={(v) =>
                              handleRememberUsernameCheckboxChange(
                                v === true,
                                usernameInput,
                                companyToUnlock.id,
                                user?.uid,
                                user?.email,
                                setRememberSharedUsername
                              )
                            }
                          />
                          <Label htmlFor="ca-remember-shared-username" className="text-sm font-normal cursor-pointer">
                            Remember username on this device
                          </Label>
                        </div>
                      )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="ca-unlock-password">
                    {companyToUnlock &&
                    isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                    onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                      ? "Password (for your shared access)"
                      : "Company password"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="ca-unlock-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={
                        companyToUnlock &&
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Enter the password set for your shared user"
                          : "Enter company password"
                      }
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmitHeader()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <RememberCompanyPasswordDurationSelect
                  id="ca-remember-cloud-pw"
                  value={rememberUnlockDays}
                  onChange={setRememberUnlockDays}
                />
              </>
            )}
          </div>
          <AlertDialogFooter className="flex-row items-center gap-2 sm:justify-end [&>*]:mt-0">
            {/* Keep both actions on one row (mobile + desktop) with pill-style corners. */}
            {/* Color cue: cancel = blue, primary action = green (requested). */}
            <AlertDialogCancel
              disabled={isVerifying}
              className="mt-0 flex-1 rounded-full border border-blue-600 bg-blue-600 text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-blue-700 hover:text-white hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-1 active:translate-y-0 active:shadow-sm disabled:opacity-60 sm:flex-none"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={isVerifying || !unlockTabHasSelectedCompanyHeader}
              onClick={() => void handlePasswordSubmitHeader()}
              className="flex-1 rounded-full border border-green-600 bg-green-600 text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-green-700 hover:shadow-md focus-visible:ring-2 focus-visible:ring-green-400/70 focus-visible:ring-offset-1 active:translate-y-0 active:shadow-sm disabled:opacity-60 sm:flex-none"
            >
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Switch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
