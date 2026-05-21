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
  interCompanyAccountFieldColClass,
  interCompanyAccountFieldsRowClass,
  interCompanyAccountNameFieldColClass,
  interCompanyDropdownContentClass,
  interCompanyIcAccountComboboxTriggerClass,
  interCompanyIcInputSizingClass,
  interCompanyIcReadonlyFieldClass,
  interCompanyIcSectionDividerClass,
  interCompanyIcTypeSelectTriggerClass,
  interCompanyInputClass,
  interCompanyReadOnlyCopyInputClass,
  interCompanyViewOnlyAllowCopyClass,
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
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  classifyAccountAcInput,
  filterInterCompanyEntitiesByBankAcNo,
  filterInterCompanyEntitiesByInterCoAcNo,
  filterInterCompanyEntitiesByKind,
  filterInterCompanyEntitiesByName,
  filterInterCompanyEntitiesByPan,
  filterInterCompanyEntitiesByPhone,
  interCompanyEntityComboboxOptions,
  interCompanyEntityValue,
  isSearchableInterCompanyPhone,
  normalizeInterCompanyPan,
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
  searchEntityHitsByPan,
  type InterCompanyEntityHit,
} from "@/lib/interCompany/interCompanyCrossCompanySearch";
import type { InterCompanyPartnerFieldFlags, InterCompanyPartnerPrivacy } from "@/lib/interCompany/interCompanyPartnerPrivacy";
import {
  formatInterCompanyFieldForPartnerView,
  type InterCompanyPartnerFieldKey,
} from "@/lib/interCompany/interCompanyPartnerPrivacy";
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
  companyPan?: string;
  onTrackCompanyByAcNo?: (acNo: string) => boolean;
  onTrackCompanyByMobile?: (mobile: string) => boolean;
  /** Target account — company PAN se linked company track + entity fill */
  onTrackCompanyByPan?: (pan: string) => boolean;
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
  /** @deprecated — use partnerSearchBy.accountName */
  allowAccountNameSearch?: boolean;
  /** Target: Join tab search flags (account name / mobile / PAN / pocket ledger A/C) */
  partnerSearchBy?: Partial<InterCompanyPartnerFieldFlags>;
  /** New IC voucher — target privacy se search band na ho; edit par `disabled` hi block kare */
  voucherCreateLookup?: boolean;
  /** Target view — mask + visibility in detail card */
  partnerViewPrivacy?: InterCompanyPartnerPrivacy | null;
  /** Company bank row — Type lock (e.g. sirf Bank) */
  lockEntityKind?: InterCompanyEntityKind;
  /** Company row search — entity hit parent se seed (company + account ek saath) */
  seedEntityHit?: InterCompanyEntityHit | null;
  onSeedEntityHitHandled?: () => void;
  /** Company row search tick — auto-fill reset jab dubara search ho */
  companySearchTick?: number;
};

function entityRowKey(row: InterCompanyEntityDetail): string {
  return `${row.kind}:${row.id}`;
}

