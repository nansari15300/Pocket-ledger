"use client";

/**
 * Target column — Target company (name | Co. A/c | Co. mobile) + Target account (naam | A/c | mobile).
 */
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { InterCompanySectionTitle } from "@/components/inter-company/InterCompanySectionTitle";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { InterCompanyAccountLookupSection } from "@/components/inter-company/InterCompanyAccountLookupSection";
import { InterCompanyMultiPickDialog } from "@/components/inter-company/InterCompanyMultiPickDialog";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  INTER_COMPANY_AC_NO_LENGTH,
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
} from "@/lib/interCompany/interCompanyAccountNo";
import {
  isSearchableInterCompanyPhone,
  normalizeInterCompanyPhone,
} from "@/lib/interCompany/interCompanyPhone";
import type { InterCompanyPartnerRow } from "@/lib/interCompany/useInterCompanyPartnerDirectory";
import {
  interCompanyComboboxTriggerClass,
  interCompanyDropdownContentClass,
  interCompanyInputClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  targetCompanyId: string;
  onTargetCompanyChange: (id: string) => void;
  comboboxOptions: { value: string; label: string }[];
  resolveCompanyIdByAcNo: (ac: string) => string | null;
  resolveCompaniesByMobile: (mob: string) => InterCompanyPartnerRow[];
  acNoForCompanyId: (id: string) => string;
  mobileForCompanyId: (id: string) => string;
  /** Target dropdown — doosri companies (current exclude) */
  partners: InterCompanyPartnerRow[];
  /** A/c / mobile search — saari accessible companies (current + shared) */
  lookupPartners: InterCompanyPartnerRow[];
  /** Account picker me avatar (entity par photo ho to) */
  showAvatarsInPicker?: boolean;
  entities: InterCompanyEntityDetail[];
  entitiesLoading: boolean;
  payeeKind: InterCompanyEntityKind;
  onPayeeKindChange: (k: InterCompanyEntityKind) => void;
  payeeId: string;
  onPayeeIdChange: (id: string) => void;
  /** Join settings — target account name combobox */
  allowTargetAccountSearchByName?: boolean;
  formMessage?: ReactNode;
  fieldsDisabled?: boolean;
  /** Edit read-only: company naam combobox ke bajay Input */
  targetCompanyDisplayName?: string;
  /** Edit: is copy role=target — receiver ne khola → Payment In badge */
  showPaymentInBadge?: boolean;
};

