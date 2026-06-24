
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
import { useState, useEffect, useMemo, useRef } from "react";
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
import { clearLocalAuth, getLocalAuthToken, setLocalAuthToken } from "@/lib/localApiClient";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import {
  OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS,
  readAnyStoredOfflineUnlockSessionForCompany,
  readStoredOfflineUnlockSession,
  saveOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
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
  type CompanyListTab,
} from "@/lib/companyStorageKind";
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

/** Offline login + online company password dono: same "Remember for" options (localStorage expiry alag module). */
function RememberCompanyPasswordDurationSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Remember for</Label>
      <select
        id={id}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={0}>Every time (ask password)</option>
        <option value={1}>1 day</option>
        <option value={7}>7 days</option>
        <option value={14}>14 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
        <option value={180}>180 days</option>
        <option value={OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS}>Never ask again</option>
      </select>
      <p className="text-[11px] text-muted-foreground">
        Don't ask for the password again on this browser for the selected duration (same device + account).
      </p>
    </div>
  );
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
  const { setCompanyId, companyId, allCompanies: contextCompanies, loading: contextCompanyLoading, triggerSync, reloadLocalCompanyRegistry } = useCompany();
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
    if (!preselect || getLocalAuthToken(preselect)) return;
    const co = companies.find((c) => c.id === preselect);
    if (!co || !isOfflineCompanyStorage(co)) return;
    remoteAutoUnlockAttemptedRef.current = true;
    void (async () => {
      if (await shouldPromptCompanyUnlockAsync(co, user?.email)) {
        setCompanyToUnlock(co);
        setUsernameInput("");
        setPasswordInput("");
        setRememberUnlockDays(0);
      }
    })();
  }, [companies, user?.email]);

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

    if (isLocalOnlyMode()) {
      const raw = contextCompanies || [];
      setCompanies(raw.filter(isCompanyVisibleInSelector));
      return;
    }
    if (!user) {
      setCompanies([]);
      return;
    }
    const map = new Map<string, CompanyData>();
    mergeIntoMap(map, (initialCompanies ?? []).filter(isCompanyVisibleInSelector));
    // Drive restore/join: device-local rows SQLite se — parent Firestore list me nahi hote.
    // Online owned + shared dono context se — EXE new tab par header jaisa poora list.
    (contextCompanies || []).forEach((c) => {
      if (!isCompanyVisibleInSelector(c)) return;
      if (isOfflineCompanyStorage(c)) {
        const driveSharedJoin =
          (c as CompanyData & { driveSharedJoin?: boolean }).driveSharedJoin === true;
        map.set(c.id, {
          ...c,
          storageOption: "local",
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
  }, [user, contextCompanies, contextCompanyLoading, parentCompaniesListSig, initialCompanies]);


  const handleSelectCompany = async (company: CompanyData) => {
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
    if (isOfflineCompanyStorage(company)) {
      const remembered =
        readStoredOfflineUnlockSession(user?.uid, company.id) ||
        readAnyStoredOfflineUnlockSessionForCompany(company.id);
      if (remembered) {
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
    if (await shouldPromptCompanyUnlockAsync(company, user?.email)) {
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
          ? 0
          : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, company.id, user?.email)
      );
    } else {
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
        saveOfflineUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays, token, localUser);
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

  const selectorCompanies = allCompanies;
  const buckets = useMemo(
    () => partitionCompaniesForSelector(selectorCompanies),
    [selectorCompanies]
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
  const myOnlineDisplay = useMemo(() => onlineList.filter((c) => c.isOwned), [onlineList]);
  const sharedOnlineDisplay = useMemo(
    () => onlineList.filter((c) => isSharedOnlineCompany(c)),
    [onlineList]
  );
  const [listTab, setListTab] = useState<CompanyListTab>(() => defaultSelectorTab(companyId, buckets));

  useEffect(() => {
    setListTab(defaultSelectorTab(companyId, buckets));
  }, [companyId, localTabCompanies.length, onlineTabCompanies.length]);

  const handleLogout = () => {
    requestEmbeddedLogout();
  };

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedOnlineDisplay.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedOnlineDisplay]
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
    <li
      key={company.id}
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
    </li>
    );
  };

  const hasAnyCompany = localList.length > 0 || onlineList.length > 0;

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
            {!hasAnyCompany && (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  No companies found yet. Create one to get started.
                </p>
                <Button type="button" className="w-full sm:w-auto" onClick={() => router.push("/company/create")}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Company
                </Button>
              </div>
            )}
            {hasAnyCompany ? (
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
                  {localList.length === 0 ? (
                    <p className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                      No local companies on this device. Create an offline company or restore a backup to Local.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {localList.map((company) => (
                        <CompanyItem key={company.id} company={company} />
                      ))}
                    </ul>
                  )}
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
                              <CompanyItem key={company.id} company={company} />
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
            ) : null}
          </CardContent>
          {hasAnyCompany ? (
            <CardFooter className="shrink-0 flex flex-col sm:flex-row gap-2 justify-center border-t bg-card pt-4">
              <Button type="button" variant="outline" onClick={() => router.push("/company/create")}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Company
              </Button>
            </CardFooter>
          ) : null}
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
            if (closing && !isOfflineCompanyStorage(closing)) {
              setRememberUnlockDays(
                readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, closing.id, user?.email)
              );
            } else {
              setRememberUnlockDays(0);
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
        readStoredOfflineUnlockSession(user?.uid, selectedCompany.id) ||
        readAnyStoredOfflineUnlockSessionForCompany(selectedCompany.id);
      if (remembered) {
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
    if (await shouldPromptCompanyUnlockAsync(selectedCompany, user?.email)) {
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
          ? 0
          : readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, selectedCompany.id, user?.email)
      );
    } else {
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
        saveOfflineUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays, token, localUser);
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
  
  const buckets = useMemo(() => partitionCompaniesForSelector(companies), [companies]);
  const {
    localTabCompanies,
    onlineTabCompanies,
  } = buckets;
  const localList = useMemo(
    () => ensureSelectedInTabList(localTabCompanies, companyId, companies, "local"),
    [localTabCompanies, companyId, companies]
  );
  const onlineList = useMemo(
    () => ensureSelectedInTabList(onlineTabCompanies, companyId, companies, "online"),
    [onlineTabCompanies, companyId, companies]
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
  }, [menuOpen, companyId, localTabCompanies.length, onlineTabCompanies.length, buckets]);

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedOnlineDisplay.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedOnlineDisplay]
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
          {(localList.length > 0 || onlineList.length > 0) && (
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
                  <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-1">
                    {localList.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                        <Building2 className="mr-2 h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{company.name}</span>
                        {company.id === companyId && (
                          <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                        )}
                      </DropdownMenuItem>
                    ))}
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
          )}
          {(localList.length > 0 || onlineList.length > 0) && <DropdownMenuSeparator />}
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
            if (closing && !isOfflineCompanyStorage(closing)) {
              setRememberUnlockDays(
                readCloudCompanyPasswordUnlockPreferenceDays(user?.uid, closing.id, user?.email)
              );
            } else {
              setRememberUnlockDays(0);
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