/** Partner view — field me bhi wahi mask/hide jo detail card me */
function partnerFieldDisplay(
  privacy: InterCompanyPartnerPrivacy | null | undefined,
  field: InterCompanyPartnerFieldKey,
  raw: string | null | undefined
): string {
  if (!privacy) return String(raw ?? "").trim();
  return formatInterCompanyFieldForPartnerView(privacy, field, raw) ?? "";
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
  companyPan = "",
  onTrackCompanyByAcNo,
  onTrackCompanyByMobile,
  onTrackCompanyByPan,
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
  partnerSearchBy,
  voucherCreateLookup = false,
  partnerViewPrivacy = null,
  lockEntityKind,
  seedEntityHit = null,
  onSeedEntityHitHandled,
  companySearchTick = 0,
}: Props) {
  const [accountAcInput, setAccountAcInput] = useState("");
  const [accountPanInput, setAccountPanInput] = useState("");
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
  /** Company track ke baad entity search — input clear mat karo jab tak pick na ho */
  const pendingEntityLookupRef = useRef<
    | { kind: "pan"; value: string }
    | { kind: "mobile"; value: string }
    | { kind: "entity_inter_co_ac"; value: string }
    | { kind: "bank_ac"; value: string }
    | null
  >(null);
  /** Company select par PAN/mobile se ek baar auto entity pick */
  const autoFillFromCompanyKeyRef = useRef("");
  /** Cross-company hit — company switch + entities load ke baad ek saath account apply */
  const pendingEntityHitRef = useRef<InterCompanyEntityHit | null>(null);

  /** Type row — lock (bank) ya user select; account search isi kind tak */
  const activeEntityKind = lockEntityKind || entityKind;

  const entitiesForActiveKind = useMemo(
    () => filterInterCompanyEntitiesByKind(entities, activeEntityKind),
    [entities, activeEntityKind]
  );

  /** Join settings — kaunse search fields allowed; new voucher par sab ON */
  const searchBy = useMemo(
    () => {
      if (voucherCreateLookup) {
        return {
          accountName: true,
          mobileNo: true,
          panNo: true,
          pocketLedgerAcNo: true,
        } satisfies InterCompanyPartnerFieldFlags;
      }
      return {
        accountName: partnerSearchBy?.accountName ?? allowAccountNameSearch,
        mobileNo: partnerSearchBy?.mobileNo ?? true,
        panNo: partnerSearchBy?.panNo ?? true,
        pocketLedgerAcNo: partnerSearchBy?.pocketLedgerAcNo ?? true,
      };
    },
    [voucherCreateLookup, partnerSearchBy, allowAccountNameSearch]
  );

  // Target privacy — dropdown/trigger labels bhi mask (sirf poora naam mat dikhao)
  const comboboxOptions = useMemo(() => {
    if (!searchBy.accountName) return [];
    const opts = interCompanyEntityComboboxOptions(entitiesForActiveKind);
    if (!partnerViewPrivacy) return opts;
    return opts.map((o) => {
      const display = partnerFieldDisplay(partnerViewPrivacy, "accountName", o.label);
      return {
        ...o,
        label: display || "—",
        triggerLabel: display || "—",
      };
    });
  }, [entitiesForActiveKind, searchBy.accountName, partnerViewPrivacy]);

  const selectedEntity = useMemo(() => {
    if (!entityId) return null;
    const row = entities.find((e) => e.kind === entityKind && e.id === entityId) ?? null;
    if (!row) return null;
    const patched = ensuredIcAcByKey[`${entityKind}:${entityId}`];
    return patched ? { ...row, interCompanyAccountNo: patched } : row;
  }, [entities, entityKind, entityId, ensuredIcAcByKey]);

  /** Select ke baad partner privacy — A/c No hamesha poora; baaki fields mask ho sakte hain */
  const maskPartnerFields = Boolean(partnerViewPrivacy && entityId);

  const displayAccountAc = accountAcInput;

  const displayAccountPan = useMemo(() => {
    if (!maskPartnerFields || !partnerViewPrivacy) return accountPanInput;
    return partnerFieldDisplay(partnerViewPrivacy, "panNo", accountPanInput);
  }, [accountPanInput, maskPartnerFields, partnerViewPrivacy]);

  const displayAccountMobile = useMemo(() => {
    if (!maskPartnerFields || !partnerViewPrivacy) return accountMobileInput;
    return partnerFieldDisplay(partnerViewPrivacy, "mobileNo", accountMobileInput);
  }, [accountMobileInput, maskPartnerFields, partnerViewPrivacy]);

  // Account naam field — text length se min width; mobile par max 20ch (Combobox + CSS)
  const selectedAccountLabel = useMemo(() => {
    if (!comboValue && !entityId) return "";
    const raw = String(selectedEntity?.label ?? "").trim();
    if (maskPartnerFields && partnerViewPrivacy) {
      return partnerFieldDisplay(partnerViewPrivacy, "accountName", raw);
    }
    return raw;
  }, [comboValue, entityId, maskPartnerFields, partnerViewPrivacy, selectedEntity?.label]);

  // Bade screen: text length se width; chhote screen par CSS max 20ch + …
  const accountNameTriggerMinCh = useMemo(() => {
    const len = selectedAccountLabel.length || 8;
    return Math.max(8, Math.min(len, 48));
  }, [selectedAccountLabel]);

  const typeLabel = INTER_COMPANY_ENTITY_LABELS[lockEntityKind || entityKind];
  const typeTriggerMinCh = Math.max(6, typeLabel.length);

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
      // Company resolve ke baad pending entity lookup — search values mat hatao
      if (pendingEntityLookupRef.current) return;
      setComboValue("");
      setAccountAcInput("");
      setAccountPanInput("");
      setAccountMobileInput("");
      return;
    }
    const row = entities.find((e) => e.kind === entityKind && e.id === entityId);
    if (!row) return;

    const rowKey = `${entityKind}:${entityId}`;
    setComboValue(interCompanyEntityValue(row));
    setAccountPanInput(normalizeInterCompanyPan(row.pan));
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
    if (searchBy.accountName) return;
    setComboValue("");
  }, [searchBy.accountName, activeCompanyId]);

  const applyEntity = (row: InterCompanyEntityDetail, ownerCompanyId?: string) => {
    pendingEntityHitRef.current = null;
    pendingEntityLookupRef.current = null;
    onEntityKindChange(row.kind);
    onEntityIdChange(row.id);
    setComboValue(interCompanyEntityValue(row));
    setAccountPanInput(normalizeInterCompanyPan(row.pan));
    setAccountMobileInput(readEntityMobile(row));
    const ic = readInterCompanyAcNoFromDoc(row);
    if (isValidInterCompanyAcNo(ic, row.kind)) {
      setAccountAcInput(normalizeInterCompanyAcNo(ic));
    } else {
      setAccountAcInput(readEntityAcNoField(row));
    }
    void ensureInterCoAcNoForRow(row, ownerCompanyId || activeCompanyId);
  };

  /** Cross search hit — pehle company, entities load par turant account (dono row ek saath) */
  const flushPendingEntityHit = () => {
    const hit = pendingEntityHitRef.current;
    if (!hit || disabled || entitiesLoading) return;
    if (hit.companyId !== activeCompanyId) return;

    const row =
      entities.find((e) => e.kind === hit.entity.kind && e.id === hit.entity.id) ?? hit.entity;
    pendingEntityHitRef.current = null;
    applyEntity(row, hit.companyId);
  };

  const applyEntityHit = (hit: InterCompanyEntityHit) => {
    pendingEntityHitRef.current = hit;
    if (hit.companyId !== activeCompanyId) {
      onResolveCompany?.(hit.companyId);
      return;
    }
    flushPendingEntityHit();
  };

  useEffect(() => {
    flushPendingEntityHit();
  }, [activeCompanyId, entities, entitiesLoading, disabled, entityId]);

  /** Parent company row — connected companies se entity hit seed */
  useEffect(() => {
    if (!seedEntityHit || disabled) return;
    autoFillFromCompanyKeyRef.current = "";
    pendingEntityLookupRef.current = null;
    applyEntityHit(seedEntityHit);
    onSeedEntityHitHandled?.();
  }, [seedEntityHit, disabled, onSeedEntityHitHandled]);

  /** Company row dubara search — PAN/mobile auto-fill purani company par mat chale */
  useEffect(() => {
    if (!companySearchTick) return;
    autoFillFromCompanyKeyRef.current = "";
  }, [companySearchTick]);

  const pickFromLocalEntities = (hits: InterCompanyEntityDetail[]) => {
    const scoped = filterInterCompanyEntitiesByKind(hits, activeEntityKind);
    if (scoped.length === 0) {
      toast.error(`No ${typeLabel} account found`);
      return;
    }
    if (scoped.length === 1) {
      pendingEntityLookupRef.current = null;
      applyEntity(scoped[0]!);
      return;
    }
    const companyName =
      partners.find((p) => p.id === activeCompanyId)?.name || activeCompanyId || "";
    setAccountPickHits(
      scoped.map((entity) => ({
        companyId: activeCompanyId,
        companyName,
        entity,
      }))
    );
    setAccountPickOpen(true);
  };

  /** Company load hone ke baad pending PAN/mobile/A/c se entity pick */
  useEffect(() => {
    const pending = pendingEntityLookupRef.current;
    if (!pending || disabled || !activeCompanyId || entitiesLoading || entityId) return;

    void (async () => {
      if (
        (pending.kind === "pan" || pending.kind === "mobile") &&
        enableCrossCompanyLookup &&
        partners.length > 0
      ) {
        try {
          const hits =
            pending.kind === "pan"
              ? await searchEntityHitsByPan(pending.value, partners)
              : await searchEntityHitsByMobile(pending.value, partners);
          if (hits.length > 0) {
            pendingEntityLookupRef.current = null;
            finishCrossHits(hits);
            return;
          }
        } catch (err) {
          console.warn("[interCompany] pending cross search:", err);
        }
      }

      if (pending.kind === "pan") {
        const local = filterInterCompanyEntitiesByPan(entitiesForActiveKind, pending.value);
        if (local.length > 0) {
          setAccountPanInput(pending.value);
          pickFromLocalEntities(local);
          return;
        }
      }
      if (pending.kind === "mobile") {
        const local = filterInterCompanyEntitiesByPhone(entitiesForActiveKind, pending.value);
        if (local.length > 0) {
          setAccountMobileInput(pending.value);
          pickFromLocalEntities(local);
          return;
        }
      }
      if (pending.kind === "entity_inter_co_ac") {
        const local = filterInterCompanyEntitiesByInterCoAcNo(entitiesForActiveKind, pending.value);
        if (local.length > 0) {
          setAccountAcInput(normalizeInterCompanyAcNo(pending.value));
          pickFromLocalEntities(local);
          return;
        }
      }
      if (pending.kind === "bank_ac") {
        const local = filterInterCompanyEntitiesByBankAcNo(entitiesForActiveKind, pending.value);
        if (local.length > 0) {
          setAccountAcInput(pending.value);
          pickFromLocalEntities(local);
          return;
        }
      }
      pendingEntityLookupRef.current = null;
    })();
  }, [
    activeCompanyId,
    activeEntityKind,
    disabled,
    enableCrossCompanyLookup,
    entitiesForActiveKind,
    entitiesLoading,
    entityId,
    partners,
  ]);

  /** Target company row se company select — us company ke PAN/mobile se account auto fill */
  useEffect(() => {
    if (disabled || entityId || !activeCompanyId || entitiesLoading || !voucherCreateLookup) return;

    const pan = normalizeInterCompanyPan(companyPan || "");
    const mob = normalizeInterCompanyPhone(companyMobile || "");
    const key = `${activeCompanyId}|${pan}|${mob}|${activeEntityKind}`;
    if (autoFillFromCompanyKeyRef.current === key) return;

    if (pan.length >= 4) {
      const local = filterInterCompanyEntitiesByPan(entitiesForActiveKind, pan);
      if (local.length > 0) {
        autoFillFromCompanyKeyRef.current = key;
        setAccountPanInput(pan);
        pickFromLocalEntities(local);
        return;
      }
    }
    if (isSearchableInterCompanyPhone(mob)) {
      const local = filterInterCompanyEntitiesByPhone(entitiesForActiveKind, mob);
      if (local.length > 0) {
        autoFillFromCompanyKeyRef.current = key;
        setAccountMobileInput(mob);
        pickFromLocalEntities(local);
        return;
      }
    }
    autoFillFromCompanyKeyRef.current = key;
  }, [
    activeCompanyId,
    activeEntityKind,
    companyMobile,
    companyPan,
    disabled,
    entitiesForActiveKind,
    entitiesLoading,
    entityId,
    voucherCreateLookup,
  ]);

  useEffect(() => {
    autoFillFromCompanyKeyRef.current = "";
  }, [activeCompanyId]);

  const pickFromCrossHits = (hits: InterCompanyEntityHit[]) => {
    const scoped = hits.filter((h) => h.entity.kind === activeEntityKind);
    if (scoped.length === 0) {
      toast.error(`No ${typeLabel} account found`);
      return;
    }
    if (scoped.length === 1) {
      applyEntityHit(scoped[0]!);
      return;
    }
    setAccountPickHits(scoped);
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
    if (!searchBy.pocketLedgerAcNo) {
      toast.error("Pocket ledger A/C search is disabled for this company");
      return;
    }
    const kind = classifyAccountAcInput(raw);
    if (kind === "company_inter_co") {
      const norm = normalizeInterCompanyAcNo(raw);
      setAccountAcInput(norm);
      const ok = onTrackCompanyByAcNo?.(norm);
      if (ok === false) toast.error("No company found for this company A/c No");
      // Company select ke baad companyPan/mobile se entity auto-fill effect chalega
      return;
    }
    if (kind === "entity_inter_co") {
      if (enableCrossCompanyLookup && partners.length > 0) {
        setCrossSearching(true);
        try {
          const hit = await findEntityHitByInterCoAcNo(raw, partners);
          if (hit) {
            applyEntityHit(hit);
            return;
          }
        } catch (err) {
          console.warn("[interCompany] A/c search failed", err);
          toast.error("Account search failed — check company access");
        } finally {
          setCrossSearching(false);
        }
      }
      const local = filterInterCompanyEntitiesByInterCoAcNo(entitiesForActiveKind, raw);
      if (local.length > 0) {
        pickFromLocalEntities(local);
        return;
      }
      toast.error("No account found for this Inter Co. A/c No");
      return;
    }
    if (kind === "entity_bank_ac") {
      if (enableCrossCompanyLookup && partners.length > 0) {
        setCrossSearching(true);
        try {
          const hits = await searchEntityHitsByBankAcNo(raw, partners);
          if (hits.length > 0) {
            finishCrossHits(hits);
            return;
          }
        } catch (err) {
          console.warn("[interCompany] Bank A/c search failed", err);
          toast.error("Account search failed — check company access");
        } finally {
          setCrossSearching(false);
        }
      }
      const local = filterInterCompanyEntitiesByBankAcNo(entitiesForActiveKind, raw);
      if (local.length > 0) {
        pickFromLocalEntities(local);
        return;
      }
      toast.error("No account found for this bank A/c");
      return;
    }
    toast.error("Use Inter Co. A/c (C/P/B… + 14 digits) or bank A/c (3+ digits)");
  };

  const commitAccountMobile = async () => {
    if (!searchBy.mobileNo) {
      toast.error("Mobile search is disabled for this company");
      return;
    }
    const digits = normalizeInterCompanyPhone(accountMobileInput);
    if (!isSearchableInterCompanyPhone(digits)) {
      if (digits.length > 0) toast.error("Mobile must be at least 7 digits");
      return;
    }
    // Pehle linked companies me entity — ek hi baar me company + account
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
    const local = filterInterCompanyEntitiesByPhone(entitiesForActiveKind, digits);
    if (local.length > 0) {
      pickFromLocalEntities(local);
      return;
    }
    if (onTrackCompanyByMobile?.(digits)) {
      pendingEntityLookupRef.current = { kind: "mobile", value: digits };
      setAccountMobileInput(digits);
      return;
    }
    toast.error("No account or company found for this mobile");
  };

  const commitAccountPan = async () => {
    if (!searchBy.panNo) {
      toast.error("PAN search is disabled for this company");
      return;
    }
    const pan = normalizeInterCompanyPan(accountPanInput);
    if (pan.length < 4) {
      if (pan.length > 0) toast.error("PAN must be at least 4 characters");
      return;
    }
    // Pehle linked companies me entity — ek hi baar me company + account
    if (enableCrossCompanyLookup && partners.length > 0) {
      setCrossSearching(true);
      try {
        const hits = await searchEntityHitsByPan(pan, partners);
        if (hits.length > 0) {
          finishCrossHits(hits);
          return;
        }
      } catch (err) {
        console.warn("[interCompany] PAN search failed", err);
        toast.error("PAN search failed — check company access");
      } finally {
        setCrossSearching(false);
      }
    }
    const local = filterInterCompanyEntitiesByPan(entitiesForActiveKind, pan);
    if (local.length > 0) {
      pickFromLocalEntities(local);
      return;
    }
    if (onTrackCompanyByPan?.(pan)) {
      pendingEntityLookupRef.current = { kind: "pan", value: pan };
      setAccountPanInput(pan);
      return;
    }
    toast.error("No account found for this PAN");
  };

  const commitAccountName = (value: string) => {
    if (!searchBy.accountName) return;
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
  /** Saved voucher read-only — `disabled` par bhi values dikhao; text copy ke liye readOnly inputs */
  const viewOnlyCopyMode = disabled && allowLookupWithoutCompany;
  /** Mask mode — search ke baad raw value edit mat karo */
  const partnerFieldReadOnly = viewOnlyCopyMode || maskPartnerFields;

  // Type badle to purana account clear — nayi kind ke list par dubara search
  useEffect(() => {
    if (lockEntityKind && entityKind !== lockEntityKind) return;
    if (!entityId) return;
    if (entitiesLoading) return;
    if (
      pendingEntityHitRef.current?.entity.id === entityId &&
      pendingEntityHitRef.current.companyId === activeCompanyId
    ) {
      return;
    }
    const stillValid = entitiesForActiveKind.some((e) => e.id === entityId);
    if (!stillValid) {
      onEntityIdChange("");
      if (pendingEntityLookupRef.current) return;
      setComboValue("");
      setAccountAcInput("");
      setAccountPanInput("");
      setAccountMobileInput("");
    }
  }, [
    activeCompanyId,
    activeEntityKind,
    entitiesForActiveKind,
    entitiesLoading,
    entityId,
    entityKind,
    lockEntityKind,
    onEntityIdChange,
  ]);

  // Lock kind row — galat kind select ho to entity clear (parent kind alag handler ho sakta hai)
  useEffect(() => {
    if (!lockEntityKind || entityKind === lockEntityKind) return;
    onEntityIdChange("");
  }, [lockEntityKind, entityKind, onEntityIdChange]);

  return (
    <div className={cn("space-y-2", interCompanyIcSectionDividerClass, viewOnlyCopyMode && interCompanyViewOnlyAllowCopyClass)}>
      <FormLabel className="!mt-0">{sectionTitle}</FormLabel>
      {blockFormLoading ? (
        <p className="text-sm text-muted-foreground">
          {crossSearching ? "Searching linked companies…" : "Loading accounts…"}
        </p>
      ) : disabled && !allowLookupWithoutCompany ? (
        <p className="text-sm text-muted-foreground">{disabledHint}</p>
      ) : (
        <>
          <div className={interCompanyAccountFieldsRowClass}>
            <div className={interCompanyAccountFieldColClass}>
              <Label className="block text-xs text-muted-foreground">Type</Label>
              {viewOnlyCopyMode ? (
                <Input
                  readOnly
                  value={typeLabel}
                  className={cn(
                    interCompanyInputClass,
                    interCompanyIcReadonlyFieldClass,
                    interCompanyReadOnlyCopyInputClass,
                    interCompanyIcTypeSelectTriggerClass
                  )}
                  style={{ minWidth: `calc(${typeTriggerMinCh}ch + 2.25rem)` }}
                />
              ) : (
                <Select
                  value={lockEntityKind || entityKind}
                  disabled={disabled || crossSearching || ensuringAcNo || !!lockEntityKind}
                  onValueChange={(v) => {
                    if (disabled || lockEntityKind) return;
                    onEntityKindChange(v as InterCompanyEntityKind);
                    onEntityIdChange("");
                    setComboValue("");
                    setAccountAcInput("");
                    setAccountPanInput("");
                    setAccountMobileInput("");
                  }}
                >
                  <SelectTrigger
                    className={interCompanyIcTypeSelectTriggerClass}
                    style={{ minWidth: `calc(${typeTriggerMinCh}ch + 2.25rem)` }}
                  >
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
              )}
            </div>
            <div className={interCompanyAccountNameFieldColClass}>
              <Label className="block w-full text-xs text-muted-foreground">Account name</Label>
              <div className="block w-full min-w-0">
                {viewOnlyCopyMode ? (
                  <Input
                    readOnly
                    value={selectedAccountLabel || "—"}
                    className={cn(
                      interCompanyInputClass,
                      interCompanyIcReadonlyFieldClass,
                      interCompanyReadOnlyCopyInputClass,
                      interCompanyIcAccountComboboxTriggerClass,
                      "text-xs"
                    )}
                    style={{ minWidth: `calc(${accountNameTriggerMinCh}ch + 2.25rem)` }}
                  />
                ) : searchBy.accountName ? (
                  <Combobox
                    options={comboboxOptions}
                    value={comboValue}
                    onChange={commitAccountName}
                    placeholder="Select account"
                    triggerClassName={interCompanyIcAccountComboboxTriggerClass}
                    triggerLabelMinCh={accountNameTriggerMinCh}
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
                    value={
                      maskPartnerFields && partnerViewPrivacy
                        ? partnerFieldDisplay(partnerViewPrivacy, "accountName", selectedEntity?.label)
                        : ""
                    }
                    placeholder="Hidden — use allowed search fields"
                    className={cn(interCompanyInputClass, interCompanyIcReadonlyFieldClass, "text-xs")}
                    title="Target company has account name search disabled"
                  />
                )}
              </div>
            </div>
            <div className={interCompanyAccountFieldColClass}>
              <Label className="block text-xs text-muted-foreground">A/c No</Label>
              <div className="relative">
                <Input
                  value={displayAccountAc}
                  onChange={(e) => setAccountAcInput(e.target.value)}
                  onBlur={() => void commitAccountAc()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitAccountAc();
                    }
                  }}
                  placeholder={
                    !searchBy.pocketLedgerAcNo
                      ? "Search disabled"
                      : ensuringAcNo
                        ? "Generating…"
                        : "Inter Co. / bank A/c"
                  }
                  readOnly={partnerFieldReadOnly}
                  disabled={
                    !partnerFieldReadOnly &&
                    (disabled || crossSearching || ensuringAcNo || !searchBy.pocketLedgerAcNo)
                  }
                  className={cn(
                    interCompanyInputClass,
                    interCompanyIcInputSizingClass,
                    "pr-8 font-mono text-xs tabular-nums",
                    ensuringAcNo && "text-muted-foreground",
                    partnerFieldReadOnly && interCompanyReadOnlyCopyInputClass
                  )}
                />
                {ensuringAcNo ? (
                  <Loader2
                    className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
            <div className={interCompanyAccountFieldColClass}>
              <Label className="block text-xs text-muted-foreground">PAN No.</Label>
              <Input
                value={displayAccountPan}
                onChange={(e) =>
                  setAccountPanInput(normalizeInterCompanyPan(e.target.value))
                }
                onBlur={() => void commitAccountPan()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitAccountPan();
                  }
                }}
                placeholder={searchBy.panNo ? "PAN" : "Search disabled"}
                className={cn(
                  interCompanyInputClass,
                  interCompanyIcInputSizingClass,
                  "font-mono text-xs uppercase",
                  partnerFieldReadOnly && interCompanyReadOnlyCopyInputClass
                )}
                readOnly={partnerFieldReadOnly}
                disabled={
                  !partnerFieldReadOnly && (disabled || crossSearching || ensuringAcNo || !searchBy.panNo)
                }
              />
            </div>
            <div className={interCompanyAccountFieldColClass}>
              <Label className="block text-xs text-muted-foreground">Mobile No.</Label>
              <Input
                inputMode="tel"
                value={displayAccountMobile}
                onChange={(e) => setAccountMobileInput(e.target.value)}
                onBlur={() => void commitAccountMobile()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitAccountMobile();
                  }
                }}
                placeholder={searchBy.mobileNo ? "Mobile" : "Search disabled"}
                className={cn(
                  interCompanyInputClass,
                  interCompanyIcInputSizingClass,
                  partnerFieldReadOnly && interCompanyReadOnlyCopyInputClass
                )}
                readOnly={partnerFieldReadOnly}
                disabled={
                  !partnerFieldReadOnly &&
                  (disabled || crossSearching || ensuringAcNo || !searchBy.mobileNo)
                }
              />
            </div>
          </div>

          {showDetails && selectedEntity ? (
            <InterCompanyEntityDetailsCard
              entity={selectedEntity}
              companyAcNo={companyAcNo}
              companyMobile={companyMobile}
              companyPan={companyPan}
              showClosingBalance={showClosingBalance}
              partnerViewPrivacy={partnerViewPrivacy}
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
