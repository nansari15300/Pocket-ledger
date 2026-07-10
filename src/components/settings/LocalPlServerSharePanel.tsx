"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Eye, EyeOff, Loader2, PlusCircle, RotateCcw, Trash2 } from "lucide-react";
import {
  getElectronLocalServerApi,
  resolveLocalAppServerSharingPort,
  type LocalAppServerAccessTokenSummary,
  type LocalAppServerStatus,
} from "@/lib/electronLocalServer";
import { isLocalCompanyHostShareable } from "@/lib/listShareableLocalCompaniesForHost";
import type { Company } from "@/hooks/useCompany";
import { useCompany } from "@/hooks/useCompany";
import { LOCAL_COMPANY_APP_ROLES } from "@/lib/localCompanyAppRoles";
import {
  inviteUserToPlServerShare,
  resendPlServerShareInvite,
  tokenRowsForCompany,
  type PlServerShareUserRow,
} from "@/lib/plServerShareInviteFlow";
import { buildPlServerInviteUrlList, applySelectedInviteUrls } from "@/lib/plServerPublicHostUrl";
import { cn } from "@/lib/utils";
import {
  companyProfileGreenZone,
  cloudSyncShareTableClass,
  cloudSyncShareTableShell,
} from "@/lib/companyProfileChrome";

const normalizeEmail = (email?: string) => String(email || "").trim().toLowerCase();

