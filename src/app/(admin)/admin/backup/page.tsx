"use client";

import { useAdminAccess } from "@/hooks/useAdminAccess";
import { BackupRestore } from "@/components/settings/BackupRestore";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function BackupPage() {
  useAdminAccess(['SuperAdmin']);

  return (
    <div className="space-y-6">
       <Card>
            <CardHeader>
                <CardTitle>Backup & Restore (Admin)</CardTitle>
                <CardDescription>
                    Manage global backups or restore to a new company for any user.
                </CardDescription>
            </CardHeader>
       </Card>
       <BackupRestore />
    </div>
  );
}
