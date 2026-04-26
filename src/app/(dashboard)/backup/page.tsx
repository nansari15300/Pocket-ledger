"use client";

import { Suspense } from "react";
import { BackupRestore } from "@/components/settings/BackupRestore";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { Loader2 } from "lucide-react";

export default function BackupPage() {
  return (
    <PermissionRouteGuard permissionAny={["export_data", "import_data"]}>
      <div className="p-4 sm:p-6 md:p-8 space-y-6">
        {/* `useSearchParams` inside BackupRestore — App Router prerender / missing-suspense error avoid */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading backup tools…
            </div>
          }
        >
          <BackupRestore />
        </Suspense>
      </div>
    </PermissionRouteGuard>
  );
}
