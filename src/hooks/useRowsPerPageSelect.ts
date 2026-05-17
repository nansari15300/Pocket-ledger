"use client";

import { useCallback, useMemo } from "react";
import { rowsPerPageSelectValue } from "@/lib/rowsPerPageSelect";

/** Stable Radix Select `value` + `onValueChange` for rows-per-page (invalid value → ref loop). */
export function useRowsPerPageSelectControl(
  rowsPerPage: number,
  setRowsPerPage: (value: number) => void,
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>,
  options: readonly number[],
  fallbackWhenUnknown: string
) {
  const selectValue = useMemo(
    () => rowsPerPageSelectValue(rowsPerPage, options, fallbackWhenUnknown),
    [rowsPerPage, options, fallbackWhenUnknown]
  );
  const onSelectValueChange = useCallback(
    (value: string) => {
      setRowsPerPage(Number(value) || 0);
      setCurrentPage(1);
    },
    [setRowsPerPage, setCurrentPage]
  );
  return { selectValue, onSelectValueChange, options };
}
