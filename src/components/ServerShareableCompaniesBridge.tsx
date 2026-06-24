"use client";

import { useEffect } from "react";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import {
  isLocalServerShareableCompany,
  toPlServerSharedCompanySummary,
} from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";

declare global {
  interface Window {
    __plListShareableLocalCompanies?: () => Promise<
      Array<{ id: string; name: string; storageOption: "local"; ownerEmail?: string | null }>
    >;
    __plValidateLocalCompanyLogin?: (
      companyId: string,
      username: string,
      password: string
    ) => Promise<{ ok: true; token: string; user: { id: string; username: string; displayName?: string; role?: string } } | { ok: false; error: string }>;
  }
}

/** Server PC (EXE): HTTP `/__pl_access_context` ke liye local company list expose — main process IPC. */
export function ServerShareableCompaniesBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPlRemoteServerClientMode()) return;

    window.__plListShareableLocalCompanies = async () => {
      const rows = await listLocalCompanies();
      return rows.filter(isLocalServerShareableCompany).map(toPlServerSharedCompanySummary);
    };

    window.__plValidateLocalCompanyLogin = async (companyId, username, password) => {
      const { localAuthLoginClientOnly } = await import("@/lib/localCompanyUsers");
      try {
        const { token, user } = await localAuthLoginClientOnly(companyId, username, password);
        return { ok: true as const, token, user };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Invalid username or password",
        };
      }
    };

    return () => {
      delete window.__plListShareableLocalCompanies;
      delete window.__plValidateLocalCompanyLogin;
    };
  }, []);

  return null;
}
