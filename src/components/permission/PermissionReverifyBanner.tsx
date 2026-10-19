"use client";

import { AlertTriangle } from "lucide-react";
import usePermissions from "@/hooks/usePermissions";

/** Cached role older than 10 days (or device clock moved back) and not re-verified online: prominent notice, app stays read-only. */
export function PermissionReverifyBanner() {
  const { permissionsReverifyRequired } = usePermissions();
  if (!permissionsReverifyRequired) return null;
  return (
    <div
      role="alert"
      className="flex w-full items-center justify-center gap-2 border-b border-amber-400 bg-amber-100 px-3 py-2 text-center text-sm font-semibold text-amber-900"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Please connect to the internet to re-verify permissions. The app is read-only until then.
    </div>
  );
}