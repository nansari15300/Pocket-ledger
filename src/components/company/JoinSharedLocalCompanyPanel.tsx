"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Cloud, Lock, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getGoogleDriveAuthUrl,
  openGoogleDriveOAuthUrl,
  resolveDriveOAuthReturnPath,
} from "@/lib/driveAuthClient";
import {
  getFirebaseAuthUserForApi,
  isLocalSyntheticAuthUid,
} from "@/lib/firebaseAuthForApi";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  isDriveSharedInviteAlreadyJoined,
  joinDriveSharedLocalCompany,
  listDriveSharedLocalCompanyInvites,
  type DriveSharedCompanyInvite,
} from "@/lib/localCloudSync/driveSharedJoinClient";
import { listLocalCompanies, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  CLOUD_SYNC_DRIVE_SALT_MISSING_MSG,
  isCloudSyncEncryptionKeyRequiredError,
} from "@/lib/localCloudSync/driveEncryption";
import { cn } from "@/lib/utils";
import { cloudSyncSharePanelCard } from "@/lib/companyProfileChrome";

type Props = {
  /** false = list load mat karo (dialog band) */
  active?: boolean;
  onJoined?: (companyId: string) => void;
  className?: string;
  /** Drive OAuth ke baad wapas is path par aao */
  returnPath?: string;
  /** dialog ke andar — title/description dialog header se aata hai */
  embedded?: boolean;
};

