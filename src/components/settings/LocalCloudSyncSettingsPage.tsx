"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloud, HardDrive } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import {
  isEligibleLocalDriveSyncCompanyRow,
  normalizeRowForLocalDriveSyncUi,
} from "@/lib/localCloudSync/companyConfig";
import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { LocalCompanyCloudSyncSettings } from "@/components/company/LocalCompanyCloudSyncSettings";
import { JoinSharedLocalCompanyPanel } from "@/components/company/JoinSharedLocalCompanyPanel";
import { CloudSyncHelpPopover } from "@/components/company/CloudSyncHelpPopover";
import {
  cloudSyncJoinPanelCard,
  cloudSyncSettingsPageShell,
  companyProfileChromeRoot,
} from "@/lib/companyProfileChrome";
import { settingsViewHref } from "@/lib/appNavHref";
import { cn } from "@/lib/utils";

const MOBILE_TOP_TAB_CLASS =
  "rounded-full text-xs sm:text-sm data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-700";

type LocalCompaniesPickerProps = {
  companies: Array<{ id: string; name?: string }>;
  syncCompanyId: string | null;
  onSelect: (id: string) => void;
};

function LocalCompaniesOnDeviceCard({ companies, syncCompanyId, onSelect }: LocalCompaniesPickerProps) {
  return (
    <div className={cn(cloudSyncJoinPanelCard, "p-4 h-full min-h-0 flex flex-col")}>
      <div className="flex items-center gap-2 shrink-0">
        <p className="flex items-center gap-2 text-base font-semibold text-emerald-900 dark:text-emerald-100">
          <HardDrive className="h-4 w-4 shrink-0" />
          Local companies on this device
        </p>
        <CloudSyncHelpPopover
          label="Local companies on this device"
          description={
            <p>Select one to open sync enable, Force sync, encryption, and share settings for that company.</p>
          }
        />
      </div>
      <div className="mt-3 flex flex-1 flex-wrap content-start gap-2">
        {companies.length > 0 ? (
          companies.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={syncCompanyId === c.id ? "default" : "outline"}
              size="sm"
              className={cn(
                "rounded-full",
                syncCompanyId === c.id &&
                  "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              )}
              onClick={() => onSelect(c.id)}
            >
              {c.name ?? c.id}
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            No local company on this device yet. Create one or restore from Drive (left tab).
          </p>
        )}
      </div>
    </div>
  );
}

/** Settings → Google Drive sync — company create/select optional; pehle Connect + join/restore. */
export function LocalCloudSyncSettingsPage() {
  const { company, allCompanies, setCompanyId, reloadLocalCompanyRegistry, triggerSync, localCompanyRegistryEpoch } =
    useCompany();
  const [sqliteLocalPickerRows, setSqliteLocalPickerRows] = useState<Array<{ id: string; name?: string }>>([]);
  const [mobileTopTab, setMobileTopTab] = useState<"drive" | "local">("drive");

  const refreshSqliteLocalPickerRows = useCallback(async () => {
    const rows = await listLocalCompanies();
    setSqliteLocalPickerRows(
      rows
        .filter((r) => !localCompanyRowIsDeleted(r) && isEligibleLocalDriveSyncCompanyRow(r))
        .map((r) => ({ id: r.id, name: typeof r.name === "string" ? r.name : r.id }))
    );
  }, []);

  useEffect(() => {
    void refreshSqliteLocalPickerRows();
  }, [refreshSqliteLocalPickerRows, localCompanyRegistryEpoch]);

  const [syncCompanyId, setSyncCompanyId] = useState<string | null>(null);
  const [syncCompany, setSyncCompany] = useState<LocalCompanyDoc | null>(null);

  const openSyncForLocalCompany = useCallback(async (id: string) => {
    const cid = String(id || "").trim();
    if (!cid) return;
    const row = await getLocalCompanyById(cid);
    if (!row || !isEligibleLocalDriveSyncCompanyRow(row)) {
      const fromList = allCompanies.find((c) => c.id === cid);
      if (!fromList || !isOfflineCompanyStorage(fromList as { storageOption?: string })) return;
      setSyncCompanyId(cid);
      setSyncCompany(normalizeRowForLocalDriveSyncUi({ ...(fromList as LocalCompanyDoc), id: cid }));
      return;
    }
    setSyncCompanyId(cid);
    setSyncCompany(normalizeRowForLocalDriveSyncUi(row));
  }, [allCompanies]);

  useEffect(() => {
    void (async () => {
      if (syncCompanyId) {
        const row = await getLocalCompanyById(syncCompanyId);
        if (row && isEligibleLocalDriveSyncCompanyRow(row)) {
          setSyncCompany(normalizeRowForLocalDriveSyncUi(row));
        }
        return;
      }
      const activeId = String(company?.id || "").trim();
      if (activeId) {
        const activeRow = await getLocalCompanyById(activeId);
        if (activeRow && isEligibleLocalDriveSyncCompanyRow(activeRow)) {
          setSyncCompanyId(activeId);
          setSyncCompany(normalizeRowForLocalDriveSyncUi(activeRow));
          return;
        }
      }
      if (sqliteLocalPickerRows.length === 1) {
        await openSyncForLocalCompany(sqliteLocalPickerRows[0].id);
      }
    })();
  }, [
    company?.id,
    sqliteLocalPickerRows,
    syncCompanyId,
    localCompanyRegistryEpoch,
    openSyncForLocalCompany,
  ]);

  const localCompanies = useMemo(() => {
    const map = new Map<string, { id: string; name?: string }>();
    for (const c of allCompanies) {
      if (!c?.id || !isOfflineCompanyStorage(c as { storageOption?: string })) continue;
      map.set(c.id, { id: c.id, name: c.name ?? c.id });
    }
    for (const row of sqliteLocalPickerRows) {
      if (!map.has(row.id)) map.set(row.id, row);
    }
    return Array.from(map.values());
  }, [allCompanies, sqliteLocalPickerRows]);

  const handleJoined = (joinedCompanyId: string) => {
    reloadLocalCompanyRegistry();
    triggerSync();
    void refreshSqliteLocalPickerRows();
    void openSyncForLocalCompany(joinedCompanyId);
    setCompanyId(joinedCompanyId);
  };

  const isLocalCompany = Boolean(syncCompany?.id && syncCompanyId);
  const joinPanelProps = {
    returnPath: settingsViewHref("local_cloud_sync"),
    onJoined: handleJoined,
  };
  const localPickerProps = {
    companies: localCompanies,
    syncCompanyId,
    onSelect: (id: string) => void openSyncForLocalCompany(id),
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain" {...{ [companyProfileChromeRoot]: "" }}>
      {/* Mobile — 2 tabs */}
      <Tabs
        value={mobileTopTab}
        onValueChange={(v) => setMobileTopTab(v as "drive" | "local")}
        className="shrink-0 lg:hidden"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-md border border-black bg-emerald-50/80 p-1 dark:bg-emerald-950/35">
          <TabsTrigger value="drive" className={MOBILE_TOP_TAB_CLASS}>
            Join from Drive
          </TabsTrigger>
          <TabsTrigger value="local" className={MOBILE_TOP_TAB_CLASS}>
            This device
          </TabsTrigger>
        </TabsList>
        <TabsContent value="drive" className="mt-3 focus-visible:outline-none">
          <JoinSharedLocalCompanyPanel {...joinPanelProps} />
        </TabsContent>
        <TabsContent value="local" className="mt-3 focus-visible:outline-none">
          <LocalCompaniesOnDeviceCard {...localPickerProps} />
        </TabsContent>
      </Tabs>

      {/* PC — 2 columns */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 lg:items-stretch shrink-0">
        <JoinSharedLocalCompanyPanel {...joinPanelProps} />
        <LocalCompaniesOnDeviceCard {...localPickerProps} />
      </div>

      {company && !syncCompany ? (
        <Card className={cn(cloudSyncSettingsPageShell, "shrink-0")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-100">
              <Cloud className="h-4 w-4 shrink-0" />
              Selected: {company.name ?? "Company"}
              <CloudSyncHelpPopover
                label="Online company selected"
                description={
                  <p>
                    App me abhi ye company online mode me dikh rahi hai. Device-local company choose karo, ya Drive
                    se Restore dabao — sync settings wahi khulengi.
                  </p>
                }
              />
            </CardTitle>
          </CardHeader>
        </Card>
      ) : null}

      {isLocalCompany && syncCompanyId && syncCompany ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <LocalCompanyCloudSyncSettings companyId={syncCompanyId} company={syncCompany} />
        </div>
      ) : null}
    </div>
  );
}
