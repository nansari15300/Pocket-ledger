"use client";

import { useEffect, useRef } from "react";
import { persistDevClientAccessToken, refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import { syncPlServerSharedCompaniesToLocalSqlite } from "@/lib/plServerClientCompanyDelta";
import { readAndStripPlRemoteClientLandingQuery, reconcilePlRemoteServerClientSessionOnLoad, reconcilePlHubServerClientSessionOnLoad } from "@/lib/plRemoteServerClient";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";

/** Remote server landing: refresh gate context — company open via Gate unlock flow, not auto dashboard. */
export function PlRemoteClientLandingBootstrap() {
  const consumedRef = useRef(false);
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    reconcilePlRemoteServerClientSessionOnLoad();
    reconcilePlHubServerClientSessionOnLoad();
  }, []);

  useEffect(() => {
    if (consumedRef.current) return;
    const landing = readAndStripPlRemoteClientLandingQuery();
    if (!landing.hadRemoteClientFlag) return;
    consumedRef.current = true;

    persistDevClientAccessToken("");

    void (async () => {
      await refreshPlServerAccessContext();
      const selectedCompanyId = readSelectedCompanyId()?.trim();
      await syncPlServerSharedCompaniesToLocalSqlite(
        selectedCompanyId ? { companyIds: [selectedCompanyId] } : undefined
      ).catch(() => undefined);
    })();
  }, []);

  return null;
}
