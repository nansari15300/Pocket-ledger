"use client";

import { Suspense } from "react";
import DesktopStaffStatementPage from "@/components/reports/DesktopStaffStatementPage";

function StaffStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

export default function StaffStatementPage() {
  return (
    // Wrap URL-query consumers used inside desktop statement component.
    <Suspense fallback={<StaffStatementLoading />}>
      <DesktopStaffStatementPage />
    </Suspense>
  );
}
