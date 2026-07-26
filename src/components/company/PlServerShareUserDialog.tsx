"use client";

/**
 * "Share local server access" — Settings → Local server → Add Person wala same dialog,
 * ab company selector / create company / edit company se bhi (local company bhi PL server par hi share hoti hai).
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { inviteUserToPlServerShare } from "@/lib/plServerShareInviteFlow";
import { getElectronLocalServerApi, resolveLocalAppServerSharingPort } from "@/lib/electronLocalServer";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { parseLocalCompanyUserRows, upsertUserInList } from "@/lib/localCompanyUsers";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";
import { LOCAL_COMPANY_APP_ROLES } from "@/lib/localCompanyAppRoles";

export type PlServerShareUserDraft = {
  name: string;
  username: string;
  role: string;
  password: string;
  shareEmail: string;
};

type Props = {
  companyId: string | null | undefined;
  companyName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded?: () => void;
  /** Create-company flow: company abhi bani nahi — user ko queue karo, SQLite/invite baad me. */
  mode?: "save" | "queue";
  onQueueUser?: (draft: PlServerShareUserDraft) => void;
};

export function PlServerShareUserDialog({
  companyId,
  companyName,
  open,
  onOpenChange,
  onUserAdded,
  mode = "save",
  onQueueUser,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shareEmail, setShareEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveCompanyId = String(companyId || "").trim();
  const effectiveCompanyName = String(companyName || "").trim() || effectiveCompanyId;

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setShareEmail("");
      setDisplayName("");
      setLoginUsername("");
      setPassword("");
      setRole("manager");
      setShowPw(false);
    }
  }

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
    if (mode === "queue") {
      onQueueUser?.({
        name: displayName.trim() || email,
        username: loginUsername.trim(),
        role,
        password: password.trim(),
        shareEmail: email,
      });
      onOpenChange(false);
      return;
    }
    if (!effectiveCompanyId) {
      toast({ variant: "destructive", title: "Select a company first" });
      return;
    }
    if (!user?.uid) {
      toast({ variant: "destructive", title: "Sign in required" });
      return;
    }

    setBusy(true);
    try {
      let serverUrls: string[] = [];
      let serverPort: number | undefined;
      let publicHost = "";
      const api = getElectronLocalServerApi();
      if (api?.getStatus) {
        const [liveStatus, liveConfig] = await Promise.all([
          api.getStatus().catch(() => null),
          api.getConfig?.().catch(() => null),
        ]);
        if (liveStatus?.urls?.length) serverUrls = liveStatus.urls;
        serverPort = resolveLocalAppServerSharingPort(liveStatus) ?? undefined;
        publicHost = String(liveConfig?.publicHost || "").trim();
      }

      const result = await inviteUserToPlServerShare({
        recipientEmail: email,
        displayName: displayName.trim() || email,
        loginUsername: loginUsername.trim(),
        password: password.trim(),
        role,
        allowedCompanyIds: [effectiveCompanyId],
        senderUserId: user.uid,
        senderEmail: user.email,
        senderName: user.displayName,
        serverUrls,
        publicHost,
        serverPort,
        gateLabel: effectiveCompanyName ? `${effectiveCompanyName} server` : "Pocket Ledger server",
        companyNames: effectiveCompanyName,
      });
      if (result.ok === false) {
        toast({ variant: "destructive", title: "Share failed", description: result.reason });
        return;
      }

      const doc = await getLocalCompanyById(effectiveCompanyId, { includeDeleted: true });
      if (doc) {
        const prev = parseLocalCompanyUserRows((doc as { localCompanyUsers?: unknown }).localCompanyUsers);
        const next = upsertUserInList(prev, {
          username: loginUsername.trim(),
          displayName: displayName.trim() || email,
          role,
          password: password.trim(),
          shareEmail: email,
        });
        await upsertLocalCompany({
          ...(doc as LocalCompanyDoc),
          id: effectiveCompanyId,
          localCompanyUsers: next,
          updatedAt: Date.now(),
        });
        await flushPendingBrowserDbSave();
        bumpLocalCompanyRegistry();
        void import("@/lib/plServerCompanyMetaSync").then(({ notifyPlServerHostCompanyMetaSaved }) =>
          notifyPlServerHostCompanyMetaSaved(effectiveCompanyId)
        );
      }

      toast({
        title: "User saved",
        description: "Ask the user to add this server IP:port in Gate, then login with the username/password.",
      });
      onUserAdded?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not add user",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share local server access</DialogTitle>
          <DialogDescription>
            {mode === "queue"
              ? "This user is created with the company. They will manually add the server IP:port in Gate."
              : "This only creates a local username/password. User will manually add the server IP:port in Gate."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {effectiveCompanyName ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Company: </span>
              <strong>{effectiveCompanyName}</strong>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Gmail</Label>
            <Input
              type="email"
              placeholder="staff@gmail.com"
              value={shareEmail}
              onChange={(e) => {
                const value = e.target.value;
                setShareEmail(value);
                if (value.includes("@")) {
                  const prefix = value.split("@")[0] || "";
                  if (!loginUsername.trim()) setLoginUsername(prefix);
                  if (!displayName.trim()) setDisplayName(prefix);
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleShare()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
