
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
import { useState, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { useSidebar } from "../ui/sidebar";
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
import { auth, firestore, signOutWithFirestoreTeardown } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { pruneRememberedLoginEmailIfDisabled } from "@/lib/loginRememberEmail";
import { disableLocalGuest, isLocalGuestEnabled } from "@/lib/localGuestSession";
import {
  shouldPromptCompanyUnlock,
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
import { localAuthLoginClientOnly } from "@/lib/localCompanyUsers";
import { clearLocalAuth, setLocalAuthToken } from "@/lib/localApiClient";
import {
  OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS,
  readStoredOfflineUnlockSession,
  saveOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import {
  readCloudCompanyPasswordUnlockSession,
  saveCloudCompanyPasswordUnlockSession,
} from "@/lib/cloudCompanyPasswordUnlockRemember";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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
        Is browser par itne din tak dubara password mat poochna (same device + login account).
      </p>
    </div>
  );
}

const GoogleDriveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 512 512">
      <path d="M339 339l-22.5-39h-73l-22.5 39H339zm-10.5-52.5l-40.5-70.5h-45l-40.5 70.5h126z" fill="#26a65b"/>
      <path d="M139.5 286.5l-40.5-70.5-22.5 39-22.5 39 63 111 63-111-22.5-39z" fill="#fcc10a"/>
      <path d="M372.5 216l-63 111 63-111-63-111h126l-63 111z" fill="#1e88e5"/>
  </svg>
);


