"use client";

import { useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";
import { buildCountryCurrencyComboboxOptions } from "@/lib/worldCurrencies";

type CountryCurrencyComboboxProps = {
  value?: string;
  onChange: (country: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Company profile chrome: nested dialog me search focus. */
  popoverModal?: boolean;
};

/**
 * Searchable currency picker — filter by country name (Combobox CommandInput).
 * Value = country name; parent maps to currencyCode + currencySymbol via getDefaultCurrencyForCountry.
 */
export function CountryCurrencyCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Select country / currency",
  popoverModal,
}: CountryCurrencyComboboxProps) {
  const options = useMemo(() => buildCountryCurrencyComboboxOptions(), []);
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search by country, code, or currency…"
      disabled={disabled}
      popoverModal={popoverModal}
      autoFocusSearchOnOpen
    />
  );
}
