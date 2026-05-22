import { Suspense } from "react";
import ReconciliationPageClient from "./ReconciliationPageClient";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

// Static export: legacy `[shareId]` HTML; asli navigation `reconciliation/?shareId=` (see reconciliation/page.tsx)
export async function generateStaticParams() {
  return [{ shareId: "__placeholder__" }];
}

export default function ReconciliationSharePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ReconciliationPageClient />
    </Suspense>
  );
}
