"use client";

import { Combobox } from "@/components/ui/combobox";
import { QUOTATION_MASTER_KIND_LABEL } from "../constants";
import type { QuotationMasterKind, QuotationMasterOption } from "../types";

export function QuotationMasterSelect({
  masters,
  accountId,
  accountKind,
  onChange,
  placeholder = "Select account",
  disabled,
  triggerClassName,
  fitTrigger,
}: {
  masters: QuotationMasterOption[];
  accountId: string;
  accountKind: QuotationMasterKind | "";
  onChange: (master: QuotationMasterOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  fitTrigger?: boolean;
}) {
  const options = masters.map((row) => ({
    value: `${row.kind}:${row.id}`,
    label: `${row.name}  (${QUOTATION_MASTER_KIND_LABEL[row.kind]})`,
    triggerLabel: row.name,
    searchText: `${row.name} ${QUOTATION_MASTER_KIND_LABEL[row.kind]}`,
  }));
  const value = accountKind && accountId ? `${accountKind}:${accountId}` : "";

  return (
    <Combobox
      options={options}
      value={value}
      onChange={(next) => {
        const found = masters.find((row) => `${row.kind}:${row.id}` === next) || null;
        onChange(found);
      }}
      placeholder={placeholder}
      searchPlaceholder="Search masters..."
      disabled={disabled}
      autoFocusSearchOnOpen
      contentWidthMode="auto"
      triggerClassName={triggerClassName}
      fitTrigger={fitTrigger}
    />
  );
}
