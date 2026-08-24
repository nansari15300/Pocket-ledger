"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import { LedgerFooterChromePill } from "@/components/vouchers/ledgerFooterChrome";
import { saveMasterAccountFreeze } from "@/lib/masterAccountFreeze/saveMasterAccountFreeze";
import { masterAccountFreezeToggleLabel } from "@/lib/masterAccountFreeze/labels";
import type { MasterAccountFreezeCollection } from "@/lib/masterAccountFreeze/types";
import { useMasterAccountFreezeFeature } from "@/hooks/useMasterAccountFreezeFeature";
import { toast as sonnerToast } from "sonner";

type MasterAccountFreezeOwnerToggleProps = {
  companyId: string;
  collection: MasterAccountFreezeCollection;
  entityId: string;
  isFrozen: boolean;
  onSaved: (patch: { isFrozen: boolean; freezeMessage?: string | null }) => void;
  className?: string;
};

/** Owner-only footer pill — tick = auto-save freeze; stays active when frozen so owner can unfreeze. */
export function MasterAccountFreezeOwnerToggle({
  companyId,
  collection,
  entityId,
  isFrozen,
  onSaved,
  className,
}: MasterAccountFreezeOwnerToggleProps) {
  const { canToggle } = useMasterAccountFreezeFeature();
  const [saving, setSaving] = React.useState(false);
  const [checked, setChecked] = React.useState(isFrozen);
  const inputId = React.useId();

  React.useEffect(() => {
    setChecked(isFrozen);
  }, [isFrozen]);

  if (!canToggle) return null;

  const toggleLabel = masterAccountFreezeToggleLabel(checked);

  const handleCheckedChange = (next: boolean) => {
    if (saving) return;
    const prev = checked;
    setChecked(next);
    setSaving(true);
    void (async () => {
      const result = await saveMasterAccountFreeze({
        companyId,
        collection,
        entityId,
        isFrozen: next,
      });
      setSaving(false);
      if (result.ok === false) {
        setChecked(prev);
        sonnerToast.error("Couldn't save freeze", { description: result.error });
        return;
      }
      onSaved({ isFrozen: next });
      sonnerToast.success(next ? "Account freezed" : "Account unfrozen");
    })();
  };

  return (
    <LedgerFooterChromePill
      active={checked}
      className={cn(
        LEDGER_HEADER_PILL_CN,
        "cursor-pointer rounded-full px-2.5",
        saving && "pointer-events-none opacity-60",
        className
      )}
    >
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(v) => handleCheckedChange(v === true)}
        disabled={saving}
        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-blue-800/80 bg-white shadow-none data-[state=checked]:border-blue-800 data-[state=checked]:bg-blue-800 data-[state=checked]:text-white dark:border-blue-300/80 dark:bg-slate-950 dark:data-[state=checked]:border-blue-300 dark:data-[state=checked]:bg-blue-300 dark:data-[state=checked]:text-blue-950"
        aria-label={toggleLabel}
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer whitespace-nowrap text-xs font-medium leading-none"
      >
        {toggleLabel}
      </label>
    </LedgerFooterChromePill>
  );
}
