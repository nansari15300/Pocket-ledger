"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

export function LoanDetailsPage({ loanId }: { loanId: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/loans?view=details&id=${encodeURIComponent(loanId)}`);
  }, [loanId, router]);
  return <LoadingSpinner />;
}
