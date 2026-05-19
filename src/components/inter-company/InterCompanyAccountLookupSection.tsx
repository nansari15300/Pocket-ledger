"use client";

/**
 * Target / Source account — type + naam | A/c No | Mobile; linked companies mein search + select.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  interCompanyComboboxTriggerClass,
  interCompanyDropdownContentClass,
  interCompanyInputClass,
  interCompanySelectTriggerClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INTER_COMPANY_ENTITY_LABELS,
  type InterCompanyEntityKind,
} from "@/components/inter-company/InterCompanyEntitySide";
import { InterCompanyMultiPickDialog } from "@/components/inter-company/InterCompanyMultiPickDialog";
import { InterCompanyEntityDetailsCard } from "@/components/inter-company/InterCompanyEntityDetailsCard";
import { filterInterCompanyEntitiesByPhone } from "@/components/inter-company/useInterCompanyEntities";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  classifyAccountAcInput,
  filterInterCompanyEntitiesByBankAcNo,
  filterInterCompanyEntitiesByInterCoAcNo,
  filterInterCompanyEntitiesByName,
  interCompanyEntityComboboxOptions,
  interCompanyEntityValue,
  isSearchableInterCompanyPhone,
  normalizeInterCompanyPhone,
  parseInterCompanyEntityValue,
  readEntityAcNoField,
  readEntityMobile,
} from "@/lib/interCompany/interCompanyEntityLookup";
import { ensureEntityInterCompanyAcNo } from "@/lib/interCompany/ensureEntityInterCompanyAcNo";
import {
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
  readInterCompanyAcNoFromDoc,
} from "@/lib/interCompany/interCompanyAccountNo";
import {
  findEntityHitByInterCoAcNo,
  groupHitsByCompany,
  searchEntityHitsByBankAcNo,
  searchEntityHitsByMobile,
  type InterCompanyEntityHit,
} from "@/lib/interCompany/interCompanyCrossCompanySearch";
import type { InterCompanyPartnerRow } from "@/lib/interCompany/useInterCompanyPartnerDirectory";

type Props = {
  sectionTitle: string;
  entities: InterCompanyEntityDetail[];
  entitiesLoading?: boolean;
  disabled?: boolean;
  allowLookupWithoutCompany?: boolean;
  entityKind: InterCompanyEntityKind;
  onEntityKindChange: (k: InterCompanyEntityKind) => void;
  entityId: string;
  onEntityIdChange: (id: string) => void;
  companyAcNo?: string;
  companyMobile?: string;
  onTrackCompanyByAcNo?: (acNo: string) => boolean;
  onTrackCompanyByMobile?: (mobile: string) => boolean;
  disabledHint?: string;
  showDetails?: boolean;
  /** Target: linked companies par mobile / A/c search */
  partners?: InterCompanyPartnerRow[];
  activeCompanyId?: string;
  onResolveCompany?: (companyId: string) => void;
  enableCrossCompanyLookup?: boolean;
  showAvatarsInPicker?: boolean;
  /** Account select par missing Inter Co. A/c auto-generate (master jaisa ensure) */
  autoEnsureInterCoAcNo?: boolean;
  /** Source account card — closing balance (target par off) */
  showClosingBalance?: boolean;
  /** Target: Join tab — allow account name combobox */
  allowAccountNameSearch?: boolean;
};

function entityRowKey(row: InterCompanyEntityDetail): string {
  return `${row.kind}:${row.id}`;
}

