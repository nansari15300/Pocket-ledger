"use client";

import { useEffect, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Company } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import {
  FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT,
  getFirebaseLedgerCompanySyncEntry,
  patchFirebaseLedgerCompanySyncEntry,
} from "@/lib/firebaseLedgerCompanySyncPrefs";
import {
  FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT,
  isFirebaseLedgerDataSyncEnabled,
} from "@/lib/firebaseLedgerDataSyncDisabled";

type Props = {
  companies: Company[];
  compact?: boolean;
  activeCompanyId?: string | null;
  onSelectCompany?: (company: Company) => void;
  onLogoutCompany?: (companyId: string) => void;
};

export function FirebaseLedgerOnlineCompanySyncList({
  companies,
  compact = false,
  activeCompanyId,
  onSelectCompany,
  onLogoutCompany,
}: Props) {
  const [prefsTick, setPrefsTick] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(() => isFirebaseLedgerDataSyncEnabled());

  useEffect(() => {
    const bumpPrefs = () => setPrefsTick((n) => n + 1);
    const bumpSync = () => setSyncEnabled(isFirebaseLedgerDataSyncEnabled());
    window.addEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, bumpPrefs);
    window.addEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, bumpSync);
    return () => {
      window.removeEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, bumpPrefs);
      window.removeEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, bumpSync);
    };
  }, []);

  void prefsTick;

  if (!syncEnabled) {
    return (
      <p className="rounded-md border border-dashed bg-muted/20 px-2 py-3 text-xs text-muted-foreground">
        Turn on <strong>Cloud data sync</strong> in the sidebar, then tick companies here to sync.
      </p>
    );
  }

  if (companies.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        No online companies on this device yet. Cloud sync ON pulls the company list from Firebase.
      </p>
    );
  }

  const headerCols = compact
    ? "grid-cols-[minmax(0,1fr)_2.25rem_2.25rem_2.75rem]"
    : "grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem]";

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "grid items-center gap-1 border-b border-border/60 px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
          headerCols
        )}
      >
        <span>Company</span>
        <span className="text-center">Sync</span>
        <span className="text-center">Data</span>
        <span className="text-center">Files</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
        {companies.map((company) => {
          const entry = getFirebaseLedgerCompanySyncEntry(company.id);
          return (
            <div
              key={company.id}
              className={cn(
                "grid items-center gap-1 rounded-md border bg-background px-1 py-1",
                headerCols
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs font-medium hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectCompany?.(company);
                  }}
                >
                  <span className="truncate">{company.name}</span>
                  {activeCompanyId === company.id ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  ) : null}
                </button>
                {onLogoutCompany ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Log out from company"
                    onClick={() => onLogoutCompany(company.id)}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              <div className="flex justify-center">
                <Checkbox
                  id={`fb-sync-co-${company.id}`}
                  checked={entry.selected}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    patchFirebaseLedgerCompanySyncEntry(company.id, {
                      selected: on,
                      data: on ? entry.data : false,
                      attachments: on ? entry.attachments : false,
                    });
                  }}
                  aria-label={`Sync ${company.name}`}
                />
              </div>
              <div className="flex justify-center">
                <Checkbox
                  id={`fb-sync-data-${company.id}`}
                  checked={entry.data}
                  disabled={!entry.selected}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    patchFirebaseLedgerCompanySyncEntry(company.id, {
                      data: on,
                      attachments: on ? entry.attachments : false,
                    });
                  }}
                  aria-label={`Sync data for ${company.name}`}
                />
              </div>
              <div className="flex justify-center">
                <Checkbox
                  id={`fb-sync-files-${company.id}`}
                  checked={entry.attachments}
                  disabled={!entry.selected || !entry.data}
                  onCheckedChange={(v) => {
                    patchFirebaseLedgerCompanySyncEntry(company.id, {
                      attachments: v === true,
                    });
                  }}
                  aria-label={`Sync attachment files for ${company.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[10px] leading-snug text-muted-foreground">
        <strong>Data</strong> = ledger records only. <strong>Files</strong> = attachment upload/download (needs Data).
      </p>
    </div>
  );
}
