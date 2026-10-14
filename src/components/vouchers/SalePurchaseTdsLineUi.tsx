"use client";

import { useCallback, useMemo } from "react";
import { Control } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import {
  mapSalePurchaseLineTaxComboboxOptions,
  SALE_PURCHASE_LINE_DESKTOP_COMBOBOX_PROPS,
  SALE_PURCHASE_LINE_NUMBER_INPUT_CLASS,
  SALE_PURCHASE_LINE_MONEY_INPUT_FIELD_PROPS,
  SALE_PURCHASE_LINE_TAX_COMBOBOX_PROPS,
  formatSalePurchaseLineMoneyDisplay,
  salePurchaseLineMoneyInputStyle,
} from "@/lib/salePurchaseLineColumnLabels";
import { salePurchasePairBodyCell } from "@/components/vouchers/salePurchaseLineDesktopPairs";
import { writeStoredTdsDefault } from "@/lib/tdsVoucher";
import { toast as sonnerToast } from "sonner";

type TaxRow = { id: string; name?: string; rate?: number };

type Props = {
  control: Control<any>;
  index: number;
  side: "sale" | "purchase";
  companyId: string;
  processedTaxes: TaxRow[];
  taxableAmount: number;
  disabled?: boolean;
  /** Desktop grid cell vs mobile stacked */
  variant: "desktop-taxable" | "desktop-tds" | "desktop-tds-amt" | "desktop-tds-pair" | "mobile";
  flatInputClass?: string;
  taxableLabel?: string;
  tdsLabel?: string;
  tdsAmountLabel?: string;
  tdsPlaceholder?: string;
  /** Tax master dialog — same as line Tax combobox. */
  onRequestCreateTdsAccount?: (prefillName?: string) => void;
  addNewLabel?: string;
};

