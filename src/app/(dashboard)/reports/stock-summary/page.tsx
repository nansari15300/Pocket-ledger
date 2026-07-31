import { Suspense } from "react";
import StockSummary from "@/components/reports/StockSummary";

function StockSummaryLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading stock summary...</div>
    </div>
  );
}

// Server page: Suspense for Next.js static export (CSR bailout / useSearchParams in tree).
export default function StockSummaryPage() {
  return (
    <Suspense fallback={<StockSummaryLoading />}>
      <StockSummary />
    </Suspense>
  );
}
