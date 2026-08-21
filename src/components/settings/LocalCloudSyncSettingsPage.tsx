"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloud, HardDrive } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import {
  isEligibleLocalDriveSyncCompanyRow,
  normalizeRowForLocalDriveSyncUi,
  readCloudSyncConfigFromCompany,
} from "@/lib/localCloudSync/companyConfig";
import {
  listLocalCompanies,
  localCompanyRowIsDeleted,
  getLocalCompanyById,
  type LocalCompanyDoc,
} from "@/lib/localCompanyStore";
import { readCachedCompanySqliteNamespace } from "@/lib/sqliteStorageNamespace";
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
  companies: Array<{ id: string; name?: string; driveSyncEnabled?: boolean }>;
  syncCompanyId: string | null;
  onSelect: (id: string) => void;
};

function isOwnedLocalDrivePickerCompany(row: LocalCompanyDoc | Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const r = row as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return false;
  if (readCachedCompanySqliteNamespace(id) !== "local") return false;
  if ((r.plServerShared as boolean | undefined) === true) return false;
  if ((r.driveSharedJoin as boolean | undefined) === true) return false;
  if ((r.syncedFromCloud as boolean | undefined) === true) return false;
  const storage = String(r.storageOption ?? "").toLowerCase().trim();
  if (storage && storage !== "local") return false;
  const syncPolicy = String(r.syncPolicy ?? "").toLowerCase().trim();
  if (syncPolicy === "online" || syncPolicy === "pl_server" || syncPolicy === "plserver") return false;
  return isEligibleLocalDriveSyncCompanyRow(row);
}

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
      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-black/25 bg-white/55 dark:border-emerald-900/55 dark:bg-emerald-950/20">
        {companies.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col className="w-[7rem]" />
            </colgroup>
            <thead className="bg-emerald-50/80 text-xs uppercase text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100">
              <tr>
                <th className="border-b border-r border-black/25 px-3 py-2 text-left font-semibold dark:border-emerald-900/55">
                  Company
                </th>
                <th className="border-b border-black/25 px-3 py-2 text-center font-semibold dark:border-emerald-900/55">
                  Drive sync
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const selected = syncCompanyId === c.id;
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "cursor-pointer border-b border-black/15 last:border-b-0 hover:bg-emerald-50/70 dark:border-emerald-900/45 dark:hover:bg-emerald-950/35",
                      selected && "bg-emerald-100/80 dark:bg-emerald-900/35"
                    )}
                    onClick={() => onSelect(c.id)}
                  >
                    <td className="min-w-0 border-r border-black/15 px-3 py-2 dark:border-emerald-900/45">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">{c.name ?? c.id}</span>
                        {c.driveSyncEnabled ? (
                          <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            ON
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        aria-label={`Select ${c.name ?? c.id} for Drive sync`}
                        checked={selected}
                        onCheckedChange={(checked) => {
                          if (checked === true) onSelect(c.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">
            No local company on this device yet. Create one or restore from Drive (right tab).
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
  const [sqliteLocalPickerRows, setSqliteLocalPickerRows] = useState<
    Array<{ id: string; name?: string; driveSyncEnabled?: boolean }>
  >([]);
  const [mobileTopTab, setMobileTopTab] = useState<"drive" | "local">("local");

  const refreshSqliteLocalPickerRows = useCallback(async () => {
    const rows = await listLocalCompanies();
    setSqliteLocalPickerRows(
      rows
        .filter((r) => !localCompanyRowIsDeleted(r) && isOwnedLocalDrivePickerCompany(r))
        .map((r) => ({
          id: r.id,
          name: typeof r.name === "string" ? r.name : r.id,
          driveSyncEnabled: readCloudSyncConfigFromCompany(r).cloudSyncEnabled,
        }))
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
    if (!row || !isOwnedLocalDrivePickerCompany(row)) {
      const fromList = allCompanies.find((c) => c.id === cid);
      if (!fromList || !isOwnedLocalDrivePickerCompany(fromList as LocalCompanyDoc)) return;
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
        if (row && isOwnedLocalDrivePickerCompany(row)) {
          setSyncCompany(normalizeRowForLocalDriveSyncUi(row));
        }
        return;
      }
      const activeId = String(company?.id || "").trim();
      if (activeId) {
        const activeRow = await getLocalCompanyById(activeId);
        if (activeRow && isOwnedLocalDrivePickerCompany(activeRow)) {
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
    const map = new Map<string, { id: string; name?: string; driveSyncEnabled?: boolean }>();
    for (const c of allCompanies) {
      if (!c?.id || !isOwnedLocalDrivePickerCompany(c as LocalCompanyDoc)) continue;
      map.set(c.id, {
        id: c.id,
        name: c.name ?? c.id,
        driveSyncEnabled: readCloudSyncConfigFromCompany(c).cloudSyncEnabled,
      });
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
          <TabsTrigger value="local" className={MOBILE_TOP_TAB_CLASS}>
            This device
          </TabsTrigger>
          <TabsTrigger value="drive" className={MOBILE_TOP_TAB_CLASS}>
            Join from Drive
          </TabsTrigger>
        </TabsList>
        <TabsContent value="local" className="mt-3 focus-visible:outline-none">
          <LocalCompaniesOnDeviceCard {...localPickerProps} />
        </TabsContent>
        <TabsContent value="drive" className="mt-3 focus-visible:outline-none">
          <JoinSharedLocalCompanyPanel {...joinPanelProps} />
        </TabsContent>
      </Tabs>

      {/* PC — 2 columns */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 lg:items-stretch shrink-0">
        <LocalCompaniesOnDeviceCard {...localPickerProps} />
        <JoinSharedLocalCompanyPanel {...joinPanelProps} />
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
                    This company is currently shown in online mode. Choose a device-local company, or restore it from
                    Drive to open sync settings.
                  </p>
                }
              />
            </CardTitle>
          </CardHeader>
        </Card>
      ) : null}

      {isLocalCompany && syncCompanyId && syncCompany ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <LocalCompanyCloudSyncSettings
            companyId={syncCompanyId}
            company={syncCompany}
            companyOptions={localCompanies}
            onCompanySelect={(id) => void openSyncForLocalCompany(id)}
          />
        </div>
      ) : null}
    </div>
  );
}
