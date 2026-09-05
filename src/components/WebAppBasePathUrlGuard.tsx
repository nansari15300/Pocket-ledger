"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { repairAppUiPathInBrowser, webAppBasePath } from "@/lib/webAppBasePath";

/** Keep browser URL aligned with Next `basePath` when History API writes drop `/app`. */
export function WebAppBasePathUrlGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!webAppBasePath()) return;
    repairAppUiPathInBrowser();
  }, [pathname]);

  return null;
}
