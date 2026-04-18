"use client";

/**
 * Select-company / header: offline company par "Add User" — Edit Company wala local API POST (same fields).
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
import { appendLocalCompanyUserClient } from "@/lib/localCompanyUsers";
import { isLocalOnlyMode } from "@/lib/localMode";
import type { Company } from "@/hooks/useCompany";

type Props = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SQLite/context list refresh after successful POST */
  onUserAdded?: () => void;
};

export function AddLocalCompanyUserDialog({ company, open, onOpenChange, onUserAdded }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!open) {
      setDisplayName("");
      setLoginUsername("");
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
    if (!n || !u || !p) {
      toast({
        variant: "destructive",
        title: "Details required",
        description: "Company user name, login username, and password are required.",
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
      // SQLite company doc me user row — 127.0.0.1 local API ki zarurat nahi.
      await appendLocalCompanyUserClient(company.id, {
        username: u,
        password: p,
        displayName: n,
        role: role.toLowerCase(),
      });
      toast({ title: "User added", description: `${n} can sign in to this company on this device.` });
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
            Add a login for <span className="font-medium text-foreground">{company?.name ?? "this company"}</span> — same as Edit Company → Add Company User (local device).
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
            <Label htmlFor="alu-password">Password</Label>
            <div className="relative">
              <Input
                id="alu-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set password"
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
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
