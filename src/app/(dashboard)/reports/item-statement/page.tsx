"use client";

import { Suspense } from "react";
import DesktopItemStatementPage from "@/components/reports/DesktopItemStatementPage";

function ItemStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

export default function ItemStatementPage() {
  return (
    // Wrap URL-query consumers used inside desktop statement component.
    <Suspense fallback={<ItemStatementLoading />}>
      <DesktopItemStatementPage />
    </Suspense>
  );
}
