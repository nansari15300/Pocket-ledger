"use client";
/**
 * Optional pencil (edit) icon on combobox option rows.
 * Any <Combobox> under a <ComboboxEditOptionContext.Provider> shows the icon; clicking it never selects the option.
 * A Combobox can also pass `onEditOption` directly (wins over the context).
 */
import * as React from "react";

/** Return a handler when this option value can be edited, else null (no icon). */
export type ComboboxEditOptionResolver = (value: string) => (() => void) | null;

export const ComboboxEditOptionContext = React.createContext<ComboboxEditOptionResolver | null>(null);

export function useComboboxEditOption(): ComboboxEditOptionResolver | null {
  return React.useContext(ComboboxEditOptionContext);
}