export function InterCompanyAccountLookupSection({
  sectionTitle,
  entities,
  entitiesLoading = false,
  disabled = false,
  allowLookupWithoutCompany = false,
  entityKind,
  onEntityKindChange,
  entityId,
  onEntityIdChange,
  companyAcNo = "",
  companyMobile = "",
  onTrackCompanyByAcNo,
  onTrackCompanyByMobile,
  showDetails = true,
  disabledHint = "Select target company first",
  partners = [],
  activeCompanyId = "",
  onResolveCompany,
  enableCrossCompanyLookup = false,
  showAvatarsInPicker = true,
  autoEnsureInterCoAcNo = true,
  showClosingBalance = false,
  allowAccountNameSearch = true,
}: Props) {
  const [accountAcInput, setAccountAcInput] = useState("");
  const [accountMobileInput, setAccountMobileInput] = useState("");
  const [comboValue, setComboValue] = useState("");
  const [crossSearching, setCrossSearching] = useState(false);
  const [ensuringAcNo, setEnsuringAcNo] = useState(false);
  /** Generate ke baad detail card / A/c field — entities list turant refresh nahi hoti */
  const [ensuredIcAcByKey, setEnsuredIcAcByKey] = useState<Record<string, string>>({});
  const [accountPickOpen, setAccountPickOpen] = useState(false);
  const [accountPickHits, setAccountPickHits] = useState<InterCompanyEntityHit[]>([]);
  const [companyPickOpen, setCompanyPickOpen] = useState(false);
  const [companyPickRows, setCompanyPickRows] = useState<InterCompanyPartnerRow[]>([]);
  const [pendingCrossHits, setPendingCrossHits] = useState<InterCompanyEntityHit[]>([]);
  /** Duplicate ensure rokne ke liye — entityId change / combobox select */
  const ensureInflightKeyRef = useRef<string | null>(null);

  // Target privacy off — name list bilkul mat bhejo (sirf A/c / mobile lookup)
  const comboboxOptions = useMemo(
    () => (allowAccountNameSearch ? interCompanyEntityComboboxOptions(entities) : []),
    [entities, allowAccountNameSearch]
  );

  const selectedEntity = useMemo(() => {
    if (!entityId) return null;
    const row = entities.find((e) => e.kind === entityKind && e.id === entityId) ?? null;
    if (!row) return null;
    const patched = ensuredIcAcByKey[`${entityKind}:${entityId}`];
    return patched ? { ...row, interCompanyAccountNo: patched } : row;
  }, [entities, entityKind, entityId, ensuredIcAcByKey]);

  /** Voucher par select — entity par prefixed Inter Co. A/c missing ho to generate */
  const ensureInterCoAcNoForRow = useCallback(
    async (row: InterCompanyEntityDetail, companyId: string) => {
      if (!autoEnsureInterCoAcNo || !companyId) return;

      const rowKey = entityRowKey(row);
      const patched = ensuredIcAcByKey[rowKey];
      if (patched) {
        setAccountAcInput(patched);
        return;
      }

      const existing = readInterCompanyAcNoFromDoc(row);
      if (isValidInterCompanyAcNo(existing, row.kind)) {
        setAccountAcInput(normalizeInterCompanyAcNo(existing));
        return;
      }

      if (ensureInflightKeyRef.current === rowKey) return;
      ensureInflightKeyRef.current = rowKey;
      setEnsuringAcNo(true);
      try {
        const next = await ensureEntityInterCompanyAcNo(companyId, row.kind, row.id);
        if (!next) {
          toast.error("Could not generate Inter Co. A/c No");
          return;
        }
        const norm = normalizeInterCompanyAcNo(next);
        setEnsuredIcAcByKey((prev) => ({ ...prev, [rowKey]: norm }));
        setAccountAcInput(norm);
      } catch (err) {
        console.warn("[interCompany] Voucher auto A/c No failed", err);
        toast.error("Could not generate Inter Co. A/c No");
      } finally {
        if (ensureInflightKeyRef.current === rowKey) {
          ensureInflightKeyRef.current = null;
        }
        setEnsuringAcNo(false);
      }
    },
    [autoEnsureInterCoAcNo, ensuredIcAcByKey]
  );

  useEffect(() => {
    if (!entityId) {
      setComboValue("");
      setAccountAcInput("");
      setAccountMobileInput("");
      return;
    }
    const row = entities.find((e) => e.kind === entityKind && e.id === entityId);
    if (!row) return;

    const rowKey = `${entityKind}:${entityId}`;
    setComboValue(interCompanyEntityValue(row));
    setAccountMobileInput(readEntityMobile(row));

    const patched = ensuredIcAcByKey[rowKey];
    const ic = patched || readInterCompanyAcNoFromDoc(row);
    if (isValidInterCompanyAcNo(ic, row.kind)) {
      setAccountAcInput(normalizeInterCompanyAcNo(ic));
      return;
    }

    setAccountAcInput(readEntityAcNoField(row));
    void ensureInterCoAcNoForRow(row, activeCompanyId);
  }, [entityId, entityKind, entities, activeCompanyId, ensuredIcAcByKey, ensureInterCoAcNoForRow]);

  useEffect(() => {
    if (allowAccountNameSearch) return;
    setComboValue("");
  }, [allowAccountNameSearch, activeCompanyId]);

  const applyEntity = (row: InterCompanyEntityDetail, ownerCompanyId?: string) => {
    onEntityKindChange(row.kind);
    onEntityIdChange(row.id);
    setComboValue(interCompanyEntityValue(row));
    setAccountMobileInput(readEntityMobile(row));
    const ic = readInterCompanyAcNoFromDoc(row);
    if (isValidInterCompanyAcNo(ic, row.kind)) {
      setAccountAcInput(normalizeInterCompanyAcNo(ic));
    } else {
      setAccountAcInput(readEntityAcNoField(row));
    }
    void ensureInterCoAcNoForRow(row, ownerCompanyId || activeCompanyId);
  };

  const applyEntityHit = (hit: InterCompanyEntityHit) => {
    onResolveCompany?.(hit.companyId);
    applyEntity(hit.entity, hit.companyId);
  };

  const pickFromLocalEntities = (hits: InterCompanyEntityDetail[]) => {
    if (hits.length === 0) {
      toast.error("No account found");
      return;
    }
    if (hits.length === 1) {
      applyEntity(hits[0]!);
      return;
    }
    const companyName =
      partners.find((p) => p.id === activeCompanyId)?.name || activeCompanyId || "";
    setAccountPickHits(
      hits.map((entity) => ({
        companyId: activeCompanyId,
        companyName,
        entity,
      }))
    );
    setAccountPickOpen(true);
  };

  const pickFromCrossHits = (hits: InterCompanyEntityHit[]) => {
    if (hits.length === 0) {
      toast.error("No account found");
      return;
    }
    if (hits.length === 1) {
      applyEntityHit(hits[0]!);
      return;
    }
    setAccountPickHits(hits);
    setAccountPickOpen(true);
  };

  const finishCrossHits = (hits: InterCompanyEntityHit[]) => {
    const grouped = groupHitsByCompany(hits);
    const ids = [...grouped.keys()];
    if (ids.length === 0) {
      toast.error("No account found");
      return;
    }
    if (ids.length > 1) {
      setPendingCrossHits(hits);
      setCompanyPickRows(
        ids
          .map((id) => partners.find((p) => p.id === id))
          .filter((p): p is InterCompanyPartnerRow => Boolean(p))
      );
      setCompanyPickOpen(true);
      return;
    }
    pickFromCrossHits(grouped.get(ids[0]!) ?? []);
  };

  const commitAccountAc = async () => {
    const raw = accountAcInput.trim();
    if (!raw) return;
    const kind = classifyAccountAcInput(raw);
    if (kind === "company_inter_co") {
      const ok = onTrackCompanyByAcNo?.(normalizeInterCompanyAcNo(raw));
      if (ok === false) toast.error("No company found for this company A/c No");
      return;
    }
    if (kind === "entity_inter_co") {
      const local = filterInterCompanyEntitiesByInterCoAcNo(entities, raw);
      if (local.length > 0) {
        pickFromLocalEntities(local);
        return;
      }
      if (enableCrossCompanyLookup && partners.length > 0) {
        setCrossSearching(true);
        try {
          const hit = await findEntityHitByInterCoAcNo(raw, partners);
          if (hit) applyEntityHit(hit);
          else toast.error("No account found for this Inter Co. A/c No");
        } catch (err) {
          console.warn("[interCompany] A/c search failed", err);
          toast.error("Account search failed — check company access");
        } finally {
          setCrossSearching(false);
        }
        return;
      }
      pickFromLocalEntities(local);
      return;
    }
    if (kind === "entity_bank_ac") {
      const local = filterInterCompanyEntitiesByBankAcNo(entities, raw);
      if (local.length > 0) {
        pickFromLocalEntities(local);
        return;
      }
      if (enableCrossCompanyLookup && partners.length > 0) {
        setCrossSearching(true);
        try {
          const hits = await searchEntityHitsByBankAcNo(raw, partners);
          finishCrossHits(hits);
        } catch (err) {
          console.warn("[interCompany] Bank A/c search failed", err);
          toast.error("Account search failed — check company access");
        } finally {
          setCrossSearching(false);
        }
        return;
      }
      pickFromLocalEntities(local);
      return;
    }
    toast.error("Use Inter Co. A/c (C/P/B… + 14 digits) or bank A/c (3+ digits)");
  };

  const commitAccountMobile = async () => {
    const digits = normalizeInterCompanyPhone(accountMobileInput);
    if (!isSearchableInterCompanyPhone(digits)) {
      if (digits.length > 0) toast.error("Mobile must be at least 7 digits");
      return;
    }
    const local = filterInterCompanyEntitiesByPhone(entities, digits);
    if (local.length > 0) {
      pickFromLocalEntities(local);
      return;
    }
    if (enableCrossCompanyLookup && partners.length > 0) {
      setCrossSearching(true);
      try {
        const hits = await searchEntityHitsByMobile(digits, partners);
        if (hits.length > 0) {
          finishCrossHits(hits);
          return;
        }
      } catch (err) {
        console.warn("[interCompany] Mobile search failed", err);
        toast.error("Mobile search failed — check company access");
      } finally {
        setCrossSearching(false);
      }
    }
    if (onTrackCompanyByMobile?.(digits)) return;
    toast.error("No account or company found for this mobile");
  };

  const commitAccountName = (value: string) => {
    if (!allowAccountNameSearch) return;
    setComboValue(value);
    const parsed = parseInterCompanyEntityValue(value);
    if (!parsed) return;
    const row = entities.find((e) => e.kind === parsed.kind && e.id === parsed.id);
    if (row) applyEntity(row);
    else {
      const byName = filterInterCompanyEntitiesByName(entities, value);
      if (byName.length === 1) applyEntity(byName[0]!);
    }
  };

  const onCompanyPickedForAccount = (companyId: string) => {
    const hits = pendingCrossHits.filter((h) => h.companyId === companyId);
    setPendingCrossHits([]);
    pickFromCrossHits(hits);
  };

  const blockFormLoading = entitiesLoading || crossSearching;

  return (
    <div className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/60">
      <FormLabel className="!mt-0">{sectionTitle}</FormLabel>
      {blockFormLoading ? (
        <p className="text-sm text-muted-foreground">
          {crossSearching ? "Searching linked companies…" : "Loading accounts…"}
        </p>
      ) : disabled && !allowLookupWithoutCompany ? (
        <p className="text-sm text-muted-foreground">{disabledHint}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(5.5rem,6.5rem)_1fr_minmax(7rem,9rem)_minmax(7rem,9rem)] sm:items-end">
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={entityKind}
                disabled={disabled || crossSearching || ensuringAcNo}
                onValueChange={(v) => {
                  if (disabled) return;
                  onEntityKindChange(v as InterCompanyEntityKind);
                  onEntityIdChange("");
                  setComboValue("");
                  setAccountAcInput("");
                  setAccountMobileInput("");
                }}
              >
                <SelectTrigger className={interCompanySelectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={interCompanyDropdownContentClass}>
                  {(Object.keys(INTER_COMPANY_ENTITY_LABELS) as InterCompanyEntityKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {INTER_COMPANY_ENTITY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-0.5">
              <Label className="text-xs text-muted-foreground">Account name</Label>
              {allowAccountNameSearch ? (
                <Combobox
                  options={comboboxOptions}
                  value={comboValue}
                  onChange={commitAccountName}
                  placeholder="Select account"
                  triggerClassName={interCompanyComboboxTriggerClass}
                  disabled={disabled || crossSearching || ensuringAcNo}
                  noWrapOptions
                  showFullOptionText
                  contentWidthMode="auto"
                  popoverContentClassName={cn(
                    interCompanyDropdownContentClass,
                    "min-w-[min(18rem,var(--radix-popover-trigger-width))] max-w-[min(28rem,calc(100vw-1.5rem))]"
                  )}
                />
              ) : (
                <Input
                  readOnly
                  tabIndex={-1}
                  value=""
                  placeholder="Hidden — enter Inter Co. A/c No or mobile"
                  className={cn(interCompanyInputClass, "bg-emerald-100/50 text-xs text-muted-foreground dark:bg-emerald-950/40")}
                  title="Target company has name search disabled for privacy"
                />
              )}
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">A/c No</Label>
              <div className="relative">
                <Input
                  value={accountAcInput}
                  onChange={(e) => setAccountAcInput(e.target.value)}
                  onBlur={() => void commitAccountAc()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitAccountAc();
                    }
                  }}
                  placeholder={ensuringAcNo ? "Generating…" : "Inter Co. / bank A/c"}
                  className={cn(
                    interCompanyInputClass,
                    "pr-8 font-mono text-xs tabular-nums",
                    ensuringAcNo && "text-muted-foreground"
                  )}
                  disabled={disabled || crossSearching || ensuringAcNo}
                />
                {ensuringAcNo ? (
                  <Loader2
                    className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Mobile No.</Label>
              <Input
                inputMode="tel"
                value={accountMobileInput}
                onChange={(e) => setAccountMobileInput(e.target.value)}
                onBlur={() => void commitAccountMobile()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitAccountMobile();
                  }
                }}
                placeholder="Mobile"
                className={interCompanyInputClass}
                disabled={disabled || crossSearching || ensuringAcNo}
              />
            </div>
          </div>

          {showDetails && selectedEntity ? (
            <InterCompanyEntityDetailsCard
              entity={selectedEntity}
              companyAcNo={companyAcNo}
              companyMobile={companyMobile}
              showClosingBalance={showClosingBalance}
            />
          ) : null}
        </>
      )}

      <InterCompanyMultiPickDialog
        open={accountPickOpen}
        onOpenChange={setAccountPickOpen}
        title="Select account"
        description="Several accounts matched — choose one."
        showAvatars={showAvatarsInPicker}
        options={accountPickHits.map((h) => ({
          id: interCompanyEntityValue(h.entity),
          label: `${INTER_COMPANY_ENTITY_LABELS[h.entity.kind]}: ${h.entity.label}`,
          subLabel: [
            h.companyName && `Co. ${h.companyName}`,
            h.entity.phone ? `Mob ${h.entity.phone}` : null,
            h.entity.accountNumber ? `Bank ${h.entity.accountNumber}` : null,
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
          const hit = accountPickHits.find((h) => interCompanyEntityValue(h.entity) === value);
          if (hit) applyEntityHit(hit);
        }}
      />

      <InterCompanyMultiPickDialog
        open={companyPickOpen}
        onOpenChange={setCompanyPickOpen}
        title="Select company"
        description="Several companies matched — choose a company first."
        showAvatars={false}
        options={companyPickRows.map((c) => ({
          id: c.id,
          label: c.name,
          subLabel: [c.acNo && `A/c ${c.acNo}`, c.mobile && `Mob ${c.mobile}`].filter(Boolean).join(" · "),
        }))}
        onSelect={(id) => onCompanyPickedForAccount(id)}
      />
    </div>
  );
}
