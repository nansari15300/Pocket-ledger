"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "pl-show-all-tds-type-cards";
const EVT = "pl-show-all-tds-type-cards-change";

/** Party/Staff TDS dropdown: sab TDS type cards hamesha dikhao (default off). Web/EXE/APK localStorage. */
export function useShowAllTdsCards(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setValue(window.localStorage.getItem(KEY) === "1");
      } catch {
        setValue(false);
      }
    };
    read();
    window.addEventListener(EVT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const set = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [value, set];
}