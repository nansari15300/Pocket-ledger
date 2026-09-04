"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { BalanceSheet2AuditPage } from "@/components/reports/BalanceSheet2AuditPage";

export default function BalanceSheet2Route() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full min-h-[320px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BalanceSheet2AuditPage />
    </Suspense>
  );
}
