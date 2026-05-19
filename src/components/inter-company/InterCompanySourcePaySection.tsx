"use client";

/**
 * Source column — Source company (auto: current) + Source account (naam | A/c | mobile).
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
import { interCompanyInputClass } from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

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
}: Props) {
  const companyAc = readCompanyInterCompanyAcNo(company);
  const companyMob = normalizeInterCompanyPhone(company?.phone);
  // Edit locked: Firestore se accounts load — phir read-only UI (disabled par sirf hint mat dikhao)
  const showReadOnlyAccounts = fieldsDisabled && !entitiesLoading;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-3",
        fieldsDisabled && "pointer-events-none select-none"
      )}
    >
      <div className="space-y-2">
        <InterCompanySectionTitle
          title="Source company"
          flowBadge={showPaymentOutBadge ? "payment_out" : null}
          trailingAction={
            showPaymentOutBadge && onRequestReverse ? (
              reverseRequestDone ? (
                <span className="text-[10px] font-medium text-emerald-700">Reversed</span>
              ) : reverseRequestPending ? (
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(9rem,11rem)_minmax(8rem,10rem)] sm:items-end">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-xs text-muted-foreground sm:sr-only">Company name</Label>
            <Input
              readOnly
              value={company?.name || "—"}
              className={cn(interCompanyInputClass, "bg-emerald-100/60 dark:bg-emerald-950/35")}
              tabIndex={-1}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">A/c No</Label>
            <Input
              readOnly
              value={companyAc}
              className={cn(interCompanyInputClass, "bg-emerald-100/60 font-mono text-xs tabular-nums dark:bg-emerald-950/35")}
              tabIndex={-1}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">Mobile No.</Label>
            <Input
              readOnly
              value={companyMob}
              className={cn(interCompanyInputClass, "bg-emerald-100/60 dark:bg-emerald-950/35")}
              tabIndex={-1}
            />
          </div>
        </div>
      </div>

      <InterCompanyAccountLookupSection
        sectionTitle="Source account"
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
  );
}
