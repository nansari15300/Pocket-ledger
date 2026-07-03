"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { appNavHref } from "@/lib/appNavHref";
import { persistDevClientAccessToken, refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import { mirrorPlServerSharedCompaniesToLocalSqlite } from "@/lib/plServerClientCompanyMirror";
import { readAndStripPlRemoteClientLandingQuery } from "@/lib/plRemoteServerClient";

/** Remote server landing: apply token + optional company from Gate connect URL, then open dashboard. */
export function PlRemoteClientLandingBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const { setCompanyId } = useCompany();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    const landing = readAndStripPlRemoteClientLandingQuery();
    if (!landing.hadRemoteClientFlag) return;
    consumedRef.current = true;

    if (landing.accessToken) persistDevClientAccessToken(landing.accessToken);

    void (async () => {
      await refreshPlServerAccessContext();
      await mirrorPlServerSharedCompaniesToLocalSqlite().catch(() => undefined);
      if (!landing.companyId) return;
      setCompanyId(landing.companyId);
      const path = pathname?.replace(/\/$/, "") || "";
      if (path === "" || path === "/" || path.startsWith("/company") || path.startsWith("/gate")) {
        router.replace(appNavHref("/dashboard"));
      }
    })();
  }, [pathname, router, setCompanyId]);

  return null;
}
