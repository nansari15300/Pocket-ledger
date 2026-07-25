"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useSync } from "@/contexts/SyncContext";
import { CloudOff, Cloud, RefreshCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { runIncrementalSync, setLastSyncAt as setSyncStorageLastSyncAt } from "@/lib/incrementalSyncClient";

const SYNC_TO_OPTIONS: { value: "firestore" | "drive" | "dropbox"; label: string }[] = [
  { value: "firestore", label: "Firestore" },
  { value: "drive", label: "Google Drive" },
  { value: "dropbox", label: "Dropbox" },
];

export function SyncSettings() {
  const { isLocalMode, localApiBaseUrl } = useDataSource();
  const { onlineSyncOn, setOnlineSyncOn, syncTo, setSyncTo, lastSyncAt, setLastSyncAt } = useSync();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncNow = async () => {
    setSyncError(null);
    setSyncing(true);
    try {
      await runIncrementalSync(localApiBaseUrl);
      const now = Date.now();
      setLastSyncAt(now);
      setSyncStorageLastSyncAt(now);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!isLocalMode) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Online sync
        </CardTitle>
        <CardDescription>
          Local data ko cloud pe sync karna (plan me multi-device sync hona chahiye). Sync to choose karein: Firestore, Drive, ya Dropbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Sync to cloud</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onlineSync"
                checked={!onlineSyncOn}
                onChange={() => setOnlineSyncOn(false)}
                className="h-4 w-4"
              />
              <CloudOff className="h-4 w-4 text-muted-foreground" />
              <span>Off</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onlineSync"
                checked={onlineSyncOn}
                onChange={() => setOnlineSyncOn(true)}
                className="h-4 w-4"
              />
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <span>On</span>
            </label>
          </div>
        </div>

        {onlineSyncOn && (
          <div className="space-y-2">
            <Label htmlFor="sync-to">Sync to</Label>
            <select
              id="sync-to"
              value={syncTo}
              onChange={(e) => setSyncTo(e.target.value as "firestore" | "drive" | "dropbox")}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {SYNC_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Data kahan upload hoga (Drive/Dropbox integration baad me connect karenge).
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {lastSyncAt != null && (
            <p className="text-sm text-muted-foreground">
              Last sync: {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync now
          </Button>
        </div>
        {syncError && <p className="text-sm text-destructive">{syncError}</p>}
      </CardContent>
    </Card>
  );
}
