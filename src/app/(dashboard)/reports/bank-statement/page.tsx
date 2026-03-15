"use client";

import { Suspense } from "react";
import DesktopBankStatementPage from "@/components/reports/DesktopBankStatementPage";

function BankStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

export default function BankStatementPage() {
  return (
    // Wrap URL-query consumers used inside desktop statement component.
    <Suspense fallback={<BankStatementLoading />}>
      <DesktopBankStatementPage />
    </Suspense>
  );
}