export function CompanySelector({ companies: initialCompanies }: { companies: CompanyData[] }) {
  const router = useRouter();
  const { user } = useAuth();
  // Local mode: list useCompany context se (local DB + mirror) — alag listLocalCompanies se sab ko isOwned true galat tha.
  const { setCompanyId, allCompanies: contextCompanies, loading: contextCompanyLoading, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const [dialogState, setDialogState] = useState<{
    type: "share" | "addLocalUser" | "delete" | null;
    company: CompanyData | null;
  }>({ type: null, company: null });
  const [companies, setCompanies] = useState<CompanyData[]>(() =>
    (initialCompanies ?? []).filter((c) => !c.isDeleted)
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

  useEffect(() => {
    if (isLocalOnlyMode()) {
      const raw = contextCompanies || [];
      setCompanies(raw.filter((c) => !c.isDeleted));
      return;
    }
    // Online: parent `/company` page is the single source — Firestore listeners + loading gate live there only.
    // Duplicate listeners here used to merge with stale `prev` and briefly showed the previous account's companies after login swap.
    if (!user) {
      setCompanies([]);
      return;
    }
    setCompanies((initialCompanies ?? []).filter((c) => !c.isDeleted));
  }, [user, contextCompanies, contextCompanyLoading, initialCompanies]);


  const handleSelectCompany = (company: CompanyData) => {
    if (isOfflineCompanyStorage(company)) {
      const remembered = readStoredOfflineUnlockSession(user?.uid, company.id);
      if (remembered) {
        setLocalAuthToken(company.id, remembered.token, remembered.user);
        setCompanyId(company.id);
        router.push("/dashboard");
        return;
      }
    }
    // Online company: pehle se valid "remember company password" window — dialog skip
    if (!isOfflineCompanyStorage(company) && readCloudCompanyPasswordUnlockSession(user?.uid, company.id)) {
      setCompanyId(company.id);
      router.push("/dashboard");
      return;
    }
    if (shouldPromptCompanyUnlock(company, user?.email)) {
      setCompanyToUnlock(company);
      const row = company as CompanyData & { isOwned?: boolean };
      const remembered =
        isOnlineSharedCompany(row) && company.password
          ? readRememberedSharedUnlockUsername(user?.uid, company.id)
          : null;
      setUsernameInput(remembered ?? "");
      setRememberSharedUsername(!!remembered);
      setPasswordInput("");
      setRememberUnlockDays(0);
    } else {
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
            description: "Login username aur password dono daalein.",
          });
          return;
        }
        const { token, user: localUser } = await localAuthLoginClientOnly(companyToUnlock.id, u, p);
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
          saveCloudCompanyPasswordUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays);
        }
        if (isOnlineSharedCompany(row)) {
          if (rememberSharedUsername) {
            saveRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id, usernameInput.trim());
          } else {
            clearRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id);
          }
        }
        clearLocalAuth(companyToUnlock.id);
        toast({ title: "Access Granted", description: `Welcome to ${companyToUnlock.name}.` });
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
    const isOwnedByUser = (c: CompanyData) =>
      c.ownerId === user?.uid ||
      (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
    companies.forEach(c => {
        if (c.isDeleted) return;
        if (!companyMap.has(c.id)) {
            companyMap.set(c.id, { ...c, isOwned: isOwnedByUser(c) });
        }
    });
    return Array.from(companyMap.values());
  }, [companies, user]);

  const ownedCompanies = allCompanies.filter(c => c.isOwned);
  const sharedCompanies = allCompanies.filter(c => !c.isOwned);
  // Header dropdown jaisa: offline/local storage vs cloud-owned alag section (select page par bhi same grouping).
  const isOfflineCompany = (c: CompanyData) =>
    ((c as CompanyData & { storageOption?: string }).storageOption || "local").toLowerCase() === "local";
  const localOwnedCompanies = useMemo(
    () => ownedCompanies.filter((c) => isOfflineCompany(c)),
    [ownedCompanies]
  );
  const cloudOwnedCompanies = useMemo(
    () => ownedCompanies.filter((c) => !isOfflineCompany(c)),
    [ownedCompanies]
  );
  // Shared + local storage: "Shared With You" me sab mat milao — offline shared alag dikhayo (dropdown jaisa intent)
  const sharedLocalCompanies = useMemo(
    () => sharedCompanies.filter((c) => isOfflineCompany(c)),
    [sharedCompanies]
  );
  const sharedCloudCompanies = useMemo(
    () => sharedCompanies.filter((c) => !isOfflineCompany(c)),
    [sharedCompanies]
  );

  const handleLogout = async () => {
    const { clearNavigationMemory } = await import("@/lib/navigation-memory");
    clearNavigationMemory();
    pruneRememberedLoginEmailIfDisabled();
    if (isLocalGuestEnabled()) {
      disableLocalGuest();
      router.replace("/");
      return;
    }
    await signOutWithFirestoreTeardown(auth);
    router.replace("/");
  };

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedCompanies.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedCompanies]
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
    return (
    <li key={company.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <button
        className="flex-1 flex items-center gap-4 text-left"
        onClick={() => handleSelectCompany(company)}
      >
        <Building2 className="h-6 w-6 text-muted-foreground" />
        <span className="text-lg font-medium">{company.name}</span>
        
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

  const hasAnyCompany =
    localOwnedCompanies.length > 0 ||
    sharedLocalCompanies.length > 0 ||
    cloudOwnedCompanies.length > 0 ||
    sharedCloudCompanies.length > 0;

  return (
    <>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="space-y-1">
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
          <CardContent className="space-y-6">
            {!hasAnyCompany && (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center space-y-4">
                <p className="text-sm text-muted-foreground">No companies yet. Create one to get started.</p>
                <Button type="button" className="w-full sm:w-auto" onClick={() => router.push("/company/create")}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Company
                </Button>
              </div>
            )}
            {/* Order: 1) owned local 2) shared local 3) owned online 4) shared online — user-requested labels */}
            {localOwnedCompanies.length > 0 && (
              <div className="rounded-lg border border-dashed bg-muted/25 p-3">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">My Company Local</h3>
                <ul className="space-y-3">
                  {localOwnedCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
            {sharedLocalCompanies.length > 0 && (
              <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-3">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Shared Companies Local</h3>
                <ul className="space-y-3">
                  {sharedLocalCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
            {cloudOwnedCompanies.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">My Online Companies</h3>
                <ul className="space-y-3">
                  {cloudOwnedCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
            {sharedCloudCompanies.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Shared Online Companies</h3>
                <ul className="space-y-3">
                  {sharedCloudCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          {hasAnyCompany ? (
            <CardFooter className="flex justify-center">
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
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberUnlockDays(0);
            setRememberSharedUsername(false);
          }
        }}
      >
        <AlertDialogContent>
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
                        <strong>Apke share</strong> ke liye: user name me <strong>account email</strong>,{" "}
                        <strong>display name</strong>, ya email ka <strong>@ se pehle</strong> hissa — password wahi jo owner ne
                        aapke user ke liye set kiya hai.
                        {(companyToUnlock as CompanyData & { password?: string }).password ? (
                          <>
                            {" "}
                            Ya Company Profile wala <strong>Admin username</strong> + <strong>Protect company</strong> password.
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {" "}
                        Company Profile wala <strong>Admin username</strong> aur <strong>Protect company</strong> password
                        daalein.
                      </>
                    )
                  ) : (
                    <> Neeche company password daalein.</>
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
                      autoComplete="username"
                      placeholder={
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Email, display name, ya email ka pehla hissa"
                          : "Company Profile → Admin username"
                      }
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmit()}
                    />
                    {companyToUnlock &&
                      isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) && (
                        <div className="flex items-center space-x-2 pt-1">
                          <Checkbox
                            id="cs-remember-shared-username"
                            checked={rememberSharedUsername}
                            onCheckedChange={(v) => setRememberSharedUsername(v === true)}
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
                      ? "Password (aapke share ke liye)"
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
                          ? "Jo owner ne aapke user ke liye set kiya"
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVerifying}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={isVerifying} onClick={() => void handlePasswordSubmit()}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlock
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CompanyActions({ companies, onCompanyCreated }: { companies: CompanyData[], onCompanyCreated: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { companyId, setCompanyId, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { isOpen } = useSidebar();
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

  const activeCompany = companies.find(c => c.id === companyId) || companies[0];

  useEffect(() => {
    // Keep persisted selection stable; only auto-pick first when nothing is saved at all.
    if (!companyId && companies.length > 0 && !localStorage.getItem("companyId")) {
      setCompanyId(companies[0].id);
    }
  }, [companyId, companies, setCompanyId]);

  const handleSelectCompany = (selectedCompany: CompanyData) => {
    if (isOfflineCompanyStorage(selectedCompany)) {
      const remembered = readStoredOfflineUnlockSession(user?.uid, selectedCompany.id);
      if (remembered) {
        setLocalAuthToken(selectedCompany.id, remembered.token, remembered.user);
        setCompanyId(selectedCompany.id);
        return;
      }
    }
    if (!isOfflineCompanyStorage(selectedCompany) && readCloudCompanyPasswordUnlockSession(user?.uid, selectedCompany.id)) {
      setCompanyId(selectedCompany.id);
      return;
    }
    if (shouldPromptCompanyUnlock(selectedCompany, user?.email)) {
      setCompanyToUnlock(selectedCompany);
      const row = selectedCompany as CompanyData & { isOwned?: boolean };
      const remembered =
        isOnlineSharedCompany(row) && selectedCompany.password
          ? readRememberedSharedUnlockUsername(user?.uid, selectedCompany.id)
          : null;
      setUsernameInput(remembered ?? "");
      setRememberSharedUsername(!!remembered);
      setPasswordInput("");
      setRememberUnlockDays(0);
    } else {
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
            description: "Login username aur password dono daalein.",
          });
          return;
        }
        const { token, user: localUser } = await localAuthLoginClientOnly(companyToUnlock.id, u, p);
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
          saveCloudCompanyPasswordUnlockSession(user?.uid, companyToUnlock.id, rememberUnlockDays);
        }
        if (isOnlineSharedCompany(row)) {
          if (rememberSharedUsername) {
            saveRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id, usernameInput.trim());
          } else {
            clearRememberedSharedUnlockUsername(user?.uid, companyToUnlock.id);
          }
        }
        clearLocalAuth(companyToUnlock.id);
        toast({ title: "Access Granted", description: `Switched to ${companyToUnlock.name}.` });
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
  
  const ownedCompanies = companies.filter(c => c.isOwned);
  const sharedCompanies = companies.filter(c => !c.isOwned);
  // Local/company grouping helper: local storage companies ko dropdown me separate section me dikhana hai.
  const isOfflineCompany = (company: CompanyData) =>
    ((company as CompanyData & { storageOption?: string }).storageOption || "local").toLowerCase() === "local";
  // Keep local companies grouped for clearer visibility in selector.
  const localOwnedCompanies = useMemo(
    () => ownedCompanies.filter((company) => isOfflineCompany(company)),
    [ownedCompanies]
  );
  // Non-local (cloud/firebase) owned companies stay in cloud list.
  const cloudOwnedCompanies = useMemo(
    () => ownedCompanies.filter((company) => !isOfflineCompany(company)),
    [ownedCompanies]
  );
  const sharedLocalCompanies = useMemo(
    () => sharedCompanies.filter((company) => isOfflineCompany(company)),
    [sharedCompanies]
  );
  const sharedCloudCompanies = useMemo(
    () => sharedCompanies.filter((company) => !isOfflineCompany(company)),
    [sharedCompanies]
  );

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedCompanies.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedCompanies]
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-between h-9", !isOpen && "justify-center aspect-square p-0")} data-theme-header="company-selector">
            <div className="flex items-center gap-2 truncate">
              <Building2 />
              {isOpen && <span className="truncate">{activeCompany ? activeCompany.name : "No Company"}</span>}
              
            </div>
            {isOpen && <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
        <DropdownMenuContent className="w-64">
          {(localOwnedCompanies.length > 0 ||
            sharedLocalCompanies.length > 0 ||
            cloudOwnedCompanies.length > 0 ||
            sharedCloudCompanies.length > 0) && (
              <DropdownMenuGroup>
                {localOwnedCompanies.length > 0 && (
                  <div className="mb-2 rounded-md border bg-muted/20 p-1">
                    <DropdownMenuLabel className="pl-8 text-[11px] text-muted-foreground">My Company Local</DropdownMenuLabel>
                    {localOwnedCompanies.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                        <Building2 className="mr-2 h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{company.name}</span>
                        {company.id === companyId && <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
                {sharedLocalCompanies.length > 0 && (
                  <div className="mb-2 rounded-md border border-dashed bg-muted/25 p-1">
                    <DropdownMenuLabel className="pl-8 text-[11px] text-muted-foreground">Shared Companies Local</DropdownMenuLabel>
                    {sharedLocalCompanies.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)} className="flex flex-col items-stretch py-2 group">
                        <div className="flex items-center gap-2 w-full">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate font-medium">{company.name}</span>
                          {company.id === companyId && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                        </div>
                        {(company.ownerEmail || ownerNames[company.ownerId]) && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5 pl-6 group-data-[highlighted]:text-white">
                            Shared by: {ownerNames[company.ownerId] ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})` : (company.ownerEmail || "")}
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
                {cloudOwnedCompanies.length > 0 && (
                  <div className="mb-2 rounded-md border bg-muted/20 p-1">
                    <DropdownMenuLabel className="pl-8 text-[11px] text-muted-foreground">My Online Companies</DropdownMenuLabel>
                    {cloudOwnedCompanies.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                        <Building2 className="mr-2 h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{company.name}</span>
                        {company.id === companyId && <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
                {sharedCloudCompanies.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-1">
                    <DropdownMenuLabel className="pl-8 text-[11px] text-muted-foreground">Shared Online Companies</DropdownMenuLabel>
                    {sharedCloudCompanies.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)} className="flex flex-col items-stretch py-2 group">
                        <div className="flex items-center gap-2 w-full">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate font-medium">{company.name}</span>
                          {company.id === companyId && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                        </div>
                        {(company.ownerEmail || ownerNames[company.ownerId]) && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5 pl-6 group-data-[highlighted]:text-white">
                            Shared by: {ownerNames[company.ownerId] ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})` : (company.ownerEmail || "")}
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
              </DropdownMenuGroup>
          )}
          {(localOwnedCompanies.length > 0 ||
            sharedLocalCompanies.length > 0 ||
            cloudOwnedCompanies.length > 0 ||
            sharedCloudCompanies.length > 0) && <DropdownMenuSeparator />}
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
            setCompanyToUnlock(null);
            setUsernameInput("");
            setPasswordInput("");
            setRememberUnlockDays(0);
            setRememberSharedUsername(false);
          }
        }}
      >
        <AlertDialogContent>
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
                        <strong>Share password:</strong> email / display name / email prefix + aapka set password.
                        {(companyToUnlock as CompanyData & { password?: string }).password ? (
                          <>
                            {" "}
                            Ya <strong>Admin username</strong> + <strong>Protect company</strong> password.
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
                    <> Neeche company password daalein.</>
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
                      autoComplete="username"
                      placeholder={
                        isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) &&
                        onlineSharedHasPerUserPassword(companyToUnlock as CompanyData & { isOwned?: boolean }, user?.email)
                          ? "Email, display name, ya email ka pehla hissa"
                          : "Company Profile → Admin username"
                      }
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handlePasswordSubmitHeader()}
                    />
                    {companyToUnlock &&
                      isOnlineSharedCompany(companyToUnlock as CompanyData & { isOwned?: boolean }) && (
                        <div className="flex items-center space-x-2 pt-1">
                          <Checkbox
                            id="ca-remember-shared-username"
                            checked={rememberSharedUsername}
                            onCheckedChange={(v) => setRememberSharedUsername(v === true)}
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
                      ? "Password (aapke share ke liye)"
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
                          ? "Jo owner ne aapke user ke liye set kiya"
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVerifying}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={isVerifying} onClick={() => void handlePasswordSubmitHeader()}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Switch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
