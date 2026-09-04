"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  diagnoseSystemOpeningBalanceFromProcessed,
  reconcileSystemOpeningBalanceLedger,
  type SystemOpeningBalanceDiagnosis,
} from "@/lib/reports/systemOpeningBalanceEquityClient";
import type { MasterOpeningBalanceEntity } from "@/lib/reports/systemOpeningBalanceEquity";

type Props = {
  companyId: string | null | undefined;
  processedParties: MasterOpeningBalanceEntity[];
  processedAccounts: MasterOpeningBalanceEntity[];
  processedStaff: MasterOpeningBalanceEntity[];
  processedTaxes: MasterOpeningBalanceEntity[];
  processedExpenseAccounts: MasterOpeningBalanceEntity[];
  storedSystemOpeningBalance: number;
  formatCurrency: (amount: number, options?: { showDrCr?: boolean }) => string;
  onReconciled?: () => void;
  className?: string;
};

function formatSignedAmount(
  amount: number,
  formatCurrency: Props["formatCurrency"]
): string {
  return formatCurrency(amount, { showDrCr: true });
}

export function OpeningBalanceReconciliationPanel({
  companyId,
  processedParties,
  processedAccounts,
  processedStaff,
  processedTaxes,
  processedExpenseAccounts,
  storedSystemOpeningBalance,
  formatCurrency,
  onReconciled,
  className,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [liveDiagnosis, setLiveDiagnosis] = useState<SystemOpeningBalanceDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const derivedDiagnosis = useMemo(
    () =>
      diagnoseSystemOpeningBalanceFromProcessed({
        processedParties,
        processedAccounts,
        processedStaff,
        processedTaxes,
        processedExpenseAccounts,
        storedSystemOpeningBalance,
      }),
    [
      processedParties,
      processedAccounts,
      processedStaff,
      processedTaxes,
      processedExpenseAccounts,
      storedSystemOpeningBalance,
    ]
  );

  const diagnosis = liveDiagnosis ?? derivedDiagnosis;

  const handleReconcile = useCallback(async () => {
    if (!companyId) return;
    setIsReconciling(true);
    setError(null);
    try {
      const result = await reconcileSystemOpeningBalanceLedger(companyId, { apply: true });
      setLiveDiagnosis(result.diagnosis);
      if (!result.success) {
        setError(result.error || "Reconciliation failed");
        return;
      }
      onReconciled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsReconciling(false);
      setConfirmOpen(false);
    }
  }, [companyId, onReconciled]);

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-3 text-xs sm:text-sm",
        diagnosis.isReconciled
          ? "border-green-300/80 bg-green-50/90 text-green-950 dark:bg-green-950/20 dark:text-green-100"
          : "border-amber-300/80 bg-amber-50/90 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
        className
      )}
    >
      <p className="font-semibold text-sm">Opening Balance Reconciliation</p>
      <p className="mt-1 text-xs text-muted-foreground">
        System Opening Balance (Equity) is derived from current master opening balances — not from
        historical incremental counters.
      </p>

      <dl className="mt-3 grid gap-1.5 tabular-nums">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">Stored System Opening Balance</dt>
          <dd className="font-medium">
            {formatSignedAmount(diagnosis.storedOpeningBalance, formatCurrency)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">Expected System Opening Balance</dt>
          <dd className="font-medium">
            {formatSignedAmount(diagnosis.expectedOpeningBalance, formatCurrency)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">Difference</dt>
          <dd className={cn("font-semibold", !diagnosis.isReconciled && "text-amber-800 dark:text-amber-200")}>
            {formatSignedAmount(Math.abs(diagnosis.difference), formatCurrency)}
            {!diagnosis.isReconciled ? (
              <span className="ml-1 font-normal text-muted-foreground">
                ({diagnosis.difference > 0 ? "stored higher" : "stored lower"})
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {diagnosis.isReconciled ? (
          <span className="inline-flex items-center gap-1.5 text-green-800 dark:text-green-200 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Reconciled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-200 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Needs reconciliation
          </span>
        )}

        {!diagnosis.isReconciled ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!companyId || isReconciling}
            onClick={() => setConfirmOpen(true)}
          >
            {isReconciling ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Reconciling…
              </>
            ) : (
              "Reconcile Opening Balance"
            )}
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconcile System Opening Balance?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will rebuild the System Opening Balance from the current master opening
                  balances. It will not change party, bank, staff, tax, income or expense opening
                  balances.
                </p>
                <p>
                  Stored: {formatSignedAmount(diagnosis.storedOpeningBalance, formatCurrency)}
                  <br />
                  Expected: {formatSignedAmount(diagnosis.expectedOpeningBalance, formatCurrency)}
                  <br />
                  Difference: {formatSignedAmount(Math.abs(diagnosis.difference), formatCurrency)}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReconciling}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isReconciling || !companyId} onClick={() => void handleReconcile()}>
              {isReconciling ? "Reconciling…" : "Reconcile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
