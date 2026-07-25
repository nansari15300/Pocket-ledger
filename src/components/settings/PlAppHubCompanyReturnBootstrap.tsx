"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { appNavHref } from "@/lib/appNavHref";
import { isAppUiOrigin } from "@/lib/plGatePageOrigin";

/** Hub return from server URL: `/company?pl_company=…` → select + dashboard. */
export function PlAppHubCompanyReturnBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const { setCompanyId } = useCompany();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current || typeof window === "undefined") return;
    if (!isAppUiOrigin()) return;
    try {
      const u = new URL(window.location.href);
      const companyId = (u.searchParams.get("pl_company") || "").trim();
      if (!companyId) return;
      consumedRef.current = true;
      u.searchParams.delete("pl_company");
      const clean = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState(window.history.state, "", clean);
      setCompanyId(companyId);
      const path = pathname?.replace(/\/$/, "") || "";
      if (path === "" || path === "/" || path.startsWith("/company") || path.startsWith("/gate")) {
        router.replace(appNavHref("/dashboard"));
      }
    } catch {
      /* ignore */
    }
  }, [pathname, router, setCompanyId]);

  return null;
}
