"use client";

import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import { isMasterOpeningBalanceDateMissing } from "@/lib/masterOpeningBalanceDateRequired";

/** Watch OB + date — true ⇒ Save should stay disabled. */
export function useMasterOpeningBalanceDateRequired<T extends FieldValues>(
  control: Control<T>,
  openingBalanceName: Path<T> = "openingBalance" as Path<T>,
  openingBalanceDateName: Path<T> = "openingBalanceDate" as Path<T>
): boolean {
  const openingBalance = useWatch({ control, name: openingBalanceName });
  const openingBalanceDate = useWatch({ control, name: openingBalanceDateName });
  return isMasterOpeningBalanceDateMissing(openingBalance, openingBalanceDate);
}
