"use client";

import React, { useState, useEffect, useMemo, Suspense, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Loader2, RotateCcw, Settings, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateFormatSettingsDialog } from "@/components/settings/DateFormatSettingsDialog";
import { cn } from "@/lib/utils";
import { startOfDay } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { collection, doc, getDoc, deleteDoc, getDocs, onSnapshot, query, serverTimestamp, where, Timestamp } from "firebase/firestore";
import { firestore, storage } from "@/lib/firebase"; // storage आयात गरियो
import { ref, deleteObject } from "firebase/storage"; // storage डिलिट गर्न आवश्यक

// Forms
import { CreateSaleForm } from "./CreateSaleForm";
import { CreatePurchaseForm } from "./CreatePurchaseForm";
import { CreatePaymentInForm } from "./CreatePaymentInForm";
import { CreatePaymentOutForm } from "./CreatePaymentOutForm";
import { CreateContraForm } from "./CreateContraForm";
import { CreateJournalForm } from "./CreateJournalForm";
import { CreateNoteForm } from "./CreateNoteForm";
import { SalaryForm } from "./SalaryForm";
import { CreateProductionForm } from "./CreateProductionForm";
import { InterCompanyVoucherForm } from "@/components/inter-company/InterCompanyVoucherForm";
import type { InterCompanyRibbonTab } from "@/components/inter-company/InterCompanyRibbonNav";
import { isInterCompanyVoucherEditDeleteBlocked } from "@/lib/interCompany/interCompanyVoucherHydrate";
import { useCompany, CompanyContext } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { useVouchers, VoucherProvider } from "@/hooks/useVouchers";
import { determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { HistoryDialog } from "./HistoryDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { NEPALI_MONTHS, adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";
import { Switch, SWITCH_TRACK_HEIGHT_PX } from "@/components/ui/switch";
import { CheckCircle } from "lucide-react";
import { hasPaymentLinks, hasSpendWiseLinks, hasAllocationsToVoucherId } from "@/lib/payment-allocation-utils";
import { useAuth } from "@/hooks/useAuth";
import { approveVoucherWithHistory, softDeleteVoucherMoveToRecycleBin } from "@/lib/voucherActionsClient";
import { getEffectiveHistorySettings } from "@/lib/voucherHistoryUtils";
import { getCompanyDocFromBrowserDb, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { VoucherAttachmentFallbackContext } from "@/contexts/VoucherAttachmentFallbackContext";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { formatVoucherNumber, normalizePrefix, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";
import { isRecurringVoucherGenerationEnabled } from "@/lib/recurringVoucherSettings";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { stripIdsForCrossCompanyClone } from "@/lib/crossCompanyMasterPrefill";
import { importVoucherAttachmentsAsFilesForLocalCloudCopy } from "@/lib/voucherLocalAttachmentUpload";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { persistLedgerModalParentFromBrowser } from "@/lib/modalUrlSync";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEmbeddedSqliteFirstWritesPreferred,
  apkEntityWriteUsesLocalSqliteMirror,
  preferLocalLedgerReads,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { useDate } from "@/hooks/useDate";
import { recurringAutoVoucherLabels } from "@/lib/calendarDisplayLabels";
import { armDashboardRedirectGuard } from "@/lib/protectFromUnwantedDashboardRedirect";
import { beginApkLedgerAsyncWriteShield } from "@/lib/apkLedgerRouteShield";
import { plNavDbg, plNavDbgIdHint } from "@/lib/plNavRedirectDebug";
import {
  clearRecurringTemplateForVoucher,
  computeRecurringAccrualPeriodStartMs,
  effectiveScheduleBsDay,
  generateRecurringVoucherNow,
  generateRecurringVouchersForPeriodSlots,
  getNextRecurringDueAd,
  getPastDueRecurringGapIfAny,
  getRecurringTemplateDocIdForVoucher,
  getRecurringTemplateForVoucher,
  listMissingRecurringPeriodSlotsAscending,
  projectNextRecurringMonetaryTotal,
  setRecurringTemplateForVoucher,
  suppressRecurringPeriodForTemplate,
  type RecurringPeriodSlot,
  type RecurringRateAdjustCadence,
  type RecurringRateAdjustMode,
  type RecurringVoucherTemplate,
} from "@/lib/recurringVouchers";
import {
  canEditRecurringAutoMonthly,
  canGenerateRecurringVoucherNow,
  canTurnOnRecurringAutoMonthlyOnSave,
  canViewRecurringVoucherControls,
} from "@/lib/recurringAutoPermissions";

/** Recurring save: % / fixed ke liye Firestore me number; none / khaali input => null. */
function recurringRatePayload(mode: RecurringRateAdjustMode, raw: string): number | null {
  if (mode === "none") return null;
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

/** % / fixed bump: kaun BS din se lagu ho — Firestore ISO; none ya date khaali => null. */
function recurringRateEffectiveFromForSave(mode: RecurringRateAdjustMode, fromAd: Date | undefined): string | null {
  if (mode !== "fixed" && mode !== "percent") return null;
  if (!fromAd || Number.isNaN(fromAd.getTime())) return null;
  return fromAd.toISOString();
}

/** Cadence + yearly anchor — % aur fixed dono ke liye; none par teeno null. */
function recurringRateCadencePayload(
  mode: RecurringRateAdjustMode,
  cadence: RecurringRateAdjustCadence,
  yearlyMonth: number,
  yearlyDay: number,
): {
  rateAdjustCadence: RecurringRateAdjustCadence | null;
  rateAdjustYearlyBsMonth: number | null;
  rateAdjustYearlyBsDay: number | null;
} {
  if (mode !== "fixed" && mode !== "percent") {
    return { rateAdjustCadence: null, rateAdjustYearlyBsMonth: null, rateAdjustYearlyBsDay: null };
  }
  if (cadence === "every_bs_month") {
    return {
      rateAdjustCadence: "every_bs_month",
      rateAdjustYearlyBsMonth: null,
      rateAdjustYearlyBsDay: null,
    };
  }
  return {
    rateAdjustCadence: "every_bs_year",
    rateAdjustYearlyBsMonth: Math.max(1, Math.min(12, Math.floor(yearlyMonth))),
    rateAdjustYearlyBsDay: Math.max(1, Math.min(32, Math.floor(yearlyDay))),
  };
}

/** Har N BS mahine / N BS saal — Firestore 1–24; none => null */
function recurringRateEveryNForSave(mode: RecurringRateAdjustMode, raw: string): number | null {
  if (mode !== "fixed" && mode !== "percent") return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(24, Math.floor(n));
}

/** Company AD mode: recurring start date — HTML date input ↔ local noon (same Firestore ISO). */
function adDateInputValue(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseAdDateInput(s: string): Date | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const [y, m, d] = t.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Yearly every-N-years: optional BS-year anchor for phase; null uses effective-from year. */
function recurringYearlyBaseAnchorForSave(
  mode: RecurringRateAdjustMode,
  cadence: RecurringRateAdjustCadence,
  d: Date | undefined,
): string | null {
  if (mode !== "fixed" && mode !== "percent") return null;
  if (cadence !== "every_bs_year") return null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type VoucherType = "sale" | "purchase" | "payment_in" | "payment_out" | "inter_company" | "contra" | "direct_income" | "direct_expense" | "journal" | "note" | "add_salary" | "production";

/** Tab strip labels — inter_company ko readable title */
const VOUCHER_TAB_LABELS: Partial<Record<VoucherType, string>> = {
  inter_company: "Inter Company",
};
function voucherTabLabel(key: VoucherType): string {
  return VOUCHER_TAB_LABELS[key] ?? key.replace(/_/g, " ");
}

const formMap: Record<VoucherType, React.ComponentType<any>> = {
  sale: CreateSaleForm,
  purchase: CreatePurchaseForm,
  payment_in: CreatePaymentInForm,
  payment_out: CreatePaymentOutForm,
  inter_company: InterCompanyVoucherForm,
  contra: CreateContraForm,
  direct_income: CreatePaymentInForm,
  direct_expense: CreatePaymentOutForm,
  journal: CreateJournalForm,
  note: CreateNoteForm,
  add_salary: SalaryForm,
  production: CreateProductionForm,
};

// Tab order: Contra left of Journal
const TAB_ORDER: VoucherType[] = [
  "sale", "purchase", "payment_in", "payment_out", "inter_company", "direct_income", "direct_expense",
  "contra", "journal", "note", "add_salary", "production",
];

/** Payment In/Out + Direct Income/Expense — chaaron aapas me convert (APK strip / user request). */
const CASHFLOW_QUARTET: readonly VoucherType[] = ["payment_in", "payment_out", "direct_income", "direct_expense"];

/** Edit-mode type switch: same “bucket” me hi `type` override + field reset — save path nayi type se align ho */
type EditConvertBucket = "sale_purchase" | "cashflow_quartet" | "journal_contra" | "other";
function editConvertBucket(t: VoucherType): EditConvertBucket {
  if (t === "sale" || t === "purchase") return "sale_purchase";
  if ((CASHFLOW_QUARTET as readonly string[]).includes(t)) return "cashflow_quartet";
  if (t === "journal" || t === "contra") return "journal_contra";
  return "other";
}
function canEditConvertBetween(stored: VoucherType, active: VoucherType): boolean {
  const a = editConvertBucket(stored);
  return a !== "other" && a === editConvertBucket(active);
}

/** Firestore `voucher` abhi purani `type` rakhta hai; active tab nayi — mismatch fields hatao ta user naya select karke save kare */
function shapeVoucherForActiveEditTab(voucher: Record<string, unknown> | undefined, activeTab: VoucherType): Record<string, unknown> | undefined {
  if (!voucher?.id) return voucher;
  const stored = (String(voucher.type || "sale") as VoucherType);
  if (!canEditConvertBetween(stored, activeTab)) return { ...voucher };
  const next: Record<string, unknown> = { ...voucher, type: activeTab };

  const isCashflowIn = (t: VoucherType) => t === "payment_in" || t === "direct_income";
  const isCashflowOut = (t: VoucherType) => t === "payment_out" || t === "direct_expense";

  // CreatePaymentInForm ↔ CreatePaymentOutForm: direction badli → galat master / links hatao
  if (isCashflowIn(stored) && isCashflowOut(activeTab)) {
    next.incomeAccountId = "";
    next.expenseAccountId = "";
    next.toAccountId = "";
    if (activeTab === "direct_expense") {
      next.partyId = "";
      next.staffId = "";
      next.taxAccountId = "";
    }
    next.allocations = [];
    next.linkedPaymentInIds = [];
    return next;
  }
  if (isCashflowOut(stored) && isCashflowIn(activeTab)) {
    next.expenseAccountId = "";
    next.toAccountId = "";
    if (activeTab === "direct_income") {
      next.partyId = "";
      next.staffId = "";
      next.taxAccountId = "";
    }
    next.allocations = [];
    next.linkedPaymentInIds = [];
    return next;
  }

  // Same income-side form: Payment In ↔ Direct Income
  if (stored === "direct_income" && activeTab === "payment_in") {
    next.incomeAccountId = "";
  }
  if (stored === "payment_in" && activeTab === "direct_income") {
    next.partyId = "";
    next.staffId = "";
    next.taxAccountId = "";
    next.allocations = [];
  }
  // Same out-side form: Payment Out ↔ Direct Expense
  if (stored === "direct_expense" && activeTab === "payment_out") {
    next.expenseAccountId = "";
    next.toAccountId = "";
  }
  if (stored === "payment_out" && activeTab === "direct_expense") {
    next.partyId = "";
    next.staffId = "";
    next.taxAccountId = "";
    next.allocations = [];
    next.linkedPaymentInIds = [];
  }
  return next;
}

// Sale ↔ Purchase pair (cashflow quartet alag hai)
const CONVERTIBLE_MAP: Partial<Record<VoucherType, VoucherType>> = {
  sale: "purchase",
  purchase: "sale",
  // Copy-to edit flow: Journal aur Contra ko bhi mutual convert allow karo.
  journal: "contra",
  contra: "journal",
};
function getConvertTarget(type: VoucherType): VoucherType | null {
  return CONVERTIBLE_MAP[type] ?? null;
}
/**
 * Tab strip: konsi tabs enable hon — null = sab (unrestricted New Sale etc.).
 * `restrictSalePurchaseForCopyDraft` — Save & Copy To ke baad convertible pair lock (Sale↔Purchase / Journal↔Contra).
 */
function getRestrictedEnabledTabs(
  activeTab: VoucherType,
  isEditing: boolean,
  restrictSalePurchaseForCopyDraft?: boolean
): VoucherType[] | null {
  // Inter Company: alag voucher — tab switch / copy-to remap meaningful nahi
  if (activeTab === "inter_company") return ["inter_company"];
  if ((CASHFLOW_QUARTET as readonly string[]).includes(activeTab)) {
    return [...CASHFLOW_QUARTET];
  }
  const convertiblePairWhileCopy = Boolean(restrictSalePurchaseForCopyDraft) && Boolean(getConvertTarget(activeTab));
  // Naya txn (bina copy-target) unrestricted; copy-draft par sirf current convertible pair allow.
  if (!isEditing && !convertiblePairWhileCopy) return null;
  const target = getConvertTarget(activeTab);
  if (target && (isEditing || convertiblePairWhileCopy)) return [activeTab, target];
  return [activeTab];
}

const getVoucherType = (voucher: any, defaultData: any, defaultTab: string): VoucherType => {
  if (voucher?.subType === 'add_salary' || defaultData?.subType === 'add_salary') return 'add_salary';
  if (voucher?.id) return (voucher.type || 'sale') as VoucherType;
  return (defaultData?.defaultTab || defaultTab || 'sale') as VoucherType;
};

/**
 * `liveVoucher` Firestore snapshot kabhi `fileUrls` omit / [] bhejta hai (sync lag, partial hydrate).
 * Daybook / Recent row `useVouchers` mirror se poore refs rakhta hai — replace se `local:` / https links gayab ho kar
 * APK pe "Attachment file not found" deta tha; Party jaisi jagah timing se kabhi bachta tha.
 */
function mergeAttachmentFieldsFromRowForEffectiveVoucher(live: any, row: any): any {
  if (!live) return live;
  const out = { ...live };
  const liveUrls = Array.isArray(live.fileUrls) ? live.fileUrls.filter(Boolean) : [];
  const rowUrls = Array.isArray(row?.fileUrls) ? row.fileUrls.filter(Boolean) : [];
  if (liveUrls.length === 0 && rowUrls.length > 0) {
    out.fileUrls = rowUrls;
  }
  const liveUn = live.unassignedFile?.url;
  const rowUn = row?.unassignedFile?.url;
  if (!liveUn && rowUn) {
    out.unassignedFile = row.unassignedFile;
  }
  return out;
}

/** Ledger row metadata Firestore doc me nahi — live snapshot replace par Journal bill-wise party/side preserve karo. */
function mergeLedgerRowContextFromRow(live: any, row: any, ledgerEntityId?: string): any {
  if (!live) return live;
  return {
    ...live,
    _contraLeg: row?._contraLeg ?? live?._contraLeg,
    _openedFromAccountId: row?._openedFromAccountId ?? ledgerEntityId ?? live?._openedFromAccountId,
    _journalFocusSide: row?._journalFocusSide ?? live?._journalFocusSide,
  };
}

// Voucher number fallback map: cross-company copy me target company ka next number nikalne ke लिए default prefix.
const DEFAULT_PREFIX_LABELS: Record<string, string> = {
  sale: "Sale Inv",
  sale_service: "SS-",
  purchase: "PUR-",
  purchase_service: "PS-",
  payment_in: "RCPT-",
  payment_out: "PYMT-",
  contra: "CNTR-",
  direct_income: "DINC-",
  direct_expense: "DEXP-",
  journal: "JRNL-",
  note: "NOTE-",
  add_salary: "ADD-SAL-",
  pay_salary: "PAY-SAL-",
  production: "PROD-",
  inter_company: "IC-",
};

function getPrefixKeyFromVoucher(v: Record<string, any>): string {
  if (v.type === "journal" && v.subType === "add_salary") return "add_salary";
  if (v.type === "payment_out" && v.subType === "pay_salary") return "pay_salary";
  if (v.type === "sale") return v.lineItems?.[0]?.type === "service" ? "sale_service" : "sale";
  if (v.type === "purchase") return v.lineItems?.[0]?.type === "service" ? "purchase_service" : "purchase";
  return String(v.type || "sale");
}

async function getNextVoucherNumberForTarget(
  targetCompanyId: string,
  targetCompanyDoc: any,
  voucherLike: Record<string, any>
): Promise<string> {
  const prefixKey = getPrefixKeyFromVoucher(voucherLike);
  const configuredPrefixes = targetCompanyDoc?.voucherPrefixes?.[prefixKey];
  const prefix = Array.isArray(configuredPrefixes) && configuredPrefixes[0]
    ? configuredPrefixes[0]
    : (DEFAULT_PREFIX_LABELS[prefixKey] || "V-");
  const vouchersPath = collection(firestore, `companies/${targetCompanyId}/vouchers`);
  const typeQuery = query(vouchersPath, where("type", "==", String(voucherLike.type || "sale")));
  const fsRows = (await getDocs(typeQuery)).docs.map((d) => d.data() as Record<string, any>);
  // APK + Firestore company: browser DB vouchers merge mat karo — duplicate/next-no galat ho sakta tha (`apkEntityWriteUsesLocalSqliteMirror`).
  const localRows = apkEntityWriteUsesLocalSqliteMirror(targetCompanyDoc)
    ? await listCompanyDocsFromBrowserDb(targetCompanyId, "vouchers")
    : [];
  const mergedRows = [...fsRows, ...localRows].filter((r) => {
    if (voucherLike.type === "sale" || voucherLike.type === "purchase") {
      const srcLineType = voucherLike?.lineItems?.[0]?.type || "item";
      const rowLineType = (r as any)?.lineItems?.[0]?.type || "item";
      return srcLineType === rowLineType;
    }
    if (voucherLike.type === "journal" && voucherLike.subType === "add_salary") return r.subType === "add_salary";
    if (voucherLike.type === "payment_out" && voucherLike.subType === "pay_salary") return r.subType === "pay_salary";
    if (voucherLike.type === "journal") return r.subType !== "add_salary";
    if (voucherLike.type === "payment_out") return r.subType !== "pay_salary";
    return true;
  });
  let maxNo = 0;
  for (const row of mergedRows) {
    const voucherCandidates =
      // Contra me numbering aksar voucherNumberOut/In me hoti hai; generic voucherNumber missing ho sakta hai.
      voucherLike.type === "contra"
        ? [
            String((row as any)?.voucherNumberOut || ""),
            String((row as any)?.voucherNumberIn || ""),
            String((row as any)?.voucherNumber || ""),
          ]
        : [String((row as any)?.voucherNumber || "")];
    for (const voucherNo of voucherCandidates) {
      if (!voucherNo) continue;
      if (!voucherNo.startsWith(prefix) && !voucherNo.startsWith(normalizePrefix(prefix))) continue;
      const parsed = parseVoucherNumberPart(voucherNo, prefix);
      if (Number.isFinite(parsed) && parsed > maxNo) maxNo = parsed;
    }
  }
  return formatVoucherNumber(prefix, maxNo + 1);
}

function resetCrossLinksForCopy(v: Record<string, any>): Record<string, any> {
  // Cross-company copy me stale link/payment ids hatake clean independent voucher banana hai.
  const out: Record<string, any> = { ...v };
  delete out.id;
  delete out.history;
  delete out.createdAt;
  delete out.updatedAt;
  delete out.deletedAt;
  delete out.approvedAt;
  delete out.approvedByUserId;
  delete out.approvedByUserName;
  delete out.allocations;
  delete out.linkedVoucherIds;
  delete out.linkedPaymentInIds;
  delete out.linkedPaymentInAmounts;
  delete out.linkedFromVoucherNos;
  delete out.linkedToVoucherNos;
  delete out.linkedOpeningBalanceAmount;
  delete out.linkedOpeningBalanceAccountId;
  delete out.openingBalanceAllocated;
  delete out.paymentStatus;
  delete out.pendingLinkAllocations;
  delete out.crossCopySourceRef;
  return out;
}

type CollectionName = "parties" | "bank_accounts" | "staff" | "taxes" | "expense_accounts" | "items";

/** Copy chip click context: snapshot se kaunsa source master prefer karna hai (random Set order se galat row pick na ho). */
export type CopyMissingMasterOpts = {
  journalLineIndex?: number;
  contraAccountField?: "fromAccountId" | "toAccountId";
  /** Add Salary: Dr line vs staff/tax per row — `addSalaryLineIndex` staff + tax ke saath. */
  addSalaryField?: "debitAccountId" | "staffId" | "taxAccountId";
  addSalaryLineIndex?: number;
};

export type CopyMasterDraftRequestPayload = {
  category: string;
  targetCompanyName: string;
  sourceCollection: CollectionName;
  sourceName: string;
  /** Source company में मौजूद stripped row — child forms को सारे fields + URL attachments hydrate करने हैं. */
  sourceRowPayload?: Record<string, unknown>;
  /** Save ke baad naya master isi journal line / contra field par lagao — async race me bhi sahi row. */
  applyTarget?: CopyMissingMasterOpts;
};

type CopyMasterDraftRequest = CopyMasterDraftRequestPayload;

function isActiveMasterRow(row: Record<string, any>): boolean {
  // Recycle-bin/deleted masters ko copy-match candidate na banao; only active rows should be remapped.
  if (!row) return false;
  if (row.isDeleted === true) return false;
  if (row.deletedAt != null) return false;
  if (row.movedToAdminRecycleAt != null) return false;
  return true;
}

function collectLikelyReferenceIds(value: unknown, bucket: Set<string>) {
  if (typeof value === "string") {
    const s = value.trim();
    // Generic id walker: nested ids (accountId/itemId/etc.) pick karne ke लिए conservative string collector.
    if (s && s.length >= 8 && !s.includes(" ")) bucket.add(s);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectLikelyReferenceIds(v, bucket));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collectLikelyReferenceIds(v, bucket));
  }
}

/** Journal row Copy / Contra From-To Copy: source voucher snapshot ki exact line/side ka accountId pehle try karo. */
function resolvePreferredSourceMasterIdsFromSnapshot(
  snapshot: Record<string, any>,
  opts?: CopyMissingMasterOpts
): string[] {
  if (!snapshot || !opts) return [];
  const t = String(snapshot.type || "");
  const sub = String(snapshot.subType || "");
  // Add Salary copy chip: form-seed `lineItems` + `debitAccountId` ya saved `entries` dono se source id nikaalo.
  if (t === "journal" && sub === "add_salary" && opts.addSalaryField) {
    const lineItems = Array.isArray(snapshot.lineItems) ? snapshot.lineItems : [];
    const idx =
      typeof opts.addSalaryLineIndex === "number" ? Math.max(0, opts.addSalaryLineIndex) : 0;
    if (lineItems.length > 0) {
      if (opts.addSalaryField === "debitAccountId") {
        const id = String(snapshot.debitAccountId ?? "").trim();
        return id ? [id] : [];
      }
      const row = lineItems[idx];
      if (opts.addSalaryField === "staffId") {
        const sid = String(row?.staffId ?? "").trim();
        return sid ? [sid] : [];
      }
      if (opts.addSalaryField === "taxAccountId") {
        const tid = String(row?.taxAccountId ?? "").trim();
        return tid ? [tid] : [];
      }
    }
    const entries = Array.isArray(snapshot.entries)
      ? snapshot.entries
      : Array.isArray(snapshot.lines)
        ? snapshot.lines
        : [];
    const staffRows = entries.filter((e: any) => {
      const credit = Number(e.credit) || 0;
      if (credit <= 0 || !e.accountId) return false;
      if (String(e.narration || "").includes("(Staff ID:")) return false;
      return true;
    });
    if (opts.addSalaryField === "debitAccountId") {
      const debit = entries.find((e: any) => Number(e.debit) > 0 && e.accountId);
      const id = String(debit?.accountId ?? "").trim();
      return id ? [id] : [];
    }
    if (opts.addSalaryField === "staffId") {
      const row = staffRows[idx];
      const sid = String(row?.accountId ?? "").trim();
      return sid ? [sid] : [];
    }
    if (opts.addSalaryField === "taxAccountId") {
      const staffRow = staffRows[idx];
      const staffMemberId = String(staffRow?.accountId ?? "").trim();
      if (!staffMemberId) return [];
      const taxE = entries.find(
        (x: any) =>
          String(x.narration || "").includes(`(Staff ID: ${staffMemberId})`) &&
          (Number(x.credit || 0) > 0 || Number(x.debit || 0) > 0)
      );
      const tid = String(taxE?.accountId ?? "").trim();
      return tid ? [tid] : [];
    }
  }
  if (t === "journal" && typeof opts.journalLineIndex === "number") {
    // Firestore me journal `entries: [{accountId, debit, credit}]` (form `lines` ko save karte waqt rename hota hai).
    // Older drafts/local seeds me `lines` bhi ho sakta hai — dono support karo taaki Dr/Cr ka exact id mile.
    const rows = Array.isArray(snapshot.entries)
      ? snapshot.entries
      : Array.isArray(snapshot.lines)
      ? snapshot.lines
      : [];
    const row = rows[opts.journalLineIndex];
    const aid = String(row?.accountId ?? "").trim();
    return aid ? [aid] : [];
  }
  if (t === "contra" && opts.contraAccountField) {
    const fid = String(snapshot.fromAccountId ?? "").trim();
    const tid = String(snapshot.toAccountId ?? "").trim();
    const pick = opts.contraAccountField === "fromAccountId" ? fid : tid;
    return pick ? [pick] : [];
  }
  return [];
}

/** Preferred IDs ko current collection ke source rows ke साथ intersect karke ordered list — baaki candidates peechhe. */
function orderMasterCandidatesForCollection(
  candidateIds: string[],
  preferredIds: string[],
  sourceById: Map<string, Record<string, any>>
): string[] {
  const preferredInColl = preferredIds.filter((id) => sourceById.has(id));
  const seen = new Set<string>(preferredInColl);
  const ordered = [...preferredInColl];
  for (const id of candidateIds) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

async function loadCollectionRows(
  companyId: string,
  collectionName: CollectionName,
  /** Kis company lane par SQLite mirror merge karna hai — APK Firestore-company par skip */
  laneCompany: { storageOption?: string } | null | undefined
): Promise<Array<Record<string, any>>> {
  const fsRows = (await getDocs(collection(firestore, `companies/${companyId}/${collectionName}`))).docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, any>),
  }));
  const localRows = apkEntityWriteUsesLocalSqliteMirror(laneCompany)
    ? await listCompanyDocsFromBrowserDb(companyId, collectionName)
    : [];
  const byId = new Map<string, Record<string, any>>();
  [...fsRows, ...localRows].forEach((r) => {
    const id = String((r as any)?.id || "");
    if (id) byId.set(id, r as Record<string, any>);
  });
  return Array.from(byId.values()).filter((row) => isActiveMasterRow(row));
}

async function remapVoucherReferencesByName(
  sourceCompanyId: string,
  targetCompanyId: string,
  voucher: Record<string, any>,
  /** Har side ka `storageOption` — APK cloud par local rows merge gate */
  allCompaniesLane: ReadonlyArray<{ id: string; storageOption?: string }>
): Promise<{ remapped: Record<string, any>; unmatchedNames: string[]; unmatchedCategories: string[] }> {
  const lane = (cid: string) => allCompaniesLane.find((c) => c.id === cid) ?? null;
  const collections: CollectionName[] = ["parties", "bank_accounts", "staff", "taxes", "expense_accounts", "items"];
  const sourceRowsByCollection = new Map<CollectionName, Array<Record<string, any>>>();
  const targetNameToIdByCollection = new Map<CollectionName, Map<string, string>>();
  for (const cname of collections) {
    const [sourceRows, targetRows] = await Promise.all([
      loadCollectionRows(sourceCompanyId, cname, lane(sourceCompanyId)),
      loadCollectionRows(targetCompanyId, cname, lane(targetCompanyId)),
    ]);
    sourceRowsByCollection.set(cname, sourceRows);
    const idx = new Map<string, string>();
    // Bank/cash rows: `accountName` common; naam match `masterRowCanonicalName` se align karo (openCopyMasterDraft se bhi waahi canonical).
    targetRows.forEach((row) => {
      const n = normalizeMasterMatchKey(masterRowCanonicalName(row as Record<string, unknown>));
      if (n) idx.set(n, String(row.id || ""));
    });
    targetNameToIdByCollection.set(cname, idx);
  }
  const allIds = new Set<string>();
  collectLikelyReferenceIds(voucher, allIds);
  const idMap = new Map<string, string | null>();
  const unmatchedNames: string[] = [];
  const unmatchedCategories = new Set<string>();
  for (const id of allIds) {
    let mapped: string | null = null;
    let foundInSourceCompany = false;
    for (const cname of collections) {
      const sourceRows = sourceRowsByCollection.get(cname) || [];
      const src = sourceRows.find((r) => String(r.id || "") === id);
      if (!src) continue;
      foundInSourceCompany = true;
      const sourceName = normalizeMasterMatchKey(masterRowCanonicalName(src as Record<string, unknown>));
      const targetMap = targetNameToIdByCollection.get(cname) || new Map<string, string>();
      mapped = sourceName ? targetMap.get(sourceName) || null : null;
      if (!mapped && sourceName) {
        unmatchedNames.push(masterRowCanonicalName(src as Record<string, unknown>) || id);
        // Granular mismatch: Payment Out Copy account/party sirf zarurat par dikhe (`account_bank` ≠ generic `account`).
        if (cname === "items") unmatchedCategories.add("item");
        else if (cname === "parties") unmatchedCategories.add("party");
        else if (cname === "staff") unmatchedCategories.add("staff");
        else if (cname === "taxes") unmatchedCategories.add("tax");
        else if (cname === "bank_accounts") unmatchedCategories.add("account_bank");
        else if (cname === "expense_accounts") unmatchedCategories.add("account_expense");
      }
      break;
    }
    if (mapped !== null) idMap.set(id, mapped);
    // Source par yeh id master hai lekin target par naam match nahi — stale source UUID copy na ho; khali + Copy chip.
    else if (foundInSourceCompany) idMap.set(id, "");
  }
  const deepMap = (value: unknown): unknown => {
    // `Date` / Firestore `Timestamp` ko object branch me mat ghusedo — warna Date → {} aur Timestamp → {seconds,nanoseconds}
    // ban jata hai; Add Salary / Sale copy-to-company me `getInitialFormValues` me date invalid → BS picker khali.
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value;
    if (typeof value === "string") {
      if (idMap.has(value)) return idMap.get(value) || "";
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => deepMap(v));
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      // Pehle deep pass se toot chuka Timestamp-like plain object dubara Timestamp banao (defensive).
      if (
        typeof o.seconds === "number" &&
        (o.nanoseconds === undefined || typeof o.nanoseconds === "number") &&
        Object.keys(o).every((k) => k === "seconds" || k === "nanoseconds")
      ) {
        try {
          return new Timestamp(o.seconds, (o.nanoseconds as number) ?? 0);
        } catch {
          /* niche generic object copy */
        }
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) out[k] = deepMap(v);
      return out;
    }
    return value;
  };
  return {
    remapped: deepMap(voucher) as Record<string, any>,
    unmatchedNames: Array.from(new Set(unmatchedNames)),
    unmatchedCategories: Array.from(unmatchedCategories),
  };
}

