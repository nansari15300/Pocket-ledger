"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Master-detail pages should sync ?selected= / &view=groups to the URL when:
 * - narrow viewport (mobile), or
 * - static app build (APK / Electron static) — even on wide windows, so header Report + useSearchParams see the id.
 */
export function useMasterDetailQueryNav(): boolean {
  const isMobile = useIsMobile();
  return isMobile || isStaticAppBuild();
}
