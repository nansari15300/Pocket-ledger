"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Report pages (mobile): main master page jaisa pehle entity LIST, row tap -> ledger statement,
 * back -> list. `idKeys` = URL params jo selected entity batate hain (e.g. ["partyId", "groupId"]).
 */
export function useReportMobileListMode(isMobile: boolean, idKeys: readonly string[]) {
  const searchParams = useSearchParams();
  const idKeysKey = idKeys.join("|");
  const hasId = idKeys.some((k) => !!searchParams.get(k));
  const [forceList, setForceList] = useState(false);
  const openedFromListRef = useRef(false);
  const prevHasIdRef = useRef(hasId);

  useEffect(() => {
    if (hasId && !prevHasIdRef.current) {
      // List row tap ne `pushState` se id add kiya -> back = history back.
      openedFromListRef.current = true;
      setForceList(false);
    }
    if (!hasId) openedFromListRef.current = false;
    prevHasIdRef.current = hasId;
  }, [hasId]);

  const showList = isMobile && (!hasId || forceList);

  /** Mobile ledger -> list. Returns true when handled (caller should not navigate away). */
  const backToList = useCallback((): boolean => {
    if (!isMobile || showList) return false;
    if (openedFromListRef.current) {
      openedFromListRef.current = false;
      window.history.back();
      return true;
    }
    const url = new URL(window.location.href);
    idKeysKey.split("|").forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(window.history.state, "", url);
    setForceList(true);
    return true;
  }, [isMobile, showList, idKeysKey]);

  return { showList, backToList };
}
