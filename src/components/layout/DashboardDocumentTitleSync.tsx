"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDashboardDocumentTitle } from "@/lib/dashboardDocumentTitle";

/**
 * Electron EXE tab strip `getTitle()` + normal browser tab — `pathname` se `document.title` sync.
 */
export function DashboardDocumentTitleSync() {
  const pathname = usePathname();
  useEffect(() => {
    document.title = getDashboardDocumentTitle(pathname);
  }, [pathname]);
  return null;
}