function defaultTabFromVoucherLike(v: Record<string, any>): VoucherType {
  // Reset-after-copy me same voucher type ka naya form kholne ke liye stable tab key.
  if (v?.subType === "add_salary") return "add_salary";
  return (String(v?.type || "sale") as VoucherType) || "sale";
}

function mapMismatchCategoryToCollections(category: string): CollectionName[] {
  if (category === "item") return ["items"];
  if (category === "tax") return ["taxes"];
  if (category === "staff") return ["staff"];
  if (category === "party") return ["parties"];
  // Payment Out: From Bank sirf bank_accounts; Expense ledger sirf expense_accounts — generic "account" dono dekhe.
  if (category === "account_bank") return ["bank_accounts"];
  if (category === "account_expense") return ["expense_accounts"];
  if (category === "account") return ["bank_accounts", "expense_accounts"];
  return ["bank_accounts", "expense_accounts"];
}

/** Cross-company remap: naam match key — trim, lower, spaces collapse taaki 100% visible match hi auto-map ho. */
function normalizeMasterMatchKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Save-after-copy freshness check: Date/Timestamp/plain seconds object ko epoch-ms me normalize karo. */
function toEpochMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      const ms = d?.getTime?.();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object" && value !== null) {
    // Drive/local JSON payload me Firestore timestamp `seconds` ya `_seconds` dono shape mil sakte hain.
    const seconds =
      (value as { seconds?: unknown; _seconds?: unknown }).seconds ??
      (value as { seconds?: unknown; _seconds?: unknown })._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

/** Canonical display name bank/party/item/tax rows ke लिए — target side duplicate naam match. */
function masterRowCanonicalName(row: Record<string, unknown>): string {
  return String(row?.name ?? row?.itemName ?? row?.accountName ?? row?.title ?? "").trim();
}

/** Voucher dialog: header jaisa BS/AD/Both + Setting — voucher khulte hi date system/format change. */
function VoucherDialogDateSystemSwitcher({ className }: { className?: string }) {
  const { dateSystem, setDateSystem } = useDate();
  const { company } = useCompany();
  const isMobile = useIsMobile();
  const [dateFormatDialogOpen, setDateFormatDialogOpen] = useState(false);

  // Nepal ke alawa country par BS switcher hide (DesktopAppHeader jaisa).
  if (company?.country && company.country !== "Nepal") {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 shrink-0 whitespace-nowrap rounded-full border-slate-400/80 bg-white/90 px-2.5 text-xs font-semibold",
              isMobile && "px-2.5",
              className
            )}
            data-theme-header="date-selector"
          >
            {!isMobile && <CalendarDays className="mr-1.5 h-3.5 w-3.5" />}
            <span>{dateSystem}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[200]">
          <DropdownMenuItem onSelect={() => setDateSystem("BS")}>Bikram Samvat (BS)</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDateSystem("AD")}>Anno Domini (AD)</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDateSystem("Both")}>Both</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDateFormatDialogOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Setting
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DateFormatSettingsDialog open={dateFormatDialogOpen} onOpenChange={setDateFormatDialogOpen} />
    </>
  );
}

