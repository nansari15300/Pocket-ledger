"use client";

/**
 * Inter Company — company ka Bank/Cash account (entity account se alag).
 */
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  interCompanyComboboxTriggerClass,
  interCompanyDropdownContentClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";

type Props = {
  label?: string;
  entities: InterCompanyEntityDetail[];
  bankAccountId: string;
  onBankAccountIdChange: (id: string) => void;
  disabled?: boolean;
};

export function InterCompanyCompanyBankPicker({
  label = "Company bank (Bank/Cash)",
  entities,
  bankAccountId,
  onBankAccountIdChange,
  disabled = false,
}: Props) {
  const bankEntities = useMemo(
    () => entities.filter((e) => e.kind === "bank"),
    [entities]
  );

  const options = useMemo(
    () =>
      bankEntities.map((e) => ({
        value: e.id,
        label: e.label || e.id,
      })),
    [bankEntities]
  );

  return (
    <div className="min-w-[16rem] shrink-0 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Combobox
        options={options}
        value={bankAccountId}
        onChange={onBankAccountIdChange}
        placeholder={bankEntities.length ? "Select bank / cash account" : "No bank accounts"}
        disabled={disabled || bankEntities.length === 0}
        triggerClassName={interCompanyComboboxTriggerClass}
        popoverContentClassName={interCompanyDropdownContentClass}
      />
    </div>
  );
}
