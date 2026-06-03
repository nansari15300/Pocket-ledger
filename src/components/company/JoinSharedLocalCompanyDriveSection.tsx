"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Cloud, Lock, ChevronDown, ChevronUp } from "lucide-react";
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
  peekDriveSharedCompanyManifest,
  type DriveSharedCompanyInvite,
} from "@/lib/localCloudSync/driveSharedJoinClient";
import { listLocalCompanies, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  CLOUD_SYNC_DRIVE_SALT_MISSING_MSG,
  isCloudSyncEncryptionKeyRequiredError,
} from "@/lib/localCloudSync/driveEncryption";
import { cn } from "@/lib/utils";
import { CloudSyncHelpPopover } from "@/components/company/CloudSyncHelpPopover";

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

/** Google Drive — shared local companies join list. */
export function JoinSharedLocalCompanyDriveSection({
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
  /** "My companies on Drive" card — default band; Refresh list ke arrow se kholo */
  const [ownedDriveListOpen, setOwnedDriveListOpen] = useState(false);
  const [localRegistryRows, setLocalRegistryRows] = useState<LocalCompanyDoc[]>([]);
  /** Connect tap — encrypt ho to password popup */
  const [connectDialog, setConnectDialog] = useState<{
    invite: DriveSharedCompanyInvite;
    actionLabel: "Restore" | "Join";
  } | null>(null);
  const [connectDialogPassword, setConnectDialogPassword] = useState("");
  /** Manifest check / join chal raha ho — us row par spinner */
  const [connectPendingFolderId, setConnectPendingFolderId] = useState<string | null>(null);

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

  const handleJoin = async (invite: DriveSharedCompanyInvite, companyPassword?: string) => {
    setJoiningId(invite.companyId);
    try {
      const rowPassword = companyPassword?.trim() || undefined;
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
      setConnectDialog(null);
      setConnectDialogPassword("");
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

  /** Connect — plain ho to seedha join; encrypt ho to password popup */
  const startConnect = async (invite: DriveSharedCompanyInvite, actionLabel: "Restore" | "Join") => {
    if (joiningId || connectPendingFolderId) return;
    setConnectPendingFolderId(invite.driveFolderId);
    try {
      let encrypted = false;
      try {
        const manifest = await peekDriveSharedCompanyManifest(invite);
        encrypted =
          manifest.cloudSyncEncryptDriveData === true || manifest.cloudSyncEncryptDriveFiles === true;
      } catch {
        // Manifest na mile to password popup — user optional try kar sake
        encrypted = true;
      }
      if (!encrypted) {
        await handleJoin(invite);
        return;
      }
      setConnectDialogPassword("");
      setConnectDialog({ invite, actionLabel });
    } finally {
      setConnectPendingFolderId(null);
    }
  };

  const confirmConnectDialog = async () => {
    if (!connectDialog) return;
    await handleJoin(connectDialog.invite, connectDialogPassword);
  };

  /** Connected = naam + "Connected"; pending = naam + Connect (popup if encrypted) */
  const renderInviteRow = (inv: DriveSharedCompanyInvite, actionLabel: "Restore" | "Join") => {
    const alreadyJoined = isDriveSharedInviteAlreadyJoined(inv, localRegistryRows);
    const rowBusy =
      joiningId === inv.companyId || connectPendingFolderId === inv.driveFolderId;

    return (
      <div
        key={inv.driveFolderId}
        className="flex items-center justify-between gap-3 rounded-md border border-black/20 bg-background/60 px-3 py-2.5"
      >
        <p className="min-w-0 flex-1 truncate font-medium">{inv.companyName}</p>
        {alreadyJoined ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">Connected</span>
        ) : (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto shrink-0 px-0 text-sm font-medium"
            disabled={rowBusy}
            onClick={() => void startConnect(inv, actionLabel)}
          >
            {rowBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card className={cn("flex h-full min-w-0 flex-col border border-black/25 bg-white/40", className)}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cloud className="h-4 w-4 shrink-0" />
          Google Drive
          <CloudSyncHelpPopover
            label="Join via Google Drive"
            description={
              <p>
                Your companies under My Drive → Pocket Ledger, plus folders others shared with your Gmail. Use the same
                Gmail as Firebase login. If empty, Connect Google Drive then Refresh list.
              </p>
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-3 px-4 pb-4 pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-full px-4" onClick={() => void connectDrive()}>
          Connect Google Drive
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void loadInvites()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh list"}
        </Button>
        {ownedInvites.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 md:hidden"
            aria-expanded={ownedDriveListOpen}
            aria-label={ownedDriveListOpen ? "Hide my companies on Drive" : "Show my companies on Drive"}
            title={ownedDriveListOpen ? "Hide my companies on Drive" : "Show my companies on Drive"}
            onClick={() => setOwnedDriveListOpen((open) => !open)}
          >
            <span className="text-xs font-medium">My companies</span>
            {ownedDriveListOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        ) : null}
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
            <Card
              className={cn(
                "border border-black/25 bg-white/40",
                !ownedDriveListOpen && "hidden md:block"
              )}
            >
              <CardHeader className="py-3 px-4">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  My companies on Drive
                  {/* Encrypt help — (i) popover (card clean rahe) */}
                  <CloudSyncHelpPopover
                    label="Encryption & restore"
                    description={
                      <p>
                        If encryption is ON, each company uses its own Company Profile password — enter it in the
                        popup when you tap Connect, then Restore.
                      </p>
                    }
                  />
                </CardTitle>
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

      {/* Encrypt ON — Connect pe password popup */}
      <Dialog
        open={connectDialog != null}
        onOpenChange={(open) => {
          if (!open && !joiningId) {
            setConnectDialog(null);
            setConnectDialogPassword("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {connectDialog?.actionLabel === "Join" ? "Join" : "Restore"} {connectDialog?.invite.companyName}
            </DialogTitle>
            <DialogDescription>
              This company is encrypted on Drive. Enter the Company Profile password to connect this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="connect-drive-company-password">Company Profile password</Label>
            <Input
              id="connect-drive-company-password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={connectDialogPassword}
              onChange={(e) => setConnectDialogPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmConnectDialog();
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={joiningId != null}
              onClick={() => {
                setConnectDialog(null);
                setConnectDialogPassword("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={joiningId != null} onClick={() => void confirmConnectDialog()}>
              {joiningId != null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : connectDialog?.actionLabel === "Join" ? (
                "Join"
              ) : (
                "Restore"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </CardContent>
    </Card>
  );
}
