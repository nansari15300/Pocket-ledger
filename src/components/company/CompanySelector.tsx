
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Building2, PlusCircle, Share2, UserPlus, ChevronDown, KeyRound, Eye, EyeOff, Loader2, Check, LogOut } from "lucide-react";
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
import { AddLocalCompanyUserDialog } from "./AddLocalCompanyUserDialog";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
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
import { mirrorPlServerSharedCompanyById } from "@/lib/plServerClientCompanyMirror";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerMirrorGate";
import { clearLocalAuth, getLocalAuthToken, setLocalAuthToken } from "@/lib/localApiClient";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import {
  OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS,
  readAnyStoredOfflineUnlockSessionForCompany,
  readOfflineUnlockPreferenceDays,
  readStoredOfflineUnlockSession,
  saveOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { RememberCompanyPasswordDurationSelect } from "@/components/company/RememberCompanyPasswordDurationSelect";
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
  defaultSelectorTab,
  ensureSelectedInTabList,
  isSharedOnlineCompany,
  isSharedLocalCompany,
  isServerGateCompany,
  isLocalSelectorCompanyRow,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Company picker visibility: admin-hidden rows (`movedToAdminRecycleAt`) normal app me na dikhao. */
function isCompanyVisibleInSelector(c: CompanyData): boolean {
  return c.isDeleted !== true && (c as CompanyData & { movedToAdminRecycleAt?: unknown }).movedToAdminRecycleAt == null;
}

function CompanySelectorTabBar({
  value,
  onChange,
  localCount,
  onlineCount,
  compact,
}: {
  value: CompanyListTab;
  onChange: (tab: CompanyListTab) => void;
  localCount: number;
  onlineCount: number;
  compact?: boolean;
}) {
  const tabBtn = (tab: CompanyListTab, label: string, count: number) => (
    <button
      key={tab}
      type="button"
      className={cn(
        "flex-1 rounded-sm font-medium transition-colors",
        compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
        value === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onChange(tab)}
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
      {tabBtn("online", "Online", onlineCount)}
    </div>
  );
}

function activateGateForServerCompanyIfNeeded(company: CompanyData): void {
  if (!isServerGateCompany(company)) return;
  const gateId = getPlServerContextGateId();
  if (gateId) activateGate(gateId);
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

/** Radix: sidebar click = pointer-outside; header company menu band na ho. */
const stopCloseIfMainSidebar = (e: { preventDefault: () => void; target: EventTarget | null }) => {
  const el = e.target as HTMLElement | null;
  if (el?.closest?.("[data-pl-main-sidebar]")) e.preventDefault();
};

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
    companyId,
    allCompanies: contextCompanies,
    allCompaniesRegistry,
    loading: contextCompanyLoading,
    triggerSync,
    reloadLocalCompanyRegistry,
    localCompanyRegistryEpoch,
  } = useCompany();
  const [driveJoinOpen, setDriveJoinOpen] = useState(true);
  const [dialogState, setDialogState] = useState<{
    type: "share" | "addLocalUser" | "delete" | null;
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
  const remoteAutoUnlockAttemptedRef = useRef(false);

  useEffect(() => {
    if (remoteAutoUnlockAttemptedRef.current) return;
    const preselect = readSelectedCompanyId()?.trim();
    if (!preselect) return;
    const co = companies.find((c) => c.id === preselect);
    if (!co || !isOfflineCompanyStorage(co)) return;
    const remembered =
      readStoredOfflineUnlockSession(user?.uid, co.id, user?.email) ||
      readAnyStoredOfflineUnlockSessionForCompany(co.id);
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
        setUsernameInput("");
        setPasswordInput("");
        setRememberUnlockDays(readOfflineUnlockPreferenceDays(user?.uid, co.id, user?.email));
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
          storageOption: "local",
          syncedFromCloud: false,
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
          if (!isLocalSelectorCompanyRow(row as CompanyData)) continue;
          const driveSharedJoin = (row as { driveSharedJoin?: boolean }).driveSharedJoin === true;
          const normalized = normalizeRowForLocalDriveSyncUi({
            ...(row as CompanyData),
            id: row.id,
            name: typeof row.name === "string" ? row.name : row.id,
          });
          const forSelector = {
            ...normalized,
            storageOption: "local" as const,
            syncedFromCloud: false,
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
        readStoredOfflineUnlockSession(user?.uid, company.id, user?.email) ||
        readAnyStoredOfflineUnlockSessionForCompany(company.id);
      if (remembered) {
        if (isServerGateCompany(company)) {
          try {
            if (await plServerCompanyLedgerNeedsFullPull(company.id)) {
              await mirrorPlServerSharedCompanyById(company.id, { pullFullLedger: true });
            }
          } catch (e) {
            toast({
              variant: "destructive",
              title: "Could not sync company",
              description: e instanceof Error ? e.message : "Mirror failed.",
            });
            return;
          }
        }
        setLocalAuthToken(company.id, remembered.token, remembered.user);
        setCompanyId(company.id);
        router.push("/dashboard");
        return;
      }
    }
    // Online company: pehle se valid "remember company password" window — dialog skip
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
      const remembered = canRememberCompanyUsername(company, user?.email)
        ? readRememberedSharedUnlockUsername(user?.uid, company.id, user?.email)
        : null;
      setUsernameInput(remembered ?? "");
      setRememberSharedUsername(!!remembered);
      setPasswordInput("");
      // Online company unlock dialog: last successful "Remember for" value preload karo taaki har baar reset na ho.
      setRememberUnlockDays(
        isOfflineCompanyStorage(company)
          ? readOfflineUnlockPreferenceDays(user?.uid, company.id, user?.email)
          : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, company.id, user?.email)
      );
    } else {
      if (isOfflineCompanyStorage(company)) {
        if (isServerGateCompany(company)) {
          try {
            if (await plServerCompanyLedgerNeedsFullPull(company.id)) {
              await mirrorPlServerSharedCompanyById(company.id, { pullFullLedger: true });
            }
          } catch (e) {
            toast({
              variant: "destructive",
              title: "Could not sync company",
              description: e instanceof Error ? e.message : "Mirror failed.",
            });
            return;
          }
        }
        grantOpenLocalCompanySession(company.id, {
          role: resolveCompanyIsOwnedForUser(company, {
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
        const { token, user: localUser } = await localAuthLoginForCompanyContext(companyToUnlock.id, u, p);
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

  const selectorCompanies = useMemo(
    () => mergePlServerSharedCompaniesIntoRegistry(allCompanies),
    [allCompanies]
  );
  const [serverContextEpoch, setServerContextEpoch] = useState(0);
  useEffect(() => {
    const onServerCtx = () => setServerContextEpoch((n) => n + 1);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
    return () => window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onServerCtx);
  }, []);
  const buckets = useMemo(
    () => partitionCompaniesForSelector(selectorCompanies),
    [selectorCompanies, serverContextEpoch]
  );
  const {
    localTabCompanies,
    onlineTabCompanies,
  } = buckets;
  const localList = useMemo(
    () => ensureSelectedInTabList(localTabCompanies, companyId, selectorCompanies, "local"),
    [localTabCompanies, companyId, selectorCompanies]
  );
  const onlineList = useMemo(
    () => ensureSelectedInTabList(onlineTabCompanies, companyId, selectorCompanies, "online"),
    [onlineTabCompanies, companyId, selectorCompanies]
  );
  const myLocalDisplay = useMemo(() => localList.filter((c) => c.isOwned), [localList]);
  const sharedLocalDisplay = useMemo(
    () => localList.filter((c) => isSharedLocalCompany(c)),
    [localList]
  );
  const myOnlineDisplay = useMemo(() => onlineList.filter((c) => c.isOwned), [onlineList]);
  const sharedOnlineDisplay = useMemo(
    () => onlineList.filter((c) => isSharedOnlineCompany(c)),
    [onlineList]
  );
  const [listTab, setListTab] = useState<CompanyListTab>(() => defaultSelectorTab(companyId, buckets));
  const prevCompanyIdForTabRef = useRef(companyId);

  useEffect(() => {
    if (prevCompanyIdForTabRef.current === companyId) return;
    prevCompanyIdForTabRef.current = companyId;
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
          storageOption: "local",
          syncedFromCloud: false,
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
  const sharedOwnerIdsKey = useMemo(
    () =>
      [...new Set([...sharedOnlineDisplay, ...sharedLocalDisplay].map((c) => c.ownerId).filter(Boolean))]
        .sort()
        .join(","),
    [sharedOnlineDisplay, sharedLocalDisplay]
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
        <span className="flex-1 text-lg font-medium">{company.name}</span>
        {isSelected ? <Check className="h-5 w-5 shrink-0 text-green-600" aria-label="Selected" /> : null}
      </button>
      {company.isOwned && (
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronDown className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                  <DropdownMenuItem
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
                      {offlineOwned ? "Add User" : "Share"}
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </div>
    );
  };

  return (
    <>
      <div className="flex h-dvh max-h-dvh min-h-0 items-center justify-center overflow-hidden bg-background p-3 sm:p-4">
        <Card className="flex h-[90dvh] max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden">
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
              onValueChange={(v) => setListTab(v as CompanyListTab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local">
                  Local{localList.length > 0 ? ` (${localList.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="online">
                  Online{onlineList.length > 0 ? ` (${onlineList.length})` : ""}
                </TabsTrigger>
              </TabsList>
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
                                  {isServerGateCompany(company)
                                    ? `Shared from server · ${company.ownerEmail || ownerNames[company.ownerId] || ""}`
                                    : (
                                      <>
                                        Shared by:{" "}
                                        {ownerNames[company.ownerId]
                                          ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})`
                                          : company.ownerEmail || ""}
                                      </>
                                    )}
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
              <TabsContent value="online" className="mt-4 space-y-4">
                {onlineList.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                    No online companies yet. Create an online company or accept a share invite.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {myOnlineDisplay.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground">My online companies</h3>
                        <ul className="space-y-3">
                          {myOnlineDisplay.map((company) => (
                            <li key={company.id}>
                              <CompanyItem company={company} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {sharedOnlineDisplay.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Shared online companies</h3>
                        <ul className="space-y-3">
                          {sharedOnlineDisplay.map((company) => (
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
                )}
              </TabsContent>
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

      <AddLocalCompanyUserDialog
        company={dialogState.type === "addLocalUser" ? dialogState.company : null}
        open={dialogState.type === "addLocalUser"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
        onUserAdded={() => {
          reloadLocalCompanyRegistry();
          triggerSync();
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
                <>
                  Open <span className="font-medium text-foreground">&quot;{companyToUnlock.name}&quot;</span>.
                </>
              ) : (
                <>
                  Open <span className="font-medium text-foreground">&quot;{companyToUnlock?.name}&quot;</span>.
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
              disabled={isVerifying}
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
  const { companyId, setCompanyId, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { activeGate } = useGate();
  const [dialogState, setDialogState] = useState<{
    type: "share" | "addLocalUser" | "delete" | null;
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
  const uploadLocked = useRestoreCloudUploadLock();

  const activeCompany =
    (companyId ? companies.find((c) => c.id === companyId) : null) ||
    (companyId ? null : companies[0]) ||
    companies[0];

  useEffect(() => {
    if (uploadLocked) return;
    // Multi-tab: keep tab-specific selection stable; auto-pick first only when no saved company exists anywhere.
    if (!companyId && companies.length > 0 && !hasAnySelectedCompanyId()) {
      const pick = pickGateAwareAutoSelectCompanyId(companies, activeGate);
      if (pick) setCompanyId(pick);
    }
  }, [companyId, companies, setCompanyId, activeGate, uploadLocked]);

  const handleSelectCompany = async (selectedCompany: CompanyData) => {
    activateGateForServerCompanyIfNeeded(selectedCompany);
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
        readStoredOfflineUnlockSession(user?.uid, selectedCompany.id, user?.email) ||
        readAnyStoredOfflineUnlockSessionForCompany(selectedCompany.id);
      if (remembered) {
        if (isServerGateCompany(selectedCompany)) {
          try {
            if (await plServerCompanyLedgerNeedsFullPull(selectedCompany.id)) {
              await mirrorPlServerSharedCompanyById(selectedCompany.id, { pullFullLedger: true });
            }
          } catch (e) {
            toast({
              variant: "destructive",
              title: "Could not sync company",
              description: e instanceof Error ? e.message : "Mirror failed.",
            });
            return;
          }
        }
        setLocalAuthToken(selectedCompany.id, remembered.token, remembered.user);
        setCompanyId(selectedCompany.id);
        return;
      }
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
      const remembered = canRememberCompanyUsername(selectedCompany, user?.email)
        ? readRememberedSharedUnlockUsername(user?.uid, selectedCompany.id, user?.email)
        : null;
      setUsernameInput(remembered ?? "");
      setRememberSharedUsername(!!remembered);
      setPasswordInput("");
      // Header switcher: remembered duration ko restore karo, warna accidental 0-day save se session clear ho jata hai.
      setRememberUnlockDays(
        isOfflineCompanyStorage(selectedCompany)
          ? readOfflineUnlockPreferenceDays(user?.uid, selectedCompany.id, user?.email)
          : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, selectedCompany.id, user?.email)
      );
    } else {
        if (isOfflineCompanyStorage(selectedCompany)) {
          if (isServerGateCompany(selectedCompany)) {
            try {
              if (await plServerCompanyLedgerNeedsFullPull(selectedCompany.id)) {
                await mirrorPlServerSharedCompanyById(selectedCompany.id, { pullFullLedger: true });
              }
            } catch (e) {
              toast({
                variant: "destructive",
                title: "Could not sync company",
                description: e instanceof Error ? e.message : "Mirror failed.",
              });
              return;
            }
          }
          grantOpenLocalCompanySession(selectedCompany.id, {
            role: resolveCompanyIsOwnedForUser(selectedCompany, {
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
        const { token, user: localUser } = await localAuthLoginForCompanyContext(companyToUnlock.id, u, p);
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
  const selectorCompanies = useMemo(
    () => mergePlServerSharedCompaniesIntoRegistry(companies),
    [companies, serverContextEpoch]
  );
  const buckets = useMemo(() => partitionCompaniesForSelector(selectorCompanies), [selectorCompanies]);
  const {
    localTabCompanies,
    onlineTabCompanies,
  } = buckets;
  const localList = useMemo(
    () => ensureSelectedInTabList(localTabCompanies, companyId, selectorCompanies, "local"),
    [localTabCompanies, companyId, selectorCompanies]
  );
  const onlineList = useMemo(
    () => ensureSelectedInTabList(onlineTabCompanies, companyId, selectorCompanies, "online"),
    [onlineTabCompanies, companyId, selectorCompanies]
  );
  const myLocalDisplay = useMemo(() => localList.filter((c) => c.isOwned), [localList]);
  const sharedLocalDisplay = useMemo(
    () => localList.filter((c) => isSharedLocalCompany(c)),
    [localList]
  );
  const myOnlineDisplay = useMemo(() => onlineList.filter((c) => c.isOwned), [onlineList]);
  const sharedOnlineDisplay = useMemo(
    () => onlineList.filter((c) => isSharedOnlineCompany(c)),
    [onlineList]
  );
  const [listTab, setListTab] = useState<CompanyListTab>(() => defaultSelectorTab(companyId, buckets));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      setListTab(defaultSelectorTab(companyId, buckets));
    }
  }, [menuOpen, companyId, buckets]);

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () =>
      [...new Set([...sharedOnlineDisplay, ...sharedLocalDisplay].map((c) => c.ownerId).filter(Boolean))]
        .sort()
        .join(","),
    [sharedOnlineDisplay, sharedLocalDisplay]
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
    activeCompany?.name.trim() ||
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
        <DropdownMenuContent className="w-72" onPointerDownOutside={stopCloseIfMainSidebar} onInteractOutside={stopCloseIfMainSidebar}>
          <DropdownMenuGroup className="p-2">
              <CompanySelectorTabBar
                compact
                value={listTab}
                onChange={setListTab}
                localCount={localList.length}
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
                            <span className="flex-1 truncate">{company.name}</span>
                            {company.id === companyId && (
                              <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                            )}
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
                              <span className="flex-1 truncate font-medium">{company.name}</span>
                              {company.id === companyId && (
                                <Check className="h-4 w-4 shrink-0 text-green-600" />
                              )}
                            </div>
                            {(company.ownerEmail || ownerNames[company.ownerId]) ? (
                              <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground group-data-[highlighted]:text-white">
                                {isServerGateCompany(company)
                                  ? `Shared from server · ${company.ownerEmail || ownerNames[company.ownerId] || ""}`
                                  : (
                                    <>
                                      Shared by:{" "}
                                      {ownerNames[company.ownerId]
                                        ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})`
                                        : company.ownerEmail || ""}
                                    </>
                                  )}
                              </div>
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              ) : onlineList.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No online companies.</p>
              ) : (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-1">
                  {myOnlineDisplay.length > 0 ? (
                    <div className="mb-2">
                      <DropdownMenuLabel className="pl-2 text-[11px] text-muted-foreground">
                        My online companies
                      </DropdownMenuLabel>
                      {myOnlineDisplay.map((company) => (
                        <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                          <Building2 className="mr-2 h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{company.name}</span>
                          {company.id === companyId && (
                            <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ) : null}
                  {sharedOnlineDisplay.length > 0 ? (
                    <div>
                      <DropdownMenuLabel className="pl-2 text-[11px] text-muted-foreground">
                        Shared online companies
                      </DropdownMenuLabel>
                      {sharedOnlineDisplay.map((company) => (
                        <DropdownMenuItem
                          key={company.id}
                          onSelect={() => handleSelectCompany(company)}
                          className="flex flex-col items-stretch py-2 group"
                        >
                          <div className="flex w-full items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">{company.name}</span>
                            {company.id === companyId && (
                              <Check className="h-4 w-4 shrink-0 text-green-600" />
                            )}
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
                  <span>{isOfflineCompanyStorage(activeCompany) ? "Add User" : "Share"}</span>
                </DropdownMenuItem>
              )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>

      <AddLocalCompanyUserDialog
        company={dialogState.type === "addLocalUser" ? dialogState.company : null}
        open={dialogState.type === "addLocalUser"}
        onOpenChange={(open) => {
          if (!open) setDialogState({ type: null, company: null });
        }}
        onUserAdded={() => {
          reloadLocalCompanyRegistry();
          triggerSync();
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
                <>
                  Open <span className="font-medium text-foreground">&quot;{companyToUnlock.name}&quot;</span>.
                </>
              ) : (
                <>
                  Open <span className="font-medium text-foreground">&quot;{companyToUnlock?.name}&quot;</span>.
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
              disabled={isVerifying}
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
