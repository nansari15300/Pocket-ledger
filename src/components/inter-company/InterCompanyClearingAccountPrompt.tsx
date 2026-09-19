"use client";

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
import {
  NESTED_VOUCHER_ALERT_CONTENT_CN,
  NESTED_VOUCHER_ALERT_OVERLAY_CN,
} from "@/lib/dialogShellChrome";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";

const IC_CLEARING_PREFILL = {
  accountName: "Clearing Account",
  isClearing: true,
  accountType: "Bank" as const,
};

export type InterCompanyClearingPromptMode = "create_voucher" | "approve";

type InterCompanyClearingAccountPromptProps = {
  promptOpen: boolean;
  onPromptOpenChange: (open: boolean) => void;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  mode: InterCompanyClearingPromptMode;
  companyName?: string;
  onClearingAccountCreated: (accountId: string, accountLabel?: string) => void;
};

export function InterCompanyClearingAccountPrompt({
  promptOpen,
  onPromptOpenChange,
  createOpen,
  onCreateOpenChange,
  mode,
  companyName,
  onClearingAccountCreated,
}: InterCompanyClearingAccountPromptProps) {
  const companyLabel = String(companyName || "this company").trim() || "this company";
  const actionLabel =
    mode === "approve"
      ? "approve this Inter Company voucher"
      : "create an Inter Company voucher";

  return (
    <>
      <AlertDialog open={promptOpen} onOpenChange={onPromptOpenChange}>
        <AlertDialogContent
          overlayClassName={NESTED_VOUCHER_ALERT_OVERLAY_CN}
          className={NESTED_VOUCHER_ALERT_CONTENT_CN}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Clearing Account missing</AlertDialogTitle>
            <AlertDialogDescription>
              You are going to {actionLabel} for <strong>{companyLabel}</strong>, but Clearing
              Account is missing. Do you want to create it now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onPromptOpenChange(false);
                onCreateOpenChange(true);
              }}
            >
              Create Clearing Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateBankAccountDialog
        isOpen={createOpen}
        onOpenChange={onCreateOpenChange}
        initialPrefill={IC_CLEARING_PREFILL}
        contextNote="Inter Company clearing account — used as intermediary on approve."
        onAccountCreated={(accountId) => {
          onCreateOpenChange(false);
          onClearingAccountCreated(accountId, IC_CLEARING_PREFILL.accountName);
        }}
      >
        <div />
      </CreateBankAccountDialog>
    </>
  );
}
