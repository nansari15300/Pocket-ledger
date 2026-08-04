"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  clearDriveOAuthReturnGrace,
  decodeDriveOAuthStateParam,
  markDriveOAuthReturnGrace,
} from "@/lib/driveOAuthReturnGrace";
import { markDriveOAuthConnected } from "@/lib/driveOAuthConnectedMarker";

/** Web/APK: Drive OAuth return par company restore + toast; URL query saaf karo. */
export function DriveOAuthReturnBootstrap() {
  const { setCompanyId, reloadLocalCompanyRegistry } = useCompany();
  const { toast } = useToast();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);
    const success = sp.get("success");
    const error = sp.get("error");
    if (!success && !error) return;
    handledRef.current = true;

    const decoded = decodeDriveOAuthStateParam(sp.get("state"));
    const companyId = String(decoded?.formData?.companyId || "").trim();
    if (companyId) {
      markDriveOAuthReturnGrace(companyId);
      setCompanyId(companyId);
      reloadLocalCompanyRegistry();
    }

    if (success === "drive_connected") {
      markDriveOAuthConnected(decoded?.email ?? null);
      toast({
        title: "Google Drive connected",
        description: "You can now sync local companies to Drive.",
      });
      try {
        window.dispatchEvent(new CustomEvent("pl-drive-connection-changed"));
      } catch {
        /* ignore */
      }
      window.setTimeout(() => clearDriveOAuthReturnGrace(), 30_000);
    } else if (error) {
      const description =
        error === "oauth_exchange_failed"
          ? "Google token exchange failed. Please try Connect again."
          : error === "invalid_grant"
            ? "OAuth session expired or redirect mismatch — Connect dubara try karo."
            : error;
      toast({
        variant: "destructive",
        title: "Drive connect failed",
        description,
      });
      window.setTimeout(() => clearDriveOAuthReturnGrace(), 60_000);
    }

    sp.delete("success");
    sp.delete("error");
    sp.delete("state");
    const next = `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}${window.location.hash || ""}`;
    try {
      window.history.replaceState(null, "", next);
    } catch {
      /* ignore */
    }
  }, [setCompanyId, reloadLocalCompanyRegistry, toast]);

  return null;
}
