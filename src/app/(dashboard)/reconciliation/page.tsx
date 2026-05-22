import { Suspense } from "react";
import ReconciliationPageClient from "./[shareId]/ReconciliationPageClient";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

/** Static export: `/reconciliation/?shareId=` — dynamic `[shareId]` folder 404 na ho (EXE dashboard jump fix). */
export default function ReconciliationQueryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ReconciliationPageClient />
    </Suspense>
  );
}
