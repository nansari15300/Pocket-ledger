"use client";

import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { ImportExportPanel } from "@/components/import-export/ImportExportPanel";

export default function ImportExportPage() {
  return (
    <PermissionRouteGuard permissionAny={["export_data", "import_data"]}>
      <div className="p-4 sm:p-6 md:p-8 space-y-6">
        <ImportExportPanel />
      </div>
    </PermissionRouteGuard>
  );
}
