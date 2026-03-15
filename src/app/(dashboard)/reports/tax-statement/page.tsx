"use client";

import { Suspense } from "react";
import DesktopTaxStatementPage from "@/components/reports/DesktopTaxStatementPage";

function TaxStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

export default function TaxStatementPage() {
  return (
    // Wrap URL-query consumers used inside desktop statement component.
    <Suspense fallback={<TaxStatementLoading />}>
      <DesktopTaxStatementPage />
    </Suspense>
  );
}
