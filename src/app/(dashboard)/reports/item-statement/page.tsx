import { Suspense } from "react";
import DesktopItemStatementPage from "@/components/reports/DesktopItemStatementPage";

function ItemStatementLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading statement...</div>
    </div>
  );
}

// Server page: Suspense must sit here (not under "use client") for static export + useSearchParams in DesktopItemStatementPage.
export default function ItemStatementPage() {
  return (
    <Suspense fallback={<ItemStatementLoading />}>
      <DesktopItemStatementPage />
    </Suspense>
  );
}
