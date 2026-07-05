"use client";

/**
 * Select-company / header: offline company par "Add User" — Edit Company wala local API POST (same fields).
 * Drive share panel: local login + Gmail se Google Drive folder share.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { appendLocalCompanyUserClient, parseLocalCompanyUserRows, upsertUserInList } from "@/lib/localCompanyUsers";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { isLocalOnlyMode } from "@/lib/localMode";
import type { Company } from "@/hooks/useCompany";
import { addDriveShareUserToLocalCompany } from "@/lib/localCloudSync/driveCloudSyncClient";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { LOCAL_COMPANY_APP_ROLES, normalizeLocalCompanyAppRole } from "@/lib/localCompanyAppRoles";
import {
  cloudSyncDialogContent,
  cloudSyncDialogOutlineButton,
  cloudSyncDialogPrimaryButton,
  cloudSyncDialogTitleClass,
} from "@/lib/companyProfileChrome";
import { cn } from "@/lib/utils";

type Props = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SQLite/context list refresh after successful POST */
  onUserAdded?: () => void;
  /** Drive "Add Person" — Gmail share field + emerald dialog */
  variant?: "default" | "driveShare";
  companyName?: string;
};

export function AddLocalCompanyUserDialog({
  company,
  open,
  onOpenChange,
  onUserAdded,
  variant = "default",
  companyName,
}: Props) {
  const isDriveShare = variant === "driveShare";
  const [displayName, setDisplayName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [shareGmail, setShareGmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!open) {
      setDisplayName("");
      setLoginUsername("");
      setShareGmail("");
      setPassword("");
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
    const appRole = normalizeLocalCompanyAppRole(role);

    if (!n || !u || !p) {
      toast({
        variant: "destructive",
        title: "Details required",
        description: "Display name, login username, and password are required.",
      });
      return;
    }
    if (isDriveShare && (!gmail.includes("@") || !gmail.includes("."))) {
      toast({
        variant: "destructive",
        title: "Gmail required",
        description: "Enter a valid Gmail to share this company folder on Google Drive.",
      });
      return;
    }

    setLoading(true);
    try {
      if (isLocalOnlyMode()) {
        const doc = await getLocalCompanyById(company.id, { includeDeleted: true });
        const rows = parseLocalCompanyUserRows((doc as { localCompanyUsers?: unknown })?.localCompanyUsers);
        const next = upsertUserInList(rows, {
          username: u,
          displayName: n,
          role: appRole,
          password: p,
        });
        await upsertLocalCompany({
          ...(doc as Record<string, unknown>),
          id: company.id,
          localCompanyUsers: next,
          updatedAt: Date.now(),
        } as unknown as Parameters<typeof upsertLocalCompany>[0]);
      } else {
        await appendLocalCompanyUserClient(company.id, {
          displayName: n,
          username: u,
          password: p,
          role: appRole,
        });
      }

      if (isDriveShare) {
        await addDriveShareUserToLocalCompany({
          companyId: company.id,
          companyName: companyName ?? company.name,
          email: gmail,
          appRole,
          displayName: n,
        });
        void runLocalCloudSyncCycle(company.id, { force: true });
      }

      toast({
        title: isDriveShare ? "Person added & shared" : "User added",
        description: isDriveShare
          ? `${n} can log in; ${gmail} has Drive folder access.`
          : `${n} can log in with username "${u}".`,
      });
      onUserAdded?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: isDriveShare ? "Could not add or share" : "Could not add user",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(isDriveShare && cloudSyncDialogContent)}>
        <DialogHeader>
          <DialogTitle className={cn(isDriveShare && cloudSyncDialogTitleClass)}>
            {isDriveShare ? "Add person & share on Drive" : "Add company user"}
          </DialogTitle>
          <DialogDescription>
            {isDriveShare
              ? company?.name
                ? `Local login for "${company.name}" + Google Drive folder share by Gmail.`
                : "Add local login and share the company folder on Google Drive."
              : company?.name
                ? `Add a login for "${company.name}" on this device.`
                : "Add a local company login user."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Login username</Label>
            <Input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} autoComplete="username" />
          </div>
          {isDriveShare ? (
            <div className="space-y-1">
              <Label htmlFor="drive-share-gmail">Share on Google Drive (Gmail)</Label>
              <Input
                id="drive-share-gmail"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="staff@gmail.com"
                value={shareGmail}
                onChange={(e) => setShareGmail(e.target.value)}
              />
              <p className="text-xs text-emerald-800/80 dark:text-emerald-300/90">
                Is Gmail par company folder write access milega — Settings → Join shared local company se connect kar
                sakte hain.
              </p>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            {isDriveShare ? (
              <Select value={appRoleSafe(role)} onValueChange={setRole}>
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
            ) : (
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="manager" />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className={cn(isDriveShare && cloudSyncDialogOutlineButton)}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(isDriveShare && cloudSyncDialogPrimaryButton)}
            onClick={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isDriveShare ? "Add & share" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function appRoleSafe(role: string): string {
  return normalizeLocalCompanyAppRole(role);
}
