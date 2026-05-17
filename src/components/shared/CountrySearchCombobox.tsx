"use client";

import { useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";
import {
  buildCountrySearchComboboxOptions,
  buildInternationalCountrySearchOptions,
  buildSaarcCountrySearchOptions,
} from "@/lib/worldCurrencies";

/** `all` = base catalog; `saarc` / `international` = FX cards filtered lists. */
export type CountrySearchScope = "all" | "saarc" | "international";

type CountrySearchComboboxProps = {
  value?: string;
  onChange: (country: string) => void;
  disabled?: boolean;
  placeholder?: string;
  scope?: CountrySearchScope;
  /** Base catalog: `Rs. 1`; default region field: sirf symbol. */
  symbolWithOne?: boolean;
};

/**
 * Searchable country list — scope se filter (SAARC-only ya international-only).
 */
export function CountrySearchCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Search country…",
  scope = "all",
  symbolWithOne = true,
}: CountrySearchComboboxProps) {
  const options = useMemo(() => {
    if (scope === "saarc") return buildSaarcCountrySearchOptions();
    if (scope === "international") return buildInternationalCountrySearchOptions();
    return buildCountrySearchComboboxOptions(symbolWithOne);
  }, [scope, symbolWithOne]);

  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Type country name…"
      disabled={disabled}
      autoFocusSearchOnOpen
      triggerClassName={scope === "all" ? "!rounded-md h-10" : "!rounded-md h-9 text-sm"}
    />
  );
}
