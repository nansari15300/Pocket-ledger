"use client";

import { useEffect } from "react";
import { persistDevClientAccessToken } from "@/lib/plServerAccessContext";
import { markPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { refreshPlServerAccessContext } from "@/lib/plServerAccessContext";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";

/**
 * Remote server open (Gate / EXE client): `?pl_access=` + `?pl_remote_client=1` URL se token persist.
 */
export function GateAccessBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const q = new URLSearchParams(window.location.search);
      const tok = q.get("pl_access")?.trim();
      if (tok) {
        persistDevClientAccessToken(tok);
        markPlRemoteServerClientMode();
        q.delete("pl_access");
        const clean =
          window.location.pathname +
          (q.toString() ? `?${q.toString()}` : "") +
          window.location.hash;
        window.history.replaceState(window.history.state ?? null, "", clean);
        void refreshPlServerAccessContext();
      }
      const companyPick = q.get("pl_company")?.trim();
      if (companyPick) writeSelectedCompanyId(companyPick);
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
