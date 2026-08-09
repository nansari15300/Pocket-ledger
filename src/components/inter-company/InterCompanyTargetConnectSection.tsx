"use client";

/**
 * Target column — Target company (name | Co. A/c | Co. mobile) + Target account (naam | A/c | mobile).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { InterCompanySectionTitle } from "@/components/inter-company/InterCompanySectionTitle";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { InterCompanyAccountLookupSection } from "@/components/inter-company/InterCompanyAccountLookupSection";
import { InterCompanyMultiPickDialog } from "@/components/inter-company/InterCompanyMultiPickDialog";
import {
  INTER_COMPANY_ENTITY_LABELS,
  type InterCompanyEntityKind,
} from "@/components/inter-company/InterCompanyEntitySide";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { filterInterCompanyClearingBankEntities } from "@/lib/interCompany/interCompanyEntityLookup";
import {
  INTER_COMPANY_AC_NO_LENGTH,
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
  readInterCompanyAcNoFromDoc,
} from "@/lib/interCompany/interCompanyAccountNo";
import {
  INTER_COMPANY_COMPANY_CODE_MAX,
  isValidInterCompanyCompanyCode,
  normalizeInterCompanyCompanyCode,
} from "@/lib/interCompany/interCompanyCompanyCode";
import {
  isSearchableInterCompanyPhone,
  normalizeInterCompanyPhone,
} from "@/lib/interCompany/interCompanyPhone";
import type { InterCompanyPartnerPrivacy } from "@/lib/interCompany/interCompanyPartnerPrivacy";
import type { InterCompanyPartnerRow } from "@/lib/interCompany/useInterCompanyPartnerDirectory";
import { normalizeInterCompanyPan, classifyAccountAcInput, interCompanyEntityValue } from "@/lib/interCompany/interCompanyEntityLookup";
import {
  findEntityHitByInterCoAcNo,
  groupHitsByCompany,
  searchEntityHitsByBankAcNo,
  searchEntityHitsByMobile,
  searchEntityHitsByPan,
  type InterCompanyEntityHit,
} from "@/lib/interCompany/interCompanyCrossCompanySearch";
import {
  interCompanyComboboxTriggerClass,
  interCompanyDropdownContentClass,
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

/** Paste ke baad input value update — turant auto search */
function afterPasteCommit(fn: () => void) {
  requestAnimationFrame(() => fn());
}

type Props = {
  targetCompanyId: string;
  onTargetCompanyChange: (id: string) => void;
  comboboxOptions: { value: string; label: string }[];
  resolveCompanyIdByCompanyCode: (code: string) => Promise<string | null>;
  /** Entity Inter Co. A/c se company track (C-prefix) — Firebase company lookup */
  resolveCompanyIdByAcNo: (ac: string) => Promise<string | null>;
  resolveCompaniesByMobile: (mob: string) => InterCompanyPartnerRow[];
  resolveCompaniesByPan: (pan: string) => Promise<InterCompanyPartnerRow[]>;
  companyCodeForCompanyId: (id: string) => string;
  acNoForCompanyId: (id: string) => string;
  panForCompanyId: (id: string) => string;
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
  /** Target company Join settings — search + view privacy */
  targetPartnerPrivacy?: InterCompanyPartnerPrivacy | null;
  formMessage?: ReactNode;
  fieldsDisabled?: boolean;
  /** Target apni taraf (clearing + target account) — company-select row se alag lock (default: fieldsDisabled) */
  accountFieldsDisabled?: boolean;
  /** Edit read-only: company naam combobox ke bajay Input */
  targetCompanyDisplayName?: string;
  /** Edit: is copy role=target — receiver ne khola → Payment In badge */
  showPaymentInBadge?: boolean;
  /** Revert accept — header par blue Reverted pill (Payment In ke left) */
  showRevertedBadge?: boolean;
  /** Target header trailing — e.g. “Also apply on other side” tick */
  headerTrailing?: ReactNode;
  companyBankAccountId?: string;
  onCompanyBankAccountIdChange?: (id: string) => void;
};

