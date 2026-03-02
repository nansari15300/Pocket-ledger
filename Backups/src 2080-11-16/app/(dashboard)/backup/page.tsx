
"use client";

import { BackupRestore } from "@/components/settings/BackupRestore";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";

export default function BackupPage() {
  return (
    <PermissionRouteGuard permissionAny={["export_data", "import_data"]}>
      <div className="p-4 sm:p-6 md:p-8 space-y-6">
        <BackupRestore />
      </div>
    </PermissionRouteGuard>
  );
}