function VoucherDialogContent({ 
  voucher, 
  defaultVoucherData, 
  defaultTab = "sale",
  allowedTabs,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  restrictConvertWhenLinked = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
  onEffectiveLinksChange,
  /** Tab switch: clear dialog-level link state so Contra/Journal/etc. don’t inherit stale `deleteDisabledWhenLinked` from Payment In/Out. */
  onClearEffectiveLinksOnTabChange,
  /** Compare-before-sync: journal account lists isi company se (`CreateJournalForm`). */
  ledgerScopeCompanyId,
  /** Party/staff/bank ledger se edit: bill-wise sirf is entity ki Dr/Cr side — Firestore row me nahi hota. */
  ledgerEntityId,
  /** Bill-wise ledger: opening row remaining — Journal link me Opening Balance include karne ke liye. */
  ledgerOpeningBalanceOutstanding,
  /** Ledger books opening signed (Dr + / Cr −) — Journal link me party lookup miss par fallback. */
  ledgerBooksOpeningBalanceSigned,
  // Mobile strip me voucher dropdown ke right company selector show karne ke liye parent-controlled props.
  targetCompanyId,
  targetCompanyOptions,
  onTargetCompanyChange,
  // Copy-draft re-seed me form ko fresh state ke liye remount karne ke liye parent-controlled key suffix.
  formInstanceKey,
  /** Copy-draft: header company change pe forms bill/spend link state reset karein — sirf tab pass jab post-copy seed active ho. */
  copySaveTargetCompanyId,
  /** Multi-company account: create/edit/copy sab par header company dropdown. */
  showHeaderCompanySelector,
  /** Inter Company edit: ribbon par company naam read-only (dropdown band). */
  headerCompanyReadOnlyLabel,
  copyMismatchCategories,
  onCopyMissingCategory,
  copyMasterDraftRequest,
  /** Copy-draft: Quartet tab switch — queued prefilled create dialog cancel + mismatch recount (sirf Copy chip se dialog). */
  onCashflowQuadTabNavigate,
  /** Copy-draft: party/bank master create ke baad mismatch list dubara ginti — Copy button hide + red labels fix. */
  onRefreshCopyMismatch,
  /** Parent `AddVoucherDialog` ko current tab batao — header Auto Monthly sirf journal pe. */
  onActiveTabChange,
  onInterCompanyRibbonTabChange,
  initialInterCompanyRibbonTab,
  recurringVoucherSaveBlocked = false,
  recurringVoucherAuxiliaryDirty = false,
}: { 
  voucher?: any, 
  defaultVoucherData?: any,
  defaultTab?: string,
  allowedTabs?: VoucherType[],
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string, pathsToDelete?: string[]) => void,
  onOpenHistory?: () => void,
  showHistoryButton?: boolean,
  editingDisabled?: boolean,
  restrictConvertWhenLinked?: boolean,
  deleteDisabledWhenLinked?: boolean,
  showApproveButton?: boolean,
  showSaveAndApproveOnCreate?: boolean,
  onApprove?: () => void,
  isApproving?: boolean,
  /** Sale/Purchase/Payment Out/Direct Expense: report effective has-links so dialog locks fields as soon as user links (or enables after unlink). */
  onEffectiveLinksChange?: (hasLinks: boolean | undefined) => void,
  onClearEffectiveLinksOnTabChange?: () => void,
  ledgerScopeCompanyId?: string,
  ledgerEntityId?: string,
  ledgerOpeningBalanceOutstanding?: number,
  ledgerBooksOpeningBalanceSigned?: number,
  targetCompanyId?: string,
  targetCompanyOptions?: Array<{ id: string; name: string }>,
  onTargetCompanyChange?: (companyId: string) => void,
  formInstanceKey?: string | number,
  copySaveTargetCompanyId?: string,
  copyMismatchCategories?: string[],
  onCopyMissingCategory?: (category: string, opts?: CopyMissingMasterOpts) => void,
  copyMasterDraftRequest?: CopyMasterDraftRequest | null;
  onCashflowQuadTabNavigate?: () => void;
  onRefreshCopyMismatch?: () => void | Promise<void>;
  onActiveTabChange?: (tab: VoucherType) => void;
  onInterCompanyRibbonTabChange?: (tab: InterCompanyRibbonTab) => void;
  /** `/inter-company?icTab=join` — dialog open par Join ribbon */
  initialInterCompanyRibbonTab?: InterCompanyRibbonTab;
  /** `true` jab account me 1 se zyada company — header company dropdown dikhane ke liye. */
  showHeaderCompanySelector?: boolean;
  headerCompanyReadOnlyLabel?: string;
  /** Legacy prop: parent ab hamesha `false` bhejta — Auto switch sirf main voucher Save se commit hota hai. */
  recurringVoucherSaveBlocked?: boolean;
  /** Toggle vs Firestore template mismatch — form pristine par bhi Save (e.g. ON→OFF). */
  recurringVoucherAuxiliaryDirty?: boolean;
}) {
  const { processedStaff } = useVouchers();
  const isEditing = !!voucher?.id;
  const isMobile = useIsMobile();
  // Parent se `allowedTabs={[...]}` inline aaye to har render naya reference milta hai; effect reset-loop rokne ke liye stable key use karo.
  const allowedTabsKey = useMemo(
    () => (Array.isArray(allowedTabs) ? allowedTabs.join("|") : ""),
    [allowedTabs]
  );

  const [activeTab, setActiveTab] = useState<VoucherType>(getVoucherType(voucher, defaultVoucherData, defaultTab));
  /** Cashflow Quartet tab-switch: mismatch refresh + prefetch cancel — mount par duplicate fire na ho. */
  const prevCashflowQuadTabRef = useRef<VoucherType | null>(null);
  useEffect(() => {
    const initial = getVoucherType(voucher, defaultVoucherData, defaultTab);
    const allowed = Array.isArray(allowedTabs) && allowedTabs.length > 0 ? allowedTabs : null;
    // Saved txn edit: kabhi allowedTabs narrow (incomes FAB, etc.) — initial ko sale jaisi default pe mat kheench; conversion/APK me galat form.
    const next =
      voucher?.id ? initial : allowed && !allowed.includes(initial) ? allowed[0] : initial;
    setActiveTab(next);
    // Poora `voucher` dep mat rakho: live snapshot har baar naya reference → edit convert ke baad tab purani `type` pe revert.
  }, [
    voucher?.id,
    voucher?.type,
    voucher?.subType,
    defaultVoucherData?.defaultTab,
    defaultVoucherData?.subType,
    defaultTab,
    allowedTabsKey,
  ]);

  // Parent header (Auto Monthly strip) ko current tab — `AddVoucherDialog` me `activeTab` state nahi hai.
  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  // Har tab change par parent ka `effectiveHasLinksFromForm` reset — warna Payment form ne `true` bheja ho to Contra/Salary attach band rehta hai.
  useEffect(() => {
    onClearEffectiveLinksOnTabChange?.();
  }, [activeTab, onClearEffectiveLinksOnTabChange]);

  const initialVoucherData = useMemo(() => {
    if (isEditing) {
      const shaped = shapeVoucherForActiveEditTab(voucher as Record<string, unknown> | undefined, activeTab);
      if (!shaped) return shaped as typeof voucher;
      // Ledger entity id row/Firestore dono se — CreateJournalForm bill-wise cards ke liye.
      return {
        ...shaped,
        _openedFromAccountId: (shaped as any)?._openedFromAccountId ?? ledgerEntityId,
      } as typeof voucher;
    }

    // nayi txn: defaultVoucherData me `id` ho to spread se “edit” ban jata — savedVoucherId galat + attach band
    const rawDefault = defaultVoucherData || {};
    const { id: _droppedNewId, ...restDefault } = rawDefault as Record<string, unknown>;

    return {
      date: startOfDay(new Date()),
      voucherNumber: "",
      narration: "",
      partyId: "",
      accountId: "",
      amount: "",
      total: 0,
      fileUrls: defaultVoucherData?.fileUrls || (defaultVoucherData?.unassignedFile ? [defaultVoucherData.unassignedFile.url] : []),
      unassignedFile: defaultVoucherData?.unassignedFile || null,
      ...restDefault,
      id: undefined as undefined,
    };
  }, [voucher, defaultVoucherData, isEditing, activeTab, ledgerEntityId]);

  const ActiveForm = useMemo(() => formMap[activeTab], [activeTab]);
  // formInstanceKey copy-draft re-seed par badalti hai (parent), taaki naye target company ka voucher number/account
  // wagairah form re-mount par fresh load ho — purane defaults ki state stale na rahe.
  const keyForForm = `${activeTab}-${voucher?.id || 'new'}-${formInstanceKey ?? ''}`;

  const restrictedEnabledTabs = useMemo((): VoucherType[] | null => {
    const unrestricted = getRestrictedEnabledTabs(activeTab, isEditing, Boolean(copySaveTargetCompanyId));
    // Linked txn par type-switch generally band — par Payment In/Out + Direct Inc/Exp ek hi `editConvertBucket` me hain;
    // mobile dropdown sab grey na dikhe: quartet ke beech convert PC jaisa active rakho; Sale/Journal wagairah ab bhi locked.
    if (!restrictConvertWhenLinked) return unrestricted;
    if ((CASHFLOW_QUARTET as readonly string[]).includes(activeTab)) return [...CASHFLOW_QUARTET];
    return [activeTab];
  }, [restrictConvertWhenLinked, activeTab, isEditing, copySaveTargetCompanyId]);

  /** Copy mode: tab switch par mismatch recount — cashflow quartet + sale/journal pairs. */
  useEffect(() => {
    const inCashflowQuartet = (t: VoucherType) => (CASHFLOW_QUARTET as readonly string[]).includes(t);
    const salePurchase = (t: VoucherType) => t === "sale" || t === "purchase";
    const journalContra = (t: VoucherType) => t === "journal" || t === "contra";
    if (!copySaveTargetCompanyId || !onCashflowQuadTabNavigate) return;
    const prev = prevCashflowQuadTabRef.current;
    prevCashflowQuadTabRef.current = activeTab;
    if (prev === null) return;
    const cashflowSwitch = inCashflowQuartet(prev) && inCashflowQuartet(activeTab) && prev !== activeTab;
    const salePurchaseSwitch = salePurchase(prev) && salePurchase(activeTab) && prev !== activeTab;
    const journalContraSwitch = journalContra(prev) && journalContra(activeTab) && prev !== activeTab;
    if (!cashflowSwitch && !salePurchaseSwitch && !journalContraSwitch) return;
    onCashflowQuadTabNavigate();
  }, [activeTab, copySaveTargetCompanyId, onCashflowQuadTabNavigate]);

  // Mobile/APK: dropdown sirf `allowedTabs` se banta tha — Payment In↔Direct Income jaise edit-convert targets list me hote hi nahi the (disabled bhi nahi, gayab).
  const tabKeys = useMemo(() => {
    const baseKeys = TAB_ORDER.filter((k) => (k in formMap) && (!allowedTabs || allowedTabs.includes(k)));
    if (!voucher?.id) return baseKeys;
    const stored = getVoucherType(voucher, defaultVoucherData, defaultTab);
    const eligible = new Set<VoucherType>(baseKeys);
    eligible.add(stored);
    if (!restrictConvertWhenLinked) {
      const conv = getRestrictedEnabledTabs(stored, true, Boolean(copySaveTargetCompanyId));
      if (conv) conv.forEach((t) => eligible.add(t));
    } else if ((CASHFLOW_QUARTET as readonly string[]).includes(stored)) {
      // Linked cashflow edit: quartet neighbours dropdown list me rahen — warna strip me option hi gum ho jata.
      CASHFLOW_QUARTET.forEach((t) => eligible.add(t));
    }
    return TAB_ORDER.filter((k) => (k in formMap) && eligible.has(k));
  }, [
    allowedTabs,
    voucher?.id,
    voucher?.type,
    voucher?.subType,
    defaultVoucherData?.defaultTab,
    defaultVoucherData?.subType,
    defaultTab,
    restrictConvertWhenLinked,
    copySaveTargetCompanyId,
  ]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Mobile: vertical padding ta voucher-type Select blue header / niche border se chipke na — chhota trigger = clear box */}
      <div
        className={cn(
          // Voucher-type selector strip: stronger blue tone so it visually matches green section intensity.
          "border-b border-sky-400 bg-sky-100",
          isMobile ? "px-3 py-2.5" : "px-[2px] md:px-6"
        )}
      >
        {isMobile ? (
          <div className="flex items-center gap-2">
            <Select
              value={activeTab}
              onValueChange={(v) => {
                const next = v as VoucherType;
                // Desktop Tabs jaisa guard — sirf allowed-convert tab pe switch (linked lock par bhi safe).
                if (restrictedEnabledTabs === null || restrictedEnabledTabs.includes(next)) setActiveTab(next);
              }}
            >
              {/* Mobile voucher-type button: full-width ke bajay text-length fit rakho taaki chip jaisa dikhe. */}
              <SelectTrigger className="h-9 w-fit min-w-[7.5rem] max-w-[70vw] rounded-full border-emerald-500 bg-emerald-100 text-emerald-900 text-sm font-semibold shadow-sm px-3">
                <SelectValue>
                  {voucherTabLabel(activeTab).replace(/\b\w/g, (l) => l.toUpperCase())}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tabKeys.map((key) => {
                  const disabled = restrictedEnabledTabs !== null && !restrictedEnabledTabs.includes(key);
                  return (
                    <SelectItem
                      key={key}
                      value={key}
                      disabled={disabled}
                      // Mobile dropdown: eligible conversion tabs sab light-green; selected tab par stronger border.
                      className={cn(
                        "rounded-md border my-0.5",
                        disabled
                          ? "border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed"
                          : key === activeTab
                            ? "border-emerald-600 bg-emerald-100 text-emerald-900 font-semibold"
                            : "border-emerald-300 bg-emerald-100 text-emerald-900 font-medium"
                      )}
                    >
                      {voucherTabLabel(key).replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {/* Company header: multi-company create/edit/copy — Inter Company edit par read-only naam. */}
            {headerCompanyReadOnlyLabel ? (
              <span
                className="h-9 inline-flex min-w-0 max-w-[70vw] flex-1 shrink items-center truncate rounded-full border border-emerald-300/80 bg-emerald-50 px-3 text-sm font-medium text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                title={headerCompanyReadOnlyLabel}
              >
                {headerCompanyReadOnlyLabel}
              </span>
            ) : showHeaderCompanySelector ? (
            <Select value={targetCompanyId || ""} onValueChange={(v) => onTargetCompanyChange?.(v)}>
              {/* Company selector: mobile par item-section jaisa soft green tone for visual consistency. */}
              <SelectTrigger className="h-9 flex-1 min-w-0 rounded-full border-emerald-300/80 bg-emerald-50 text-sm">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                {(targetCompanyOptions || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            ) : null}
            {/* Mobile: date selector — desktop par sirf purple ribbon (tab strip duplicate hata diya). */}
            <VoucherDialogDateSystemSwitcher className="ml-auto" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const next = v as VoucherType;
              if (restrictedEnabledTabs === null || restrictedEnabledTabs.includes(next)) setActiveTab(next);
            }}
            className="w-full"
          >
            <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0 gap-1 py-1">
              {tabKeys.map((key) => {
                const disabled = restrictedEnabledTabs !== null && !restrictedEnabledTabs.includes(key);
                return (
                  <TabsTrigger 
                    key={key} 
                    value={key}
                    disabled={disabled}
                    className={cn(
                      // Desktop tabs: pill width ~2× (px-4→px-8 + min-w) taaki Sale/Purchase wagaira zyada readable.
                      "capitalize rounded-md border px-8 py-2 min-w-[8.5rem] transition-all",
                      disabled
                        // Disabled tabs bhi pill shape me hi dikhayein so tab strip geometry consistent rahe.
                        ? "rounded-full border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed"
                        : "border-emerald-300 bg-emerald-100 text-emerald-900 data-[state=active]:rounded-full data-[state=active]:border-emerald-600 data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=inactive]:rounded-md"
                    )}
                  >
                    {voucherTabLabel(key)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Dialog form canvas: desktop `pt-6` breathable; APK/mobile par `pt-0` ta sky strip ke border ke niche white/slate wasted band (user scroll-area ke upar khali dhari). */}
      <div
        className={cn(
          "w-full min-w-0 max-w-full pl-[2px] pr-[2px] flex-1 flex flex-col min-h-0 overflow-x-hidden box-border bg-slate-100",
          isMobile ? "pt-0 pb-0" : "pt-6 pb-6 md:p-6"
        )}
      >
        <Suspense fallback={<div className="p-10 text-center"><Loader2 className="animate-spin mx-auto" /></div>}>
          {ActiveForm ? (
            <ActiveForm 
              key={keyForForm} 
              voucher={initialVoucherData} 
              inDialog={activeTab === "inter_company"}
              onVoucherAction={onVoucherAction}
              onOpenHistory={onOpenHistory}
              showHistoryButton={showHistoryButton}
              staffList={activeTab === 'add_salary' ? processedStaff : undefined}
              defaultTab={activeTab === 'direct_income' ? 'direct_income' : activeTab === 'direct_expense' ? 'direct_expense' : undefined}
              defaultVoucherData={initialVoucherData}
              editingDisabled={editingDisabled}
              deleteDisabledWhenLinked={deleteDisabledWhenLinked}
              showApproveButton={showApproveButton}
              showSaveAndApproveOnCreate={showSaveAndApproveOnCreate}
              onApprove={onApprove}
              isApproving={isApproving}
              onEffectiveLinksChange={activeTab === 'sale' || activeTab === 'purchase' || activeTab === 'payment_in' || activeTab === 'direct_income' || activeTab === 'payment_out' || activeTab === 'direct_expense' || activeTab === 'add_salary' ? onEffectiveLinksChange : undefined}
              initialFocusSide={activeTab === 'journal' ? (initialVoucherData as any)?._journalFocusSide : undefined}
              {...(activeTab === "journal" && ledgerScopeCompanyId ? { ledgerScopeCompanyId } : {})}
              {...(activeTab === "journal" && ledgerEntityId ? { ledgerEntityId } : {})}
              {...(activeTab === "journal" && ledgerOpeningBalanceOutstanding != null ? { ledgerOpeningBalanceOutstanding } : {})}
              {...(activeTab === "journal" && typeof ledgerBooksOpeningBalanceSigned === "number" ? { ledgerBooksOpeningBalanceSigned } : {})}
              {...(copySaveTargetCompanyId ? { copySaveTargetCompanyId } : {})}
              {...(copyMismatchCategories ? { copyMismatchCategories } : {})}
              {...(onCopyMissingCategory ? { onCopyMissingCategory } : {})}
              {...(copyMasterDraftRequest ? { copyMasterDraftRequest } : {})}
              {...(onRefreshCopyMismatch ? { onRefreshCopyMismatch } : {})}
              recurringVoucherSaveBlocked={recurringVoucherSaveBlocked}
              recurringVoucherAuxiliaryDirty={recurringVoucherAuxiliaryDirty}
              {...(activeTab === "inter_company"
                ? {
                    onRibbonTabChange: onInterCompanyRibbonTabChange,
                    ...(initialInterCompanyRibbonTab
                      ? { initialRibbonTab: initialInterCompanyRibbonTab }
                      : {}),
                  }
                : {})}
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}

// Default open size only: max 15" width, 12" height; small screens 90vw × 80vh. Resize is unlimited (no max).
const DEFAULT_MAX_W_PX = 15 * 96;  // 15in
const DEFAULT_MAX_H_PX = 12 * 96;  // 12in
const MIN_DIALOG_W = 420;
const MIN_DIALOG_H = 320;
const VOUCHER_DIALOG_STORAGE_KEY = "pl-voucher-dialog-bounds";

export function AddVoucherDialog(props: any) {
  /** Compare-before-sync jaisi jagah nested stack: `false` se parent non-modal Compare band hone par saath na band ho. */
  const {
    children,
    isOpen,
    onOpenChange,
    voucher,
    defaultVoucherData,
    dialogRootModal = true,
    editCompanyId,
    /** Recycle bin / audit: poora form read-only — Save/Copy/Delete band. */
    forceViewOnly = false,
    /** Recycle bin view: ribbon + Restore (parent restore ke baad `forceViewOnly` hatao). */
    recycleBinOnRestore,
    recycleBinRestoring = false,
    /** Party/staff/bank ledger entity id — Journal bill-wise cards ke liye (Firestore live doc me nahi). */
    ledgerEntityId,
    /** Bill-wise opening row remaining — Journal link dialog me OB row ke liye. */
    ledgerOpeningBalanceOutstanding,
    ledgerBooksOpeningBalanceSigned,
    ...rest
  } = props;
  // Outer company context full reference: dialog-scope override provider build karne ke liye (forms ko target company dikhana hai
  // bina global app state badale).
  const outerCompanyContext = useCompany();
  const { companyId: ctxCompanyId, setCompanyId, company: ctxCompany, effectiveNotificationSettings, allCompanies } =
    outerCompanyContext;
  /** Voucher jis company ka hai (Compare Side A/B) — header company se alag ho sakta hai. */
  const companyId = String(editCompanyId?.trim() || ctxCompanyId || "");
  const company = useMemo(() => {
    const eid = editCompanyId?.trim();
    if (eid) return allCompanies.find((c) => c.id === eid) ?? ctxCompany ?? null;
    return ctxCompany ?? null;
  }, [editCompanyId, allCompanies, ctxCompany]);
  const navigatorOnline = useNavigatorOnline();
  /** Dialog company lane: APK local ⇒ SQLite/live snapshot; APK Firestore ⇒ onSnapshot taaki stale mirror `/company` na khenche. */
  const voucherSqlMirrorFirst = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);
  /** Offline + Firestore-mode company (non-embedded APK cloud): view-only — Save / Copy / Approve band. */
  const apkOfflineViewOnly = useMemo(() => apkCloudCompanyOfflineViewOnly(company, navigatorOnline), [company, navigatorOnline]);
  const { user, customUser } = useAuth();
  /** Company Display settings se AD/BS/Both — recurring dialog labels + apply-from picker. */
  const { dateSystem, formatDate, formatDateBS, formatCurrencyForPrint } = useDate();
  const calLab = useMemo(() => recurringAutoVoucherLabels(dateSystem), [dateSystem]);
  const router = useRouter();
  const pathname = usePathname();
  const { can, canEditRecord, canDeleteVoucher } = usePermissions();
  const { vouchers } = useVouchers();
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;
  // Manage Sharing → Recurring Auto Voucher (Voucher Settings user list hata di).
  const canViewRecurringOnVoucher = useMemo(() => canViewRecurringVoucherControls(can), [can]);
  const canEditRecurringOnVoucher = useMemo(() => canEditRecurringAutoMonthly(can), [can]);
  const canAddRecurringOnVoucher = useMemo(() => can("add_recurring_auto_monthly"), [can]);
  const canGenerateRecurringOnVoucher = useMemo(() => canGenerateRecurringVoucherNow(can), [can]);
  // Static export: FAB + party/bank *desktop* ledger par modal khulte hi URL session me — save/approve/dashboard-guard ko restore anchor mile
  useEffect(() => {
    if (!isOpen || !isStaticAppBuild()) return;
    persistLedgerModalParentFromBrowser();
  }, [isOpen]);
  /** Wide desktop static me bhi polling-restore — `armDashboardRedirectGuard` ka `explicit` surrogate */
  const ledgerModalGuardWide = useMemo(() => isMobile || isStaticAppBuild(), [isMobile]);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [isApproving, setIsApproving] = useState(false);
  // Dialog-scope company selector: global sidebar company ko change kiye bina target save/copy company control karta hai.
  const [targetCompanyId, setTargetCompanyId] = useState<string>(companyId);
  // Copy destination ke liye ref: Select change ke turant baad Copy click par bhi state batch se pehle stale `targetCompanyId` na ho.
  const targetCompanyIdRef = useRef<string>(targetCompanyId);
  targetCompanyIdRef.current = targetCompanyId;
  const [isCopyingToCompany, setIsCopyingToCompany] = useState(false);
  // Edit mode label rule: if form has pending changes => "Sv & Copy To", otherwise only "Copy To".
  const [hasPendingEditChanges, setHasPendingEditChanges] = useState(false);
  // Copy flow ke baad same dialog me naya form kholne ke लिए prepared seed data.
  const [postCopyNewFormSeed, setPostCopyNewFormSeed] = useState<any | null>(null);
  const [copyMismatchCategories, setCopyMismatchCategories] = useState<string[]>([]);
  const [copySourceVoucherSnapshot, setCopySourceVoucherSnapshot] = useState<Record<string, any> | null>(null);
  /** Copy-draft header: tick par pehli save ke baad source voucher recycle-bin (permission check). */
  const [deleteOriginalAfterCopySave, setDeleteOriginalAfterCopySave] = useState(false);
  /** Copy-draft: pehli successful save par original delete ek hi baar try ho. */
  const copyOriginalDeleteHandledRef = useRef(false);
  const [copyMasterDraftRequest, setCopyMasterDraftRequest] = useState<CopyMasterDraftRequest | null>(null);
  // Center guidance popup: vague toast ki jagah formal actionable message dikhane ke लिए.
  const [copyMissingMasterPopup, setCopyMissingMasterPopup] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "", message: "" });
  // Copy button ko existing action-row ke andar (Save & Print ke left) portal mount node se inject karte hain.
  const [copyButtonMountNode, setCopyButtonMountNode] = useState<HTMLDivElement | null>(null);
  const dialogFrameRef = useRef<HTMLDivElement | null>(null);
  const copyButtonHostRef = useRef<HTMLDivElement | null>(null);
  /** Multi-gap picker main voucher Save se khula ho to dismiss/complete par parent voucher dialog band (`onOpenChange(false)`). */
  const recurringPickerCloseParentRef = useRef(false);
  const [liveVoucher, setLiveVoucher] = useState<any>(null);
  const [editingDisabled, setEditingDisabled] = useState(false);
  /** Block edit rule: when voucher history is full and setting is "Block edit", disable Save. */
  const [historyBlocksEdit, setHistoryBlocksEdit] = useState(false);
  /** When sale/purchase form has pending link changes (e.g. user unlinked in dialog), form reports effective state so we enable edit locally. */
  const [effectiveHasLinksFromForm, setEffectiveHasLinksFromForm] = useState<boolean | null>(null);
  // Recurring toggle: new + edit voucher dono flow me common dialog-level control rakho.
  const [autoMonthlyEnabled, setAutoMonthlyEnabled] = useState(false);
  /** ON = add; OFF = edit — `autoMonthlyEnabled` ke baad; alag permission enforce. */
  const canToggleAutoMonthlySwitch = useMemo(
    () => (autoMonthlyEnabled ? canEditRecurringOnVoucher : canAddRecurringOnVoucher),
    [autoMonthlyEnabled, canEditRecurringOnVoucher, canAddRecurringOnVoucher],
  );
  const [autoMonthlyHydrating, setAutoMonthlyHydrating] = useState(false);
  // BS month day 1–31 ya 32 = us mahine ka aakhiri din; rate adjust template save ke saath jata hai.
  const [autoMonthlyScheduleBsDay, setAutoMonthlyScheduleBsDay] = useState(32);
  const [autoMonthlyRateMode, setAutoMonthlyRateMode] = useState<RecurringRateAdjustMode>("none");
  const [autoMonthlyRateValue, setAutoMonthlyRateValue] = useState("");
  /** Fixed amount: is BS date se pehle due wale period par bump skip (`rateAdjustEffectiveFrom`). */
  const [autoMonthlyRateEffectiveFromAd, setAutoMonthlyRateEffectiveFromAd] = useState<Date | undefined>(undefined);
  /** Fixed: har mahine bump vs saal me ek baar — saal wale par BS month/day anchor. */
  const [autoMonthlyRateCadence, setAutoMonthlyRateCadence] = useState<RecurringRateAdjustCadence>("every_bs_month");
  const [autoMonthlyYearlyBsMonth, setAutoMonthlyYearlyBsMonth] = useState(1);
  const [autoMonthlyYearlyBsDay, setAutoMonthlyYearlyBsDay] = useState(1);
  /** Cadence: har kitne BS mahine / kitne BS saal par bump (1 = har eligible run). */
  const [autoMonthlyRateEveryN, setAutoMonthlyRateEveryN] = useState("1");
  /** Yearly every-N: which BS year phases the interval (app start date can differ from books cycle). */
  const [autoMonthlyYearlyBaseAnchorAd, setAutoMonthlyYearlyBaseAnchorAd] = useState<Date | undefined>(undefined);
  const [recurringSettingsOpen, setRecurringSettingsOpen] = useState(false);
  const [savingRecurringSettings, setSavingRecurringSettings] = useState(false);
  const [generatingRecurringNow, setGeneratingRecurringNow] = useState(false);
  /** Generate / Settings save / main Save: 2+ missing months — tick wale batch; koi tick nahi = sirf latest due ek. */
  const [recurringGeneratePicker, setRecurringGeneratePicker] = useState<{
    open: boolean;
    slots: RecurringPeriodSlot[];
    selected: Record<string, boolean>;
    voucherId: string;
    /** Har row par schedule BS din dikhane ke liye (Firestore template). */
    templateForSchedule: RecurringVoucherTemplate;
  } | null>(null);
  /** Generate now: Firestore list aa rahi hai — button par chhota wait (tooltip nahi). */
  const [recurringGeneratePickerPrep, setRecurringGeneratePickerPrep] = useState(false);
  /** Firestore template: next-run hint skips periods already auto-created or user-deleted. */
  const [recurringTemplateLastPeriodKey, setRecurringTemplateLastPeriodKey] = useState<string | null>(null);
  const [recurringTemplateSuppressedKeys, setRecurringTemplateSuppressedKeys] = useState<string[]>([]);
  /** Full Firestore template — accrual / projected amount bump logic ke liye (form fields se merge). */
  const [recurringTemplateSnapshot, setRecurringTemplateSnapshot] = useState<RecurringVoucherTemplate | null>(null);
  /** Last auto voucher `generatedAtMs` ya `createdAt` — accrual window start (null = fallback pichhla BS due). */
  const [recurringLastGeneratedAtMs, setRecurringLastGeneratedAtMs] = useState<number | null>(null);
  /**
   * Firestore template `enabled` — Settings save / main Save ke baad sync.
   * OFF→ON: local ON + committed false → main Save block jab tak Settings me save na ho; ON→OFF turant Save allow.
   */
  const [committedAutoMonthlyEnabled, setCommittedAutoMonthlyEnabled] = useState<boolean | null>(null);
  /** Past-due gap (Generate now jaisa target): banner Create / Skip — `suppressRecurringPeriodForTemplate` ya generate se clear. */
  const [missedRecurringGap, setMissedRecurringGap] = useState<{ periodKey: string; bsY: number; bsM: number } | null>(null);
  const [missedRecurringGapScanning, setMissedRecurringGapScanning] = useState(false);
  const [skippingMissedRecurring, setSkippingMissedRecurring] = useState(false);
  /** `VoucherDialogContent` se sync — Inter Company open/edit par header lock turant (child mount se pehle flash na ho). */
  const [voucherFormActiveTab, setVoucherFormActiveTab] = useState<VoucherType>(() =>
    getVoucherType(voucher, defaultVoucherData, (rest as { defaultTab?: string }).defaultTab ?? "sale")
  );
  /** Auto recurring UI + Firestore: inner form ka current tab journal ho tab hi. */
  const showVoucherAutoRecurringUi = voucherFormActiveTab === "journal";
  /** Inter Company ribbon sub-tab — Join/Invite par Save & Copy To mat dikhao */
  const [interCompanyRibbonTab, setInterCompanyRibbonTab] = useState<InterCompanyRibbonTab>(
    () => (rest as { initialInterCompanyRibbonTab?: InterCompanyRibbonTab }).initialInterCompanyRibbonTab ?? "voucher"
  );
  /** Inter Company saved voucher — edit read-only; Copy To band; Join/Invite/Revert par bhi band */
  const copyToDisabledForInterCompany =
    voucherFormActiveTab === "inter_company" &&
    ((!!voucher?.id &&
      String((voucher as { type?: string })?.type || voucherFormActiveTab) === "inter_company") ||
      interCompanyRibbonTab !== "voucher");
  const recurringEditorsEffective = canViewRecurringOnVoucher && showVoucherAutoRecurringUi;
  /** Switch / dirty: view strip alag; toggle ON/OFF alag permission. */
  const recurringVoucherControlsEditable = recurringEditorsEffective && canToggleAutoMonthlySwitch;
  /** Strip pills / countdown: permission + journal tab + switch ON teeno */
  const recurringStripActive = recurringEditorsEffective && autoMonthlyEnabled;
  /**
   * Capacitor plain add/edit: nested `CompanyContext` override hatao — sidebar `companyId` aur form save target align rahein;
   * SQLite list recovery race par galat `clearCompanyId` + `/company` kam (Electron/web jaisa nested rehne do).
   */
  const apkLedgerPinsShellCompanyContext = useMemo(() => {
    if (!isCapacitorNativeApp()) return false;
    if (postCopyNewFormSeed) return false;
    const eid = editCompanyId?.trim();
    const ctx = String(ctxCompanyId || "").trim();
    if (eid && eid !== ctx) return false;
    return true;
  }, [postCopyNewFormSeed, editCompanyId, ctxCompanyId]);

  /** Create / edit / copy: header company dropdown jab account me 1 se zyada company ho. */
  const showHeaderCompanySelector = allCompanies.length > 1;

  /** Inter Company tab — header company sirf current (sidebar / edit) company; dropdown lock. */
  const interCompanyHeaderLockedCompanyId = useMemo(() => {
    if (voucherFormActiveTab !== "inter_company") return "";
    return String(editCompanyId?.trim() || ctxCompanyId || companyId || "").trim();
  }, [voucherFormActiveTab, editCompanyId, ctxCompanyId, companyId]);

  useEffect(() => {
    if (voucherFormActiveTab !== "inter_company") {
      setInterCompanyRibbonTab("voucher");
    }
  }, [voucherFormActiveTab]);

  const interCompanyRibbonCompanyReadOnly = useMemo(() => {
    if (voucherFormActiveTab !== "inter_company") return undefined;
    const cid = interCompanyHeaderLockedCompanyId;
    if (!cid) return undefined;
    const c =
      allCompanies.find((x) => x.id === cid) ?? (company?.id === cid ? company : null);
    const name = String(c?.name ?? company?.name ?? "").trim();
    return name || undefined;
  }, [
    voucherFormActiveTab,
    interCompanyHeaderLockedCompanyId,
    allCompanies,
    company,
  ]);

  const showLedgerHeaderCompanyDropdown =
    showHeaderCompanySelector && !interCompanyRibbonCompanyReadOnly;

  /** Header company Select: copy-draft = sirf targetCompanyId; APK shell = global setCompanyId + storage pin. */
  const handleLedgerHeaderCompanyChange = useCallback(
    (v: string) => {
      // Inter Company: target company change nahi — sirf read-only current company.
      if (voucherFormActiveTab === "inter_company") return;
      if (postCopyNewFormSeed) {
        setTargetCompanyId(v);
        return;
      }
      if (apkLedgerPinsShellCompanyContext) {
        writeSelectedCompanyId(v);
        setCompanyId(v);
        setTargetCompanyId(v);
        return;
      }
      setTargetCompanyId(v);
    },
    [voucherFormActiveTab, postCopyNewFormSeed, apkLedgerPinsShellCompanyContext, setCompanyId]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (voucherFormActiveTab !== "inter_company") return;
    const cid = interCompanyHeaderLockedCompanyId;
    if (cid && targetCompanyId !== cid) setTargetCompanyId(cid);
  }, [isOpen, voucherFormActiveTab, interCompanyHeaderLockedCompanyId, targetCompanyId]);

  /** VoucherDialogContent tab switch par call — stale link flags hatao (file upload dubara chale). */
  const clearEffectiveLinksOnTabChange = useCallback(() => {
    setEffectiveHasLinksFromForm(null);
  }, []);

  useEffect(() => {
    // Dialog open hote hi default target current/effective company rakho, taaki "Add New" me auto current company dikhe.
    if (!isOpen) return;
    setTargetCompanyId(companyId);
  }, [isOpen, companyId]);

  useEffect(() => {
    if (!isOpen) {
      // Dialog close/reset par copy-flow transient state clear rakho.
      setPostCopyNewFormSeed(null);
      setCopyMismatchCategories([]);
      setCopySourceVoucherSnapshot(null);
      setDeleteOriginalAfterCopySave(false);
      copyOriginalDeleteHandledRef.current = false;
      setCopyMasterDraftRequest(null);
      // Dialog close par recurring toggle + schedule state safe default (agli open par stale na rahe).
      setAutoMonthlyEnabled(false);
      setAutoMonthlyHydrating(false);
      setAutoMonthlyScheduleBsDay(32);
      setAutoMonthlyRateMode("none");
      setAutoMonthlyRateValue("");
      setAutoMonthlyRateEffectiveFromAd(undefined);
      setAutoMonthlyRateCadence("every_bs_month");
      setAutoMonthlyYearlyBsMonth(1);
      setAutoMonthlyYearlyBsDay(1);
      setAutoMonthlyRateEveryN("1");
      setAutoMonthlyYearlyBaseAnchorAd(undefined);
      setRecurringTemplateLastPeriodKey(null);
      setRecurringTemplateSuppressedKeys([]);
      setRecurringTemplateSnapshot(null);
      setRecurringLastGeneratedAtMs(null);
      setCommittedAutoMonthlyEnabled(null);
      setRecurringSettingsOpen(false);
      setVoucherFormActiveTab("sale");
    }
  }, [isOpen]);

  /** Journal se doosra tab: settings modal band — non-journal par Auto Monthly panel dikhe na. */
  useEffect(() => {
    if (!showVoucherAutoRecurringUi) setRecurringSettingsOpen(false);
  }, [showVoucherAutoRecurringUi]);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    const editVoucherId = voucher?.id ? String(voucher.id) : "";
    if (!editVoucherId) {
      // New voucher flow: user manually enable karega; stale edit template state carry mat karo.
      setAutoMonthlyEnabled(false);
      setAutoMonthlyHydrating(false);
      setAutoMonthlyScheduleBsDay(32);
      setAutoMonthlyRateMode("none");
      setAutoMonthlyRateValue("");
      setAutoMonthlyRateEffectiveFromAd(undefined);
      setAutoMonthlyRateCadence("every_bs_month");
      setAutoMonthlyYearlyBsMonth(1);
      setAutoMonthlyYearlyBsDay(1);
      setAutoMonthlyRateEveryN("1");
      setAutoMonthlyYearlyBaseAnchorAd(undefined);
      setRecurringTemplateLastPeriodKey(null);
      setRecurringTemplateSuppressedKeys([]);
      setRecurringTemplateSnapshot(null);
      setRecurringLastGeneratedAtMs(null);
      setCommittedAutoMonthlyEnabled(false);
      return;
    }
    let cancelled = false;
    setAutoMonthlyHydrating(true);
    void (async () => {
      try {
        const tpl = await getRecurringTemplateForVoucher(companyId, editVoucherId);
        if (cancelled) return;
        // Journal series = ek Firestore template; sirf jis voucherId par `sourceVoucherId` match ho wahi line “ON” — doosri line pe switch OFF (purana source).
        const nominalSource = String(tpl?.cloneSourceVoucherId || tpl?.sourceVoucherId || "").trim();
        const ownsRecurringTemplate = tpl?.enabled === true && nominalSource === editVoucherId;
        setRecurringTemplateSnapshot(ownsRecurringTemplate ? tpl : null);
        setAutoMonthlyEnabled(ownsRecurringTemplate);
        if (!ownsRecurringTemplate) {
          setAutoMonthlyScheduleBsDay(32);
          setAutoMonthlyRateMode("none");
          setAutoMonthlyRateValue("");
          setAutoMonthlyRateEffectiveFromAd(undefined);
          setAutoMonthlyRateCadence("every_bs_month");
          setAutoMonthlyYearlyBsMonth(1);
          setAutoMonthlyYearlyBsDay(1);
          setAutoMonthlyRateEveryN("1");
          setAutoMonthlyYearlyBaseAnchorAd(undefined);
          setRecurringTemplateLastPeriodKey(null);
          setRecurringTemplateSuppressedKeys([]);
          setRecurringLastGeneratedAtMs(null);
          setCommittedAutoMonthlyEnabled(false);
          return;
        }
        // Firestore se schedule + rate fields hydrate (recurring_voucher_templates) — tabhi jab yahi voucher active source ho.
        const d =
          typeof tpl?.scheduleBsDay === "number" && Number.isFinite(tpl.scheduleBsDay)
            ? Math.max(1, Math.min(32, Math.floor(tpl.scheduleBsDay)))
            : 32;
        setAutoMonthlyScheduleBsDay(d);
        setAutoMonthlyRateMode((tpl?.rateAdjustMode as RecurringRateAdjustMode) || "none");
        const rv = tpl?.rateAdjustValue;
        if (rv != null && typeof rv === "number" && Number.isFinite(rv) && rv !== 0) {
          setAutoMonthlyRateValue(String(rv));
        } else {
          setAutoMonthlyRateValue("");
        }
        const effIso = tpl?.rateAdjustEffectiveFrom;
        if (typeof effIso === "string" && effIso.trim()) {
          const ed = new Date(effIso);
          if (!Number.isNaN(ed.getTime())) {
            setAutoMonthlyRateEffectiveFromAd(
              new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 12, 0, 0, 0),
            );
          } else setAutoMonthlyRateEffectiveFromAd(undefined);
        } else {
          setAutoMonthlyRateEffectiveFromAd(undefined);
        }
        setAutoMonthlyRateCadence((tpl?.rateAdjustCadence as RecurringRateAdjustCadence) || "every_bs_month");
        setAutoMonthlyYearlyBsMonth(
          typeof tpl?.rateAdjustYearlyBsMonth === "number" && Number.isFinite(tpl.rateAdjustYearlyBsMonth)
            ? Math.max(1, Math.min(12, Math.floor(tpl.rateAdjustYearlyBsMonth)))
            : 1,
        );
        setAutoMonthlyYearlyBsDay(
          typeof tpl?.rateAdjustYearlyBsDay === "number" && Number.isFinite(tpl.rateAdjustYearlyBsDay)
            ? Math.max(1, Math.min(32, Math.floor(tpl.rateAdjustYearlyBsDay)))
            : 1,
        );
        const en = tpl?.rateAdjustEveryN;
        if (typeof en === "number" && Number.isFinite(en) && en >= 1) {
          setAutoMonthlyRateEveryN(String(Math.min(24, Math.floor(en))));
        } else {
          setAutoMonthlyRateEveryN("1");
        }
        const ybIso = tpl?.rateAdjustYearlyBaseAnchorIso;
        if (typeof ybIso === "string" && ybIso.trim()) {
          const ybd = new Date(ybIso);
          if (!Number.isNaN(ybd.getTime())) {
            setAutoMonthlyYearlyBaseAnchorAd(
              new Date(ybd.getFullYear(), ybd.getMonth(), ybd.getDate(), 12, 0, 0, 0),
            );
          } else setAutoMonthlyYearlyBaseAnchorAd(undefined);
        } else {
          setAutoMonthlyYearlyBaseAnchorAd(undefined);
        }
        const lp = tpl?.lastGeneratedPeriodKey;
        setRecurringTemplateLastPeriodKey(lp != null && String(lp).trim() ? String(lp) : null);
        setRecurringTemplateSuppressedKeys(
          Array.isArray(tpl?.suppressedPeriodKeys) ? (tpl!.suppressedPeriodKeys as string[]) : [],
        );
        setCommittedAutoMonthlyEnabled(true);
      } catch {
        if (cancelled) return;
        setRecurringTemplateSnapshot(null);
        setAutoMonthlyEnabled(false);
        setAutoMonthlyScheduleBsDay(32);
        setAutoMonthlyRateMode("none");
        setAutoMonthlyRateValue("");
        setAutoMonthlyRateEffectiveFromAd(undefined);
        setAutoMonthlyRateCadence("every_bs_month");
        setAutoMonthlyYearlyBsMonth(1);
        setAutoMonthlyYearlyBsDay(1);
        setAutoMonthlyRateEveryN("1");
        setAutoMonthlyYearlyBaseAnchorAd(undefined);
        setRecurringTemplateLastPeriodKey(null);
        setRecurringTemplateSuppressedKeys([]);
        setRecurringLastGeneratedAtMs(null);
        setCommittedAutoMonthlyEnabled(false);
      } finally {
        if (!cancelled) setAutoMonthlyHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId, voucher?.id]);

  /** Last auto voucher ka timestamp — accrual numerator ke liye (PC strip). */
  useEffect(() => {
    let cancelled = false;
    const vid = String(recurringTemplateSnapshot?.lastGeneratedVoucherId || "").trim();
    if (!companyId?.trim() || !vid) {
      setRecurringLastGeneratedAtMs(null);
      return;
    }
    const rawLp =
      recurringTemplateSnapshot?.lastGeneratedPeriodKey != null &&
      String(recurringTemplateSnapshot.lastGeneratedPeriodKey).trim()
        ? String(recurringTemplateSnapshot.lastGeneratedPeriodKey).trim()
        : null;
    void getDoc(doc(firestore, `companies/${companyId}/vouchers`, vid)).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        setRecurringLastGeneratedAtMs(null);
        setRecurringTemplateLastPeriodKey(null);
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      if (d.isDeleted === true) {
        setRecurringLastGeneratedAtMs(null);
        setRecurringTemplateLastPeriodKey(null);
        return;
      }
      setRecurringTemplateLastPeriodKey(rawLp);
      const meta = d.recurringMeta;
      if (meta && typeof meta === "object") {
        const g = (meta as Record<string, unknown>).generatedAtMs;
        if (typeof g === "number" && Number.isFinite(g)) {
          setRecurringLastGeneratedAtMs(g);
          return;
        }
      }
      const ca = d.createdAt;
      if (ca instanceof Timestamp) {
        setRecurringLastGeneratedAtMs(ca.toMillis());
        return;
      }
      setRecurringLastGeneratedAtMs(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    recurringTemplateSnapshot?.lastGeneratedVoucherId,
    recurringTemplateSnapshot?.lastGeneratedPeriodKey,
  ]);

  // Re-seed-on-target-change tracker: avoid loop when same target is auto-applied.
  const lastReseededTargetRef = useRef<string | null>(null);
  // Copy-draft seed version: child form ko remount karke fresh defaults pick karne ke liye monotonic counter.
  const [copyDraftSeedVersion, setCopyDraftSeedVersion] = useState(0);
  /** Save & Copy To: pehle form save, phir copy — promise resolve jab `handleAction('saved',…, newId)` aaye. */
  const saveBeforeCopyResolveRef = useRef<((id: string | null) => void) | null>(null);
  /** Save complete hone par dialog band na ho jab tak copy flow age nahi badhta. */
  const skipCloseAfterSaveForCopyRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!voucher?.id) {
      // New voucher: button should always show save+copy intent.
      setHasPendingEditChanges(true);
      return;
    }
    const detectEditDirtyFromSaveButton = () => {
      if (typeof document === "undefined") return;
      const submitButtons = Array.from(document.querySelectorAll('button[type="submit"]')) as HTMLButtonElement[];
      const saveButtons = submitButtons.filter((btn) => (btn.textContent || "").trim().toLowerCase() === "save");
      const visibleSave = saveButtons.find((btn) => btn.offsetParent !== null) || saveButtons[0];
      // Voucher forms disable Save in edit mode when no dirty changes; reuse that signal for Copy button label.
      setHasPendingEditChanges(Boolean(visibleSave && !visibleSave.disabled));
    };
    detectEditDirtyFromSaveButton();
    const id = window.setInterval(detectEditDirtyFromSaveButton, 250);
    return () => window.clearInterval(id);
  }, [isOpen, voucher?.id]);

  const wantsSaveCopyLabel = !voucher?.id || hasPendingEditChanges;
  // Mobile me compact label, desktop me full label when save+copy intent active.
  const copyButtonLabel = wantsSaveCopyLabel ? (isMobile ? "Sv & Copy To" : "Save & Copy To") : "Copy To";

  useEffect(() => {
    const frame = dialogFrameRef.current;
    if (!frame) return;
    const labels = Array.from(frame.querySelectorAll("label")) as HTMLLabelElement[];
    labels.forEach((label) => {
      if (label.dataset.copyMismatch === "1") {
        label.style.color = "";
        label.style.fontWeight = "";
        delete label.dataset.copyMismatch;
      }
    });
    if (!postCopyNewFormSeed || copyMismatchCategories.length === 0) return;
    const has = (k: string) => copyMismatchCategories.includes(k);
    labels.forEach((label) => {
      if (label.closest("[data-suppress-global-copy-red]")) return;
      const txt = (label.textContent || "").toLowerCase();
      const mark =
        ((has("account") || has("account_bank") || has("account_expense")) &&
          /(account|a\/c|pay to|pay from|purchase account|sale account|bank\/cash|bank|cash)/i.test(txt)) ||
        (has("item") && /(item|material|product|finished good)/.test(txt)) ||
        (has("party") && /(party|customer|supplier)/.test(txt)) ||
        (has("staff") && /(staff|employee)/.test(txt)) ||
        (has("tax") && /(tax)/.test(txt));
      if (mark) {
        // Selected company me no-match fields ko red label highlight karo so user save se pehle fix kare.
        label.style.color = "#dc2626";
        label.style.fontWeight = "700";
        label.dataset.copyMismatch = "1";
      }
    });
  }, [postCopyNewFormSeed, copyMismatchCategories, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const syncCopyButtonHostInActionRow = () => {
      if (copyToDisabledForInterCompany) {
        const staleHost = copyButtonHostRef.current;
        if (staleHost?.isConnected) staleHost.remove();
        copyButtonHostRef.current = null;
        setCopyButtonMountNode(null);
        return;
      }
      const frame = dialogFrameRef.current;
      if (!frame) return;
      const applyMobileButtonDistribution = (container: HTMLElement) => {
        const children = Array.from(container.children).filter((el) => (el as HTMLElement).offsetParent !== null) as HTMLElement[];
        // Reset inline overrides first so desktop or non-target counts fall back to form's original classes.
        container.style.display = "";
        container.style.flexWrap = "";
        container.style.gap = "";
        container.style.justifyContent = "";
        children.forEach((child) => {
          child.style.flex = "";
          child.style.maxWidth = "";
          child.style.minWidth = "";
        });
        // PC: mobile ne jo height/font/width inline lagaye the unhe hatao — warna desktop footer stretch reh jata.
        const clearFooterButtonInlineOverrides = (child: HTMLElement) => {
          const btn =
            child.tagName.toLowerCase() === "button"
              ? (child as HTMLButtonElement)
              : (child.querySelector("button") as HTMLButtonElement | null);
          if (!btn) return;
          btn.style.height = "";
          btn.style.fontSize = "";
          btn.style.paddingLeft = "";
          btn.style.paddingRight = "";
          btn.style.columnGap = "";
          btn.style.minWidth = "";
          btn.style.width = "";
        };
        children.forEach(clearFooterButtonInlineOverrides);
        if (!isMobile) return;
        const total = children.length;
        // Mobile distribution requested by user: 6=>3/3, 7=>3/4, 8=>4/4.
        const rows = total === 6 ? [3, 3] : total === 7 ? [3, 4] : total === 8 ? [4, 4] : null;
        if (!rows) return;
        container.style.display = "flex";
        container.style.flexWrap = "wrap";
        // Keep compact spacing while still avoiding button collision.
        container.style.gap = "6px";
        container.style.justifyContent = "flex-start";
        const widthForCols = (cols: number) =>
          cols === 4 ? "calc((100% - 18px) / 4)" : "calc((100% - 12px) / 3)";
        const applyCompactButtonStyle = (child: HTMLElement, compact: boolean) => {
          const btn =
            child.tagName.toLowerCase() === "button"
              ? (child as HTMLButtonElement)
              : (child.querySelector("button") as HTMLButtonElement | null);
          if (!btn) return;
          // For 4-buttons-in-a-row case, reduce button footprint for safer fit on narrow mobiles.
          btn.style.height = compact ? "34px" : "";
          btn.style.fontSize = compact ? "11px" : "";
          btn.style.paddingLeft = compact ? "8px" : "";
          btn.style.paddingRight = compact ? "8px" : "";
          btn.style.columnGap = compact ? "4px" : "";
          btn.style.minWidth = compact ? "0px" : "";
          // Second row (4 cols): har cell poora use ho — Sv & Copy To pehle content-width reh jata tha kyunki portal button me w-full nahi tha.
          btn.style.width = compact ? "100%" : "";
        };
        const firstRowCount = rows[0];
        children.forEach((child, index) => {
          const cols = index < firstRowCount ? rows[0] : rows[1];
          const w = widthForCols(cols);
          // Keep each row buttons same length while matching requested row counts.
          child.style.flex = `0 0 ${w}`;
          child.style.maxWidth = w;
          // Flex item default min-width:auto se equal columns bigad sakte hain; 0 se sab same slot width pe rehte hain.
          child.style.minWidth = "0";
          applyCompactButtonStyle(child, cols === 4);
        });
      };
      const allButtons = Array.from(frame.querySelectorAll("button")) as HTMLButtonElement[];
      const normalize = (txt: string) => txt.replace(/\s+/g, " ").trim().toLowerCase();
      const saveCandidates = allButtons.filter((btn) => normalize(btn.textContent || "") === "save");
      const savePrintCandidates = allButtons.filter((btn) => normalize(btn.textContent || "") === "save & print");
      const anchorBtn =
        saveCandidates.find((btn) => btn.offsetParent !== null) ||
        saveCandidates[0] ||
        savePrintCandidates.find((btn) => btn.offsetParent !== null) ||
        savePrintCandidates[0];
      if (!anchorBtn || !anchorBtn.parentElement) {
        setCopyButtonMountNode(null);
        return;
      }
      const parent = anchorBtn.parentElement;
      let host = copyButtonHostRef.current;
      let createdHost = false;
      if (!host || !host.isConnected || host.parentElement !== parent) {
        if (host && host.isConnected) host.remove();
        host = document.createElement("div");
        // PC: pehle jaisa inline host; mobile: equal-width row ke liye full cell + andar w-full button.
        host.className = isMobile ? "flex min-w-0 w-full" : "inline-flex shrink-0";
        parent.insertBefore(host, anchorBtn);
        copyButtonHostRef.current = host;
        createdHost = true;
      } else {
        // Breakpoint badle to host class bhi sync karo (resize / desktop↔mobile).
        host.className = isMobile ? "flex min-w-0 w-full" : "inline-flex shrink-0";
        if (host.nextSibling !== anchorBtn) {
          parent.insertBefore(host, anchorBtn);
        }
      }
      // Copy host DOM ke baad hi distribute karo — pehle `return` se grid miss hoti thi → Copy full row + 220ms tak flicker (APK).
      applyMobileButtonDistribution(parent);
      if (createdHost) setCopyButtonMountNode(host);
    };
    syncCopyButtonHostInActionRow();
    const intervalId = window.setInterval(syncCopyButtonHostInActionRow, 220);
    const onResize = () => syncCopyButtonHostInActionRow();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", onResize);
      const host = copyButtonHostRef.current;
      if (host && host.isConnected) host.remove();
      copyButtonHostRef.current = null;
      setCopyButtonMountNode(null);
    };
  }, [isOpen, isMobile, voucher?.id, copyButtonLabel, postCopyNewFormSeed, copyToDisabledForInterCompany]);

  // Draggable & resizable (desktop only)
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [dialogSize, setDialogSize] = useState({ w: DEFAULT_MAX_W_PX, h: DEFAULT_MAX_H_PX });
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ handle: string; startX: number; startY: number; startW: number; startH: number; startLeft: number; startTop: number } | null>(null);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) setEffectiveHasLinksFromForm(null);
  }, [isOpen, voucher?.id]);
  // Default open (both Add New & Edit): max 15"×12"; small screen 90vw×80vh. Restore saved size for Edit only (unlimited); New always default.
  useEffect(() => {
    if (!isOpen || !isDesktop || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNew = !voucher?.id;
    if (!isNew) {
      try {
        const raw = localStorage.getItem(VOUCHER_DIALOG_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved.x === "number" && typeof saved.y === "number" && typeof saved.w === "number" && typeof saved.h === "number") {
          const w = Math.max(MIN_DIALOG_W, Math.min(saved.w, vw));
          const h = Math.max(MIN_DIALOG_H, Math.min(saved.h, vh));
          const x = Math.max(0, Math.min(saved.x, vw - w));
          const y = Math.max(0, Math.min(saved.y, vh - h));
          setDialogSize({ w, h });
          setDialogPosition({ x, y });
          return;
        }
      } catch {
        /* ignore */
      }
    }
    const maxW = Math.min(DEFAULT_MAX_W_PX, vw * 0.9);
    const maxH = Math.min(DEFAULT_MAX_H_PX, vh * 0.8);
    const w = Math.max(MIN_DIALOG_W, Math.min(maxW, vw));
    const h = Math.max(MIN_DIALOG_H, Math.min(maxH, vh));
    setDialogSize({ w, h });
    setDialogPosition({ x: (vw - w) / 2, y: (vh - h) / 2 });
  }, [isOpen, isDesktop, voucher?.id]);

  useEffect(() => {
    if (prevOpenRef.current && !isOpen && isDesktop && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          VOUCHER_DIALOG_STORAGE_KEY,
          JSON.stringify({ x: dialogPosition.x, y: dialogPosition.y, w: dialogSize.w, h: dialogSize.h })
        );
      } catch {
        /* ignore */
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, isDesktop, dialogPosition.x, dialogPosition.y, dialogSize.w, dialogSize.h]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isDesktop) return;
    const t = e.target as HTMLElement;
    // Ribbon drag only — interactive controls (and radix triggers) must not start a window drag.
    if (t.closest("button, a, input, textarea, select, [role='switch'], [role='combobox'], [data-radix-select-trigger]"))
      return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: dialogPosition.x, startTop: dialogPosition.y };
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setDialogPosition({
        x: Math.max(0, dragRef.current.startLeft + e.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.startTop + e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isDesktop, dialogPosition.x, dialogPosition.y]);

  const handleResizeStart = useCallback((e: React.MouseEvent, handle: string) => {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: dialogSize.w,
      startH: dialogSize.h,
      startLeft: dialogPosition.x,
      startTop: dialogPosition.y,
    };
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { handle: h, startX, startY, startW, startH, startLeft, startTop } = resizeRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let w = startW;
      let hh = startH;
      if (h === "e" || h === "se" || h === "ne") w = Math.max(MIN_DIALOG_W, Math.min(startW + dx, vw));
      if (h === "w" || h === "sw" || h === "nw") {
        const dw = Math.min(dx, startW - MIN_DIALOG_W);
        w = Math.max(MIN_DIALOG_W, Math.min(startW - dw, vw));
      }
      if (h === "s" || h === "se" || h === "sw") hh = Math.max(MIN_DIALOG_H, Math.min(startH + dy, vh));
      if (h === "n" || h === "nw" || h === "ne") {
        const dh = Math.min(dy, startH - MIN_DIALOG_H);
        hh = Math.max(MIN_DIALOG_H, Math.min(startH - dh, vh));
      }
      setDialogSize({ w, h: hh });
      const posUpdate: { x?: number; y?: number } = {};
      if (h === "w" || h === "sw" || h === "nw") posUpdate.x = startLeft + (startW - w);
      if (h === "n" || h === "nw" || h === "ne") posUpdate.y = startTop + (startH - hh);
      if (Object.keys(posUpdate).length) setDialogPosition((prev) => ({ ...prev, ...posUpdate }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isDesktop, dialogSize.w, dialogSize.h, dialogPosition.x, dialogPosition.y]);

  // When editing, subscribe to voucher doc so unlink/allocations updates enable Save & convert
  useEffect(() => {
    // Copied-draft mode: `postCopyNewFormSeed` par naya unsaved draft dikh rahe ho — source voucher snapshot band rakho.
    // Warna onSnapshot liveVoucher ko source company se bhar deta hai aur bill/spend/link locks purani company par chipak jate hain.
    if (!isOpen || !voucher?.id || !companyId || postCopyNewFormSeed) {
      setLiveVoucher(null);
      return;
    }
    if (voucherSqlMirrorFirst) {
      // Compare Side B: voucher dusri company ka — context `vouchers` me nahi; SQLite se same company id.
      if (editCompanyId?.trim() && editCompanyId.trim() !== ctxCompanyId) {
        void listCompanyDocsFromBrowserDb(editCompanyId.trim(), "vouchers").then((rows) => {
          const localLive = rows.find((v: any) => v.id === voucher.id) || null;
          setLiveVoucher(localLive);
        });
        return;
      }
      const localLive = (vouchers || []).find((v: any) => v.id === voucher.id) || null;
      setLiveVoucher(localLive);
      return;
    }
    // Note vouchers: sale/journal jaisi live allocation sync nahi; snapshot har chhoti update par form reset trigger ho sakta tha
    if (voucher?.type === "note") {
      setLiveVoucher(null);
      return;
    }
    const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucher.id);
    const unsub = onSnapshot(voucherRef, (snap) => {
      if (snap.exists()) setLiveVoucher({ id: snap.id, ...snap.data() });
      else setLiveVoucher(null);
    });
    return () => {
      unsub();
      setLiveVoucher(null);
    };
  }, [isOpen, voucher?.id, companyId, postCopyNewFormSeed, voucher?.type, editCompanyId, ctxCompanyId, vouchers, voucherSqlMirrorFirst]);

  // Preserve clicked contra leg + ledger row context + attachments when live Firestore doc replaces table row.
  const effectiveVoucherBase = liveVoucher
    ? mergeAttachmentFieldsFromRowForEffectiveVoucher(
        mergeLedgerRowContextFromRow(liveVoucher, voucher, ledgerEntityId),
        voucher
      )
    : voucher
      ? mergeLedgerRowContextFromRow(voucher, voucher, ledgerEntityId)
      : voucher;
  const effectiveVoucher = useMemo(() => {
    if (!effectiveVoucherBase || typeof effectiveVoucherBase !== "object") return effectiveVoucherBase;
    const row = effectiveVoucherBase as Record<string, unknown>;
    // Edit form date: Drive-synced rows me timestamp-object ho sakta hai, isliye yahan Date normalize karke sab forms ko stable value do.
    const dateMs = toEpochMs(row.date) ?? toEpochMs(row.createdAt) ?? toEpochMs(row.updatedAt);
    if (!dateMs) return effectiveVoucherBase;
    return { ...row, date: new Date(dateMs) };
  }, [effectiveVoucherBase]);
  // Dialog chrome / link-locks sirf saved edit par: copied-draft session me null rakho (nahi to source voucher id se locks lag jate hain).
  const voucherForDialogChrome = postCopyNewFormSeed ? null : effectiveVoucher;
  // Bill-wise: voucher's own allocations/linked refs, OR (sale/purchase) any payment has allocations to this voucher
  const hasBillWiseLinks =
    !!voucherForDialogChrome?.id &&
    (hasPaymentLinks(voucherForDialogChrome) ||
      ((voucherForDialogChrome.type === "sale" || voucherForDialogChrome.type === "purchase") &&
        hasAllocationsToVoucherId(voucherForDialogChrome.id, vouchers || [])));
  const hasSpendWise = !!voucherForDialogChrome?.id && hasSpendWiseLinks(voucherForDialogChrome, vouchers || []);
  /** Use form-reported effective state when set (local unlink); else server-based hasLinks so banner/fields follow local changes. */
  const hasLinks = effectiveHasLinksFromForm ?? (hasBillWiseLinks || hasSpendWise);
  /**
   * Sirf saved voucher par dialog “edit lock” bhejo — nayi txn par local link/add se `onEffectiveLinksChange(true)` aata hai
   * aur pehle poor file input `deleteDisabledWhenLinked` se band ho jata tha (Add File kaam nahi karta).
   * Form ke andar amount/wagaira ab bhi local `allocations` se band rehte hain.
   */
  const isEditLockedByLinks = !!voucherForDialogChrome?.id && hasLinks;

  /** IC: target copy / source approved — dialog bhi view-only (ledger "View" jaisa). */
  const interCompanyViewOnly = useMemo(() => {
    if (!voucherForDialogChrome?.id) return false;
    if (String(voucherForDialogChrome.type || "") !== "inter_company") return false;
    return isInterCompanyVoucherEditDeleteBlocked(voucherForDialogChrome as Record<string, unknown>);
  }, [voucherForDialogChrome]);

  const effectiveForceViewOnly = forceViewOnly || interCompanyViewOnly;

  // Recycle bin view: hamesha read-only — permission check skip
  useEffect(() => {
    if (effectiveForceViewOnly) {
      setEditingDisabled(true);
    }
  }, [effectiveForceViewOnly, isOpen]);

  // Permission-based: disable edit when user cannot edit this voucher (role + ownership)
  useEffect(() => {
    if (effectiveForceViewOnly) return;
    if (!voucherForDialogChrome?.id) {
      setEditingDisabled(false);
      return;
    }
    const fetchVoucher = async (cid: string, vid: string) => {
      /** Har cid ka apna lane — APK me Side B alag storage ho sakti hai (`apkEntityWriteUsesLocalSqliteMirror`). */
      const lane = allCompanies.find((c) => c.id === cid) ?? company;
      if (apkEntityWriteUsesLocalSqliteMirror(lane)) {
        if (cid && cid !== ctxCompanyId) {
          const rows = await listCompanyDocsFromBrowserDb(cid, "vouchers");
          return rows.find((v: any) => v.id === vid) || null;
        }
        const localMatch = (vouchers || []).find((v: any) => v.id === vid);
        return localMatch || null;
      }
      const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    };
    let cancelled = false;
    determineVoucherOwnership(
      voucherForDialogChrome,
      voucherForDialogChrome.id,
      vouchers || [],
      user?.uid || "",
      companyId,
      fetchVoucher
    ).then((isOwnRecord) => {
      if (!cancelled) {
        const icLocked =
          String(voucherForDialogChrome.type || "") === "inter_company" &&
          isInterCompanyVoucherEditDeleteBlocked(voucherForDialogChrome as Record<string, unknown>);
        const canEdit = canEditRecord(isOwnRecord, voucherForDialogChrome);
        setEditingDisabled(!canEdit || icLocked);
      }
    });
    return () => { cancelled = true; };
  }, [
    voucherForDialogChrome?.id,
    voucherForDialogChrome?.isApproved,
    voucherForDialogChrome?.type,
    companyId,
    user?.uid,
    vouchers,
    canEditRecord,
    ctxCompanyId,
    allCompanies,
    company,
    effectiveForceViewOnly,
  ]);

  const voucherDialogTitle =
    effectiveForceViewOnly && !!voucher?.id ? "View Trxn" : !!voucher?.id ? "Edit Trxn" : "New Trxn";

  /** Copy-draft header: source doc par delete permission ho to hi checkbox dikhao. */
  const showDeleteOriginalCopyCheckbox = useMemo(() => {
    if (!postCopyNewFormSeed || !copySourceVoucherSnapshot?.id || forceViewOnly) return false;
    return canDeleteVoucher(copySourceVoucherSnapshot);
  }, [postCopyNewFormSeed, copySourceVoucherSnapshot, canDeleteVoucher, forceViewOnly]);

  /** Copied Draft (New) + optional delete-original checkbox — desktop/mobile header reuse. */
  const copiedDraftHeaderBadge = postCopyNewFormSeed ? (
    <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0">
      <p
        className={cn(
          "m-0 font-semibold leading-tight text-emerald-700",
          isMobile ? "text-[10px]" : "text-[10px] md:text-xs"
        )}
      >
        Copied Draft (New)
        {copyMismatchCategories.length > 0 ? " - Fix red fields" : ""}
      </p>
      {showDeleteOriginalCopyCheckbox ? (
        <label
          className={cn(
            "flex cursor-pointer select-none items-center gap-1.5",
            forceViewOnly && "pointer-events-none opacity-60"
          )}
        >
          <Checkbox
            checked={deleteOriginalAfterCopySave}
            disabled={forceViewOnly}
            onCheckedChange={(v) => setDeleteOriginalAfterCopySave(v === true)}
            className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")}
            aria-label="Delete original voucher after save"
          />
          <span
            className={cn(
              "whitespace-nowrap font-medium text-emerald-900",
              isMobile ? "text-[10px]" : "text-[10px] md:text-xs"
            )}
          >
            Delete original voucher
          </span>
        </label>
      ) : null}
    </div>
  ) : null;

  // Block edit rule: when history full + setting "Block edit", disable Save (user must clear history first)
  // Re-run when company changes so live voucher settings (from Settings) apply immediately
  useEffect(() => {
    if (!companyId || !voucherForDialogChrome?.id) {
      setHistoryBlocksEdit(false);
      return;
    }
    let cancelled = false;
    getEffectiveHistorySettings(companyId).then(({ enabled, limit, fullBehavior }) => {
      if (cancelled) return;
      const existingHistory = Array.isArray(voucherForDialogChrome?.history) ? voucherForDialogChrome.history : [];
      const blocks = enabled && fullBehavior === 'block_edit' && existingHistory.length >= limit;
      setHistoryBlocksEdit(blocks);
    });
    return () => { cancelled = true; };
  }, [companyId, voucherForDialogChrome?.id, voucherForDialogChrome?.history, company?.voucherHistoryFullBehavior, company?.voucherHistoryEnabled, company?.voucherHistoryLimit]);

  // Show Approve / Save & Approve for any existing voucher if user can approve (approved voucher: enable when form has changes)
  const showApproveButton =
    !!voucherForDialogChrome?.id &&
    can("approve_transactions") &&
    !apkOfflineViewOnly &&
    !forceViewOnly;

  const showSaveAndApproveOnCreate =
    !voucherForDialogChrome?.id &&
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    !apkOfflineViewOnly &&
    !forceViewOnly;

  const handleApprove = useCallback(async () => {
    const cid = String(editCompanyId?.trim() || ctxCompanyId || "");
    const activeContextCompanyId = String(ctxCompanyId || "").trim();
    // Copied-draft par approve sirf source saved doc ke liye — chrome me id nahi dikhate, yahan bhi guard.
    if (!cid || !effectiveVoucher?.id || postCopyNewFormSeed || isApproving || !user?.uid) return;
    // APK cloud offline: approve Firestore call fail + galat UX — pehle roko.
    if (apkOfflineViewOnly) {
      toast.warning("Offline — view only. Connect to approve.");
      return;
    }
    // APK/mobile: kuch parent / global effect approve ke baad silently `/dashboard` push kar deta hai — guard poll + restore (native ~8s).
    armDashboardRedirectGuard(router, { isMobile: ledgerModalGuardWide });
    plNavDbg("AddVoucherDialog.handleApprove.start", {
      cidHint: plNavDbgIdHint(cid),
      voucherId: effectiveVoucher?.id,
    });
    setIsApproving(true);
    const voucherId = String(effectiveVoucher.id);
    const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
    const toastId = toast.loading("Approving...");
    // Pehle hi persist: SQLite/outbox busy ho to bhi readSelectedCompanyId empty na ho, /company push na ho.
    try {
      if (typeof window !== "undefined") writeSelectedCompanyId(cid);
    } catch {
      /* ignore */
    }
    if (!activeContextCompanyId || activeContextCompanyId !== cid) {
      setCompanyId(cid);
    }
    // Capacitor plain voucher: approve bhi async write — company pin shield (Save jaisa).
    if (isCapacitorNativeApp() && apkLedgerPinsShellCompanyContext) {
      beginApkLedgerAsyncWriteShield({ pinCompanyId: cid });
    }
    // Dialog turant band — approve API background me.
    if (!(isStaticAppBuild() && isMobile)) {
      props.onVoucherAction?.("saved");
    }
    onOpenChange?.(false);
    setIsApproving(false);

    void (async () => {
      try {
        await approveVoucherWithHistory(cid, voucherId, user.uid, approverName);
        try {
          if (typeof window !== "undefined") writeSelectedCompanyId(cid);
        } catch {
          /* ignore */
        }
        toast.success("Transaction approved.", { id: toastId, duration: 1000 });
      } catch (e) {
        toast.error("Failed to approve transaction.", { id: toastId });
      }
    })();
  }, [
    editCompanyId,
    ctxCompanyId,
    effectiveVoucher?.id,
    postCopyNewFormSeed,
    isApproving,
    user?.uid,
    user?.displayName,
    user?.email,
    customUser?.displayName,
    setCompanyId,
    props.onVoucherAction,
    onOpenChange,
    isMobile,
    ledgerModalGuardWide,
    router,
    apkOfflineViewOnly,
  ]);

  const prepareCopyDraftForCompany = useCallback(async (sourceVoucherId?: string, minSavedAtMs?: number) => {
    // Save & Copy To: copied-draft mode me form target company context me save hota hai;
    // source read bhi wahi current save-context company se lo, warna stale old seed copy ho sakta hai.
    // Re-seed/company-switch me bhi source always original opening company hi rahe;
    // warna source=target ho kar mismatch detect nahi hota aur old ids pass-through ho jate hain.
    const sourceCompanyId = String(companyId || "").trim();
    const destinationCompanyId = String(targetCompanyIdRef.current || targetCompanyId || "").trim();
    /** Source lane: APK Firestore-company par local mirror fallback copy-race ko bigaad sakta tha (`apkEntityWriteUsesLocalSqliteMirror`). */
    const sourceLaneCompany = allCompanies.find((c) => c.id === sourceCompanyId) ?? company ?? null;
    const readLocalVoucherStaleFallback = apkEntityWriteUsesLocalSqliteMirror(sourceLaneCompany);
    if (!sourceCompanyId || !destinationCompanyId) {
      toast.error("Company not selected.");
      return null;
    }
    if (!user?.uid) {
      toast.error("User not authenticated.");
      return null;
    }
    const voucherIdToCopy = String(sourceVoucherId || effectiveVoucher?.id || "").trim();
    setIsCopyingToCompany(true);
    try {
      let sourceDoc: Record<string, any> | null = null;
      if (voucherIdToCopy) {
        // Save & Copy To me stale seed fallback bilkul na ho: freshly saved voucher hi source hona chahiye.
        for (let attempt = 0; attempt < 6; attempt++) {
          const snap = await getDoc(doc(firestore, `companies/${sourceCompanyId}/vouchers`, voucherIdToCopy));
          if (snap.exists()) {
            const docCandidate = { id: snap.id, ...(snap.data() as Record<string, any>) };
            const updatedMs = toEpochMs((docCandidate as any).updatedAt);
            // Save & Copy To: just-saved write ka updatedAt milne tak wait karo; purana snapshot copy na ho.
            const isFreshEnough = minSavedAtMs == null || updatedMs == null || updatedMs >= (minSavedAtMs - 1200);
            if (isFreshEnough) {
              sourceDoc = docCandidate;
              break;
            }
          }
          // APK local lane: save ke baad row browser DB pehle aa sakta hai; Firestore lane par isse purana mirror copy na ho.
          if (readLocalVoucherStaleFallback) {
            const localRow =
              (await getCompanyDocFromBrowserDb(sourceCompanyId, "vouchers", voucherIdToCopy) as Record<string, any> | null) ?? null;
            if (localRow) {
              const updatedMs = toEpochMs((localRow as any).updatedAt);
              const isFreshEnough = minSavedAtMs == null || updatedMs == null || updatedMs >= (minSavedAtMs - 1200);
              if (isFreshEnough) {
                sourceDoc = localRow;
                break;
              }
            }
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 180));
        }
        if (!sourceDoc) {
          toast.error("Saved voucher is not ready for copy yet. Please try once again.");
          return null;
        }
      } else {
        // Re-seed/company-change flow: explicit voucher id na ho to current in-memory draft snapshot use karo.
        sourceDoc =
          (postCopyNewFormSeed as Record<string, any> | null)
          ?? (effectiveVoucher as Record<string, any> | null)
          ?? (defaultVoucherData as Record<string, any> | null);
        if (!sourceDoc) {
          toast.error("Source voucher not found for copy.");
          return null;
        }
      }
      const targetCompanyDoc = allCompanies.find((c) => c.id === destinationCompanyId) || null;
      const nextVoucherNumber = await getNextVoucherNumberForTarget(destinationCompanyId, targetCompanyDoc, sourceDoc);
      const cleaned = resetCrossLinksForCopy(sourceDoc);
      const { remapped, unmatchedNames, unmatchedCategories } = await remapVoucherReferencesByName(
        sourceCompanyId,
        destinationCompanyId,
        cleaned,
        allCompanies
      );
      const { id: _sourceVoucherDocId, ...remappedSansId } = remapped as Record<string, unknown>;
      const copyPayloadBase = {
        ...remappedSansId,
        voucherNumber: nextVoucherNumber,
        // Cross-company create me stale approval carry na ho; target voucher fresh pending/editable rahe.
        isApproved: false,
      };
      const importedCopy = await importVoucherAttachmentsAsFilesForLocalCloudCopy({
        targetCompanyId: destinationCompanyId,
        voucher: copyPayloadBase,
      });
      const copyPayload = importedCopy.voucher;
      const nextNewFormSeed = {
        ...copyPayload,
        // New form seed me voucher number fresh auto/entry ke liye blank rakho.
        voucherNumber: nextVoucherNumber,
        defaultTab: defaultTabFromVoucherLike(copyPayload),
      };
      return {
        copiedId: null,
        nextNewFormSeed,
        unmatchedNames,
        unmatchedCategories,
        // Missing-master helper ko source company ids chahiye hote hain; snapshot preserve karo.
        sourceSnapshot: sourceDoc,
      };
    } catch (err: any) {
      toast.error(err?.message || "Copy to company failed.");
      return null;
    } finally {
      setIsCopyingToCompany(false);
    }
  }, [companyId, targetCompanyId, user?.uid, effectiveVoucher?.id, allCompanies, postCopyNewFormSeed, effectiveVoucher, defaultVoucherData, company]);

  /** Party/bank/target me create-save ke baad mismatch list dubara ginti — Copy buttons stale na rahein (`accountName` match ab mila ho). */
  const refreshCopyMismatchAfterMasterSave = useCallback(async () => {
    const destinationCompanyId = String(targetCompanyIdRef.current || targetCompanyId || "").trim();
    const sourceCompanyId = companyId.trim();
    if (!postCopyNewFormSeed || !copySourceVoucherSnapshot || !sourceCompanyId || !destinationCompanyId) return;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 400));
    try {
      const cleaned = resetCrossLinksForCopy(copySourceVoucherSnapshot);
      const { unmatchedCategories } = await remapVoucherReferencesByName(
        sourceCompanyId,
        destinationCompanyId,
        cleaned,
        allCompanies
      );
      setCopyMismatchCategories(unmatchedCategories);
    } catch {
      /* Firestore list race par ignore — user fir save / company change kar sakta hai */
    }
  }, [companyId, targetCompanyId, postCopyNewFormSeed, copySourceVoucherSnapshot, allCompanies]);

  /** Quartet (PI/PO/DInc/DExp) tabs switch — prefilled Create_* dialog cancel + mismatch recount; tab-click se dialog na khule. */
  const onCashflowQuadTabNavigate = useCallback(() => {
    setCopyMasterDraftRequest(null);
    void refreshCopyMismatchAfterMasterSave();
  }, [refreshCopyMismatchAfterMasterSave]);

  const openCopyMasterDraftForCategory = useCallback(async (category: string, opts?: CopyMissingMasterOpts) => {
    const sourceCompanyId = companyId;
    const destinationCompanyId = String(targetCompanyIdRef.current || targetCompanyId || "").trim();
    if (!sourceCompanyId || !destinationCompanyId || !copySourceVoucherSnapshot) return;
    const collectionsToCopy = mapMismatchCategoryToCollections(category);
    const candidateIdsBucket = new Set<string>();
    collectLikelyReferenceIds(copySourceVoucherSnapshot, candidateIdsBucket);
    const candidateIds = Array.from(candidateIdsBucket);
    const targetCompanyNameResolved =
      allCompanies.find((c) => c.id === destinationCompanyId)?.name || "selected company";
    const sourceLaneCompany = allCompanies.find((c) => c.id === sourceCompanyId) ?? null;
    const destLaneCompany = allCompanies.find((c) => c.id === destinationCompanyId) ?? null;

    /** Jo row/side user ne Copy dabaya — seed snapshot ki exact master id pehle; baaki Set order par depend na ho. */
    const preferredMasterIds = resolvePreferredSourceMasterIdsFromSnapshot(copySourceVoucherSnapshot, opts);
    const applyTarget =
      opts &&
      (opts.journalLineIndex !== undefined ||
        opts.contraAccountField !== undefined ||
        opts.addSalaryField !== undefined)
        ? opts
        : undefined;

    /** Target में यह naam pehle se hai क्या — टर्मिनोलॉजी bank/expense/name सब.cover. */
    const collectTargetLowerNames = (rows: Record<string, any>[]): Set<string> => {
      const s = new Set<string>();
      for (const row of rows) {
        const n = normalizeMasterMatchKey(masterRowCanonicalName(row));
        if (n) s.add(n);
      }
      return s;
    };

    for (const collectionName of collectionsToCopy) {
      const sourceRows = await loadCollectionRows(sourceCompanyId, collectionName, sourceLaneCompany);
      const targetRows = await loadCollectionRows(destinationCompanyId, collectionName, destLaneCompany);
      const targetNameSet = collectTargetLowerNames(targetRows as Record<string, any>[]);
      const sourceById = new Map(sourceRows.map((row) => [String(row.id || ""), row]));

      let chosenAnyFallback: Record<string, any> | null = null;

      const orderedCandidates = orderMasterCandidatesForCollection(candidateIds, preferredMasterIds, sourceById);

      for (const sourceId of orderedCandidates) {
        const sourceRow = sourceById.get(sourceId);
        if (!sourceRow) continue;
        const sourceNameCanon = masterRowCanonicalName(sourceRow as Record<string, unknown>);
        if (!sourceNameCanon) continue;
        const lower = normalizeMasterMatchKey(sourceNameCanon);
        const missingInTarget = !targetNameSet.has(lower);

        const payloadClean = stripIdsForCrossCompanyClone(sourceRow as Record<string, unknown>);

        if (missingInTarget) {
          setCopyMasterDraftRequest({
            category,
            targetCompanyName: targetCompanyNameResolved,
            sourceCollection: collectionName,
            sourceName: sourceNameCanon,
            sourceRowPayload: payloadClean,
            applyTarget,
          });
          return;
        }
        if (!chosenAnyFallback) chosenAnyFallback = sourceRow as Record<string, any>;
      }

      if (chosenAnyFallback) {
        const nm = masterRowCanonicalName(chosenAnyFallback as Record<string, unknown>);
        const payloadClean = stripIdsForCrossCompanyClone(chosenAnyFallback as Record<string, unknown>);
        setCopyMasterDraftRequest({
          category,
          targetCompanyName: targetCompanyNameResolved,
          sourceCollection: collectionName,
          sourceName: nm,
          sourceRowPayload: payloadClean,
          applyTarget,
        });
        return;
      }
    }
    const normalizedCategory = category.replace(/_/g, " ");
    const isBankAccountCase = category === "account_bank" || category === "account";
    const formalMessage = isBankAccountCase
      ? "No bank account reference is available in the copied source voucher for this action. You attempted to copy a bank account, but this draft appears to come from a voucher context where a bank account was not present for the mapped line. Please select or create a bank account in this form, or copy from a source voucher that contains the required bank account reference."
      : `No referenced ${normalizedCategory} master was found in the copied source voucher for this action. This can happen while converting between voucher types when entities do not map one-to-one. Please create/select the required master in this form, or copy from a source voucher that contains the required ${normalizedCategory} reference.`;
    setCopyMissingMasterPopup({
      open: true,
      title: "Reference Not Available For Copy",
      message: formalMessage,
    });
  }, [companyId, targetCompanyId, copySourceVoucherSnapshot, allCompanies]);

  // Copy-draft mode me dropdown se target company badle to form ko naye target ke hisaab se auto re-seed karo:
  // voucher number target company ka next number, party/account/item IDs naye company me name-match se remap.
  // Bina iske old company ke account/voucher number stale dikhte rehte hain (issue user-reported).
  useEffect(() => {
    if (!isOpen) {
      lastReseededTargetRef.current = null;
      return;
    }
    if (!postCopyNewFormSeed) return;
    if (!targetCompanyId) return;
    if (lastReseededTargetRef.current === targetCompanyId) return;
    let cancelled = false;
    (async () => {
      const res = await prepareCopyDraftForCompany(voucher?.id ? String(voucher.id) : undefined);
      if (cancelled || !res?.nextNewFormSeed) return;
      // NOTE: Global setCompanyId(targetCompanyId) deliberately skipped — main page ki company change nahi karni.
      // Dialog ke andar override CompanyContext provider naye target ko forms ka save target banata hai.
      setPostCopyNewFormSeed(res.nextNewFormSeed);
      setCopyMismatchCategories(res.unmatchedCategories || []);
      setCopySourceVoucherSnapshot((res as any).sourceSnapshot || null);
      setEffectiveHasLinksFromForm(null);
      setLiveVoucher(null);
      lastReseededTargetRef.current = targetCompanyId;
      // Re-seed par form remount: naye target company ka voucherNumber/accounts purane state ki jagah lagein.
      setCopyDraftSeedVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    targetCompanyId,
    isOpen,
    postCopyNewFormSeed,
    prepareCopyDraftForCompany,
    voucher?.id,
  ]);

  /** Sync last-generated / suppressed keys after save, Generate now, or settings persist — drives “Next:” strip. */
  const refreshRecurringTemplateMeta = useCallback(async (cid: string, vid: string) => {
    try {
      const t = await getRecurringTemplateForVoucher(cid, vid);
      setRecurringTemplateSnapshot(t?.enabled === true ? t : null);
      const lp = t?.lastGeneratedPeriodKey;
      setRecurringTemplateLastPeriodKey(lp != null && String(lp).trim() ? String(lp) : null);
      setRecurringTemplateSuppressedKeys(
        Array.isArray(t?.suppressedPeriodKeys) ? (t!.suppressedPeriodKeys as string[]) : [],
      );
    } catch {
      setRecurringTemplateSnapshot(null);
      setRecurringTemplateLastPeriodKey(null);
      setRecurringTemplateSuppressedKeys([]);
    }
  }, []);

  /** Multi-gap picker dismiss: kabhi parent voucher dialog bhi band (main Save ne defer kiya ho to). */
  const closeRecurringGeneratePickerDismiss = useCallback(() => {
    const closeParent = recurringPickerCloseParentRef.current;
    recurringPickerCloseParentRef.current = false;
    setRecurringGeneratePicker(null);
    if (closeParent) onOpenChange?.(false);
  }, [onOpenChange]);

  // Dialog khule + Auto ON: Firestore template ke hisaab se past-due gap scan — user Create / Skip choose kare.
  useEffect(() => {
    if (
      !isOpen ||
      !companyId?.trim() ||
      !voucher?.id ||
      !autoMonthlyEnabled ||
      autoMonthlyHydrating ||
      !recurringTemplateSnapshot?.enabled ||
      !recurringEditorsEffective
    ) {
      setMissedRecurringGap(null);
      setMissedRecurringGapScanning(false);
      return;
    }
    let cancelled = false;
    setMissedRecurringGapScanning(true);
    setMissedRecurringGap(null);
    void (async () => {
      try {
        const vid = String(voucher.id).trim();
        const docId = await getRecurringTemplateDocIdForVoucher(companyId, vid);
        const gap = await getPastDueRecurringGapIfAny(companyId, docId, recurringTemplateSnapshot, new Date());
        if (!cancelled) setMissedRecurringGap(gap);
      } catch {
        if (!cancelled) setMissedRecurringGap(null);
      } finally {
        if (!cancelled) setMissedRecurringGapScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    companyId,
    voucher?.id,
    autoMonthlyEnabled,
    autoMonthlyHydrating,
    recurringTemplateSnapshot,
    recurringEditorsEffective,
  ]);

  /** Past-due banner: BS month name + optional AD (template schedule day se due). */
  const missedRecurringBannerDetail = useMemo(() => {
    if (!missedRecurringGap || !recurringTemplateSnapshot) return "";
    const { bsY, bsM } = missedRecurringGap;
    const dayRaw = recurringTemplateSnapshot.scheduleBsDay;
    const dayNum =
      typeof dayRaw === "number" && Number.isFinite(dayRaw) ? Math.max(1, Math.min(32, Math.floor(dayRaw))) : 32;
    const dim = getBSMonthDays(bsY)[bsM - 1] || 30;
    const dueD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
    let dueAd: Date;
    try {
      dueAd = bsToAd({ y: bsY, m: bsM, d: dueD });
    } catch {
      return `${NEPALI_MONTHS[Math.max(0, Math.min(11, bsM - 1))] ?? ""} ${bsY}`;
    }
    const bsLine = `${NEPALI_MONTHS[Math.max(0, Math.min(11, bsM - 1))] ?? ""} ${bsY} · day ${dueD}`;
    if (dateSystem === "AD") return `${bsLine} (${formatDate(dueAd)})`;
    if (dateSystem === "BS") return `${bsLine} (${formatDateBS(dueAd)})`;
    return `${bsLine} (${formatDateBS(dueAd)} / ${formatDate(dueAd)})`;
  }, [missedRecurringGap, recurringTemplateSnapshot, dateSystem, formatDate, formatDateBS]);

  /** AD `Date` for strip “Next auto” + desktop countdown (due local day ke end tak). */
  const autoVoucherNextDueAd = useMemo(() => {
    if (!recurringStripActive || !voucher?.id || autoMonthlyHydrating) return null;
    return getNextRecurringDueAd(
      autoMonthlyScheduleBsDay,
      new Date(),
      recurringTemplateLastPeriodKey,
      recurringTemplateSuppressedKeys,
    );
  }, [
    recurringStripActive,
    voucher?.id,
    autoMonthlyHydrating,
    autoMonthlyScheduleBsDay,
    recurringTemplateLastPeriodKey,
    recurringTemplateSuppressedKeys,
  ]);

  /** Green pill: BS/AD due date only — pink strip se alag chip. */
  const autoVoucherNextRunDatePillText = useMemo(() => {
    if (!autoVoucherNextDueAd) return null;
    const next = autoVoucherNextDueAd;
    if (dateSystem === "AD") return formatDate(next);
    if (dateSystem === "BS") return formatDateBS(next);
    return `${formatDateBS(next)} (${formatDate(next)})`;
  }, [autoVoucherNextDueAd, dateSystem, formatDate, formatDateBS]);

  /** Due din ke local end tak — countdown `N days HH:MM:SS` (dialog open par mobile + desktop). */
  const [autoVoucherDesktopCountdownTick, setAutoVoucherDesktopCountdownTick] = useState(0);
  useEffect(() => {
    // Dialog open + due date: har device par countdown tick (mobile par bhi PC jaisa pill).
    if (!isOpen || !autoVoucherNextDueAd) return;
    const id = window.setInterval(() => setAutoVoucherDesktopCountdownTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [isOpen, autoVoucherNextDueAd]);

  const autoVoucherDesktopCountdownSuffix = useMemo(() => {
    if (!isOpen || !autoVoucherNextDueAd) return null;
    void autoVoucherDesktopCountdownTick;
    const n = autoVoucherNextDueAd;
    const end = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
    let ms = end.getTime() - Date.now();
    const pad2 = (v: number) => String(v).padStart(2, "0");
    if (ms <= 0) return "· ( due now )";
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const rem = totalSec % 86400;
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = rem % 60;
    const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    // 20.5d → `20 days 12:00:00` jaisa; &lt;1 din sirf `HH:MM:SS`.
    if (days <= 0) return `· ( in ${clock} )`;
    const dayWord = days === 1 ? "day" : "days";
    return `· ( in ${days} ${dayWord} ${clock} )`;
  }, [isOpen, autoVoucherNextDueAd, autoVoucherDesktopCountdownTick]);

  /** Dialog schedule/rate + Firestore snapshot merge — projected “next auto” amount jaisa bump. */
  const recurringTemplateForProjection = useMemo((): RecurringVoucherTemplate | null => {
    if (!recurringTemplateSnapshot?.enabled) return null;
    const cad = recurringRateCadencePayload(
      autoMonthlyRateMode,
      autoMonthlyRateCadence,
      autoMonthlyYearlyBsMonth,
      autoMonthlyYearlyBsDay,
    );
    return {
      ...recurringTemplateSnapshot,
      scheduleBsDay: autoMonthlyScheduleBsDay,
      rateAdjustMode: autoMonthlyRateMode,
      rateAdjustValue: recurringRatePayload(autoMonthlyRateMode, autoMonthlyRateValue),
      rateAdjustEffectiveFrom: recurringRateEffectiveFromForSave(autoMonthlyRateMode, autoMonthlyRateEffectiveFromAd),
      ...cad,
      rateAdjustEveryN: recurringRateEveryNForSave(autoMonthlyRateMode, autoMonthlyRateEveryN),
      rateAdjustYearlyBaseAnchorIso: recurringYearlyBaseAnchorForSave(
        autoMonthlyRateMode,
        autoMonthlyRateCadence,
        autoMonthlyYearlyBaseAnchorAd,
      ),
    };
  }, [
    recurringTemplateSnapshot,
    autoMonthlyScheduleBsDay,
    autoMonthlyRateMode,
    autoMonthlyRateValue,
    autoMonthlyRateEffectiveFromAd,
    autoMonthlyRateCadence,
    autoMonthlyYearlyBsMonth,
    autoMonthlyYearlyBsDay,
    autoMonthlyRateEveryN,
    autoMonthlyYearlyBaseAnchorAd,
  ]);

  const recurringAccrualPeriodStartMs = useMemo(() => {
    if (!autoVoucherNextDueAd || !recurringTemplateForProjection) return null;
    return computeRecurringAccrualPeriodStartMs(
      recurringTemplateForProjection,
      autoVoucherNextDueAd,
      recurringLastGeneratedAtMs,
      recurringTemplateLastPeriodKey,
    );
  }, [
    autoVoucherNextDueAd,
    recurringTemplateForProjection,
    recurringLastGeneratedAtMs,
    recurringTemplateLastPeriodKey,
  ]);

  /** Agle due par banne wali (rate-adjusted) rashi — form + live voucher se. */
  const autoVoucherProjectedNextTotal = useMemo(() => {
    if (!autoVoucherNextDueAd || !recurringTemplateForProjection || !effectiveVoucher) return null;
    const noonLocal = new Date(
      autoVoucherNextDueAd.getFullYear(),
      autoVoucherNextDueAd.getMonth(),
      autoVoucherNextDueAd.getDate(),
      12,
      0,
      0,
      0,
    );
    const bs = adToBs(noonLocal);
    const n = projectNextRecurringMonetaryTotal(
      recurringTemplateForProjection,
      effectiveVoucher as Record<string, unknown>,
      { y: bs.y, m: bs.m },
    );
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [autoVoucherNextDueAd, recurringTemplateForProjection, effectiveVoucher]);

  /** Linear accrual — (elapsed / period) × projected next; har sec tick ke saath (mobile + desktop). */
  const autoVoucherDesktopAccruedLabel = useMemo(() => {
    if (!isOpen) return null;
    void autoVoucherDesktopCountdownTick;
    if (
      autoVoucherProjectedNextTotal == null ||
      recurringAccrualPeriodStartMs == null ||
      !autoVoucherNextDueAd
    ) {
      return null;
    }
    const n = autoVoucherNextDueAd;
    const endMs = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999).getTime();
    const startMs = recurringAccrualPeriodStartMs;
    const totalSpan = endMs - startMs;
    if (totalSpan <= 0) return null;
    const frac = Math.min(1, Math.max(0, (Date.now() - startMs) / totalSpan));
    const raw = autoVoucherProjectedNextTotal * frac;
    const rounded = Math.round(raw * 100) / 100;
    return formatCurrencyForPrint(rounded, { noSuffix: true, showDrCr: false });
  }, [
    isOpen,
    autoVoucherDesktopCountdownTick,
    autoVoucherProjectedNextTotal,
    recurringAccrualPeriodStartMs,
    autoVoucherNextDueAd,
    formatCurrencyForPrint,
  ]);

  // ✅ handleAction मा pathsToDelete थपियो
  const handleAction = useCallback(async (
    status: 'saved' | 'cancelled', 
    isSaveAndNew?: boolean, 
    newId?: string, 
    pathsToDelete: string[] = [] // यहाँ एरे प्राप्त हुन्छ
  ) => {
    const skipDialogCloseForSaveCopy = skipCloseAfterSaveForCopyRef.current && status === "saved";
    /** Kai missing months picker khula ho to voucher dialog turant band na ho (user tick / cancel kare). */
    let suppressMainDialogCloseForRecurringPicker = false;

    // Copy-draft: naya voucher save ho chuka — tick par source recycle-bin (role delete permission).
    if (
      status === "saved" &&
      postCopyNewFormSeed &&
      deleteOriginalAfterCopySave &&
      !copyOriginalDeleteHandledRef.current &&
      copySourceVoucherSnapshot?.id &&
      user?.uid
    ) {
      copyOriginalDeleteHandledRef.current = true;
      const srcCompanyId = String(companyId || "").trim();
      const srcVoucherId = String(copySourceVoucherSnapshot.id).trim();
      if (srcCompanyId && srcVoucherId) {
        if (canDeleteVoucher(copySourceVoucherSnapshot)) {
          try {
            await softDeleteVoucherMoveToRecycleBin(srcCompanyId, srcVoucherId, user.uid);
            toast.success("Original voucher moved to recycle bin.");
            setDeleteOriginalAfterCopySave(false);
          } catch (err: unknown) {
            console.error("[AddVoucherDialog] copy-delete original failed", err);
            toast.error(
              err instanceof Error ? err.message : "New voucher saved but original could not be deleted."
            );
          }
        } else {
          toast.error("New voucher saved. You do not have permission to delete the original voucher.");
          setDeleteOriginalAfterCopySave(false);
        }
      }
    }

    // Static ledger (mobile + desktop wide): SQLite flush ke baad `/dashboard` push — guard pehle arm (native ~8s window).
    if (status === "saved") {
      plNavDbg("AddVoucherDialog.handleAction.saved.armGuard", {
        ledgerModalWide: ledgerModalGuardWide,
        pinCapacitorShell: apkLedgerPinsShellCompanyContext,
        hint: plNavDbgIdHint(companyId),
      });
      armDashboardRedirectGuard(router, { isMobile: ledgerModalGuardWide });
    }

    // Capacitor plain voucher: sidebar company + SQLite selection pin — list recovery transient null se `/company` avoid.
    if (
      status === "saved" &&
      isCapacitorNativeApp() &&
      apkLedgerPinsShellCompanyContext &&
      !skipDialogCloseForSaveCopy
    ) {
      const pinId = String(targetCompanyIdRef.current || companyId || "").trim();
      if (pinId) {
        plNavDbg("AddVoucherDialog.handleAction.saved.pinCompanyShield", {
          hint: plNavDbgIdHint(pinId),
          apkLedgerPinsShellCompanyContext,
        });
        writeSelectedCompanyId(pinId);
        setCompanyId(pinId);
        beginApkLedgerAsyncWriteShield({ pinCompanyId: pinId });
      }
    }

    // १–२. Storage / unassigned cleanup — dialog band hone ke baad background (Save pe turant close).
    const pathsToDeleteCopy = [...pathsToDelete];
    const unassignedFileId =
      status === "saved" ? String(defaultVoucherData?.unassignedFile?.id || "").trim() : "";
    const cleanupCompanyId = companyId;

    // ३. Propagate action — pehle parent ko saved batao + dialog band (static/offline par niche recurring `getDoc` await se form mat chipke)
    let keepDialogAsNew = Boolean(isSaveAndNew);
    if (status === "saved" && keepDialogAsNew) {
      // Save & New: next fresh voucher par auto-monthly stale ON state carry mat karo.
      setAutoMonthlyEnabled(false);
      setAutoMonthlyScheduleBsDay(32);
      setAutoMonthlyRateMode("none");
      setAutoMonthlyRateValue("");
      setAutoMonthlyRateEffectiveFromAd(undefined);
      setAutoMonthlyRateCadence("every_bs_month");
      setAutoMonthlyYearlyBsMonth(1);
      setAutoMonthlyYearlyBsDay(1);
      setAutoMonthlyRateEveryN("1");
      setAutoMonthlyYearlyBaseAnchorAd(undefined);
      setRecurringTemplateLastPeriodKey(null);
      setRecurringTemplateSuppressedKeys([]);
      setRecurringTemplateSnapshot(null);
      setRecurringLastGeneratedAtMs(null);
      setCommittedAutoMonthlyEnabled(false);
    }
    if (status === "cancelled") {
      setPostCopyNewFormSeed(null);
      setCopyMismatchCategories([]);
      setCopySourceVoucherSnapshot(null);
      setDeleteOriginalAfterCopySave(false);
      copyOriginalDeleteHandledRef.current = false;
    }
    if (props.onVoucherAction) {
      props.onVoucherAction(status, keepDialogAsNew, newId);
    }

    // Save & Copy To: parent notify ke baad waiter ko id do — `prepareCopyDraftForCompany` Firestore se saved doc uth sake.
    if (status === "saved" && saveBeforeCopyResolveRef.current) {
      const resolve = saveBeforeCopyResolveRef.current;
      saveBeforeCopyResolveRef.current = null;
      resolve(newId ?? (voucher?.id ? String(voucher.id) : null));
    }
    if (skipDialogCloseForSaveCopy) {
      skipCloseAfterSaveForCopyRef.current = false;
    }
  
    if (!keepDialogAsNew && !skipDialogCloseForSaveCopy && !suppressMainDialogCloseForRecurringPicker) {
      onOpenChange?.(false);
    }

    if (status === "saved" && (pathsToDeleteCopy.length > 0 || (unassignedFileId && cleanupCompanyId))) {
      void (async () => {
        if (pathsToDeleteCopy.length > 0) {
          console.log("Cleaning up files from storage...");
          for (const path of pathsToDeleteCopy) {
            try {
              const fileRef = ref(storage, path);
              await deleteObject(fileRef);
              console.log("Deleted:", path);
            } catch (error) {
              console.error("Failed to delete file:", path, error);
            }
          }
        }
        if (unassignedFileId && cleanupCompanyId) {
          try {
            const laneForFirestoreCleanup = company;
            if (!apkEntityWriteUsesLocalSqliteMirror(laneForFirestoreCleanup)) {
              const fileDocRef = doc(
                firestore,
                `companies/${cleanupCompanyId}/unassigned_documents`,
                unassignedFileId
              );
              await deleteDoc(fileDocRef);
            }
          } catch (error) {
            console.error("Failed to delete unassigned document:", error);
          }
        }
      })();
    }

    /** Auto Monthly / recurring — har action apni permission; view-only se Firestore mat likho. */
    if (status === "saved" && companyId) {
      const savedVoucherIdForRecurring = String(newId || voucher?.id || "").trim();
      if (savedVoucherIdForRecurring) {
        void (async () => {
          const sourceType = String(voucher?.type || defaultVoucherData?.type || "journal");
          const isJournalSaved = sourceType === "journal";
          if (autoMonthlyEnabled && isJournalSaved) {
            if (
              !canTurnOnRecurringAutoMonthlyOnSave(
                can,
                committedAutoMonthlyEnabled === true || recurringTemplateSnapshot?.enabled === true,
              )
            ) {
              return;
            }
            try {
              await setRecurringTemplateForVoucher(companyId, {
                sourceVoucherId: savedVoucherIdForRecurring,
                sourceVoucherType: sourceType,
                enabled: true,
                actorUserId: user?.uid,
                actorName: customUser?.displayName || user?.displayName || user?.email || null,
                scheduleBsDay: autoMonthlyScheduleBsDay,
                rateAdjustMode: autoMonthlyRateMode,
                rateAdjustValue: recurringRatePayload(autoMonthlyRateMode, autoMonthlyRateValue),
                rateAdjustEffectiveFrom: recurringRateEffectiveFromForSave(
                  autoMonthlyRateMode,
                  autoMonthlyRateEffectiveFromAd
                ),
                ...recurringRateCadencePayload(
                  autoMonthlyRateMode,
                  autoMonthlyRateCadence,
                  autoMonthlyYearlyBsMonth,
                  autoMonthlyYearlyBsDay
                ),
                rateAdjustEveryN: recurringRateEveryNForSave(autoMonthlyRateMode, autoMonthlyRateEveryN),
                rateAdjustYearlyBaseAnchorIso: recurringYearlyBaseAnchorForSave(
                  autoMonthlyRateMode,
                  autoMonthlyRateCadence,
                  autoMonthlyYearlyBaseAnchorAd
                ),
              });
              void refreshRecurringTemplateMeta(companyId, savedVoucherIdForRecurring);
              setCommittedAutoMonthlyEnabled(true);

              // Company recurring ON (default) + permission → save ke baad auto-generate try
              if (
                isRecurringVoucherGenerationEnabled(company) &&
                canGenerateRecurringOnVoucher &&
                !apkOfflineViewOnly &&
                user?.uid &&
                !isSaveAndNew &&
                !skipDialogCloseForSaveCopy
              ) {
                try {
                  const tplFresh = await getRecurringTemplateForVoucher(companyId, savedVoucherIdForRecurring);
                  if (tplFresh?.enabled) {
                    const activeLine = String(tplFresh.cloneSourceVoucherId || tplFresh.sourceVoucherId || "").trim();
                    if (!activeLine || activeLine === savedVoucherIdForRecurring) {
                      const templateDocId = await getRecurringTemplateDocIdForVoucher(
                        companyId,
                        savedVoucherIdForRecurring
                      );
                      const slots = await listMissingRecurringPeriodSlotsAscending(
                        companyId,
                        templateDocId,
                        tplFresh,
                        new Date()
                      );
                      if (slots.length >= 2) {
                        recurringPickerCloseParentRef.current = true;
                        setRecurringGeneratePicker({
                          open: true,
                          slots,
                          selected: Object.fromEntries(slots.map((s) => [s.periodKey, false])),
                          voucherId: savedVoucherIdForRecurring,
                          templateForSchedule: tplFresh,
                        });
                      }
                    }
                  }
                } catch {
                  /* gap list optional */
                }
              }
            } catch (recErr) {
              toast.error(recErr instanceof Error ? recErr.message : "Auto Monthly save failed.");
            }
          } else if (!autoMonthlyEnabled && isJournalSaved) {
            if (!canEditRecurringOnVoucher) return;
            try {
              if (!preferLocalLedgerReads() && !apkEmbeddedSqliteFirstWritesPreferred()) {
                await clearRecurringTemplateForVoucher(companyId, savedVoucherIdForRecurring);
              }
            } catch {
              /* offline */
            }
            setRecurringTemplateLastPeriodKey(null);
            setRecurringTemplateSuppressedKeys([]);
            setRecurringTemplateSnapshot(null);
            setRecurringLastGeneratedAtMs(null);
            setCommittedAutoMonthlyEnabled(false);
          }
        })();
      }
    }
  }, [
    onOpenChange,
    companyId,
    company,
    can,
    autoMonthlyEnabled,
    autoMonthlyScheduleBsDay,
    autoMonthlyRateMode,
    autoMonthlyRateValue,
    autoMonthlyRateEffectiveFromAd,
    autoMonthlyRateCadence,
    autoMonthlyYearlyBsMonth,
    autoMonthlyYearlyBsDay,
    autoMonthlyRateEveryN,
    autoMonthlyYearlyBaseAnchorAd,
    user?.uid,
    user?.displayName,
    user?.email,
    customUser?.displayName,
    defaultVoucherData?.type,
    defaultVoucherData?.unassignedFile?.id,
    props,
    voucher?.id,
    voucher?.type,
    router,
    ledgerModalGuardWide,
    apkLedgerPinsShellCompanyContext,
    setCompanyId,
    refreshRecurringTemplateMeta,
    canAddRecurringOnVoucher,
    canEditRecurringOnVoucher,
    canGenerateRecurringOnVoucher,
    committedAutoMonthlyEnabled,
    recurringTemplateSnapshot?.enabled,
    apkOfflineViewOnly,
    postCopyNewFormSeed,
    deleteOriginalAfterCopySave,
    copySourceVoucherSnapshot,
    canDeleteVoucher,
  ]);

  /**
   * Auto Monthly **modal** ka Save: sirf schedule + rate Firestore me (jab recurring pehle se main Save se ON ho).
   * Header switch / template ON-OFF yahan commit nahi — woh sirf voucher dialog ke Save par (`handleAction` + `setRecurringTemplateForVoucher`).
   */
  const persistRecurringScheduleRateOnly = useCallback(async (): Promise<boolean> => {
    if (!canEditRecurringOnVoucher) {
      toast.error("You need “Edit Auto Monthly settings” permission.");
      return false;
    }
    const vid = String(voucher?.id || "").trim();
    if (!companyId?.trim() || !vid) {
      toast.error("Save the voucher first, then configure Auto Monthly.");
      return false;
    }
    // Abhi tak server par recurring ON nahi — modal values sirf local state; Firestore mat chhedo.
    if (committedAutoMonthlyEnabled !== true) {
      return true;
    }
    let sourceType = String(voucher?.type || defaultVoucherData?.type || "journal");
    try {
      const savedSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, vid));
      if (savedSnap.exists()) {
        const d = savedSnap.data() as Record<string, unknown>;
        sourceType = String(d.type || sourceType || "journal");
      }
    } catch {
      /* snapshot fail par inferred type */
    }
    if (sourceType !== "journal") {
      toast.error("Auto Monthly applies only to journal vouchers.");
      return false;
    }
    await setRecurringTemplateForVoucher(companyId, {
      sourceVoucherId: vid,
      sourceVoucherType: sourceType,
      enabled: true,
      actorUserId: user?.uid,
      actorName: customUser?.displayName || user?.displayName || user?.email || null,
      scheduleBsDay: autoMonthlyScheduleBsDay,
      rateAdjustMode: autoMonthlyRateMode,
      rateAdjustValue: recurringRatePayload(autoMonthlyRateMode, autoMonthlyRateValue),
      rateAdjustEffectiveFrom: recurringRateEffectiveFromForSave(autoMonthlyRateMode, autoMonthlyRateEffectiveFromAd),
      ...recurringRateCadencePayload(
        autoMonthlyRateMode,
        autoMonthlyRateCadence,
        autoMonthlyYearlyBsMonth,
        autoMonthlyYearlyBsDay,
      ),
      rateAdjustEveryN: recurringRateEveryNForSave(autoMonthlyRateMode, autoMonthlyRateEveryN),
      rateAdjustYearlyBaseAnchorIso: recurringYearlyBaseAnchorForSave(
        autoMonthlyRateMode,
        autoMonthlyRateCadence,
        autoMonthlyYearlyBaseAnchorAd,
      ),
    });
    return true;
  }, [
    companyId,
    voucher?.id,
    voucher?.type,
    defaultVoucherData?.type,
    committedAutoMonthlyEnabled,
    autoMonthlyScheduleBsDay,
    autoMonthlyRateMode,
    autoMonthlyRateValue,
    autoMonthlyRateEffectiveFromAd,
    autoMonthlyRateCadence,
    autoMonthlyYearlyBsMonth,
    autoMonthlyYearlyBsDay,
    autoMonthlyRateEveryN,
    autoMonthlyYearlyBaseAnchorAd,
    user?.uid,
    user?.displayName,
    user?.email,
    customUser?.displayName,
    canEditRecurringOnVoucher,
  ]);

  const handleSaveRecurringSettingsClick = useCallback(async () => {
    if (!canEditRecurringOnVoucher) return;
    if (!showVoucherAutoRecurringUi) return;
    setSavingRecurringSettings(true);
    try {
      const ok = await persistRecurringScheduleRateOnly();
      if (ok) {
        const vid = String(voucher?.id || "").trim();
        if (committedAutoMonthlyEnabled === true && companyId?.trim() && vid) {
          toast.success("Auto Monthly settings saved.");
          void refreshRecurringTemplateMeta(companyId, vid);
          // Purana voucher + “ab tak” missing months — 2+ ho to backfill choice (Generate default = oldest gap first).
          if (!apkOfflineViewOnly && user?.uid) {
            try {
              const tpl = await getRecurringTemplateForVoucher(companyId, vid);
              const activeLine = String(tpl?.cloneSourceVoucherId || tpl?.sourceVoucherId || "").trim();
              // Sirf jis voucher par switch ON hai — warna Generate / backfill “another line” error.
              if (tpl?.enabled && (!activeLine || activeLine === vid)) {
                const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, vid);
                const slots = await listMissingRecurringPeriodSlotsAscending(companyId, templateDocId, tpl, new Date());
                if (slots.length >= 2) {
                  recurringPickerCloseParentRef.current = false;
                  setRecurringGeneratePicker({
                    open: true,
                    slots,
                    selected: Object.fromEntries(slots.map((s) => [s.periodKey, false])),
                    voucherId: vid,
                    templateForSchedule: tpl,
                  });
                }
              }
            } catch {
              /* optional prompt — ignore */
            }
          }
        } else {
          toast.success("Schedule saved. Save the voucher to apply Auto Monthly.");
        }
        setRecurringSettingsOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingRecurringSettings(false);
    }
  }, [
    canEditRecurringOnVoucher,
    showVoucherAutoRecurringUi,
    persistRecurringScheduleRateOnly,
    committedAutoMonthlyEnabled,
    companyId,
    voucher?.id,
    refreshRecurringTemplateMeta,
    apkOfflineViewOnly,
    user?.uid,
  ]);

  /** Generate now: 1 missing = seedha create; 2+ = tick list popup (hover tooltip nahi). */
  const handleGenerateRecurringNowClick = useCallback(async () => {
    if (!canGenerateRecurringOnVoucher) {
      toast.error("You need “Generate recurring voucher now” permission (Manage Sharing → Recurring Auto Voucher).");
      return;
    }
    if (!showVoucherAutoRecurringUi) {
      toast.error("Open the Journal tab to use Auto Monthly.");
      return;
    }
    if (String(voucher?.type || "").trim() !== "journal") {
      toast.error("Auto Monthly runs only on journal vouchers.");
      return;
    }
    if (apkOfflineViewOnly) {
      toast.warning("Offline — view only. Connect to update.");
      return;
    }
    const vid = String(voucher?.id || "").trim();
    if (!companyId?.trim() || !vid || !user?.uid) {
      toast.error("Save the voucher first.");
      return;
    }
    if (!isRecurringVoucherGenerationEnabled(company)) {
      toast.error("Company auto recurring is off.");
      return;
    }

    recurringPickerCloseParentRef.current = false;
    setRecurringGeneratePickerPrep(true);
    try {
      const tpl = await getRecurringTemplateForVoucher(companyId, vid);
      if (!tpl?.enabled) {
        toast.warning("Enable Auto Monthly and save the voucher first.");
        return;
      }
      const activeLine = String(tpl.cloneSourceVoucherId || tpl.sourceVoucherId || "").trim();
      if (activeLine && activeLine !== vid) {
        toast.warning("Auto Monthly is active on another line in this series. Open that voucher to generate.");
        return;
      }
      const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, vid);
      const slots = await listMissingRecurringPeriodSlotsAscending(companyId, templateDocId, tpl, new Date());
      if (slots.length === 0) {
        toast.info("No missing auto months in range (or all already created).");
        return;
      }
      if (slots.length >= 2) {
        setRecurringGeneratePicker({
          open: true,
          slots,
          selected: Object.fromEntries(slots.map((s) => [s.periodKey, false])),
          voucherId: vid,
          templateForSchedule: tpl,
        });
        return;
      }
      setGeneratingRecurringNow(true);
      const res = await generateRecurringVoucherNow(companyId, company, vid, {
        uid: user.uid,
        email: user.email ?? null,
        displayName: customUser?.displayName || user.displayName || null,
      });
      if (res.ok) {
        toast.success(res.message);
        void refreshRecurringTemplateMeta(companyId, res.voucherId?.trim() || vid);
      } else toast.warning(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setRecurringGeneratePickerPrep(false);
      setGeneratingRecurringNow(false);
    }
  }, [
    canGenerateRecurringOnVoucher,
    showVoucherAutoRecurringUi,
    apkOfflineViewOnly,
    companyId,
    company,
    voucher?.id,
    voucher?.type,
    user,
    customUser?.displayName,
    refreshRecurringTemplateMeta,
  ]);

  /** Tick list: 1+ tick = sirf wahi months; 0 tick = sabse recent missing month ek (pickStrategy latest). */
  const handleRecurringGeneratePickerConfirm = useCallback(async () => {
    const p = recurringGeneratePicker;
    if (!p?.open || !companyId?.trim() || !user?.uid) return;
    const vid = String(p.voucherId || "").trim();
    const chosen = p.slots.filter((s) => p.selected[s.periodKey] === true);
    const closeParentAfter = recurringPickerCloseParentRef.current;
    recurringPickerCloseParentRef.current = false;
    setRecurringGeneratePicker(null);
    setGeneratingRecurringNow(true);
    try {
      if (chosen.length === 0) {
        const res = await generateRecurringVoucherNow(
          companyId,
          company,
          vid,
          {
            uid: user.uid,
            email: user.email ?? null,
            displayName: customUser?.displayName || user.displayName || null,
          },
          { pickStrategy: "latest" },
        );
        if (res.ok) {
          toast.success(res.message);
          void refreshRecurringTemplateMeta(companyId, res.voucherId?.trim() || vid);
          if (closeParentAfter) onOpenChange?.(false);
        } else toast.warning(res.message);
      } else {
        const r = await generateRecurringVouchersForPeriodSlots(
          companyId,
          company,
          vid,
          {
            uid: user.uid,
            email: user.email ?? null,
            displayName: customUser?.displayName || user.displayName || null,
          },
          chosen,
        );
        if (r.ok) {
          toast.success(r.message);
          void refreshRecurringTemplateMeta(companyId, r.lastVoucherId?.trim() || vid);
          if (closeParentAfter) onOpenChange?.(false);
        } else toast.warning(r.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGeneratingRecurringNow(false);
    }
  }, [
    recurringGeneratePicker,
    companyId,
    company,
    user,
    customUser?.displayName,
    refreshRecurringTemplateMeta,
    onOpenChange,
  ]);

  /** Past-due row: Skip = period `suppressedPeriodKeys` me — sirf upcoming auto; Create = `generateRecurringVoucherNow` (same target). */
  const handleSkipMissedRecurringClick = useCallback(async () => {
    if (!canEditRecurringOnVoucher) {
      toast.error("You need “Edit Auto Monthly settings” permission (Manage Sharing → Recurring Auto Voucher).");
      return;
    }
    if (!showVoucherAutoRecurringUi) {
      toast.error("Open the Journal tab to use Auto Monthly.");
      return;
    }
    if (String(voucher?.type || "").trim() !== "journal") {
      toast.error("Auto Monthly applies only to journal vouchers.");
      return;
    }
    if (apkOfflineViewOnly) {
      toast.warning("Offline — view only. Connect to update.");
      return;
    }
    const vid = String(voucher?.id || "").trim();
    const pk = missedRecurringGap?.periodKey?.trim();
    if (!companyId?.trim() || !vid || !pk) return;
    setSkippingMissedRecurring(true);
    try {
      await suppressRecurringPeriodForTemplate(companyId, vid, pk);
      toast.success("Skipped. Only upcoming scheduled runs will apply.");
      void refreshRecurringTemplateMeta(companyId, vid);
      setMissedRecurringGap(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not skip.");
    } finally {
      setSkippingMissedRecurring(false);
    }
  }, [
    canEditRecurringOnVoucher,
    showVoucherAutoRecurringUi,
    apkOfflineViewOnly,
    companyId,
    voucher?.id,
    voucher?.type,
    missedRecurringGap?.periodKey,
    refreshRecurringTemplateMeta,
  ]);

  // Purple ribbon = drag handle only; white auto strip is a sibling below so it never stacks above the ribbon while dragging.
  const headerBlock = (
    <>
      <DialogHeader
        className={cn(
          "border-b bg-[#b8c8f5] dark:bg-[#7a8ed8] text-gray-900 dark:text-white flex flex-col justify-center shrink-0 relative z-20",
          isDesktop ? cn("p-0", (isEditLockedByLinks || historyBlocksEdit) && "min-h-[unset]") : "px-2 py-1.5 pb-1.5 gap-1",
        )}
      >
        {isDesktop ? (
          <div
            className={cn(
              "cursor-grab active:cursor-grabbing select-none",
              (isEditLockedByLinks || historyBlocksEdit) && "min-h-[unset]",
            )}
            onMouseDown={handleDragStart}
          >
            <div className="flex flex-col justify-center px-3 py-2 md:px-4 md:py-2">
              {isEditLockedByLinks ? (
                // 3-equal wing grid: beechna ribbon header ke geometric center rahe — company dropdown width se shift na ho.
                <div className="grid min-h-[2.75rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
                  <div className="flex min-w-0 shrink flex-row flex-wrap items-center gap-x-2 gap-y-0 justify-self-start self-center pr-2">
                    <DialogTitle className="m-0 font-bold font-headline text-inherit text-xl leading-tight">
                      {voucherDialogTitle}
                    </DialogTitle>
                    {copiedDraftHeaderBadge}
                  </div>
                  <div
                    className="justify-self-center self-center shrink-0 rounded-full border border-gray-300/80 bg-gray-200 px-2 py-1.5 md:px-3 md:py-2 inline-flex w-fit max-w-[min(52vw,560px)]"
                  >
                    <p className="font-semibold text-center text-[#ff0000] m-0 leading-snug text-sm whitespace-nowrap">
                      Voucher Edit disabled — To convert or edit, unlink linked transactions first.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-row items-center justify-end justify-self-end self-center gap-[10px]">
                    <VoucherDialogDateSystemSwitcher />
                    {interCompanyRibbonCompanyReadOnly ? (
                      <span
                        className="h-9 inline-flex max-w-[22vw] shrink items-center truncate rounded-full border border-emerald-300/80 bg-emerald-50 px-3 text-sm font-medium text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                        title={interCompanyRibbonCompanyReadOnly}
                      >
                        {interCompanyRibbonCompanyReadOnly}
                      </span>
                    ) : showLedgerHeaderCompanyDropdown ? (
                      <Select value={targetCompanyId || ""} onValueChange={handleLedgerHeaderCompanyChange}>
                        <SelectTrigger className="h-9 min-w-[9rem] w-auto max-w-[22vw] shrink rounded-full border-emerald-300/80 bg-emerald-50">
                          <SelectValue placeholder="Company" />
                        </SelectTrigger>
                        <SelectContent>
                          {allCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <DialogClose className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none shrink-0">
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </DialogClose>
                  </div>
                </div>
              ) : (
                <div className={cn("flex w-full min-w-0 flex-nowrap items-center gap-2")}>
                  <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0">
                    <DialogTitle className="m-0 font-bold font-headline text-inherit text-xl leading-tight">
                      {voucherDialogTitle}
                    </DialogTitle>
                    {copiedDraftHeaderBadge}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-[10px]">
                    <VoucherDialogDateSystemSwitcher />
                    {interCompanyRibbonCompanyReadOnly ? (
                      <span
                        className="h-9 inline-flex max-w-[22vw] shrink items-center truncate rounded-full border border-emerald-300/80 bg-emerald-50 px-3 text-sm font-medium text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                        title={interCompanyRibbonCompanyReadOnly}
                      >
                        {interCompanyRibbonCompanyReadOnly}
                      </span>
                    ) : showLedgerHeaderCompanyDropdown ? (
                      <Select value={targetCompanyId || ""} onValueChange={handleLedgerHeaderCompanyChange}>
                        <SelectTrigger className="h-9 min-w-[9rem] w-auto max-w-[22vw] shrink rounded-full border-emerald-300/80 bg-emerald-50">
                          <SelectValue placeholder="Company" />
                        </SelectTrigger>
                        <SelectContent>
                          {allCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <DialogClose className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none shrink-0">
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </DialogClose>
                  </div>
                </div>
              )}
              {historyBlocksEdit && !isEditLockedByLinks && (
                <div
                  className={cn(
                    "mt-2 w-full max-w-full mx-auto bg-amber-600 rounded-md flex items-center justify-center self-center",
                    "min-h-[52px] px-4 py-3 w-fit",
                  )}
                >
                  <p className="font-semibold text-center text-white m-0 text-base md:text-xl leading-snug">
                    Voucher history is full. Clear history in History dialog to edit and save changes.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: neeli patti — title + (optional link lock banner) + gear slot; gear par capture stop taaki dialog/scroll drag interfere na kare */}
            <div className={cn("flex w-full min-w-0 gap-2 items-start justify-between")}>
              <div
                className={cn(
                  "flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0",
                  recurringEditorsEffective ? "pr-1 min-w-0 flex-1" : "pr-8",
                )}
              >
                <DialogTitle className="m-0 font-bold font-headline text-inherit text-base leading-tight">
                  {voucherDialogTitle}
                </DialogTitle>
                {copiedDraftHeaderBadge}
              </div>
              {isEditLockedByLinks && (
                <div className="min-w-0 max-w-[min(100%,14rem)] flex-1 rounded-full border border-gray-300/80 bg-gray-200 px-2 py-1.5">
                  <p className="m-0 text-center text-[10px] font-semibold leading-snug text-[#ff0000]">
                    To Edit Unlink Linked trxn 1st
                  </p>
                </div>
              )}
              {recurringEditorsEffective ? (
                <div
                  className="shrink-0 self-center pl-0.5"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDownCapture={(e) => e.stopPropagation()}
                  onTouchStartCapture={(e) => e.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    style={{
                      height: SWITCH_TRACK_HEIGHT_PX,
                      minHeight: SWITCH_TRACK_HEIGHT_PX,
                      width: SWITCH_TRACK_HEIGHT_PX,
                    }}
                    className="rounded-full border-indigo-400/90 bg-white/90 p-0 text-indigo-900 shadow-sm hover:bg-white"
                    disabled={autoMonthlyHydrating || !autoMonthlyEnabled || !canEditRecurringOnVoucher}
                    onClick={() => setRecurringSettingsOpen(true)}
                    aria-label="Auto monthly settings"
                  >
                    <Settings className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>
            {historyBlocksEdit && !isEditLockedByLinks && (
              <div className="mt-1 w-full max-w-full mx-auto bg-amber-600 rounded-md flex items-center justify-center self-center px-2 py-1">
                <p className="font-semibold text-center text-white m-0 text-[11px] leading-snug">
                  Voucher history is full. Clear history in History dialog to edit and save changes.
                </p>
              </div>
            )}
          </>
        )}
      </DialogHeader>
      {forceViewOnly && typeof recycleBinOnRestore === "function" && (
        <div
          role="status"
          className="relative z-20 flex shrink-0 flex-col gap-2 border-b border-amber-300/90 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="m-0 text-sm font-semibold leading-snug text-amber-950">
            This voucher is in the recycle bin. Restore it to edit or save changes.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-full border-amber-600/50 bg-white px-3 text-amber-950 hover:bg-amber-100"
            disabled={recycleBinRestoring}
            onClick={() => recycleBinOnRestore()}
          >
            {recycleBinRestoring ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Restore
          </Button>
        </div>
      )}
      {recurringEditorsEffective && (
        // White strip below ribbon only — not inside drag layer (`z-20` stack above resize hit-zones).
        <div className="relative z-20 flex shrink-0 flex-col gap-1 border-b border-indigo-200/70 bg-white px-2 py-1 text-xs text-indigo-900">
          {missedRecurringGapScanning ? (
            <p className="m-0 text-[11px] font-medium text-indigo-600/90">Checking missed schedule…</p>
          ) : null}
          {missedRecurringGap && !missedRecurringGapScanning ? (
            <div
              role="status"
              className="flex min-w-0 flex-col gap-1.5 rounded-md border border-amber-400/90 bg-amber-50 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="m-0 min-w-0 text-[11px] font-semibold leading-snug text-amber-950">
                A scheduled auto-create date has already passed ({missedRecurringBannerDetail}) but no voucher exists for
                that period. Create it now, or skip so only upcoming runs apply.
              </p>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 rounded-full px-3 text-[11px] font-semibold"
                  disabled={
                    savingRecurringSettings ||
                    generatingRecurringNow ||
                    skippingMissedRecurring ||
                    autoMonthlyHydrating ||
                    !voucher?.id ||
                    !user?.uid ||
                    !canGenerateRecurringOnVoucher ||
                    apkOfflineViewOnly ||
                    editingDisabled ||
                    historyBlocksEdit
                  }
                  onClick={() => void handleGenerateRecurringNowClick()}
                >
                  {generatingRecurringNow ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create now"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-3 text-[11px] font-semibold"
                  disabled={
                    savingRecurringSettings ||
                    generatingRecurringNow ||
                    skippingMissedRecurring ||
                    autoMonthlyHydrating ||
                    !voucher?.id ||
                    !canEditRecurringOnVoucher ||
                    apkOfflineViewOnly ||
                    editingDisabled ||
                    historyBlocksEdit
                  }
                  onClick={() => void handleSkipMissedRecurringClick()}
                >
                  {skippingMissedRecurring ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Skipping…
                    </>
                  ) : (
                    "Skip"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
          {/* Mobile: pills baein horizontal scroll; Settings+Switch scroll ke bahar — switch hamesha daen fix. Desktop: pills flex-wrap, controls daen. */}
          <div className="flex w-full min-w-0 items-center gap-2">
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-x-1.5 gap-y-1",
                // Mobile: sirf yahan overflow — switch column alag; scrollbar-x-voucher-pills = patla/dim (mouse) ya chhupa (touch)
                isMobile ? "flex-nowrap overflow-x-auto pb-0.5 scrollbar-x-voucher-pills" : "flex-wrap",
              )}
            >
              {/* ON: desktop/mobile dono par label + day select ek hi pink pill (PC jaisa). */}
              {autoMonthlyEnabled ? (
                <div
                  style={{ minHeight: SWITCH_TRACK_HEIGHT_PX }}
                  className={cn(
                    "box-border inline-flex min-h-0 max-w-full flex-nowrap items-center gap-2 rounded-full border border-pink-400/85 bg-pink-100 py-0 text-[11px] font-semibold leading-none text-pink-950 shadow-sm",
                    isMobile ? "shrink-0 px-1.5" : "px-2.5",
                  )}
                >
                  <span className="m-0 shrink-0 leading-snug">auto voucher create</span>
                  <Select
                    value={String(autoMonthlyScheduleBsDay)}
                    onValueChange={(v) => setAutoMonthlyScheduleBsDay(parseInt(v, 10) || 32)}
                    disabled={autoMonthlyHydrating || !canEditRecurringOnVoucher}
                  >
                    <SelectTrigger
                      style={{ height: SWITCH_TRACK_HEIGHT_PX, minHeight: SWITCH_TRACK_HEIGHT_PX }}
                      className="box-border h-auto min-h-0 w-[min(100%,12.5rem)] shrink-0 rounded-md border-0 bg-transparent px-0 py-0 text-[11px] font-semibold leading-none text-pink-950 shadow-none hover:bg-pink-200/45 focus:ring-1 focus:ring-pink-400/55 focus:ring-offset-0 data-[placeholder]:text-pink-950 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-pink-800 [&>span]:line-clamp-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(50vh,280px)]">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          Day {d}
                        </SelectItem>
                      ))}
                      <SelectItem value="32">{calLab.lastDayOfScheduledMonth}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="m-0 shrink-0 font-semibold leading-snug">auto voucher create</p>
              )}
              {autoVoucherNextRunDatePillText ? (
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-1.5",
                    isMobile ? "min-w-0 shrink-0 flex-nowrap" : "flex-wrap",
                  )}
                >
                  <span
                    style={{ height: SWITCH_TRACK_HEIGHT_PX, minHeight: SWITCH_TRACK_HEIGHT_PX }}
                    className={cn(
                      "inline-flex min-h-0 min-w-0 max-w-full flex-nowrap items-center gap-1 rounded-full border border-pink-400/85 bg-pink-100 px-2 py-0 text-[11px] font-medium leading-none text-pink-950 shadow-sm box-border",
                    )}
                  >
                    <span className="shrink-0 leading-none">Next auto voucher will be created on</span>
                    <span
                      className="shrink-0 text-[11px] font-semibold tabular-nums leading-none text-pink-950"
                      title="Scheduled due date (BS month day / last day when applicable)."
                    >
                      {autoVoucherNextRunDatePillText}
                    </span>
                    {autoVoucherDesktopCountdownSuffix ? (
                      <span
                        className="whitespace-nowrap tabular-nums font-semibold leading-none text-pink-950"
                        title="Time left until end of the scheduled due day (local)."
                      >
                        {autoVoucherDesktopCountdownSuffix}
                      </span>
                    ) : null}
                  </span>
                  {autoVoucherDesktopAccruedLabel ? (
                    <span
                      style={{ height: SWITCH_TRACK_HEIGHT_PX, minHeight: SWITCH_TRACK_HEIGHT_PX }}
                      className="inline-flex max-w-full shrink-0 items-center rounded-full border border-gray-300/90 bg-gray-200 px-2 py-0 text-[11px] font-semibold tabular-nums leading-none text-gray-900 shadow-sm box-border"
                      title="Estimated amount accrued so far toward the next auto voucher (linear by time)."
                    >
                      Till now amount accrued {autoVoucherDesktopAccruedLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className={cn(
                "flex shrink-0 items-center gap-2",
                // Mobile: safed piche pills scroll overlap na dikhe; halka shadow daen se edge clear
                isMobile && "bg-white pl-1.5 shadow-[-10px_0_12px_-8px_rgba(255,255,255,1)]",
              )}
            >
              {/* Mobile: Settings text chhupa — neeli header me gear pehle se; desktop: yahan label. */}
              {!isMobile ? (
                <Button
                  type="button"
                  variant="outline"
                  style={{ height: SWITCH_TRACK_HEIGHT_PX, minHeight: SWITCH_TRACK_HEIGHT_PX }}
                  className="border-indigo-300 bg-white px-2 py-0 text-[11px] leading-none text-indigo-900 hover:bg-indigo-100"
                  disabled={autoMonthlyHydrating || !autoMonthlyEnabled || !canEditRecurringOnVoucher}
                  onClick={() => setRecurringSettingsOpen(true)}
                >
                  Settings
                </Button>
              ) : null}
              {/* Id/Src sirf generated voucher ki narration me — header me duplicate mat dikhao (user request). */}
              <Switch
                checked={autoMonthlyEnabled}
                onCheckedChange={setAutoMonthlyEnabled}
                disabled={autoMonthlyHydrating || !recurringEditorsEffective || !canToggleAutoMonthlySwitch}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Har render naya `{ companyId, voucherId }` object = FilePreview blob effect dubara + thumb flash; ref stable rakho.
  const voucherAttachmentFallbackValue = useMemo(
    () =>
      companyId && effectiveVoucher?.id ? { companyId, voucherId: String(effectiveVoucher.id) } : null,
    [companyId, effectiveVoucher?.id]
  );

  // Dialog-scope CompanyContext override: copy/compare me target alag ho sakta hai. Capacitor plain add/edit: shell context direct use.
  const overriddenCompanyContextValue = useMemo(() => {
    if (apkLedgerPinsShellCompanyContext) {
      return outerCompanyContext;
    }
    const targetCompanyDoc =
      allCompanies.find((c) => c.id === (targetCompanyId || "")) ?? ctxCompany ?? null;
    return {
      ...outerCompanyContext,
      companyId: targetCompanyId || outerCompanyContext.companyId,
      company: targetCompanyDoc,
    };
  }, [apkLedgerPinsShellCompanyContext, outerCompanyContext, targetCompanyId, allCompanies, ctxCompany]);

  /**
   * Copy-to / compare-edit: dialog company ≠ shell → nested `VoucherProvider` se doosri company ke masters.
   * Plain same-company edit/add: outer layout ka `useVouchers` pehle se sahi — dubara poori company load mat chalao (open freeze kam).
   */
  const needsNestedVoucherProvider = useMemo(() => {
    const shellId = String(ctxCompanyId || "").trim();
    if (apkLedgerPinsShellCompanyContext) return false;
    // Header company change: target ≠ sidebar shell → nested masters (create/edit/copy sab).
    const dest = String(targetCompanyId || shellId).trim();
    return dest !== shellId;
  }, [apkLedgerPinsShellCompanyContext, targetCompanyId, ctxCompanyId]);

  /** Auto switch Settings modal se commit nahi — sirf main voucher Save; forms ko block karne ki zaroorat nahi. */
  const recurringVoucherSaveBlocked = false;
  const recurringVoucherAuxiliaryDirty = useMemo(() => {
    if (!recurringVoucherControlsEditable) return false;
    if (!String(voucher?.id || "").trim()) return false;
    if (committedAutoMonthlyEnabled === null) return false;
    return autoMonthlyEnabled !== committedAutoMonthlyEnabled;
  }, [recurringVoucherControlsEditable, voucher?.id, committedAutoMonthlyEnabled, autoMonthlyEnabled]);

  const voucherDialogFormTree = (
    <VoucherAttachmentFallbackContext.Provider value={voucherAttachmentFallbackValue}>
      <>
        <VoucherDialogContent
          {...rest}
          // Journal / ledger lists: header target company, warna compare-edit `editCompanyId`.
          ledgerScopeCompanyId={targetCompanyId || editCompanyId || undefined}
          ledgerEntityId={ledgerEntityId}
          ledgerOpeningBalanceOutstanding={ledgerOpeningBalanceOutstanding}
          ledgerBooksOpeningBalanceSigned={ledgerBooksOpeningBalanceSigned}
          // Copy flow ke baad new form force: old voucher edit ke badle seeded new voucher open karo.
          voucher={postCopyNewFormSeed ? undefined : effectiveVoucher}
          defaultVoucherData={postCopyNewFormSeed ?? defaultVoucherData}
          onVoucherAction={handleAction}
          onOpenHistory={
            voucherForDialogChrome?.id && can("view_voucher_history")
              ? () => setHistoryVoucher(effectiveVoucher)
              : undefined
          }
          showHistoryButton={!!voucherForDialogChrome?.id && can("view_voucher_history")}
          editingDisabled={editingDisabled || historyBlocksEdit || apkOfflineViewOnly || effectiveForceViewOnly}
          restrictConvertWhenLinked={hasLinks}
          deleteDisabledWhenLinked={isEditLockedByLinks}
          showApproveButton={showApproveButton}
          showSaveAndApproveOnCreate={showSaveAndApproveOnCreate}
          onApprove={handleApprove}
          isApproving={isApproving}
          onEffectiveLinksChange={(v) => setEffectiveHasLinksFromForm(v === undefined ? null : v)}
          onClearEffectiveLinksOnTabChange={clearEffectiveLinksOnTabChange}
          targetCompanyId={targetCompanyId}
          targetCompanyOptions={allCompanies.map((c) => ({ id: c.id, name: c.name }))}
          onTargetCompanyChange={handleLedgerHeaderCompanyChange}
          formInstanceKey={copyDraftSeedVersion}
          // Multi-company: create / edit / copy sab par header company dropdown.
          showHeaderCompanySelector={showLedgerHeaderCompanyDropdown}
          headerCompanyReadOnlyLabel={interCompanyRibbonCompanyReadOnly}
          copySaveTargetCompanyId={postCopyNewFormSeed ? (targetCompanyId || undefined) : undefined}
          copyMismatchCategories={postCopyNewFormSeed ? copyMismatchCategories : undefined}
          // Party/staff/tax/item/account sab: pehle prefilled Create dialog — direct Firestore clone nahi (user save se pehle edit mile).
          onCopyMissingCategory={
            postCopyNewFormSeed
              ? async (category: string, opts?: CopyMissingMasterOpts) => {
                  await openCopyMasterDraftForCategory(category, opts);
                }
              : undefined
          }
          copyMasterDraftRequest={postCopyNewFormSeed ? copyMasterDraftRequest : null}
          onCashflowQuadTabNavigate={postCopyNewFormSeed ? onCashflowQuadTabNavigate : undefined}
          onRefreshCopyMismatch={postCopyNewFormSeed ? refreshCopyMismatchAfterMasterSave : undefined}
          onActiveTabChange={setVoucherFormActiveTab}
          onInterCompanyRibbonTabChange={setInterCompanyRibbonTab}
          recurringVoucherSaveBlocked={recurringVoucherSaveBlocked}
          recurringVoucherAuxiliaryDirty={recurringVoucherAuxiliaryDirty}
        />
      </>
    </VoucherAttachmentFallbackContext.Provider>
  );

  const bodyBlock = (
    <>
    <CompanyContext.Provider value={overriddenCompanyContextValue}>
      {needsNestedVoucherProvider ? (
        <VoucherProvider>{voucherDialogFormTree}</VoucherProvider>
      ) : (
        voucherDialogFormTree
      )}
    </CompanyContext.Provider>
    {/* HistoryDialog source voucher (jis company me wo save hai) ka history dikhata/edit karta hai —
        isliye dialog-scope target override ke BAHAR rakha hai taaki outer source company context use ho. */}
    <HistoryDialog
      voucher={historyVoucher}
      isOpen={!!historyVoucher}
      onOpenChange={(open) => !open && setHistoryVoucher(null)}
      onHistoryReset={() => setHistoryVoucher((prev: any) => (prev ? { ...prev, history: [] } : null))}
    />
    </>
  );

  /**
   * Static export: ledger page (party/bank/FAB) — save/approve/close ke baad galat `/dashboard` restore; dev server par no-op (guard early exit).
   */
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        plNavDbg("AddVoucherDialog.onClose (dialog root)", {
          ledgerModalWide: ledgerModalGuardWide,
        });
        armDashboardRedirectGuard(router, { isMobile: ledgerModalGuardWide });
      }
      onOpenChange?.(open);
    },
    [onOpenChange, router, ledgerModalGuardWide]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={dialogRootModal}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {isDesktop ? (
        <DialogContent
          hideCloseButton
          className="flex flex-col p-0 md:!left-0 md:!top-0 md:!translate-x-0 md:!translate-y-0 md:w-full md:h-full md:max-w-none md:max-h-none md:border-0 md:bg-transparent md:shadow-none md:rounded-none"
        >
          <div
            ref={dialogFrameRef}
            className="flex flex-col rounded-lg border bg-background shadow-lg overflow-hidden flex-1 min-h-0"
            style={{
              position: "fixed",
              left: dialogPosition.x,
              top: dialogPosition.y,
              width: dialogSize.w,
              height: dialogSize.h,
              minWidth: MIN_DIALOG_W,
              minHeight: MIN_DIALOG_H,
            }}
          >
            {headerBlock}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {bodyBlock}
            </div>
            {/* z-10: ribbon/header z-20 — drag title bar wins over top resize hitbox. */}
            {/* Resize handle - top edge */}
            <div
              className="absolute left-0 right-0 top-0 z-10 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-t"
              onMouseDown={(e) => handleResizeStart(e, "n")}
              aria-hidden
            />
            {/* Resize handle - top-left corner */}
            <div
              className="absolute left-0 top-0 z-10 w-4 h-4 cursor-nw-resize hover:bg-primary/20 transition-colors rounded-tl"
              onMouseDown={(e) => handleResizeStart(e, "nw")}
              aria-hidden
            />
            {/* Resize handle - top-right corner */}
            <div
              className="absolute right-0 top-0 z-10 w-4 h-4 cursor-ne-resize hover:bg-primary/20 transition-colors rounded-tr"
              onMouseDown={(e) => handleResizeStart(e, "ne")}
              aria-hidden
            />
            {/* Resize handle - left edge */}
            <div
              className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-l"
              onMouseDown={(e) => handleResizeStart(e, "w")}
              aria-hidden
            />
            {/* Resize handle - right edge */}
            <div
              className="absolute right-0 top-0 bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-r"
              style={{ top: 0, bottom: 0 }}
              onMouseDown={(e) => handleResizeStart(e, "e")}
              aria-hidden
            />
            {/* Resize handle - bottom edge */}
            <div
              className="absolute bottom-0 left-0 right-0 z-10 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-b"
              onMouseDown={(e) => handleResizeStart(e, "s")}
              aria-hidden
            />
            {/* Resize handle - bottom-left corner */}
            <div
              className="absolute left-0 bottom-0 z-10 w-4 h-4 cursor-sw-resize hover:bg-primary/20 transition-colors rounded-bl"
              onMouseDown={(e) => handleResizeStart(e, "sw")}
              aria-hidden
            />
            {/* Resize handle - bottom-right corner */}
            <div
              className="absolute right-0 bottom-0 z-10 w-4 h-4 cursor-se-resize hover:bg-primary/20 transition-colors rounded-br"
              onMouseDown={(e) => handleResizeStart(e, "se")}
              aria-hidden
            />
          </div>
        </DialogContent>
      ) : (
        // Mobile: full viewport — PWA, mobile browser aur static/Capacitor APK sab par yahi layout; safe-area env() 0 ho to asar nahi.
        <DialogContent
          hideCloseButton
          className={cn(
            "flex min-h-0 flex-col overflow-hidden p-0 !gap-0",
            "box-border h-[100dvh] max-h-[100dvh] w-full max-w-none !left-0 !top-0 !translate-x-0 !translate-y-0 rounded-none border-0 shadow-lg",
            "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
          )}
        >
          <div ref={dialogFrameRef} className="relative flex min-h-0 flex-1 flex-col">
            {headerBlock}
            {/* Header fixed feel: form area scroll; min-h-0 ta flex child shrink ho sake */}
            {/* scrollbar-slim-dim: vertical bar mota default na ho — form ke horizontal jaisa patla */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-slim-dim">{bodyBlock}</div>
          </div>
        </DialogContent>
      )}
      {copyButtonMountNode && !effectiveForceViewOnly && !copyToDisabledForInterCompany &&
        createPortal(
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-10 rounded-full px-4",
              // Mobile footer row: char buttons barabar; PC par purana content-width pill.
              isMobile && "min-w-0 w-full text-center",
              BTN_SAVE_CLASS
            )}
            disabled={isCopyingToCompany || !targetCompanyId || apkOfflineViewOnly}
            title="Copy to another company"
            onClick={async () => {
              if (apkOfflineViewOnly) {
                toast.warning("Offline — view only.");
                return;
              }
              let sourceVoucherId = voucher?.id ? String(voucher.id) : undefined;
              let saveStartedAtMs: number | undefined;

              // Save & Copy To: pehle current form ko Save karo (validation pass), phir hi copy draft — sirf copy na ho.
              if (wantsSaveCopyLabel) {
                saveStartedAtMs = Date.now();
                skipCloseAfterSaveForCopyRef.current = true;
                const savedIdPromise = new Promise<string | null>((resolve) => {
                  saveBeforeCopyResolveRef.current = resolve;
                });
                const root = dialogFrameRef.current;
                const formEl = root?.querySelector("form") as HTMLFormElement | null;
                if (!formEl) {
                  skipCloseAfterSaveForCopyRef.current = false;
                  saveBeforeCopyResolveRef.current = null;
                  toast.error("Form not found.");
                  return;
                }
                formEl.requestSubmit();
                const newId = await Promise.race([
                  savedIdPromise,
                  new Promise<string | null>((resolve) => window.setTimeout(() => resolve(null), 45_000)),
                ]);
                saveBeforeCopyResolveRef.current = null;
                skipCloseAfterSaveForCopyRef.current = false;
                if (!newId) {
                  toast.error("Save the voucher first (fix validation / red fields), then try Copy To again.");
                  return;
                }
                sourceVoucherId = newId;
              }

              const copiedResult = await prepareCopyDraftForCompany(
                sourceVoucherId,
                saveStartedAtMs
              );
              if (!copiedResult?.nextNewFormSeed) return;
              // NOTE: Global setCompanyId(targetCompanyId) yahan jaan-bujh ke nahi — outer page apni purani company me hi rahe.
              // Save target dialog override CompanyContext provider se shift hota hai.
              setPostCopyNewFormSeed(copiedResult.nextNewFormSeed);
              setCopyMismatchCategories(copiedResult.unmatchedCategories || []);
              setCopySourceVoucherSnapshot((copiedResult as any).sourceSnapshot || null);
              setDeleteOriginalAfterCopySave(false);
              copyOriginalDeleteHandledRef.current = false;
              setEffectiveHasLinksFromForm(null);
              setLiveVoucher(null);
              // Manual copy ke liye target ko already-applied mark karo, taaki re-seed effect dubara na chale.
              lastReseededTargetRef.current = targetCompanyId;
              // Form ko fresh seed pick karne ke liye remount.
              setCopyDraftSeedVersion((v) => v + 1);
              // NOTE: Global setCompanyId(targetCompanyId) call jaan-bujh ke nahi karte — main page ki company
              // wahi rakhni hai jaha se dialog khula tha. Dialog ke andar form-context override se save target shift hoga.
              toast.success(
                wantsSaveCopyLabel
                  ? "Saved and copied to new draft. Review red fields if any, then Save."
                  : "Copied to new draft. Review red fields, then Save."
              );
            }}
          >
            {/* Edit: no-change => Copy To, changed => Sv & Copy To; New always Sv & Copy To. */}
            {isCopyingToCompany ? "Copying..." : copyButtonLabel}
          </Button>,
          copyButtonMountNode
        )}
      {/* Auto Monthly: rate bump + Save / Generate Now — main voucher dialog ke upar nested portal. */}
      <Dialog open={recurringSettingsOpen} onOpenChange={setRecurringSettingsOpen}>
        <DialogContent
          // Auto Monthly modal: zyada mota neela outline (pehle border-2).
          className="w-[95vw] max-w-md gap-3 border-4 border-blue-600 p-5 shadow-md sm:max-w-lg dark:border-blue-500"
          aria-describedby="recurring-settings-desc"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Auto Monthly settings</DialogTitle>
            <DialogDescription id="recurring-settings-desc" className="text-left text-xs text-muted-foreground">
              {calLab.settingsIntro}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-indigo-950">{calLab.scheduleMonthDayLabel}</Label>
              <Select
                value={String(autoMonthlyScheduleBsDay)}
                onValueChange={(v) => setAutoMonthlyScheduleBsDay(parseInt(v, 10) || 32)}
                disabled={autoMonthlyHydrating}
              >
                <SelectTrigger className="h-9 border-indigo-200 bg-background text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(50vh,280px)]">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Day {d}
                    </SelectItem>
                  ))}
                  <SelectItem value="32">{calLab.lastDayOfScheduledMonth}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-indigo-950">Rate change for generated voucher</Label>
              <Select
                value={autoMonthlyRateMode}
                onValueChange={(v) => {
                  const next = v as RecurringRateAdjustMode;
                  setAutoMonthlyRateMode(next);
                  // Sirf "No change" par cadence / effective-from reset — % ↔ fixed switch par values retain.
                  if (next === "none") {
                    setAutoMonthlyRateEffectiveFromAd(undefined);
                    setAutoMonthlyRateCadence("every_bs_month");
                    setAutoMonthlyYearlyBsMonth(1);
                    setAutoMonthlyYearlyBsDay(1);
                    setAutoMonthlyRateEveryN("1");
                    setAutoMonthlyYearlyBaseAnchorAd(undefined);
                  }
                }}
                disabled={autoMonthlyHydrating}
              >
                <SelectTrigger className="h-9 border-indigo-200 bg-background text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="percent">Increase by %</SelectItem>
                  <SelectItem value="fixed">Increase by fixed amount</SelectItem>
                </SelectContent>
              </Select>
              {(autoMonthlyRateMode === "fixed" || autoMonthlyRateMode === "percent") && (
                <div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-2 py-2">
                  {/* % / fixed bump: mahine vs saal — yearly par BS month/day anchor (generation due date se match). */}
                  <div className="space-y-1">
                    <Label className="text-xs text-indigo-950">How often to apply increase</Label>
                    <Select
                      value={autoMonthlyRateCadence}
                      onValueChange={(v) => {
                        const next = v as RecurringRateAdjustCadence;
                        setAutoMonthlyRateCadence(next);
                        if (next === "every_bs_month") {
                          setAutoMonthlyYearlyBsMonth(1);
                          setAutoMonthlyYearlyBsDay(1);
                          setAutoMonthlyYearlyBaseAnchorAd(undefined);
                        }
                      }}
                      disabled={autoMonthlyHydrating}
                    >
                      <SelectTrigger className="h-9 border-indigo-200 bg-background text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="every_bs_month">{calLab.everyMonthOption}</SelectItem>
                        <SelectItem value="every_bs_year">{calLab.oncePerYearOption}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {autoMonthlyRateCadence === "every_bs_month" && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-indigo-950">{calLab.everyNMonthsLabel}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        inputMode="numeric"
                        className="h-9 border-indigo-200 text-sm"
                        placeholder="1"
                        value={autoMonthlyRateEveryN}
                        onChange={(e) => setAutoMonthlyRateEveryN(e.target.value.replace(/[^\d]/g, ""))}
                        disabled={autoMonthlyHydrating}
                      />
                    </div>
                  )}
                  {autoMonthlyRateCadence === "every_bs_year" && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-[11px] text-indigo-950">{calLab.bumpWhenMonthLabel}</Label>
                        <Select
                          value={String(autoMonthlyYearlyBsMonth)}
                          onValueChange={(v) => setAutoMonthlyYearlyBsMonth(parseInt(v, 10) || 1)}
                          disabled={autoMonthlyHydrating}
                        >
                          <SelectTrigger className="h-9 border-indigo-200 bg-background text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(50vh,280px)]">
                            {NEPALI_MONTHS.map((name, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-[11px] text-indigo-950">{calLab.bumpDayLabel}</Label>
                        <Select
                          value={String(autoMonthlyYearlyBsDay)}
                          onValueChange={(v) => setAutoMonthlyYearlyBsDay(parseInt(v, 10) || 1)}
                          disabled={autoMonthlyHydrating}
                        >
                          <SelectTrigger className="h-9 border-indigo-200 bg-background text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(50vh,280px)]">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                Day {d}
                              </SelectItem>
                            ))}
                            <SelectItem value="32">{calLab.lastDayOfScheduledMonth}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-[11px] text-indigo-950">{calLab.everyNYearsLabel}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          inputMode="numeric"
                          className="h-9 border-indigo-200 text-sm"
                          placeholder="1"
                          value={autoMonthlyRateEveryN}
                          onChange={(e) => setAutoMonthlyRateEveryN(e.target.value.replace(/[^\d]/g, ""))}
                          disabled={autoMonthlyHydrating}
                        />
                      </div>
                    </div>
                  )}
                  {/* Every-N-years phase anchor: books cycle vs app start date can differ. */}
                  {autoMonthlyRateCadence === "every_bs_year" && (
                    <div className="space-y-1 border-t border-indigo-100/80 pt-2">
                      <Label className="text-[11px] text-indigo-950">{calLab.yearlyBaseAnchorLabel}</Label>
                      {dateSystem === "AD" ? (
                        <Input
                          type="date"
                          className="h-9 max-w-[11rem] border-indigo-200 text-sm"
                          value={adDateInputValue(autoMonthlyYearlyBaseAnchorAd)}
                          onChange={(e) => setAutoMonthlyYearlyBaseAnchorAd(parseAdDateInput(e.target.value))}
                          disabled={autoMonthlyHydrating}
                        />
                      ) : (
                        <BsDatePicker
                          isRange={false}
                          valueAD={autoMonthlyYearlyBaseAnchorAd}
                          onChangeAD={(d) => setAutoMonthlyYearlyBaseAnchorAd(d)}
                          disabled={autoMonthlyHydrating}
                          numberOfMonths={1}
                          className="h-9 w-full max-w-[11rem] border-indigo-200 font-normal"
                        />
                      )}
                      <p className="text-[11px] leading-snug text-indigo-900/80">{calLab.yearlyBaseAnchorHint}</p>
                    </div>
                  )}
                </div>
              )}
              {autoMonthlyRateMode !== "none" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-[11px] text-indigo-950">
                      {autoMonthlyRateMode === "percent" ? "Percent increase" : "Amount to add"}
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="h-9 border-indigo-200 text-sm"
                      placeholder={autoMonthlyRateMode === "percent" ? "e.g. 10 for +10%" : "Amount to add"}
                      value={autoMonthlyRateValue}
                      onChange={(e) => setAutoMonthlyRateValue(e.target.value)}
                      disabled={autoMonthlyHydrating}
                    />
                  </div>
                  {(autoMonthlyRateMode === "fixed" || autoMonthlyRateMode === "percent") && (
                    <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[11rem]">
                      <Label className="text-xs text-indigo-950">{calLab.applyIncreaseFromLabel}</Label>
                      {dateSystem === "AD" ? (
                        <Input
                          type="date"
                          className="h-9 border-indigo-200 text-sm"
                          value={adDateInputValue(autoMonthlyRateEffectiveFromAd)}
                          onChange={(e) => setAutoMonthlyRateEffectiveFromAd(parseAdDateInput(e.target.value))}
                          disabled={autoMonthlyHydrating}
                        />
                      ) : (
                        <BsDatePicker
                          isRange={false}
                          valueAD={autoMonthlyRateEffectiveFromAd}
                          onChangeAD={(d) => setAutoMonthlyRateEffectiveFromAd(d)}
                          disabled={autoMonthlyHydrating}
                          numberOfMonths={1}
                          className="h-9 w-full border-indigo-200 font-normal sm:w-[11rem]"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="secondary" onClick={() => setRecurringSettingsOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                savingRecurringSettings ||
                generatingRecurringNow ||
                recurringGeneratePickerPrep ||
                autoMonthlyHydrating ||
                !voucher?.id ||
                !user?.uid ||
                !canGenerateRecurringOnVoucher
              }
              onClick={() => void handleGenerateRecurringNowClick()}
            >
              {generatingRecurringNow || recurringGeneratePickerPrep ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {recurringGeneratePickerPrep ? "Checking…" : "Generating…"}
                </>
              ) : (
                "Generate now"
              )}
            </Button>
            <Button
              type="button"
              disabled={
                savingRecurringSettings || autoMonthlyHydrating || !voucher?.id || !canEditRecurringOnVoucher
              }
              onClick={() => void handleSaveRecurringSettingsClick()}
            >
              {savingRecurringSettings ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={recurringGeneratePicker?.open === true}
        onOpenChange={(open) => {
          if (!open) closeRecurringGeneratePickerDismiss();
        }}
      >
        <DialogContent
          className="flex max-h-[85vh] max-w-md flex-col gap-3 border-2 border-indigo-400 p-4 sm:max-w-lg dark:border-indigo-500"
          aria-describedby="recurring-generate-picker-desc"
        >
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="text-base font-semibold">Create auto vouchers</DialogTitle>
            <DialogDescription id="recurring-generate-picker-desc" className="text-left text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{recurringGeneratePicker?.slots.length ?? 0}</span>{" "}
              scheduled voucher{recurringGeneratePicker?.slots.length === 1 ? "" : "s"} can be created up to this month
              (one per BS period, on the schedule day below). Tick only the months you want now; use Select all for
              every row. If you leave all unticked and continue, only the{" "}
              <span className="font-medium text-foreground">most recent missing</span> month (closest to today) gets one
              voucher. After a batch, Auto stays on the{" "}
              <span className="font-medium text-foreground">last</span> voucher created.
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!recurringGeneratePicker?.slots.length}
              onClick={() =>
                setRecurringGeneratePicker((prev) =>
                  prev?.open
                    ? {
                        ...prev,
                        selected: Object.fromEntries(prev.slots.map((s) => [s.periodKey, true])),
                      }
                    : prev,
                )
              }
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!recurringGeneratePicker?.slots.length}
              onClick={() =>
                setRecurringGeneratePicker((prev) =>
                  prev?.open
                    ? {
                        ...prev,
                        selected: Object.fromEntries(prev.slots.map((s) => [s.periodKey, false])),
                      }
                    : prev,
                )
              }
            >
              Clear all
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-indigo-100 bg-muted/30 p-2 dark:border-indigo-900/50">
            <ul className="flex flex-col gap-2">
              {recurringGeneratePicker?.slots.map((slot) => {
                const monthName = NEPALI_MONTHS[Math.max(0, Math.min(11, slot.bsM - 1))] ?? "";
                const checked = recurringGeneratePicker.selected[slot.periodKey] === true;
                const tplRow = recurringGeneratePicker.templateForSchedule;
                const dayNum = effectiveScheduleBsDay(tplRow);
                const dim = getBSMonthDays(slot.bsY)[slot.bsM - 1] || 30;
                const dueD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
                const bsYmd = `${slot.bsY}-${String(slot.bsM).padStart(2, "0")}-${String(dueD).padStart(2, "0")}`;
                let adExtra = "";
                try {
                  const dueAd = bsToAd({ y: slot.bsY, m: slot.bsM, d: dueD });
                  if (dateSystem === "AD") adExtra = ` → ${formatDate(dueAd)}`;
                  else if (dateSystem === "BS") adExtra = ` → ${formatDateBS(dueAd)}`;
                  else adExtra = ` → ${formatDateBS(dueAd)} / ${formatDate(dueAd)}`;
                } catch {
                  adExtra = "";
                }
                return (
                  <li
                    key={slot.periodKey}
                    className="flex items-start gap-3 rounded-md border border-transparent bg-background/80 px-2 py-2 hover:border-indigo-200 dark:hover:border-indigo-800"
                  >
                    <Checkbox
                      id={`rec-gen-${slot.periodKey}`}
                      checked={checked}
                      onCheckedChange={(v) =>
                        setRecurringGeneratePicker((prev) =>
                          prev?.open
                            ? {
                                ...prev,
                                selected: {
                                  ...prev.selected,
                                  [slot.periodKey]: v === true,
                                },
                              }
                            : prev,
                        )
                      }
                      disabled={generatingRecurringNow}
                      className="mt-0.5"
                    />
                    <label htmlFor={`rec-gen-${slot.periodKey}`} className="cursor-pointer text-sm leading-snug">
                      <span className="font-medium text-foreground">{slot.periodKey}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {monthName} {slot.bsY}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        Voucher date (schedule): <span className="font-mono text-foreground">{bsYmd}</span>
                        {adExtra}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <DialogFooter className="shrink-0 gap-2 sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => closeRecurringGeneratePickerDismiss()}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={generatingRecurringNow || !canGenerateRecurringOnVoucher}
              onClick={() => void handleRecurringGeneratePickerConfirm()}
            >
              {generatingRecurringNow ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (() => {
                const n =
                  recurringGeneratePicker?.slots.filter((s) => recurringGeneratePicker.selected[s.periodKey] === true)
                    .length ?? 0;
                return n === 0 ? "Create next due only" : `Create selected (${n})`;
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={copyMissingMasterPopup.open}
        onOpenChange={(open) =>
          setCopyMissingMasterPopup((prev) => ({
            ...prev,
            open,
          }))
        }
      >
        {/* User feedback: dialog thoda bada + text bolder rakho — chhoti screen par bhi readable rahe. */}
        <DialogContent className="w-[95vw] max-w-2xl p-7 sm:max-w-2xl">
          {/* Formal center popup: conversion/mapping edge case ko actionable wording ke saath explain karo. */}
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {copyMissingMasterPopup.title}
            </DialogTitle>
          </DialogHeader>
          {/* Body: muted nahin — semi-bold/foreground, normal text size se thoda bada (base) for clarity. */}
          <p className="text-base font-medium leading-7 text-foreground">
            {copyMissingMasterPopup.message}
          </p>
          <div className="flex justify-end pt-3">
            <Button
              type="button"
              size="lg"
              className="font-semibold"
              onClick={() =>
                setCopyMissingMasterPopup((prev) => ({
                  ...prev,
                  open: false,
                }))
              }
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}