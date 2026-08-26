"use client";

import { useParams } from "next/navigation";
import { LoanDetailsPage } from "@/modules/loans/pages/LoanDetailsPage";

export function LoanIdRouteClient() {
  const params = useParams();
  const id = String(params?.id || "");
  return <LoanDetailsPage loanId={id} />;
}
