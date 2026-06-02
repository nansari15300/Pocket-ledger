"use client";

/**
 * Source column — Source company (auto: current) + Company bank + Source account (optional).
 */
import { InterCompanySectionTitle } from "@/components/inter-company/InterCompanySectionTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InterCompanyAccountLookupSection } from "@/components/inter-company/InterCompanyAccountLookupSection";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { readCompanyInterCompanyAcNo } from "@/lib/interCompany/interCompanyAccountNo";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import type { Company } from "@/hooks/useCompany";
import {
  interCompanyCompanyFieldsRowClass,
  interCompanyFieldColClass,
  interCompanyIcReadonlyFieldClass,
  interCompanyInputClass,
  interCompanyReadOnlyCopyInputClass,
  interCompanyViewOnlyAllowCopyClass,
  interCompanyVoucherRowAccountClass,
  interCompanyVoucherRowBankClass,
  interCompanyVoucherRowCompanyClass,
  interCompanyVoucherSideRowsClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useStickyInterCompanyCompanyCode } from "@/components/inter-company/useStickyInterCompanyCompanyCode";

type Props = {
  company: Company | null;
  entities: InterCompanyEntityDetail[];
  entitiesLoading?: boolean;
  payeeKind: InterCompanyEntityKind;
  onPayeeKindChange: (k: InterCompanyEntityKind) => void;
  payeeId: string;
  onPayeeIdChange: (id: string) => void;
  /** Edit view — account pickers read-only */
  fieldsDisabled?: boolean;
  /** Target-copy edit: source company current login nahi — peer company ka real row */
  isPeerSourceCompany?: boolean;
  /** Edit: is copy role=source — sender ne khola → Payment Out badge */
  showPaymentOutBadge?: boolean;
  onRequestReverse?: () => void;
  reverseRequestPending?: boolean;
  reverseRequestDone?: boolean;
  /** Revert accept — header par blue Reverted pill (Payment Out ke left) */
  showRevertedBadge?: boolean;
  companyBankAccountId?: string;
  onCompanyBankAccountIdChange?: (id: string) => void;
};

export function InterCompanySourcePaySection({
  company,
  entities,
  entitiesLoading = false,
  payeeKind,
  onPayeeKindChange,
  payeeId,
  onPayeeIdChange,
  fieldsDisabled = false,
  isPeerSourceCompany = false,
  showPaymentOutBadge = false,
  onRequestReverse,
  reverseRequestPending = false,
  reverseRequestDone = false,
  showRevertedBadge = false,
  companyBankAccountId = "",
  onCompanyBankAccountIdChange,
}: Props) {
  const companyAc = readCompanyInterCompanyAcNo(company);
  const companyCode = useStickyInterCompanyCompanyCode(company);
  const companyMob = normalizeInterCompanyPhone(company?.phone);
  const bankEntities = useMemo(() => entities.filter((e) => e.kind === "bank"), [entities]);
  // Edit locked: Firestore se accounts load — phir read-only UI (disabled par sirf hint mat dikhao)
  const showReadOnlyAccounts = fieldsDisabled && !entitiesLoading;

  return (
    <div
      className={cn(
        interCompanyVoucherSideRowsClass,
        fieldsDisabled && interCompanyViewOnlyAllowCopyClass
      )}
    >
      <div className={cn(interCompanyVoucherRowCompanyClass, "space-y-2")}>
        <InterCompanySectionTitle
          title="Source company"
          flowBadge={showPaymentOutBadge ? "payment_out" : null}
          showRevertedBadge={showRevertedBadge}
          trailingAction={
            showPaymentOutBadge && onRequestReverse && !showRevertedBadge ? (
              reverseRequestPending ? (
                <span className="text-[10px] font-medium text-amber-700">Request pending</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 border-amber-600/60 text-xs"
                  onClick={onRequestReverse}
                >
                  Request for reverse
                </Button>
              )
            ) : null
          }
        />
        <p className="text-[11px] text-muted-foreground">
          {isPeerSourceCompany ? "Linked source company" : "Auto — current logged-in company"}
        </p>
        <div className={interCompanyCompanyFieldsRowClass}>
          <div className={cn(interCompanyFieldColClass, "min-w-[8.5rem]")}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground sm:sr-only">Company name</Label>
            <Input
              readOnly
              value={company?.name || "—"}
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                interCompanyReadOnlyCopyInputClass
              )}
            />
          </div>
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">Company Code</Label>
            <Input
              readOnly
              value={companyCode || "—"}
              placeholder="SWIFT-style code"
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                interCompanyReadOnlyCopyInputClass,
                "font-mono text-xs uppercase"
              )}
            />
          </div>
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">Mobile No.</Label>
            <Input
              readOnly
              value={companyMob}
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                interCompanyReadOnlyCopyInputClass
              )}
            />
          </div>
        </div>
      </div>

      <div className={interCompanyVoucherRowBankClass}>
        <InterCompanyAccountLookupSection
          sectionTitle="Company bank (Bank/Cash)"
          entities={bankEntities}
          entitiesLoading={entitiesLoading}
          activeCompanyId={company?.id ?? ""}
          autoEnsureInterCoAcNo
          lockEntityKind="bank"
          entityKind="bank"
          onEntityKindChange={() => {}}
          entityId={companyBankAccountId}
          onEntityIdChange={onCompanyBankAccountIdChange ?? (() => {})}
          companyAcNo={companyAc}
          companyMobile={companyMob}
          disabled={fieldsDisabled || !onCompanyBankAccountIdChange}
          allowLookupWithoutCompany={showReadOnlyAccounts}
          showDetails={false}
          disabledHint={
            entitiesLoading
              ? "Loading bank accounts…"
              : "Saved voucher — bank account is read-only"
          }
        />
      </div>

      <div className={interCompanyVoucherRowAccountClass}>
        <InterCompanyAccountLookupSection
          sectionTitle="Source account (optional)"
          entities={entities}
          entitiesLoading={entitiesLoading}
          activeCompanyId={company?.id ?? ""}
          autoEnsureInterCoAcNo
          showClosingBalance
          entityKind={payeeKind}
          onEntityKindChange={onPayeeKindChange}
          entityId={payeeId}
          onEntityIdChange={onPayeeIdChange}
          companyAcNo={companyAc}
          companyMobile={companyMob}
          disabled={fieldsDisabled}
          allowLookupWithoutCompany={showReadOnlyAccounts}
          disabledHint={
            entitiesLoading
              ? "Loading source accounts…"
              : "Saved voucher — accounts are read-only"
          }
        />
      </div>
    </div>
  );
}
