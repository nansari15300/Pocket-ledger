"use client";

import { useMemo } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { LocalCompanyCloudSyncSettings } from "@/components/company/LocalCompanyCloudSyncSettings";
import { JoinSharedLocalCompanyPanel } from "@/components/company/JoinSharedLocalCompanyPanel";
import { companyProfileChromeRoot, settingsDetailCardShell } from "@/lib/companyProfileChrome";
import { settingsViewHref } from "@/lib/appNavHref";
import { cn } from "@/lib/utils";

type Props = {
  /** Mobile footer Back — settings list par wapas */
  onBack?: () => void;
  /** Mobile settings list sheet — Force sync ke upar */
  onOpenSettingsList?: () => void;
};

/** Settings → Google Drive sync — company create/select optional; pehle Connect + join/restore. */
export function LocalCloudSyncSettingsPage({ onBack, onOpenSettingsList }: Props) {
  const { company, allCompanies, setCompanyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();

  const localCompanies = useMemo(
    () => allCompanies.filter((c) => isOfflineCompanyStorage(c as { storageOption?: string })),
    [allCompanies]
  );

  /** Dropdown + sync — local company; global online select ho to pehli local */
  const activeLocalCompany = useMemo(() => {
    if (company && company.id && isOfflineCompanyStorage(company as { storageOption?: string })) {
      return company;
    }
    return localCompanies[0] ?? null;
  }, [company, localCompanies]);

  const handleJoined = (joinedCompanyId: string) => {
    reloadLocalCompanyRegistry();
    triggerSync();
    setCompanyId(joinedCompanyId);
  };

  const isOnlineCompanySelected = Boolean(
    company && company.id && !isOfflineCompanyStorage(company as { storageOption?: string })
  );

  return (
    <div
      className="flex h-full min-h-0 w-full max-w-full flex-col gap-[2px] px-[2px]"
      {...{ [companyProfileChromeRoot]: "" }}
    >
      <JoinSharedLocalCompanyPanel
        className="w-full shrink-0"
        returnPath={settingsViewHref("local_cloud_sync")}
        onJoined={handleJoined}
      />

      {activeLocalCompany?.id ? (
        <LocalCompanyCloudSyncSettings
          className="min-h-0 flex-1"
          companyId={activeLocalCompany.id}
          company={activeLocalCompany}
          onBack={onBack}
          onOpenSettingsList={onOpenSettingsList}
        />
      ) : isOnlineCompanySelected ? (
        <Card className={cn(settingsDetailCardShell, "w-full shrink-0")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="h-4 w-4 shrink-0" />
              Selected: {company?.name ?? "Company"}
            </CardTitle>
            <CardDescription>
              Ye online (Firestore) company hai — upar se Drive connect karke pehle se Drive par maujood local company
              restore/join karo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