export function InterCompanyTargetConnectSection({
  targetCompanyId,
  onTargetCompanyChange,
  comboboxOptions,
  resolveCompanyIdByCompanyCode,
  resolveCompanyIdByAcNo,
  resolveCompaniesByMobile,
  resolveCompaniesByPan,
  companyCodeForCompanyId,
  acNoForCompanyId,
  panForCompanyId,
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
  targetPartnerPrivacy = null,
  formMessage,
  fieldsDisabled = false,
  accountFieldsDisabled,
  targetCompanyDisplayName = "",
  showPaymentInBadge = false,
  showRevertedBadge = false,
  headerTrailing = null,
  companyBankAccountId = "",
  onCompanyBankAccountIdChange,
}: Props) {
  const [companyCodeInput, setCompanyCodeInput] = useState("");
  const [companyAcInput, setCompanyAcInput] = useState("");
  const [companyPanInput, setCompanyPanInput] = useState("");
  const [companyMobileInput, setCompanyMobileInput] = useState("");
  const [companyPickOpen, setCompanyPickOpen] = useState(false);
  const [companyPickOptions, setCompanyPickOptions] = useState<InterCompanyPartnerRow[]>([]);
  const [companyRowSearching, setCompanyRowSearching] = useState(false);
  /** Company row search — target account me turant entity apply */
  const [seedEntityHit, setSeedEntityHit] = useState<InterCompanyEntityHit | null>(null);
  const [companySearchTick, setCompanySearchTick] = useState(0);
  const [entityPickOpen, setEntityPickOpen] = useState(false);
  const [entityPickHits, setEntityPickHits] = useState<InterCompanyEntityHit[]>([]);
  const [pendingCompanyRowEntityHits, setPendingCompanyRowEntityHits] = useState<
    InterCompanyEntityHit[]
  >([]);

  useEffect(() => {
    if (!targetCompanyId) {
      setCompanyCodeInput("");
      setCompanyAcInput("");
      setCompanyPanInput("");
      setCompanyMobileInput("");
      return;
    }
    const code = companyCodeForCompanyId(targetCompanyId);
    const ac = acNoForCompanyId(targetCompanyId);
    const pan = panForCompanyId(targetCompanyId);
    const mob = mobileForCompanyId(targetCompanyId);
    if (code) setCompanyCodeInput(code);
    if (ac) setCompanyAcInput(ac);
    if (pan) setCompanyPanInput(pan);
    if (mob) setCompanyMobileInput(mob);
  }, [
    targetCompanyId,
    companyCodeForCompanyId,
    acNoForCompanyId,
    panForCompanyId,
    mobileForCompanyId,
  ]);

  const applyCompany = useCallback(
    (id: string, entityHit?: InterCompanyEntityHit) => {
      const nextId = String(id || "").trim();
      if (!nextId) return;
      const sameCompany = nextId === targetCompanyId;
      // Company row search — entity hit ho to account row seed; nahi to purana seed clear
      setSeedEntityHit(entityHit ?? null);
      setCompanySearchTick((t) => t + 1);
      // Blur / re-search on same company — target accounts mat clear karo
      if (sameCompany) return;
      onTargetCompanyChange(nextId);
      onPayeeIdChange("");
    },
    [targetCompanyId, onTargetCompanyChange, onPayeeIdChange]
  );

  /** Multi company pick — entity hits pending ho to us company ke accounts filter */
  const handleCompanyPick = useCallback(
    (id: string) => {
      if (pendingCompanyRowEntityHits.length > 0) {
        const scoped = pendingCompanyRowEntityHits.filter((h) => h.companyId === id);
        setPendingCompanyRowEntityHits([]);
        if (scoped.length === 1) {
          applyCompany(id, scoped[0]!);
          return;
        }
        if (scoped.length > 1) {
          setEntityPickHits(scoped);
          setEntityPickOpen(true);
          return;
        }
      }
      applyCompany(id);
    },
    [applyCompany, pendingCompanyRowEntityHits]
  );

  /** Company row — connected companies me entity hit; company + account ek saath */
  const finishCompanyRowEntityHits = useCallback(
    (hits: InterCompanyEntityHit[]): boolean => {
      if (hits.length === 0) return false;
      const grouped = groupHitsByCompany(hits);
      if (grouped.size > 1) {
        setPendingCompanyRowEntityHits(hits);
        setCompanyPickOptions(
          [...grouped.keys()]
            .map((id) => lookupPartners.find((p) => p.id === id))
            .filter((p): p is InterCompanyPartnerRow => Boolean(p))
        );
        setCompanyPickOpen(true);
        return true;
      }
      const only = [...grouped.values()][0] ?? [];
      if (only.length === 1) {
        applyCompany(only[0]!.companyId, only[0]!);
        return true;
      }
      setEntityPickHits(only);
      setEntityPickOpen(true);
      return true;
    },
    [applyCompany, lookupPartners]
  );

  const openCompanyPick = useCallback((hits: InterCompanyPartnerRow[]) => {
    setCompanyPickOptions(hits);
    setCompanyPickOpen(true);
  }, []);

  const tryAutoApplyCompanyCode = useCallback(
    (raw: string) => {
      const norm = normalizeInterCompanyCompanyCode(raw);
      if (!isValidInterCompanyCompanyCode(norm)) return;
      void (async () => {
        setCompanyRowSearching(true);
        try {
          const id = await resolveCompanyIdByCompanyCode(norm);
          if (id) applyCompany(id);
        } finally {
          setCompanyRowSearching(false);
        }
      })();
    },
    [applyCompany, resolveCompanyIdByCompanyCode]
  );

  const tryAutoApplyCompanyAc = useCallback(
    (raw: string) => {
      void (async () => {
        setCompanyRowSearching(true);
        try {
          if (!fieldsDisabled && lookupPartners.length > 0) {
            const kind = classifyAccountAcInput(raw);
            if (kind === "entity_inter_co") {
              const hit = await findEntityHitByInterCoAcNo(raw, lookupPartners);
              if (hit) {
                applyCompany(hit.companyId, hit);
                return;
              }
            }
            if (kind === "entity_bank_ac") {
              const hits = await searchEntityHitsByBankAcNo(raw, lookupPartners);
              if (finishCompanyRowEntityHits(hits)) return;
            }
          }
          const norm = normalizeInterCompanyAcNo(raw);
          if (!isValidInterCompanyAcNo(norm)) return;
          const id = await resolveCompanyIdByAcNo(norm);
          if (id) applyCompany(id);
        } finally {
          setCompanyRowSearching(false);
        }
      })();
    },
    [applyCompany, fieldsDisabled, finishCompanyRowEntityHits, lookupPartners, resolveCompanyIdByAcNo]
  );

  const tryAutoApplyCompanyPan = useCallback(
    (raw: string) => {
      const pan = normalizeInterCompanyPan(raw);
      if (pan.length < 10) return;
      void (async () => {
        setCompanyRowSearching(true);
        try {
          if (!fieldsDisabled && lookupPartners.length > 0) {
            const entityHits = await searchEntityHitsByPan(pan, lookupPartners);
            if (finishCompanyRowEntityHits(entityHits)) return;
          }
          const hits = await resolveCompaniesByPan(pan);
          if (hits.length === 1) {
            applyCompany(hits[0]!.id);
            return;
          }
          if (hits.length > 1) openCompanyPick(hits);
        } finally {
          setCompanyRowSearching(false);
        }
      })();
    },
    [
      applyCompany,
      fieldsDisabled,
      finishCompanyRowEntityHits,
      lookupPartners,
      openCompanyPick,
      resolveCompaniesByPan,
    ]
  );

  const tryAutoApplyCompanyMobile = useCallback(
    (raw: string) => {
      const digits = normalizeInterCompanyPhone(raw);
      if (!isSearchableInterCompanyPhone(digits)) return;
      void (async () => {
        if (!fieldsDisabled && lookupPartners.length > 0) {
          const entityHits = await searchEntityHitsByMobile(digits, lookupPartners);
          if (finishCompanyRowEntityHits(entityHits)) return;
        }
        const hits = resolveCompaniesByMobile(digits);
        if (hits.length === 1) {
          applyCompany(hits[0]!.id);
          return;
        }
        if (hits.length > 1) openCompanyPick(hits);
      })();
    },
    [
      applyCompany,
      fieldsDisabled,
      finishCompanyRowEntityHits,
      lookupPartners,
      openCompanyPick,
      resolveCompaniesByMobile,
    ]
  );

  const commitCompanyCode = useCallback(async () => {
    if (!isValidInterCompanyCompanyCode(companyCodeInput)) {
      if (companyCodeInput.length > 0) {
        toast.error("Company Code must be 12 characters (letters A–Z and digits 0–9, both required)");
      }
      return;
    }
    setCompanyRowSearching(true);
    try {
      const id = await resolveCompanyIdByCompanyCode(companyCodeInput);
      if (!id) {
        toast.error("No company found for this Company Code");
        return;
      }
      applyCompany(id);
    } finally {
      setCompanyRowSearching(false);
    }
  }, [applyCompany, companyCodeInput, resolveCompanyIdByCompanyCode]);

  const commitCompanyAc = useCallback(async () => {
    const raw = companyAcInput.trim();
    if (!raw) return;

    setCompanyRowSearching(true);
    try {
      if (!fieldsDisabled && lookupPartners.length > 0) {
        try {
          const kind = classifyAccountAcInput(raw);
          if (kind === "entity_inter_co") {
            const hit = await findEntityHitByInterCoAcNo(raw, lookupPartners);
            if (hit) {
              applyCompany(hit.companyId, hit);
              return;
            }
          }
          if (kind === "entity_bank_ac") {
            const hits = await searchEntityHitsByBankAcNo(raw, lookupPartners);
            if (finishCompanyRowEntityHits(hits)) return;
          }
        } catch (err) {
          console.warn("[IC company row] entity A/c search:", err);
        }
      }

      const norm = normalizeInterCompanyAcNo(raw);
      if (!isValidInterCompanyAcNo(norm)) {
        toast.error("Use company A/c (C + 14 digits) or party/bank Inter Co. A/c");
        return;
      }
      const id = await resolveCompanyIdByAcNo(norm);
      if (!id) {
        toast.error("No company found for this A/c No");
        return;
      }
      applyCompany(id);
    } finally {
      setCompanyRowSearching(false);
    }
  }, [
    applyCompany,
    companyAcInput,
    fieldsDisabled,
    finishCompanyRowEntityHits,
    lookupPartners,
    resolveCompanyIdByAcNo,
  ]);

  const commitCompanyMobile = useCallback(async () => {
    const digits = normalizeInterCompanyPhone(companyMobileInput);
    if (!isSearchableInterCompanyPhone(digits)) {
      if (digits.length > 0) toast.error("Mobile must be at least 7 digits");
      return;
    }

    if (!fieldsDisabled && lookupPartners.length > 0) {
      setCompanyRowSearching(true);
      try {
        const entityHits = await searchEntityHitsByMobile(digits, lookupPartners);
        if (finishCompanyRowEntityHits(entityHits)) return;
      } catch (err) {
        console.warn("[IC company row] entity mobile search:", err);
      } finally {
        setCompanyRowSearching(false);
      }
    }

    const hits = resolveCompaniesByMobile(digits);
    if (hits.length === 0) {
      toast.error("No linked company found for this mobile number");
      return;
    }
    if (hits.length === 1) {
      applyCompany(hits[0]!.id);
      return;
    }
    openCompanyPick(hits);
  }, [
    applyCompany,
    companyMobileInput,
    fieldsDisabled,
    finishCompanyRowEntityHits,
    lookupPartners,
    openCompanyPick,
    resolveCompaniesByMobile,
  ]);

  const commitCompanyPan = useCallback(async () => {
    const pan = normalizeInterCompanyPan(companyPanInput);
    if (pan.length < 4) {
      if (pan.length > 0) toast.error("PAN must be at least 4 characters");
      return;
    }

    setCompanyRowSearching(true);
    try {
      if (!fieldsDisabled && lookupPartners.length > 0) {
        try {
          const entityHits = await searchEntityHitsByPan(pan, lookupPartners);
          if (finishCompanyRowEntityHits(entityHits)) return;
        } catch (err) {
          console.warn("[IC company row] entity PAN search:", err);
        }
      }

      const hits = await resolveCompaniesByPan(pan);
      if (hits.length === 0) {
        toast.error("No company found for this PAN");
        return;
      }
      if (hits.length === 1) {
        applyCompany(hits[0]!.id);
        return;
      }
      openCompanyPick(hits);
    } finally {
      setCompanyRowSearching(false);
    }
  }, [
    applyCompany,
    companyPanInput,
    fieldsDisabled,
    finishCompanyRowEntityHits,
    lookupPartners,
    openCompanyPick,
    resolveCompaniesByPan,
  ]);

  /** Target account se company track — company A/c via Firebase */
  const trackCompanyByAcNo = async (acNo: string): Promise<boolean> => {
    const id = await resolveCompanyIdByAcNo(acNo);
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

  /** Target account se company track — company PAN via Firebase */
  const trackCompanyByPan = async (pan: string): Promise<boolean> => {
    const normalized = normalizeInterCompanyPan(pan);
    if (normalized.length < 4) return false;
    const hits = await resolveCompaniesByPan(normalized);
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
  const companyCodeDisplay = targetCompanyId ? companyCodeForCompanyId(targetCompanyId) : "";
  const companyAcForEntity = targetCompanyId ? acNoForCompanyId(targetCompanyId) : "";
  const companyPanDisplay = targetCompanyId ? panForCompanyId(targetCompanyId) : "";
  const companyMobDisplay = targetCompanyId ? mobileForCompanyId(targetCompanyId) : "";
  const bankEntities = useMemo(
    () => filterInterCompanyClearingBankEntities(entities, companyBankAccountId),
    [entities, companyBankAccountId]
  );
  // Optional target account row: clearing bank ko hide rakho (sirf clearing row me dikhna chahiye).
  const optionalTargetEntities = useMemo(
    () => entities.filter((e) => !(e.kind === "bank" && e.isClearing === true)),
    [entities]
  );
  const accountsDisabled = accountFieldsDisabled ?? fieldsDisabled;
  const showReadOnlyAccounts = accountsDisabled && !entitiesLoading;
  const companyNameDisplay =
    targetCompanyDisplayName ||
    comboboxOptions.find((o) => o.value === targetCompanyId)?.label ||
    "";

  return (
    <div
      className={cn(
        interCompanyVoucherSideRowsClass,
        fieldsDisabled && interCompanyViewOnlyAllowCopyClass
      )}
    >
      <div className={cn(interCompanyVoucherRowCompanyClass, "space-y-2")}>
        <InterCompanySectionTitle
          title="Target company"
          flowBadge={showPaymentInBadge ? "payment_in" : null}
          showRevertedBadge={showRevertedBadge}
          trailingAction={headerTrailing}
        />
        <div className={interCompanyCompanyFieldsRowClass}>
          <div className={cn(interCompanyFieldColClass, "min-w-[8.5rem]")}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground sm:sr-only">Company name</Label>
            {fieldsDisabled ? (
              <Input
                readOnly
                value={companyNameDisplay || "—"}
                className={cn(
                  interCompanyInputClass,
                  interCompanyIcReadonlyFieldClass,
                  interCompanyReadOnlyCopyInputClass
                )}
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
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">Company Code</Label>
            <Input
              value={fieldsDisabled ? companyCodeDisplay : companyCodeInput}
              onChange={(e) => {
                const v = normalizeInterCompanyCompanyCode(e.target.value);
                setCompanyCodeInput(v);
                if (!fieldsDisabled) tryAutoApplyCompanyCode(v);
              }}
              onPaste={
                fieldsDisabled
                  ? undefined
                  : () => afterPasteCommit(commitCompanyCode)
              }
              onBlur={fieldsDisabled ? undefined : commitCompanyCode}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCompanyCode();
                      }
                    }
              }
              placeholder="12-char code (A–Z, 0–9)"
              maxLength={INTER_COMPANY_COMPANY_CODE_MAX}
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                fieldsDisabled && interCompanyReadOnlyCopyInputClass,
                "font-mono uppercase"
              )}
              readOnly={fieldsDisabled}
            />
          </div>
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">A/c No</Label>
            <Input
              value={fieldsDisabled ? companyAcForEntity : companyAcInput}
              onChange={(e) => {
                const v = normalizeInterCompanyAcNo(e.target.value);
                setCompanyAcInput(v);
                if (!fieldsDisabled) tryAutoApplyCompanyAc(v);
              }}
              onPaste={
                fieldsDisabled ? undefined : () => afterPasteCommit(() => void commitCompanyAc())
              }
              onBlur={fieldsDisabled ? undefined : () => void commitCompanyAc()}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitCompanyAc();
                      }
                    }
              }
              placeholder="Company Inter Co. A/c"
              maxLength={INTER_COMPANY_AC_NO_LENGTH}
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                fieldsDisabled && interCompanyReadOnlyCopyInputClass,
                "font-mono text-xs uppercase tabular-nums"
              )}
              readOnly={fieldsDisabled}
            />
          </div>
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">PAN No.</Label>
            <Input
              value={fieldsDisabled ? companyPanDisplay : companyPanInput}
              onChange={(e) => {
                const v = normalizeInterCompanyPan(e.target.value);
                setCompanyPanInput(v);
                if (!fieldsDisabled) tryAutoApplyCompanyPan(v);
              }}
              onPaste={
                fieldsDisabled ? undefined : () => afterPasteCommit(() => void commitCompanyPan())
              }
              onBlur={fieldsDisabled ? undefined : () => void commitCompanyPan()}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitCompanyPan();
                      }
                    }
              }
              placeholder="PAN"
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                fieldsDisabled && interCompanyReadOnlyCopyInputClass,
                "font-mono uppercase"
              )}
              readOnly={fieldsDisabled}
            />
          </div>
          <div className={interCompanyFieldColClass}>
            <Label className="whitespace-nowrap text-xs text-muted-foreground">Mobile No.</Label>
            <Input
              inputMode="tel"
              value={fieldsDisabled ? companyMobDisplay : companyMobileInput}
              onChange={(e) => {
                const v = e.target.value;
                setCompanyMobileInput(v);
                if (!fieldsDisabled) tryAutoApplyCompanyMobile(v);
              }}
              onPaste={
                fieldsDisabled ? undefined : () => afterPasteCommit(() => void commitCompanyMobile())
              }
              onBlur={fieldsDisabled ? undefined : () => void commitCompanyMobile()}
              onKeyDown={
                fieldsDisabled
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitCompanyMobile();
                      }
                    }
              }
              placeholder="Mobile"
              className={cn(
                interCompanyInputClass,
                interCompanyIcReadonlyFieldClass,
                fieldsDisabled && interCompanyReadOnlyCopyInputClass
              )}
              readOnly={fieldsDisabled}
            />
          </div>
        </div>
        {companyRowSearching ? (
          <p className="text-xs text-muted-foreground">Searching linked companies…</p>
        ) : null}
        {formMessage}
      </div>

      <div className={interCompanyVoucherRowBankClass}>
        <InterCompanyAccountLookupSection
          sectionTitle="Clearing account"
          entities={bankEntities}
          entitiesLoading={!!targetCompanyId && entitiesLoading}
          lockEntityKind="bank"
          entityKind="bank"
          onEntityKindChange={() => {}}
          entityId={companyBankAccountId}
          onEntityIdChange={onCompanyBankAccountIdChange ?? (() => {})}
          activeCompanyId={targetCompanyId}
          autoEnsureInterCoAcNo
          companyAcNo={companyAcForEntity}
          companyMobile={companyMobDisplay}
          companyPan={companyPanDisplay}
          voucherCreateLookup={!accountsDisabled}
          disabled={accountsDisabled || !onCompanyBankAccountIdChange}
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
          sectionTitle="Target account"
          entities={optionalTargetEntities}
          entitiesLoading={!!targetCompanyId && entitiesLoading}
          enableCrossCompanyLookup={lookupPartners.length > 0}
          partners={lookupPartners}
          activeCompanyId={targetCompanyId}
          onResolveCompany={applyCompany}
          autoEnsureInterCoAcNo
          showAvatarsInPicker={showAvatarsInPicker}
          partnerSearchBy={targetPartnerPrivacy?.searchBy}
          voucherCreateLookup={!accountsDisabled}
          partnerViewPrivacy={targetPartnerPrivacy}
          entityKind={payeeKind}
          onEntityKindChange={onPayeeKindChange}
          entityId={payeeId}
          onEntityIdChange={onPayeeIdChange}
          companyAcNo={companyAcForEntity}
          companyMobile={companyMobDisplay}
          companyPan={companyPanDisplay}
          onTrackCompanyByAcNo={trackCompanyByAcNo}
          onTrackCompanyByMobile={trackCompanyByMobile}
          onTrackCompanyByPan={trackCompanyByPan}
          disabled={accountsDisabled}
          allowLookupWithoutCompany={showReadOnlyAccounts}
          seedEntityHit={seedEntityHit}
          onSeedEntityHitHandled={() => setSeedEntityHit(null)}
          companySearchTick={companySearchTick}
          disabledHint={
            entitiesLoading
              ? "Loading target accounts…"
              : "Saved voucher — accounts are read-only"
          }
        />
      </div>

      <InterCompanyMultiPickDialog
        open={companyPickOpen}
        onOpenChange={setCompanyPickOpen}
        title="Multi company found"
        description="Several linked companies match — choose one."
        options={companyPickOptions.map((c) => ({
          id: c.id,
          label: c.name,
          subLabel: [c.acNo && `A/c ${c.acNo}`, c.mobile].filter(Boolean).join(" · "),
        }))}
        onSelect={handleCompanyPick}
      />

      <InterCompanyMultiPickDialog
        open={entityPickOpen}
        onOpenChange={setEntityPickOpen}
        title="Select account"
        description="Several accounts matched — choose one."
        showAvatars={showAvatarsInPicker}
        options={entityPickHits.map((h) => ({
          id: `${h.companyId}|${interCompanyEntityValue(h.entity)}`,
          label: `${INTER_COMPANY_ENTITY_LABELS[h.entity.kind]}: ${h.entity.label}`,
          subLabel: [
            h.companyName && `Co. ${h.companyName}`,
            readInterCompanyAcNoFromDoc(h.entity)
              ? `IC ${readInterCompanyAcNoFromDoc(h.entity)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          avatarUrl: h.entity.fileUrl,
          avatarFallback: h.entity.label,
        }))}
        onSelect={(value) => {
          const hit = entityPickHits.find(
            (h) => `${h.companyId}|${interCompanyEntityValue(h.entity)}` === value
          );
          if (hit) applyCompany(hit.companyId, hit);
        }}
      />
    </div>
  );
}