function avatarUrl(email: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`;
}

function initials(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "U";
  const parts = s.includes("@") ? s.split("@")[0].split(/[.\s_-]+/) : s.split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U";
}

type Props = {
  companyId?: string | null;
  companyName?: string;
  allCompaniesRegistry: Company[];
  serverStatus?: LocalAppServerStatus | null;
  variant?: "settings" | "manageShare";
  disabled?: boolean;
  onUsersChanged?: () => void;
};

export function LocalPlServerSharePanel({
  companyId,
  companyName,
  allCompaniesRegistry,
  serverStatus,
  variant = "settings",
  disabled,
  onUsersChanged,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { localCompanyRegistryEpoch, companyId: activeCompanyId, company: activeCompany } = useCompany();
  const effectiveCompanyId = String(companyId || activeCompanyId || "").trim();
  const effectiveCompanyName =
    companyName ||
    activeCompany?.name ||
    allCompaniesRegistry.find((c) => c.id === effectiveCompanyId)?.name ||
    effectiveCompanyId;
  const [tokens, setTokens] = useState<LocalAppServerAccessTokenSummary[]>([]);
  const [hostShareable, setHostShareable] = useState(false);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [appUsers, setAppUsers] = useState<
    Array<{ id: string; email?: string; displayName?: string; photoURL?: string }>
  >([]);

  const [shareEmail, setShareEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [showPw, setShowPw] = useState(false);
  const [localServerStatus, setLocalServerStatus] = useState(serverStatus ?? null);

  useEffect(() => {
    if (serverStatus) {
      setLocalServerStatus(serverStatus);
      return;
    }
    const api = getElectronLocalServerApi();
    if (!api?.getStatus) return;
    void api.getStatus().then(setLocalServerStatus).catch(() => undefined);
  }, [serverStatus]);

  useEffect(() => {
    let cancelled = false;
    setCompaniesLoading(true);
    const registryRow =
      activeCompany?.id === effectiveCompanyId
        ? activeCompany
        : allCompaniesRegistry.find((c) => c.id === effectiveCompanyId) ?? null;
    void isLocalCompanyHostShareable(effectiveCompanyId, allCompaniesRegistry, registryRow).then((ok) => {
      if (!cancelled) {
        setHostShareable(ok);
        setCompaniesLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId, allCompaniesRegistry, localCompanyRegistryEpoch, activeCompany]);

  const scopedCompanyIds = useMemo(() => {
    if (!effectiveCompanyId || !hostShareable) return [];
    return [effectiveCompanyId];
  }, [effectiveCompanyId, hostShareable]);

  const refreshTokens = useCallback(async () => {
    const api = getElectronLocalServerApi();
    if (!api?.listAccessTokens) {
      setTokens([]);
      setLoading(false);
      return;
    }
    try {
      setTokens(await api.listAccessTokens());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  const userRows = useMemo(
    () => tokenRowsForCompany(tokens, effectiveCompanyId || undefined),
    [tokens, effectiveCompanyId]
  );

  const ownerEmail = user?.email || "";

  useEffect(() => {
    const emails = [...new Set([ownerEmail, ...userRows.map((r) => r.email)].filter(Boolean))];
    if (!emails.length) return;
    const qy = query(collection(firestore, "users"), where("email", "in", emails.slice(0, 10)));
    const unsub = onSnapshot(qy, (snap) => {
      setAppUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as typeof appUsers);
    });
    return () => unsub();
  }, [ownerEmail, userRows]);

  useEffect(() => {
    if (!addOpen) return;
    setShareEmail("");
    setDisplayName("");
    setLoginUsername("");
    setPassword("");
    setRole("manager");
    setShowPw(false);
  }, [addOpen]);

  const resolveCompanyNames = (ids: string[]) =>
    ids
      .map(
        (id) =>
          (id === effectiveCompanyId ? effectiveCompanyName : null) ||
          allCompaniesRegistry.find((c) => c.id === id)?.name ||
          id
      )
      .join(", ");

  const selectedCompanyIds = scopedCompanyIds;

  const resolveShareInviteStatus = useCallback(async (): Promise<LocalAppServerStatus | null> => {
    const api = getElectronLocalServerApi();
    if (api?.getStatus) {
      try {
        const fresh = await api.getStatus();
        setLocalServerStatus(fresh);
        return fresh;
      } catch {
        /* fall through */
      }
    }
    return localServerStatus;
  }, [localServerStatus]);

  const resolveSharingPort = (status: LocalAppServerStatus | null | undefined): number | null =>
    resolveLocalAppServerSharingPort(status);

  const handleShare = async () => {
    const email = shareEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      toast({ variant: "destructive", title: "Valid Gmail required" });
      return;
    }
    if (!loginUsername.trim() || !password.trim()) {
      toast({ variant: "destructive", title: "Login username and password required" });
      return;
    }
    if (!selectedCompanyIds.length) {
      toast({
        variant: "destructive",
        title: "Select a local company",
        description: "Header se Local tab me apni local company select karein — online companies Firebase se share hoti hain.",
      });
      return;
    }
    if (!user?.uid) {
      toast({ variant: "destructive", title: "Sign in required" });
      return;
    }

    const status = await resolveShareInviteStatus();
    const sharingPort = resolveSharingPort(status);
    if (!sharingPort) {
      toast({
        variant: "destructive",
        title: "Start server sharing first",
        description: "Remote sharing must be active (not just app UI on port 3000) before sending invites.",
      });
      return;
    }
    const api = getElectronLocalServerApi();
    const cfg = api?.getConfig ? await api.getConfig().catch(() => null) : null;
    const allUrls = buildPlServerInviteUrlList({
      urls: status?.urls || [],
      publicHost: status?.publicHost,
      port: sharingPort,
    });
    const urls = applySelectedInviteUrls(allUrls, cfg?.selectedInviteUrls);
    if (!urls.length) {
      toast({
        variant: "destructive",
        title: "No invite addresses selected",
        description: "Server settings me kam se kam ek server address tick karein.",
      });
      return;
    }

    setBusy(true);
    try {
      const result = await inviteUserToPlServerShare({
        recipientEmail: email,
        displayName: displayName.trim() || email,
        loginUsername: loginUsername.trim(),
        password: password.trim(),
        role,
        allowedCompanyIds: selectedCompanyIds,
        senderUserId: user.uid,
        senderEmail: user.email,
        senderName: user.displayName,
        serverUrls: urls,
        publicHost: status?.publicHost,
        serverPort: sharingPort,
        gateLabel: effectiveCompanyName ? `${effectiveCompanyName} server` : "Pocket Ledger server",
        companyNames: resolveCompanyNames(selectedCompanyIds),
      });
      if (result.ok === false) {
        toast({ variant: "destructive", title: "Share failed", description: result.reason });
        return;
      }
      toast({
        title: "Shared",
        description: `${email} will get a Messages alert with server addresses.`,
      });
      setAddOpen(false);
      await refreshTokens();
      onUsersChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const revokeUser = async (row: PlServerShareUserRow) => {
    const api = getElectronLocalServerApi();
    if (!api?.revokeAccessToken) return;
    setBusyEmail(row.email);
    try {
      await api.revokeAccessToken(row.tokenId);
      toast({ title: "Access removed", description: row.email });
      await refreshTokens();
      onUsersChanged?.();
    } finally {
      setBusyEmail(null);
    }
  };

  const resendInvite = async (row: PlServerShareUserRow) => {
    if (!user?.uid) {
      toast({ variant: "destructive", title: "Sign in required" });
      return;
    }
    const status = await resolveShareInviteStatus();
    const sharingPort = resolveSharingPort(status);
    if (!sharingPort) {
      toast({
        variant: "destructive",
        title: "Start server sharing first",
        description: "Remote sharing must be active before resending invites.",
      });
      return;
    }
    const api = getElectronLocalServerApi();
    const cfg = api?.getConfig ? await api.getConfig().catch(() => null) : null;
    const allUrls = buildPlServerInviteUrlList({
      urls: status?.urls || [],
      publicHost: status?.publicHost,
      port: sharingPort,
    });
    const urls = applySelectedInviteUrls(allUrls, cfg?.selectedInviteUrls);
    if (!urls.length) {
      toast({
        variant: "destructive",
        title: "No invite addresses selected",
        description: "Server settings me kam se kam ek server address tick karein.",
      });
      return;
    }
    const companyIds =
      row.allowedCompanyIds.length > 0
        ? row.allowedCompanyIds
        : scopedCompanyIds;
    setBusyEmail(row.email);
    try {
      const result = await resendPlServerShareInvite({
        tokenId: row.tokenId,
        recipientEmail: row.email,
        displayName: row.name,
        allowedCompanyIds: companyIds,
        senderUserId: user.uid,
        senderEmail: user.email,
        senderName: user.displayName,
        serverUrls: urls,
        publicHost: status?.publicHost,
        serverPort: sharingPort,
        gateLabel: effectiveCompanyName ? `${effectiveCompanyName} server` : "Pocket Ledger server",
        companyNames: resolveCompanyNames(companyIds),
      });
      if (result.ok === false) {
        toast({ variant: "destructive", title: "Resend failed", description: result.reason });
        return;
      }
      toast({
        title: "Invite resent",
        description: `${row.email} will get a fresh Messages alert with new server addresses.`,
      });
      await refreshTokens();
      onUsersChanged?.();
    } finally {
      setBusyEmail(null);
    }
  };

  const isManageShare = variant === "manageShare";
  const panelLoading = loading || companiesLoading;

  if (!hostShareable && !companiesLoading) {
    return (
      <p className="text-xs text-amber-700">
        {effectiveCompanyId
          ? "Selected company is online-only — use Manage Sharing (Firebase) for that. P2P server sirf pure local companies ke liye hai."
          : "Header se Local tab me local company select karein. Online companies Firebase se share hoti hain — local server par nahi."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {isManageShare ? "Shared users (local server)" : "Share this local company via P2P server"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Company: <strong>{effectiveCompanyName}</strong>. Firebase sirf invite bhejta hai (IP + token) — ledger is PC par rehta hai.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy || panelLoading || !hostShareable}
          onClick={() => setAddOpen(true)}
        >
          <PlusCircle className="mr-1.5 h-4 w-4" />
          Add Person
        </Button>
      </div>

      <div className={cn(isManageShare ? companyProfileGreenZone : cloudSyncShareTableShell, "overflow-x-auto")}>
        {panelLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : (
          <Table className={cloudSyncShareTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-2/5">Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerEmail ? (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user?.photoURL || avatarUrl(ownerEmail)} />
                        <AvatarFallback>{initials(user?.displayName || ownerEmail)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm truncate">{ownerEmail}</div>
                        <span className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5">
                          <Crown className="h-3 w-3" /> OWNER
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user?.displayName || "Owner"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Host (this company)</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">Owner</TableCell>
                </TableRow>
              ) : null}
              {userRows.map((row) => {
                const profile = appUsers.find((u) => normalizeEmail(u.email) === normalizeEmail(row.email));
                const name = profile?.displayName || row.name;
                return (
                  <TableRow key={row.tokenId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={profile?.photoURL || avatarUrl(row.email)} />
                          <AvatarFallback>{initials(name || row.email)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{row.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {effectiveCompanyName}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={disabled || !!busyEmail}
                          title="Resend share invite"
                          onClick={() => void resendInvite(row)}
                        >
                          {busyEmail === row.email ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={disabled || !!busyEmail}
                          title="Remove access"
                          onClick={() => void revokeUser(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!userRows.length && !ownerEmail ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No shared users yet. Click Add Person to invite by Gmail.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share local server access</DialogTitle>
            <DialogDescription>
              User ko Messages me server addresses + token milega. Woh IP select karke P2P se connect karega — ledger Firebase par nahi jata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Company: </span>
              <strong>{effectiveCompanyName}</strong>
            </div>
            <div className="space-y-1">
              <Label>Gmail</Label>
              <Input
                type="email"
                placeholder="staff@gmail.com"
                value={shareEmail}
                onChange={(e) => {
                  setShareEmail(e.target.value);
                  if (!loginUsername.trim() && e.target.value.includes("@")) {
                    setLoginUsername(e.target.value.split("@")[0] || "");
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Staff name" />
            </div>
            <div className="space-y-1">
              <Label>Login username (on shared companies)</Label>
              <Input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCAL_COMPANY_APP_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleShare()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