/** Drive par shared local companies — join list (settings page + dialog dono). */
export function JoinSharedLocalCompanyPanel({
  active = true,
  onJoined,
  className,
  returnPath,
  embedded = false,
}: Props) {
  const { user } = useAuth();
  const { reloadLocalCompanyRegistry, localCompanyRegistryEpoch } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [invites, setInvites] = useState<DriveSharedCompanyInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Har Drive folder ka alag password — encrypt ON par kaunsi company clear rahe. */
  const [passwordByFolderId, setPasswordByFolderId] = useState<Record<string, string>>({});
  const [localRegistryRows, setLocalRegistryRows] = useState<LocalCompanyDoc[]>([]);

  const refreshLocalJoinState = useCallback(async () => {
    setLocalRegistryRows(await listLocalCompanies({ includeDeleted: true }));
  }, []);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listDriveSharedLocalCompanyInvites();
      setInvites(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadInvites();
  }, [active, loadInvites]);

  // Join ke baad "Connected" + company selector list — local registry dubara padho.
  useEffect(() => {
    if (!active) return;
    void refreshLocalJoinState();
  }, [active, refreshLocalJoinState, invites, localCompanyRegistryEpoch, joiningId]);

  const ownedInvites = useMemo(() => invites.filter((inv) => inv.isOwnedOnDrive), [invites]);

  const groupedBySharer = useMemo(() => {
    const map = new Map<string, DriveSharedCompanyInvite[]>();
    for (const inv of invites) {
      if (inv.isOwnedOnDrive) continue;
      const key = inv.sharedByEmail.toLowerCase();
      const list = map.get(key) ?? [];
      list.push(inv);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [invites]);

  const hasAnyInvites = ownedInvites.length > 0 || groupedBySharer.length > 0;

  const connectDrive = async () => {
    try {
      const firebaseUser = await getFirebaseAuthUserForApi();
      const { url } = await getGoogleDriveAuthUrl({
        returnPath: resolveDriveOAuthReturnPath(returnPath),
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? undefined,
      });
      await openGoogleDriveOAuthUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        variant: "destructive",
        title: isLocalSyntheticAuthUid(user?.uid) ? "Google sign-in required" : "Drive connect failed",
        description: msg,
      });
    }
  };

  const handleJoin = async (invite: DriveSharedCompanyInvite) => {
    setJoiningId(invite.companyId);
    try {
      const rowPassword = passwordByFolderId[invite.driveFolderId]?.trim() || undefined;
      const joinedCompanyId = await joinDriveSharedLocalCompany(invite, {
        companyPassword: rowPassword,
      });
      reloadLocalCompanyRegistry();
      await refreshLocalJoinState();
      await loadInvites();
      toast({
        title: "Company joined",
        description: `${invite.companyName} synced from Drive.`,
      });
      setPasswordByFolderId((prev) => {
        const next = { ...prev };
        delete next[invite.driveFolderId];
        return next;
      });
      onJoined?.(joinedCompanyId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        variant: "destructive",
        title: "Join failed",
        description:
          msg === CLOUD_SYNC_DRIVE_SALT_MISSING_MSG
            ? msg
            : isCloudSyncEncryptionKeyRequiredError(msg)
              ? msg
              : msg,
      });
    } finally {
      setJoiningId(null);
    }
  };

  /** Company naam | password (beech) | Restore/Join — har row alag encrypt password. */
  const renderInviteRow = (inv: DriveSharedCompanyInvite, actionLabel: "Restore" | "Join") => {
    const alreadyJoined = isDriveSharedInviteAlreadyJoined(inv, localRegistryRows);
    const rowPassword = passwordByFolderId[inv.driveFolderId] ?? "";
    return (
      <div
        key={inv.driveFolderId}
        className="flex flex-col gap-2 rounded-md border border-black/20 bg-background/60 p-3 sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{inv.companyName}</p>
          <p className="text-xs text-muted-foreground truncate">{inv.folderName}</p>
        </div>
        {!alreadyJoined ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[14rem]">
            <Label htmlFor={`join-pwd-${inv.driveFolderId}`} className="sr-only">
              {inv.companyName} password
            </Label>
            <Input
              id={`join-pwd-${inv.driveFolderId}`}
              type="password"
              autoComplete="current-password"
              placeholder="Password (if encrypted)"
              value={rowPassword}
              onChange={(e) =>
                setPasswordByFolderId((prev) => ({ ...prev, [inv.driveFolderId]: e.target.value }))
              }
              className="h-9"
            />
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={alreadyJoined ? "secondary" : "default"}
          className="rounded-full shrink-0 sm:self-center"
          disabled={alreadyJoined || joiningId === inv.companyId}
          onClick={() => void handleJoin(inv)}
        >
          {joiningId === inv.companyId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : alreadyJoined ? (
            "Connected"
          ) : (
            <>
              <UserPlus className="h-4 w-4 mr-1" />
              {actionLabel}
            </>
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className={cn(!embedded && cloudSyncSharePanelCard, "space-y-4", !embedded && "p-4", className)}>
      {!embedded ? (
        <div>
          <p className="flex items-center gap-2 text-base font-semibold">
            <Cloud className="h-4 w-4 shrink-0" />
            Join shared local company
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your own companies under My Drive → Pocket Ledger, plus folders others shared with your Gmail. Use the same
            Gmail as Firebase login. If empty after sync, Connect Google Drive again then Refresh list.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-full px-4" onClick={() => void connectDrive()}>
          Connect Google Drive
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void loadInvites()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh list"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
          {error.includes("not connected") || error.includes("Sign in")
            ? `${error} — use Connect Google Drive first.`
            : error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasAnyInvites ? (
        <p className="text-sm text-muted-foreground py-2">
          No Pocket Ledger company folders found on Drive. Sync a local company first (Enable cloud sync → Force sync),
          or ask the owner to share their folder with your Gmail. Then Connect Google Drive and Refresh list.
        </p>
      ) : (
        <div className="space-y-4">
          {ownedInvites.length > 0 ? (
            <Card className="border border-black/25 bg-white/40">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">My companies on Drive</CardTitle>
                <p className="text-xs text-muted-foreground font-normal flex items-start gap-1.5 pt-1">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Encrypt ON ho to har company ka apna Company Profile password — usi row me likho, phir Restore.
                </p>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4 pt-0">
                {ownedInvites.map((inv) => renderInviteRow(inv, "Restore"))}
              </CardContent>
            </Card>
          ) : null}
          {groupedBySharer.map(([email, rows]) => (
            <Card key={email} className="border border-black/25 bg-white/40">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">
                  Shared with me · {rows[0]?.sharedByName ? `${rows[0].sharedByName} · ` : ""}
                  {email}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal flex items-start gap-1.5 pt-1">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Owner ne encrypt ON kiya ho to us company ka password middle field me — phir Join.
                </p>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4 pt-0">
                {rows.map((inv) => renderInviteRow(inv, "Join"))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
