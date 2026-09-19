"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import { useLoans } from "@/modules/loans/hooks/useLoans";
import { LoanOverviewMasterDetail } from "@/modules/loans/components/LoanOverviewMasterDetail";
import type { LoanDraftInput } from "@/modules/loans/types/loanTypes";

const LOAN_CREATE_PREFILL_KEY = "pl-loan-create-prefill";

/** Reports hub — same Loan Overview master/detail as `/loans`, URL stays on `/reports?report=loan-overview`. */
export function LoanOverviewReportDetail() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { companyId } = useCompany();
  const { allLoans, reload, hydrated } = useLoans(companyId);

  const selectedId = searchParams.get("selected");
  const activeView = searchParams.get("tab") === "groups" ? "groups" : "accounts";

  const patchReportParams = (patch: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", "loan-overview");
    for (const [key, val] of Object.entries(patch)) {
      if (val == null || val === "") params.delete(key);
      else params.set(key, val);
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  if (!companyId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a company to view loan overview.</p>;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <LoanOverviewMasterDetail
        chromeMode="reports"
        loans={allLoans}
        selectedId={selectedId}
        activeView={activeView}
        onSelectAccountId={(accountId, tab) => {
          patchReportParams({
            selected: accountId,
            tab: tab === "groups" ? "groups" : null,
          });
        }}
        onCreate={(initial?: Partial<LoanDraftInput>) => {
          if (typeof window !== "undefined") {
            if (initial && Object.keys(initial).length) {
              sessionStorage.setItem(LOAN_CREATE_PREFILL_KEY, JSON.stringify(initial));
            } else {
              sessionStorage.removeItem(LOAN_CREATE_PREFILL_KEY);
            }
          }
          router.push("/loans?view=create");
        }}
        onReloadList={reload}
        loansHydrated={hydrated}
      />
    </div>
  );
}
