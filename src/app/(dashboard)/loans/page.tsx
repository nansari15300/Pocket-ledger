"use client";

import { Suspense } from "react";
import { LoansPage } from "@/modules/loans/pages/LoansPage";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

export default function LoansRoutePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoansPage />
    </Suspense>
  );
}
