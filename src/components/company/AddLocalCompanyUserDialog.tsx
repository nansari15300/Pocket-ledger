"use client";

/**
 * Select-company / header: offline company par "Add User" — Edit Company wala local API POST (same fields).
 * Drive share: Gmail + user password → encryption session + encrypted Drive sync.
 */
import { useState, useEffect } from "react";
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
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { appendLocalCompanyUserClient, parseLocalCompanyUserRows, upsertUserInList } from "@/lib/localCompanyUsers";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { isLocalOnlyMode } from "@/lib/localMode";
import type { Company } from "@/hooks/useCompany";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import { enableDriveEncryptionAndShareEmail } from "@/lib/localCloudSync/driveCloudSyncClient";
import { setBackupEncryptionSessionFromLogin } from "@/lib/serverBackupEncryption";
import { backfillLocalDocsToCloudSyncOutbox } from "@/lib/localCloudSync/backfillOutbox";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";

type Props = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SQLite/context list refresh after successful POST */
  onUserAdded?: () => void;
};

function driveShareEnabledForCompany(company: Company | null): boolean {
  if (!company) return false;
  const cfg = readCloudSyncConfigFromCompany(company as Record<string, unknown>);
  return cfg.cloudSyncEnabled === true && cfg.cloudSyncProvider === "google_drive";
}

export function AddLocalCompanyUserDialog({ company, open, onOpenChange, onUserAdded }: Props) {
  const driveShareMode = driveShareEnabledForCompany(company);
  const [displayName, setDisplayName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shareGmail, setShareGmail] = useState("");
  const [role, setRole] = useState("manager");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!open) {
      setDisplayName("");
      setLoginUsername("");
      setPassword("");
      setShareGmail("");
      setRole("manager");
      setShowPw(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!company?.id) return;
    const n = displayName.trim();
    const u = loginUsername.trim();
    const p = password.trim();
    const gmail = shareGmail.trim().toLowerCase();
    if (!n || !u || !p) {
      toast({
        variant: "destructive",
        title: "Details required",
        description: "Company user name, login username, and password are required.",
      });
      return;
    }
    if (driveShareMode && !gmail.includes("@")) {
      toast({
        variant: "destructive",
        title: "Gmail required",
        description: "Share with Gmail — Drive folder isi email par writer access ke saath share hoga.",
      });
      return;
    }
    if (!isLocalOnlyMode()) {
      toast({
        variant: "destructive",
        title: "Local only",
        description: "Add User works only in offline / local app mode.",
      });
      return;
    }
    setLoading(true);
    try {
      await appendLocalCompanyUserClient(company.id, {
        username: u,
        password: p,
        displayName: n,
        role: role.toLowerCase(),
      });

      if (!driveShareMode) {
        toast({
          title: "User added",
          description: `${n} can log in with username "${u}" when opening this company (or via your local server gate).`,
        });
        onOpenChange(false);
        onUserAdded?.();
        return;
      }

      // Gmail se bhi login ho sake — password sync `opening/users.json` me email row ke saath.
      if (gmail.toLowerCase() !== u.toLowerCase()) {
        const reg = await getLocalCompanyById(company.id, { includeDeleted: true });
        if (reg) {
          let localUsers = parseLocalCompanyUserRows((reg as { localCompanyUsers?: unknown }).localCompanyUsers);
          localUsers = upsertUserInList(localUsers, {
            username: gmail,
            displayName: n,
            role: role.toLowerCase(),
            password: p,
          });
          await upsertLocalCompany({ ...reg, localCompanyUsers: localUsers, updatedAt: Date.now() });
        }
      }

      // User password → is tab encryption session (Drive upload/decrypt jab company password na ho).
      await setBackupEncryptionSessionFromLogin(company.id, u, p);

      await enableDriveEncryptionAndShareEmail({
        companyId: company.id,
        companyName: typeof company.name === "string" ? company.name : undefined,
        shareEmail: gmail,
        appRole: role.toLowerCase(),
      });

      await backfillLocalDocsToCloudSyncOutbox(company.id);
      void runLocalCloudSyncCycle(company.id, { force: true });

      toast({
        title: "User added & Drive shared",
        description: `${n} can login on another device with this username/password. Drive folder shared with ${gmail} (encrypted ops).`,
      });
      onOpenChange(false);
      onUserAdded?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Add user failed.";
      toast({ variant: "destructive", title: "Add user failed", description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add company user</DialogTitle>
          <DialogDescription>
            Add a login for <span className="font-medium text-foreground">{company?.name ?? "this company"}</span>.
            {driveShareMode
              ? " User password is also used for Drive encryption. Gmail gets writer access on the shared folder."
              : " They use this username and password on Select company, or on another PC via your local server gate + access token."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="alu-display-name">Company user name</Label>
            <Input
              id="alu-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sales User"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alu-login">Login username</Label>
            <Input
              id="alu-login"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="e.g. sales_user"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alu-role">Role</Label>
            <select
              id="alu-role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="manager">Admin</option>
              <option value="editor">Editor</option>
              <option value="accountant">Accountant</option>
              <option value="data-entry">Data Entry</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alu-password">Password (encryption key)</Label>
            <div className="relative">
              <Input
                id="alu-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set password — Drive decrypt ke liye bhi yahi"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Shared user dusre device par isi username/password se login kare — tab Drive se decrypt ho payega.
            </p>
          </div>
          {driveShareMode ? (
            <div className="space-y-1.5">
              <Label htmlFor="alu-share-gmail">Share Drive folder with (Gmail)</Label>
              <Input
                id="alu-share-gmail"
                type="email"
                value={shareGmail}
                onChange={(e) => setShareGmail(e.target.value)}
                placeholder="staff@gmail.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Add user ke saath Drive company folder writer access — encrypted data sync.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {driveShareMode ? "Add user & share Drive" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
