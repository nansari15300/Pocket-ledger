"use client";

import { Suspense } from "react";
import DesktopExpenseStatementPage from "@/components/reports/DesktopExpenseStatementPage";

function ExpenseStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

export default function ExpenseStatementPage() {
  return (
    // Wrap URL-query consumers used inside desktop statement component.
    <Suspense fallback={<ExpenseStatementLoading />}>
      <DesktopExpenseStatementPage />
    </Suspense>
  );
}