export function InterCompanyTargetConnectSection({
  targetCompanyId,
  onTargetCompanyChange,
  comboboxOptions,
  resolveCompanyIdByAcNo,
  resolveCompaniesByMobile,
  acNoForCompanyId,
  mobileForCompanyId,
  partners,
  lookupPartners,
  showAvatarsInPicker = true,
  entities,
  entitiesLoading,
  payeeKind,
  onPayeeKindChange,
  payeeId,
  onPayeeIdChange,
  allowTargetAccountSearchByName = true,
  formMessage,
  fieldsDisabled = false,
  targetCompanyDisplayName = "",
  showPaymentInBadge = false,
}: Props) {
  const [acNoInput, setAcNoInput] = useState("");
  const [companyMobileInput, setCompanyMobileInput] = useState("");
  const [companyPickOpen, setCompanyPickOpen] = useState(false);
  const [companyPickOptions, setCompanyPickOptions] = useState<InterCompanyPartnerRow[]>([]);

  useEffect(() => {
    if (!targetCompanyId) {
      setAcNoInput("");
      setCompanyMobileInput("");
      return;
    }
    setAcNoInput(acNoForCompanyId(targetCompanyId));
    setCompanyMobileInput(mobileForCompanyId(targetCompanyId));
  }, [targetCompanyId, acNoForCompanyId, mobileForCompanyId]);

  const applyCompany = (id: string) => {
    onTargetCompanyChange(id);
    onPayeeIdChange("");
  };

  const commitCompanyAcNo = () => {
    if (!isValidInterCompanyAcNo(acNoInput)) {
      if (acNoInput.length > 0) {
        toast.error(`A/c No must be exactly ${INTER_COMPANY_AC_NO_LENGTH} characters`);
      }
      return;
    }
    const id = resolveCompanyIdByAcNo(acNoInput);
    if (!id) {
      toast.error("No company found for this A/c No");
      return;
    }
    applyCompany(id);
  };

  const commitCompanyMobile = () => {
    const digits = normalizeInterCompanyPhone(companyMobileInput);
    if (!isSearchableInterCompanyPhone(digits)) {
      if (digits.length > 0) toast.error("Mobile must be at least 7 digits");
      return;
    }
    const hits = resolveCompaniesByMobile(digits);
    if (hits.length === 0) {
      toast.error("No company found for this mobile number");
      return;
    }
    if (hits.length === 1) {
      applyCompany(hits[0]!.id);
      return;
    }
    setCompanyPickOptions(hits);
    setCompanyPickOpen(true);
  };

  /** Target account se company track — 15-digit Inter Co. A/c */
  const trackCompanyByAcNo = (acNo: string): boolean => {
    const id = resolveCompanyIdByAcNo(acNo);
    if (!id) return false;
    applyCompany(id);
    return true;
  };

  /** Target account se company track — company mobile */
  const trackCompanyByMobile = (mobile: string): boolean => {
    const hits = resolveCompaniesByMobile(mobile);
    if (hits.length === 0) return false;
    if (hits.length === 1) {
      applyCompany(hits[0]!.id);
      return true;
    }
    setCompanyPickOptions(hits);
    setCompanyPickOpen(true);
    return true;
  };

  // Real company row — edit par current company bhi ho sakti hai (partners list se exclude)
  const companyAcDisplay = targetCompanyId ? acNoForCompanyId(targetCompanyId) : "";
  const companyMobDisplay = targetCompanyId ? mobileForCompanyId(targetCompanyId) : "";
  const showReadOnlyAccounts = fieldsDisabled && !entitiesLoading;
  const companyNameDisplay =
    targetCompanyDisplayName ||
    comboboxOptions.find((o) => o.value === targetCompanyId)?.label ||
    "";

  return (
    <div
      className={cn("flex flex-col gap-3", fieldsDisabled && "pointer-events-none select-none")}
    >
      <div className="space-y-2">
        <InterCompanySectionTitle
          title="Target company"
          flowBadge={showPaymentInBadge ? "payment_in" : null}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(9rem,11rem)_minmax(8rem,10rem)] sm:items-end">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-xs text-muted-foreground sm:sr-only">Company name</Label>
            {fieldsDisabled ? (
              <Input
                readOnly
                value={companyNameDisplay || "—"}
                className={cn(interCompanyInputClass, "bg-emerald-100/60 dark:bg-emerald-950/35")}
                tabIndex={-1}
              />
            ) : (
              <Combobox
                options={comboboxOptions}
                value={targetCompanyId}
                onChange={(id) => applyCompany(id)}
                placeholder="Select company"
                triggerClassName={interCompanyComboboxTriggerClass}
                noWrapOptions
                showFullOptionText
                contentWidthMode="auto"
                popoverContentClassName={cn(
                  interCompanyDropdownContentClass,
                  "min-w-[min(18rem,var(--radix-popover-trigger-width))] max-w-[min(28rem,calc(100vw-1.5rem))]"
                )}
              />
            )}
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">A/c No</Label>
            <Input
              inputMode="numeric"
              maxLength={INTER_COMPANY_AC_NO_LENGTH}
              value={fieldsDisabled ? companyAcDisplay : acNoInput}
              onChange={(e) => setAcNoInput(normalizeInterCompanyAcNo(e.target.value))}
              onBlur={fieldsDisabled ? undefined : commitCompanyAcNo}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCompanyAcNo();
                      }
                    }
              }
              placeholder="C + 14 / legacy"
              className={cn(
                interCompanyInputClass,
                "font-mono tabular-nums",
                fieldsDisabled && "bg-emerald-100/60 dark:bg-emerald-950/35"
              )}
              disabled={fieldsDisabled}
              readOnly={fieldsDisabled}
              tabIndex={fieldsDisabled ? -1 : undefined}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">Mobile No.</Label>
            <Input
              inputMode="tel"
              value={fieldsDisabled ? companyMobDisplay : companyMobileInput}
              onChange={(e) => setCompanyMobileInput(e.target.value)}
              onBlur={fieldsDisabled ? undefined : commitCompanyMobile}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCompanyMobile();
                      }
                    }
              }
              placeholder="Mobile"
              className={cn(
                interCompanyInputClass,
                fieldsDisabled && "bg-emerald-100/60 dark:bg-emerald-950/35"
              )}
              disabled={fieldsDisabled}
              readOnly={fieldsDisabled}
              tabIndex={fieldsDisabled ? -1 : undefined}
            />
          </div>
        </div>
        {formMessage}
      </div>

      <InterCompanyAccountLookupSection
        sectionTitle="Target account"
        entities={entities}
        entitiesLoading={!!targetCompanyId && entitiesLoading}
        enableCrossCompanyLookup={lookupPartners.length > 0}
        partners={lookupPartners}
        activeCompanyId={targetCompanyId}
        onResolveCompany={applyCompany}
        autoEnsureInterCoAcNo
        showAvatarsInPicker={showAvatarsInPicker}
        allowAccountNameSearch={allowTargetAccountSearchByName}
        entityKind={payeeKind}
        onEntityKindChange={onPayeeKindChange}
        entityId={payeeId}
        onEntityIdChange={onPayeeIdChange}
        companyAcNo={companyAcDisplay}
        companyMobile={companyMobDisplay}
        onTrackCompanyByAcNo={trackCompanyByAcNo}
        onTrackCompanyByMobile={trackCompanyByMobile}
        disabled={fieldsDisabled}
        allowLookupWithoutCompany={showReadOnlyAccounts}
        disabledHint={
          entitiesLoading
            ? "Loading target accounts…"
            : "Saved voucher — accounts are read-only"
        }
      />

      <InterCompanyMultiPickDialog
        open={companyPickOpen}
        onOpenChange={setCompanyPickOpen}
        title="Multi company found"
        description="Several companies use this mobile — choose one."
        options={companyPickOptions.map((c) => ({
          id: c.id,
          label: c.name,
          subLabel: [c.acNo && `A/c ${c.acNo}`, c.mobile].filter(Boolean).join(" · "),
        }))}
        onSelect={(id) => applyCompany(id)}
      />
    </div>
  );
}
