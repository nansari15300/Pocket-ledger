"use client";

import { useCallback, useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
import {
  FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT,
  getFirebaseLedgerSyncMode,
  setFirebaseLedgerSyncMode,
  type FirebaseLedgerSyncMode,
} from "@/lib/firebaseLedgerSyncMode";

type Props = {
  sidebarOpen: boolean;
  compact?: boolean;
};

const RULE_TEXT =
  "deltaa: the app reads and writes ledger data from local SQLite first. Saves are queued to Firebase immediately in the background. Remote edits are detected through a small change feed and only changed documents are downloaded to SQLite, which reduces Firebase reads. live: the old live Firebase collection listeners are used and screens read directly from online snapshots.";

export function FirebaseLedgerSyncModeSwitch({ sidebarOpen, compact }: Props) {
  const { toast } = useToast();
  const { company } = useCompany();
  const [mode, setMode] = useState<FirebaseLedgerSyncMode>("local");

  // Sirf online (Firebase/cloud) company — local + PL Server pe hide.
  const showForOnlineCompany =
    Boolean(company) && isCloudBackedCompanyShape(company) && !isServerGateCompany(company);

  const refresh = useCallback(() => {
    setMode(getFirebaseLedgerSyncMode());
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  if (!showForOnlineCompany) return null;

  const fullOnline = mode === "full_online";
  const title = fullOnline
    ? "live: Firebase listeners"
    : "deltaa: SQLite first with background delta sync";

  const onCheckedChange = (checked: boolean) => {
    const next: FirebaseLedgerSyncMode = checked ? "full_online" : "local";
    setFirebaseLedgerSyncMode(next);
    setMode(next);
    toast({
      title: next === "local" ? "deltaa mode" : "live mode",
      description:
        next === "local"
          ? "SQLite is primary. Firebase is used for background upload and small delta downloads."
          : "Full online Firebase listener mode is active.",
    });
  };

  if (!sidebarOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label={title}
            title={title}
            onClick={() => onCheckedChange(!fullOnline)}
          >
            <span className="text-[10px] font-semibold text-emerald-700">{fullOnline ? "live" : "deltaa"}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {title}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md bg-emerald-500/10 px-2 py-2",
        compact ? "space-y-1" : "space-y-1.5"
      )}
      title={title}
    >
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
        <span
          className={cn(
            "truncate text-[11px]",
            !fullOnline ? "font-semibold text-emerald-700" : "text-muted-foreground"
          )}
        >
          deltaa
        </span>
        <Switch
          checked={fullOnline}
          onCheckedChange={onCheckedChange}
          aria-label={title}
          className={cn(
            "w-[64px]",
            // Dono sides green track + knob
            "!border-green-300 !bg-green-100/80",
            "data-[state=checked]:!border-green-300 data-[state=checked]:!bg-green-100/80",
            "data-[state=unchecked]:!border-green-300 data-[state=unchecked]:!bg-green-100/80",
            "dark:!border-green-700 dark:!bg-green-900/40",
            "dark:data-[state=checked]:!border-green-700 dark:data-[state=checked]:!bg-green-900/40",
            "[&>span:last-child]:!bg-green-400"
          )}
        />
        <span
          className={cn(
            "truncate text-right text-[11px]",
            fullOnline ? "font-semibold text-emerald-700" : "text-muted-foreground"
          )}
        >
          live
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground"
              aria-label="Sync mode rules"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-sm text-xs leading-relaxed">
            {RULE_TEXT}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
