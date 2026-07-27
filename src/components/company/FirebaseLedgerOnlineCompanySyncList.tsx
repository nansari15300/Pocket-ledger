"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Company } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT,
  getFirebaseLedgerCompanySyncEntry,
  replaceFirebaseLedgerCompanySyncEntries,
  type FirebaseLedgerCompanySyncEntry,
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

type DraftMap = Record<string, FirebaseLedgerCompanySyncEntry>;

function emptyEntry(): FirebaseLedgerCompanySyncEntry {
  return { selected: false, data: false, attachments: false };
}

function draftsFromCompanies(companies: Company[]): DraftMap {
  const next: DraftMap = {};
  for (const company of companies) {
    const id = String(company.id || "").trim();
    if (!id) continue;
    next[id] = getFirebaseLedgerCompanySyncEntry(id);
  }
  return next;
}

export function FirebaseLedgerOnlineCompanySyncList({
  companies,
  compact = false,
  activeCompanyId,
  onSelectCompany,
  onLogoutCompany,
}: Props) {
  const { toast } = useToast();
  const [prefsTick, setPrefsTick] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(() => isFirebaseLedgerDataSyncEnabled());
  const [draft, setDraft] = useState<DraftMap>(() => draftsFromCompanies(companies));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Reload draft from storage when list / prefs change (not while editing).
  useEffect(() => {
    if (dirty) return;
    setDraft(draftsFromCompanies(companies));
  }, [companies, prefsTick, syncEnabled, dirty]);

  const companyIdsKey = useMemo(
    () => companies.map((c) => String(c.id || "").trim()).filter(Boolean).join("|"),
    [companies]
  );

  // New companies appear in draft as unticked.
  useEffect(() => {
    setDraft((prev) => {
      const next: DraftMap = { ...prev };
      let changed = false;
      for (const company of companies) {
        const id = String(company.id || "").trim();
        if (!id) continue;
        if (!next[id]) {
          next[id] = emptyEntry();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when id set changes
  }, [companyIdsKey]);

  if (!syncEnabled) {
    return (
      <p className="rounded-md border border-dashed bg-muted/20 px-2 py-3 text-xs text-muted-foreground">
        Turn on <strong>Cloud data sync</strong> in the sidebar, then tick <strong>Data</strong> /{" "}
        <strong>Files</strong> here and tap Save.
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

  const setDataTick = (companyId: string, on: boolean) => {
    setDirty(true);
    setDraft((prev) => {
      const cur = prev[companyId] ?? emptyEntry();
      return {
        ...prev,
        [companyId]: {
          selected: on,
          data: on,
          attachments: on ? cur.attachments : false,
        },
      };
    });
  };

  const setFilesTick = (companyId: string, on: boolean) => {
    setDirty(true);
    setDraft((prev) => {
      const cur = prev[companyId] ?? emptyEntry();
      if (!cur.data) {
        return {
          ...prev,
          [companyId]: { selected: false, data: false, attachments: false },
        };
      }
      return {
        ...prev,
        [companyId]: { selected: true, data: true, attachments: on },
      };
    });
  };

  const onSave = () => {
    setSaving(true);
    try {
      replaceFirebaseLedgerCompanySyncEntries(draft);
      setDirty(false);
      toast({
        title: "Online sync saved",
        description:
          "Data = cloud download/upload for masters & vouchers. Untick keeps Local SQLite on screen (offline). Files = attachment upload/download.",
      });
    } finally {
      setSaving(false);
    }
  };

  const headerCols = compact
    ? "grid-cols-[minmax(11rem,1fr)_2.75rem_2.75rem]"
    : "grid-cols-[minmax(14rem,1fr)_3.25rem_3.25rem]";

  return (
    <div className="space-y-2">
      <div className="-mx-0.5 overflow-x-auto overscroll-x-contain pb-0.5">
        <div className={cn("min-w-[18rem] space-y-1.5", compact ? "min-w-[20rem]" : "min-w-[24rem]")}>
          <div
            className={cn(
              "grid items-center gap-1 border-b border-border/60 px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
              headerCols
            )}
          >
            <span>Company</span>
            <span className="text-center">Data</span>
            <span className="text-center">Files</span>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
            {companies.map((company) => {
              const id = String(company.id || "").trim();
              const entry = draft[id] ?? emptyEntry();
              return (
                <div
                  key={id}
                  className={cn(
                    "grid items-center gap-1 rounded-md border bg-background px-1 py-1",
                    headerCols
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left text-xs font-medium hover:underline"
                      title={company.name}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectCompany?.(company);
                      }}
                    >
                      <span className="block whitespace-normal break-words leading-snug">
                        {company.name}
                      </span>
                      {activeCompanyId === company.id ? (
                        <Check className="mt-0.5 inline h-3.5 w-3.5 shrink-0 text-green-600" />
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
                      id={`fb-sync-data-${id}`}
                      checked={entry.data}
                      onCheckedChange={(v) => setDataTick(id, v === true)}
                      aria-label={`Sync data for ${company.name}`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Checkbox
                      id={`fb-sync-files-${id}`}
                      checked={entry.attachments}
                      disabled={!entry.data}
                      onCheckedChange={(v) => setFilesTick(id, v === true)}
                      aria-label={`Sync attachment files for ${company.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="px-1 text-[10px] leading-snug text-muted-foreground">
        <strong>Data</strong> — cloud download/upload for masters &amp; vouchers. Untick keeps Local
        SQLite on screen (offline). <strong>Files</strong> — attachment upload/download (needs Data).
        Default off until you tick and Save. Same on web, EXE, APK, iOS.
      </p>
      <div className="flex justify-end px-1">
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