export function SalePurchaseTdsLineUi({
  control,
  index,
  side,
  companyId,
  processedTaxes,
  taxableAmount,
  disabled,
  variant,
  flatInputClass: _flatInputClass = "h-9 w-full border-0 shadow-none focus-visible:ring-0 rounded-none",
  taxableLabel = "Taxable",
  tdsLabel = "TDS",
  tdsAmountLabel = "TDS Amt.",
  tdsPlaceholder = "TDS",
  onRequestCreateTdsAccount,
  addNewLabel = "+ Add New TDS",
}: Props) {
  const onTdsComboboxChange = useCallback(
    (fieldOnChange: (v: string) => void, val: string, newName?: string) => {
      if (val === "add-new") {
        onRequestCreateTdsAccount?.(newName);
        return;
      }
      fieldOnChange(val === "none" ? "" : val);
    },
    [onRequestCreateTdsAccount]
  );
  const taxAccountOptions = useMemo(
    () => mapSalePurchaseLineTaxComboboxOptions(processedTaxes),
    [processedTaxes]
  );

  const setDefault = useCallback(
    (accountId: string) => {
      const id = String(accountId || "").trim();
      if (!id) return;
      try {
        writeStoredTdsDefault(side, companyId, id);
        sonnerToast.success("Default TDS account saved.");
      } catch {
        sonnerToast.error("Default save failed.");
      }
    },
    [companyId, side]
  );

  if (variant === "desktop-taxable") {
    const taxableText = formatSalePurchaseLineMoneyDisplay(taxableAmount);
    return (
      <div className="inline-flex w-max shrink-0 justify-end">
        <Input
          {...SALE_PURCHASE_LINE_MONEY_INPUT_FIELD_PROPS}
          value={taxableText}
          style={salePurchaseLineMoneyInputStyle(taxableAmount)}
          className={cn(SALE_PURCHASE_LINE_NUMBER_INPUT_CLASS, "bg-muted text-sm")}
        />
      </div>
    );
  }

  if (variant === "desktop-tds-amt") {
    return (
      <FormField
        control={control}
        name={`lineItems.${index}.tdsAmount`}
        render={({ field }: any) => {
          const moneyText = formatSalePurchaseLineMoneyDisplay(field.value);
          return (
            <FormControl className="inline-flex w-max shrink-0 justify-end">
              <Input
                {...SALE_PURCHASE_LINE_MONEY_INPUT_FIELD_PROPS}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
                value={moneyText}
                style={salePurchaseLineMoneyInputStyle(field.value)}
                className={cn(SALE_PURCHASE_LINE_NUMBER_INPUT_CLASS, "bg-muted")}
              />
            </FormControl>
          );
        }}
      />
    );
  }

  const tdsComboboxCell = (
    <FormField
      control={control}
      name={`lineItems.${index}.tdsAccountId`}
      render={({ field }: any) => (
        <FormItem className="w-max min-w-max max-w-none space-y-0">
          <div className="flex w-max items-center gap-1">
            <div className="w-max">
              <Combobox
                options={taxAccountOptions}
                value={field.value}
                disabled={disabled}
                onChange={(val, newName) => onTdsComboboxChange(field.onChange, val, newName)}
                placeholder={tdsPlaceholder}
                addNewLabel={addNewLabel}
                triggerClassName="text-xs min-w-0"
                {...SALE_PURCHASE_LINE_DESKTOP_COMBOBOX_PROPS}
              />
            </div>
            {field.value ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-1 text-[9px]"
                disabled={disabled}
                onClick={() => setDefault(field.value)}
              >
                Default
              </Button>
            ) : null}
          </div>
        </FormItem>
      )}
    />
  );

  const tdsAmountInlineCell = (
    <FormField
      control={control}
      name={`lineItems.${index}.tdsAmount`}
      render={({ field }: any) => {
        const moneyText = formatSalePurchaseLineMoneyDisplay(field.value);
        return (
          <FormControl className="inline-flex w-max shrink-0 justify-end">
            <Input
              {...SALE_PURCHASE_LINE_MONEY_INPUT_FIELD_PROPS}
              name={field.name}
              onBlur={field.onBlur}
              ref={field.ref}
              value={moneyText}
              style={salePurchaseLineMoneyInputStyle(field.value)}
              className={cn(SALE_PURCHASE_LINE_NUMBER_INPUT_CLASS, "bg-muted")}
            />
          </FormControl>
        );
      }}
    />
  );

  if (variant === "desktop-tds-pair") {
    return (
      <>
        <div className={salePurchasePairBodyCell("left", "w-max max-w-none")}>{tdsComboboxCell}</div>
        <div className={salePurchasePairBodyCell("right", "p-[2px] flex items-stretch justify-end w-full min-w-0")}>{tdsAmountInlineCell}</div>
      </>
    );
  }

  if (variant === "desktop-tds") {
    return <div className="px-2 py-1 box-border min-w-0">{tdsComboboxCell}</div>;
  }

  // mobile
  return (
    <div className="flex gap-[2px] px-[2px] w-full">
      <div className="flex-1 min-w-0">
        <FormLabel className="text-xs">{taxableLabel}</FormLabel>
        <Input
          type="number"
          readOnly
          value={taxableAmount.toFixed(2)}
          className="h-9 text-xs text-right bg-muted"
        />
      </div>
      <div className="flex-[1.4] min-w-0">
        <FormField
          control={control}
          name={`lineItems.${index}.tdsAccountId`}
          render={({ field }: any) => (
            <FormItem>
              <div className="flex items-center justify-between gap-1">
                <FormLabel className="text-xs">{tdsLabel}</FormLabel>
                {field.value ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[9px]"
                    disabled={disabled}
                    onClick={() => setDefault(field.value)}
                  >
                    Default
                  </Button>
                ) : null}
              </div>
              <FormControl>
                <div className="[&_button]:h-9 [&_button]:text-xs">
                  <Combobox
                    options={taxAccountOptions}
                    value={field.value}
                    disabled={disabled}
                    onChange={(val, newName) => onTdsComboboxChange(field.onChange, val, newName)}
                    placeholder={tdsPlaceholder}
                    addNewLabel={addNewLabel}
                    {...SALE_PURCHASE_LINE_TAX_COMBOBOX_PROPS}
                  />
                </div>
              </FormControl>
            </FormItem>
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <FormField
          control={control}
          name={`lineItems.${index}.tdsAmount`}
          render={({ field }: any) => (
            <FormItem>
              <FormLabel className="text-xs">{tdsAmountLabel}</FormLabel>
              <FormControl>
                <Input type="number" {...field} readOnly className="h-9 text-xs text-right bg-muted" />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
