"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getGoogleDriveAuthUrl } from "@/lib/driveAuthClient";
import { getLocalCloudSyncStatus, runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { Input } from "@/components/ui/input";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";
import type { DriveAttachmentDateFolderMode } from "@/lib/localCloudSync/driveAttachmentPath";
import { formatDistanceToNow } from "date-fns";
import { Cloud, Loader2, RefreshCw } from "lucide-react";
import { doc, deleteDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

type Props = {
  companyId: string;
  company: LocalCompanyDoc | Record<string, unknown>;
};

/** Sirf device-local companies — Firestore companies par ye card hide. */
export function LocalCompanyCloudSyncSettings({ companyId, company }: Props) {
  const { user } = useAuth();
  const { reloadLocalCompanyRegistry } = useCompany();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({
    pending: 0,
    lastSyncAt: null as number | null,
    status: "idle",
    lastError: null as string | null,
  });

  const cfg = readCloudSyncConfigFromCompany(company);
  const [enabled, setEnabled] = useState(cfg.cloudSyncEnabled);
  const [provider, setProvider] = useState<CloudSyncProviderId>(cfg.cloudSyncProvider ?? "google_drive");
  const [sharedEmailsInput, setSharedEmailsInput] = useState(cfg.cloudSyncSharedEmails.join(", "));
  const [dateFolderMode, setDateFolderMode] = useState<DriveAttachmentDateFolderMode>(
    cfg.cloudSyncDriveDateFolderMode ?? "ad"
  );
  const isNepalCompany = ["NP", "NEPAL"].includes(
    String((company as { country?: string }).country ?? "").trim().toUpperCase()
  );

  // Parent `company` refresh (registry bump) par checkbox state sync — tick UI + SQLite align
  useEffect(() => {
    const next = readCloudSyncConfigFromCompany(company);
    setEnabled(next.cloudSyncEnabled);
    if (next.cloudSyncProvider) setProvider(next.cloudSyncProvider);
    setSharedEmailsInput(next.cloudSyncSharedEmails.join(", "));
    if (next.cloudSyncDriveDateFolderMode) setDateFolderMode(next.cloudSyncDriveDateFolderMode);
  }, [company]);

  const refreshStatus = useCallback(async () => {
    const s = await getLocalCloudSyncStatus(companyId);
    setStatus({
      pending: s.pending,
      lastSyncAt: s.lastSyncAt,
      status: s.status,
      lastError: s.lastError,
    });
  }, [companyId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, enabled]);

  if (!isOfflineCompanyStorage(company as { storageOption?: string })) return null;

  const saveConfig = async (patch: Partial<LocalCompanyDoc>) => {
    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    if (!reg) return;
    await upsertLocalCompany({ ...reg, ...patch } as LocalCompanyDoc);
    reloadLocalCompanyRegistry();
  };

  const onToggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await saveConfig({
      cloudSyncEnabled: checked,
      cloudSyncProvider: provider,
    });
  };

  const onProviderChange = async (p: CloudSyncProviderId) => {
    setProvider(p);
    await saveConfig({ cloudSyncProvider: p, cloudSyncEnabled: enabled });
  };

  const saveDriveExtras = async () => {
    const emails = sharedEmailsInput
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));
    await saveConfig({
      cloudSyncSharedEmails: emails,
      cloudSyncDriveDateFolderMode: isNepalCompany ? dateFolderMode : "ad",
    });
    toast({ title: "Drive settings saved", description: "Share list and attachment folders updated." });
  };

  const connectDrive = async () => {
    if (!user?.uid) {
      toast({ variant: "destructive", title: "Sign in required", description: "Connect Google account first." });
      return;
    }
    setBusy(true);
    try {
      const { url } = await getGoogleDriveAuthUrl({
        returnPath: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/company",
        uid: user.uid,
        email: user.email ?? undefined,
        formData: { companyId },
      });
      window.location.href = url;
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Drive connect failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnectDrive = async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      await deleteDoc(doc(firestore, "user_tokens", user.uid, "google", "drive"));
      toast({ title: "Disconnected", description: "Google Drive unlinked." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Disconnect failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const forceSync = async () => {
    setBusy(true);
    try {
      const res = await runLocalCloudSyncCycle(companyId, { force: true });
      await refreshStatus();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Sync failed", description: res.error ?? "Unknown error" });
      } else {
        toast({
          title: "Sync complete",
          description: `Uploaded ${res.uploaded}, downloaded ${res.downloaded} operations.`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border border-black">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4" />
          Cloud sync (local company)
        </CardTitle>
        <CardDescription>
          Google Drive layout:{" "}
          <span className="font-mono text-[11px]">Pocket Ledger/CompanyName__id/backup|data|attachments/</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="local-company-cloud-sync-enabled"
            checked={enabled}
            onCheckedChange={(v) => void onToggleEnabled(v === true)}
          />
          <Label htmlFor="local-company-cloud-sync-enabled" className="text-sm font-normal cursor-pointer">
            Enable cloud sync
          </Label>
        </div>

        {enabled ? (
          <>
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cloudSyncProvider"
                    checked={provider === "google_drive"}
                    onChange={() => void onProviderChange("google_drive")}
                  />
                  Google Drive
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cloudSyncProvider"
                    checked={provider === "dropbox"}
                    onChange={() => void onProviderChange("dropbox")}
                  />
                  Dropbox
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {provider === "google_drive" ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void connectDrive()}>
                    Connect account
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void disconnectDrive()}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Dropbox OAuth coming soon — same delta op layout as Drive.</p>
              )}
              <Button type="button" size="sm" disabled={busy} onClick={() => void forceSync()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Force sync now
              </Button>
            </div>

            {provider === "google_drive" ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="cloud-sync-shared-emails">Share Drive folder with (Gmail)</Label>
                  <Input
                    id="cloud-sync-shared-emails"
                    value={sharedEmailsInput}
                    onChange={(e) => setSharedEmailsInput(e.target.value)}
                    placeholder="staff@gmail.com, partner@gmail.com"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Writer access on company folder — staff same Pocket Ledger login + Drive connect karein.
                  </p>
                </div>
                {isNepalCompany ? (
                  <div className="space-y-1">
                    <Label>Attachment date folder (Nepal)</Label>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {(["ad", "bs", "both"] as const).map((mode) => (
                        <label key={mode} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="cloudSyncDriveDateFolderMode"
                            checked={dateFolderMode === mode}
                            onChange={() => setDateFolderMode(mode)}
                          />
                          {mode === "ad" ? "AD only" : mode === "bs" ? "BS only" : "Both"}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void saveDriveExtras()}>
                  Save Drive share / folder options
                </Button>
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Status: {status.status}</p>
              <p>Pending operations: {status.pending}</p>
              {status.lastSyncAt ? (
                <p>Last sync: {formatDistanceToNow(status.lastSyncAt, { addSuffix: true })}</p>
              ) : (
                <p>Last sync: never</p>
              )}
              {status.lastError ? <p className="text-destructive">Error: {status.lastError}</p> : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
