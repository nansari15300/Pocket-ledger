"use client";

import { useEffect, useState } from "react";
import { useMobileView } from "@/hooks/use-mobile";

const VIEWPORT_MIN_WIDTH = "(min-width: 768px)";

/**
 * Admin list + detail (Party page jaisa): PC par left/right split.
 * `md:` CSS se mat rely karo — touchscreen laptop par `isMobile` galat ho sakta hai; yahan `matchMedia` + real phone.
 * `forcedViewMode === "mobile"` yahan ignore: app header ka mobile toggle poori app ke liye hai; admin rail 4K / wide par
 * bhi stack na ho (purane `md:grid-cols-[…]` / D: Static Build jaisa behaviour).
 */
export function useAdminMasterDetailSplit() {
  const { isRealMobile } = useMobileView();
  const [wideViewport, setWideViewport] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(VIEWPORT_MIN_WIDTH);
    const sync = () => setWideViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Sirf chhoti width ya asli phone par single column — wide desktop par forced mobile se stack nahi.
  const splitLayout = wideViewport && !isRealMobile;

  return { splitLayout };
}

/** ~25% list rail + ~75% detail — `display:grid` hamesha; column count switch. */
export function adminMasterDetailGridClass(splitLayout: boolean): string {
  return splitLayout
    ? "grid min-h-0 w-full min-w-0 grid-cols-[minmax(0,25%)_minmax(0,1fr)] gap-0 overflow-x-hidden"
    : "grid min-h-0 w-full min-w-0 grid-cols-1 gap-4 overflow-x-hidden";
}
