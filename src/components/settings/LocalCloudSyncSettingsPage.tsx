"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cloud } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { LocalCompanyCloudSyncSettings } from "@/components/company/LocalCompanyCloudSyncSettings";
import { JoinSharedLocalCompanyPanel } from "@/components/company/JoinSharedLocalCompanyPanel";
import { companyProfileChromeRoot, settingsDetailCardShell } from "@/lib/companyProfileChrome";
import { settingsViewHref } from "@/lib/appNavHref";
import { cn } from "@/lib/utils";

/** Settings → Google Drive sync — company create/select optional; pehle Connect + join/restore. */
export function LocalCloudSyncSettingsPage() {
  const { company, allCompanies, setCompanyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();

  const localCompanies = useMemo(
    () => allCompanies.filter((c) => isOfflineCompanyStorage(c as { storageOption?: string })),
    [allCompanies]
  );

  const handleJoined = (joinedCompanyId: string) => {
    reloadLocalCompanyRegistry();
    triggerSync();
    setCompanyId(joinedCompanyId);
  };

  const isLocalCompany = Boolean(
    company && company.id && isOfflineCompanyStorage(company as { storageOption?: string })
  );

  return (
    <div className="flex h-full min-h-full flex-col gap-4" {...{ [companyProfileChromeRoot]: "" }}>
      {/* Hamesha upar: Drive connect + Drive par maujood companies join/restore — online company select par bhi */}
      <JoinSharedLocalCompanyPanel
        returnPath={settingsViewHref("local_cloud_sync")}
        onJoined={handleJoined}
      />

      {isLocalCompany && company?.id ? (
        <LocalCompanyCloudSyncSettings companyId={company.id} company={company} />
      ) : company ? (
        <Card className={cn(settingsDetailCardShell)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="h-4 w-4 shrink-0" />
              Selected: {company.name ?? "Company"}
            </CardTitle>
            <CardDescription>
              Ye online (Firestore) company hai — upar se Drive connect karke pehle se Drive par maujood local company
              restore/join karo. Full sync settings ke liye neeche device-local company select karo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {localCompanies.length > 0 && !isLocalCompany ? (
        <Card className={cn(settingsDetailCardShell)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Local companies on this device</CardTitle>
            <CardDescription>Select one to open sync enable / Force sync settings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {localCompanies.map((c) => (
              <Button
                key={c.id}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setCompanyId(c.id)}
              >
                {c.name ?? c.id}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
