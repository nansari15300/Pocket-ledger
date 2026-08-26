"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useLoans } from "../hooks/useLoans";
import { LoanForm } from "../components/LoanForm";
import { LoanReportsView } from "../components/LoanReportsView";
import { LoanOverviewMasterDetail } from "../components/LoanOverviewMasterDetail";
import { LoanWorkspaceDetails } from "../components/LoanWorkspaceDetails";
import { createLoan } from "../services/loanService";
import type { LoanDraftInput } from "../types/loanTypes";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

const LOAN_CREATE_PREFILL_KEY = "pl-loan-create-prefill";

function readCreatePrefill(): Partial<LoanDraftInput> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(LOAN_CREATE_PREFILL_KEY);
    sessionStorage.removeItem(LOAN_CREATE_PREFILL_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<LoanDraftInput>;
  } catch {
    return undefined;
  }
}

export function LoansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "overview";
  const selectedId = searchParams.get("id");
  const selectedAccountId = searchParams.get("selected");
  const activeView = searchParams.get("tab") === "groups" ? "groups" : "accounts";
  const { company, companyId } = useCompany();
  const { user } = useAuth();
  const { allLoans, schedulesByLoan, loading, reload } = useLoans(companyId);
  const [saving, setSaving] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<Partial<LoanDraftInput> | undefined>(undefined);
  const [prefillView, setPrefillView] = useState(view);
  if (view !== prefillView) {
    setPrefillView(view);
    setCreatePrefill(view === "create" ? readCreatePrefill() : undefined);
  }
  const userName = user?.displayName || user?.email || user?.uid || "user";

  const pushLoanUrl = (params: URLSearchParams) => {
    const q = params.toString();
    router.push(q ? `/loans?${q}` : "/loans");
  };

  const setView = (next: string, id?: string) => {
    const params = new URLSearchParams();
    if (next && next !== "overview") params.set("view", next);
    if (id) params.set("id", id);
    pushLoanUrl(params);
  };

  if (!companyId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a company to manage loans.</p>;
  }
  if (loading && view === "overview") return <LoadingSpinner />;

  if (view === "create") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <LoanForm
          initial={createPrefill}
          saving={saving}
          onCancel={() => router.push("/loans")}
          onSave={async (input) => {
            if (!user?.uid) {
              toast.error("You must be signed in.");
              return;
            }
            setSaving(true);
            try {
              const created = await createLoan({
                companyId,
                userId: user.uid,
                userName,
                company,
                input,
              });
              toast.success("Loan saved.");
              await reload();
              const params = new URLSearchParams();
              if (created.loan.loanAccountId) params.set("selected", created.loan.loanAccountId);
              pushLoanUrl(params);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save loan");
            } finally {
              setSaving(false);
            }
          }}
        />
      </div>
    );
  }

  if (view === "reports") {
    return (
      <div className="h-full min-h-0 space-y-3 overflow-y-auto p-4">
        <Button type="button" variant="outline" onClick={() => router.push("/loans")}>
          Back to overview
        </Button>
        <LoanReportsView loans={allLoans} schedules={schedulesByLoan} transactions={{}} />
      </div>
    );
  }

  if (view === "details" && selectedId) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-3">
          <Button type="button" variant="outline" onClick={() => router.push("/loans")}>
            Back to overview
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <LoanWorkspaceDetails loanId={selectedId} onReloadList={reload} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <LoanOverviewMasterDetail
        loans={allLoans}
        selectedId={selectedAccountId}
        activeView={activeView}
        onSelectAccountId={(accountId, tab) => {
          const params = new URLSearchParams();
          if (tab === "groups") params.set("tab", "groups");
          if (accountId) params.set("selected", accountId);
          const q = params.toString();
          router.replace(q ? `/loans?${q}` : "/loans", { scroll: false });
        }}
        onCreate={(initial) => {
          if (typeof window !== "undefined") {
            if (initial && Object.keys(initial).length) {
              sessionStorage.setItem(LOAN_CREATE_PREFILL_KEY, JSON.stringify(initial));
            } else {
              sessionStorage.removeItem(LOAN_CREATE_PREFILL_KEY);
            }
          }
          setView("create");
        }}
        onReloadList={reload}
      />
    </div>
  );
}
