"use client";

import React, { useState, useEffect, useMemo, Suspense, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
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
import { useCompany, CompanyContext } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { useVouchers, VoucherProvider } from "@/hooks/useVouchers";
import { determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { HistoryDialog } from "./HistoryDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { hasPaymentLinks, hasSpendWiseLinks, hasAllocationsToVoucherId } from "@/lib/payment-allocation-utils";
import { useAuth } from "@/hooks/useAuth";
import { approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { getEffectiveHistorySettings } from "@/lib/voucherHistoryUtils";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getCompanyDocFromBrowserDb, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { VoucherAttachmentFallbackContext } from "@/contexts/VoucherAttachmentFallbackContext";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { formatVoucherNumber, normalizePrefix, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { stripIdsForCrossCompanyClone } from "@/lib/crossCompanyMasterPrefill";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { armDashboardRedirectGuard } from "@/lib/protectFromUnwantedDashboardRedirect";

type VoucherType = "sale" | "purchase" | "payment_in" | "payment_out" | "contra" | "direct_income" | "direct_expense" | "journal" | "note" | "add_salary" | "production";

const formMap: Record<VoucherType, React.ComponentType<any>> = {
  sale: CreateSaleForm,
  purchase: CreatePurchaseForm,
  payment_in: CreatePaymentInForm,
  payment_out: CreatePaymentOutForm,
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
  "sale", "purchase", "payment_in", "payment_out", "direct_income", "direct_expense",
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
  const localRows = isLocalOnlyMode() ? await listCompanyDocsFromBrowserDb(targetCompanyId, "vouchers") : [];
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

async function loadCollectionRows(companyId: string, collectionName: CollectionName): Promise<Array<Record<string, any>>> {
  const fsRows = (await getDocs(collection(firestore, `companies/${companyId}/${collectionName}`))).docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, any>),
  }));
  const localRows = isLocalOnlyMode() ? await listCompanyDocsFromBrowserDb(companyId, collectionName) : [];
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
  voucher: Record<string, any>
): Promise<{ remapped: Record<string, any>; unmatchedNames: string[]; unmatchedCategories: string[] }> {
  const collections: CollectionName[] = ["parties", "bank_accounts", "staff", "taxes", "expense_accounts", "items"];
  const sourceRowsByCollection = new Map<CollectionName, Array<Record<string, any>>>();
  const targetNameToIdByCollection = new Map<CollectionName, Map<string, string>>();
  for (const cname of collections) {
    const [sourceRows, targetRows] = await Promise.all([
      loadCollectionRows(sourceCompanyId, cname),
      loadCollectionRows(targetCompanyId, cname),
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
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

/** Canonical display name bank/party/item/tax rows ke लिए — target side duplicate naam match. */
function masterRowCanonicalName(row: Record<string, unknown>): string {
  return String(row?.name ?? row?.itemName ?? row?.accountName ?? row?.title ?? "").trim();
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
  // Mobile strip me voucher dropdown ke right company selector show karne ke liye parent-controlled props.
  targetCompanyId,
  targetCompanyOptions,
  onTargetCompanyChange,
  // Copy-draft re-seed me form ko fresh state ke liye remount karne ke liye parent-controlled key suffix.
  formInstanceKey,
  /** Copy-draft: header company change pe forms bill/spend link state reset karein — sirf tab pass jab post-copy seed active ho. */
  copySaveTargetCompanyId,
  /** Sirf copied-draft (Save & Copy To) ke baad header me company switch dikhao; navin Add/Edit me chhupa rakho. */
  showHeaderCompanySelector,
  copyMismatchCategories,
  onCopyMissingCategory,
  copyMasterDraftRequest,
  /** Copy-draft: Quartet tab switch — queued prefilled create dialog cancel + mismatch recount (sirf Copy chip se dialog). */
  onCashflowQuadTabNavigate,
  /** Copy-draft: party/bank master create ke baad mismatch list dubara ginti — Copy button hide + red labels fix. */
  onRefreshCopyMismatch,
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
  /** `true` sirf jab copied draft (post-copy seed) — header company dropdown dikhane ke liye. */
  showHeaderCompanySelector?: boolean;
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

  // Har tab change par parent ka `effectiveHasLinksFromForm` reset — warna Payment form ne `true` bheja ho to Contra/Salary attach band rehta hai.
  useEffect(() => {
    onClearEffectiveLinksOnTabChange?.();
  }, [activeTab, onClearEffectiveLinksOnTabChange]);

  const initialVoucherData = useMemo(() => {
    if (isEditing) {
      const shaped = shapeVoucherForActiveEditTab(voucher as Record<string, unknown> | undefined, activeTab);
      return shaped as typeof voucher;
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
  }, [voucher, defaultVoucherData, isEditing, activeTab]);

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
                  {activeTab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {/* Company header: sirf Save & Copy To ke baad copied draft me — navin Add/Edit me hide. */}
            {showHeaderCompanySelector && (
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
            )}
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
                      // Desktop tabs: selected pill रहे; बाकी tabs rounded-square रहे (mobile feel match).
                      "capitalize rounded-md border px-4 py-2 transition-all",
                      disabled
                        // Disabled tabs bhi pill shape me hi dikhayein so tab strip geometry consistent rahe.
                        ? "rounded-full border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed"
                        : "border-emerald-300 bg-emerald-100 text-emerald-900 data-[state=active]:rounded-full data-[state=active]:border-emerald-600 data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=inactive]:rounded-md"
                    )}
                  >
                    {key.replace(/_/g, ' ')}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Dialog form canvas background: fill leftover white space without changing field colors. */}
      <div className={cn("w-full min-w-0 max-w-full pl-[2px] pr-[2px] pt-6 flex-1 flex flex-col min-h-0 overflow-x-hidden box-border bg-slate-100", isMobile ? "pb-0" : "pb-6 md:p-6")}>
        <Suspense fallback={<div className="p-10 text-center"><Loader2 className="animate-spin mx-auto" /></div>}>
          {ActiveForm ? (
            <ActiveForm 
              key={keyForForm} 
              voucher={initialVoucherData} 
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
              {...(copySaveTargetCompanyId ? { copySaveTargetCompanyId } : {})}
              {...(copyMismatchCategories ? { copyMismatchCategories } : {})}
              {...(onCopyMissingCategory ? { onCopyMissingCategory } : {})}
              {...(copyMasterDraftRequest ? { copyMasterDraftRequest } : {})}
              {...(onRefreshCopyMismatch ? { onRefreshCopyMismatch } : {})}
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
  const { children, isOpen, onOpenChange, voucher, defaultVoucherData, dialogRootModal = true, editCompanyId, ...rest } = props;
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
  const { user, customUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { can, canEditRecord } = usePermissions();
  const { vouchers } = useVouchers();
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;
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
  const [liveVoucher, setLiveVoucher] = useState<any>(null);
  const [editingDisabled, setEditingDisabled] = useState(false);
  /** Block edit rule: when voucher history is full and setting is "Block edit", disable Save. */
  const [historyBlocksEdit, setHistoryBlocksEdit] = useState(false);
  /** When sale/purchase form has pending link changes (e.g. user unlinked in dialog), form reports effective state so we enable edit locally. */
  const [effectiveHasLinksFromForm, setEffectiveHasLinksFromForm] = useState<boolean | null>(null);

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
      setCopyMasterDraftRequest(null);
    }
  }, [isOpen]);

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
  }, [isOpen, isMobile, voucher?.id, copyButtonLabel, postCopyNewFormSeed]);

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
    if (!isDesktop || (e.target as HTMLElement).closest("button")) return;
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
    if (isLocalOnlyMode()) {
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
  }, [isOpen, voucher?.id, companyId, postCopyNewFormSeed, voucher?.type, editCompanyId, ctxCompanyId, vouchers]);

  // Preserve clicked contra leg + attachments from table row when live doc has not synced fileUrls yet.
  const effectiveVoucher = liveVoucher
    ? mergeAttachmentFieldsFromRowForEffectiveVoucher(
        { ...liveVoucher, _contraLeg: (voucher as any)?._contraLeg ?? (liveVoucher as any)?._contraLeg },
        voucher
      )
    : voucher;
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

  // Permission-based: disable edit when user cannot edit this voucher (role + ownership)
  useEffect(() => {
    if (!voucherForDialogChrome?.id) {
      setEditingDisabled(false);
      return;
    }
    const fetchVoucher = async (cid: string, vid: string) => {
      if (isLocalOnlyMode()) {
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
        const canEdit = canEditRecord(isOwnRecord, voucherForDialogChrome);
        setEditingDisabled(!canEdit);
      }
    });
    return () => { cancelled = true; };
  }, [voucherForDialogChrome?.id, voucherForDialogChrome?.isApproved, companyId, user?.uid, vouchers, canEditRecord, ctxCompanyId]);

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
    can("approve_transactions");

  const showSaveAndApproveOnCreate =
    !voucherForDialogChrome?.id &&
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false;

  const handleApprove = useCallback(async () => {
    const cid = String(editCompanyId?.trim() || ctxCompanyId || "");
    const activeContextCompanyId = String(ctxCompanyId || "").trim();
    // Copied-draft par approve sirf source saved doc ke liye — chrome me id nahi dikhate, yahan bhi guard.
    if (!cid || !effectiveVoucher?.id || postCopyNewFormSeed || isApproving || !user?.uid) return;
    // APK/mobile: kuch parent / global effect approve ke baad silently `/dashboard` push kar deta hai — guard poll + restore (native ~8s).
    armDashboardRedirectGuard(router, { isMobile });
    setIsApproving(true);
    try {
      // Pehle hi persist: await ke dauran SQLite/outbox busy ho to bhi readSelectedCompanyId empty na ho, /company push na ho.
      try {
        if (typeof window !== "undefined") writeSelectedCompanyId(cid);
      } catch {
        /* ignore */
      }
      const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
      await approveVoucherWithHistory(cid, effectiveVoucher.id, user.uid, approverName);
      // Baad me dubara: koi intermediate clear ho to session/local fallback phir set ho jaye.
      try {
        if (typeof window !== "undefined") writeSelectedCompanyId(cid);
      } catch {
        /* ignore */
      }
      // Approve flow me global company ko tabhi touch karo jab context miss/mismatch ho; same-company par needless switch se page-route churn avoid.
      if (!activeContextCompanyId || activeContextCompanyId !== cid) {
        setCompanyId(cid);
      }
      toast.success("Transaction approved.");
      // Static APK mobile: parent callbacks kabhi route canonicalization chala dete hain; approve ke baad dialog close enough hai.
      if (!(isStaticAppBuild() && isMobile)) {
        props.onVoucherAction?.("saved");
      }
      onOpenChange?.(false);
    } catch (e) {
      toast.error("Failed to approve transaction.");
    } finally {
      setIsApproving(false);
    }
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
    router,
  ]);

  const prepareCopyDraftForCompany = useCallback(async (sourceVoucherId?: string, minSavedAtMs?: number) => {
    // Save & Copy To: copied-draft mode me form target company context me save hota hai;
    // source read bhi wahi current save-context company se lo, warna stale old seed copy ho sakta hai.
    // Re-seed/company-switch me bhi source always original opening company hi rahe;
    // warna source=target ho kar mismatch detect nahi hota aur old ids pass-through ho jate hain.
    const sourceCompanyId = String(companyId || "").trim();
    const destinationCompanyId = String(targetCompanyIdRef.current || targetCompanyId || "").trim();
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
          // Local/static mode me save ke baad row browser DB me pehle aa sakta hai.
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
      const { remapped, unmatchedNames, unmatchedCategories } = await remapVoucherReferencesByName(sourceCompanyId, destinationCompanyId, cleaned);
      const copyPayload = {
        ...remapped,
        voucherNumber: nextVoucherNumber,
        // Cross-company create me stale approval carry na ho; target voucher fresh pending/editable rahe.
        isApproved: false,
      };
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
  }, [companyId, targetCompanyId, user?.uid, effectiveVoucher?.id, allCompanies, postCopyNewFormSeed, effectiveVoucher, defaultVoucherData]);

  /** Party/bank/target me create-save ke baad mismatch list dubara ginti — Copy buttons stale na rahein (`accountName` match ab mila ho). */
  const refreshCopyMismatchAfterMasterSave = useCallback(async () => {
    const destinationCompanyId = String(targetCompanyIdRef.current || targetCompanyId || "").trim();
    const sourceCompanyId = companyId.trim();
    if (!postCopyNewFormSeed || !copySourceVoucherSnapshot || !sourceCompanyId || !destinationCompanyId) return;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 400));
    try {
      const cleaned = resetCrossLinksForCopy(copySourceVoucherSnapshot);
      const { unmatchedCategories } = await remapVoucherReferencesByName(sourceCompanyId, destinationCompanyId, cleaned);
      setCopyMismatchCategories(unmatchedCategories);
    } catch {
      /* Firestore list race par ignore — user fir save / company change kar sakta hai */
    }
  }, [companyId, targetCompanyId, postCopyNewFormSeed, copySourceVoucherSnapshot]);

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
      const sourceRows = await loadCollectionRows(sourceCompanyId, collectionName);
      const targetRows = await loadCollectionRows(destinationCompanyId, collectionName);
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

  // ✅ handleAction मा pathsToDelete थपियो
  const handleAction = useCallback(async (
    status: 'saved' | 'cancelled', 
    isSaveAndNew?: boolean, 
    newId?: string, 
    pathsToDelete: string[] = [] // यहाँ एरे प्राप्त हुन्छ
  ) => {
    const skipDialogCloseForSaveCopy = skipCloseAfterSaveForCopyRef.current && status === "saved";

    // Static APK + mobile: Save / Save & Print / Save & Approve sab parent `onVoucherAction` ke baad
    // kabhi `/dashboard` push kar dete the (close ke pehle hi). Guard ko parent callback se PEHLE arm karo (native ~8s SQLite flush).
    if (status === "saved") {
      armDashboardRedirectGuard(router, { isMobile });
    }

    // १. सेभ भएको बेला मात्र सर्भरबाट फाइल डिलिट गर्ने
    if (status === 'saved' && pathsToDelete.length > 0) {
      console.log("Cleaning up files from storage...");
      for (const path of pathsToDelete) {
        try {
          const fileRef = ref(storage, path);
          await deleteObject(fileRef);
          console.log("Deleted:", path);
        } catch (error) {
          console.error("Failed to delete file:", path, error);
        }
      }
    }

    // २. Unassigned file को cleanup (पहिलेकै लजिक)
    if (status === 'saved' && defaultVoucherData?.unassignedFile?.id && companyId) {
      try {
        if (!isLocalOnlyMode()) {
          const fileDocRef = doc(firestore, `companies/${companyId}/unassigned_documents`, defaultVoucherData.unassignedFile.id);
          await deleteDoc(fileDocRef);
        }
      } catch (error) {
        console.error("Failed to delete unassigned document:", error);
      }
    }
  
    // ३. Propagate action
    let keepDialogAsNew = Boolean(isSaveAndNew);
    if (status === "cancelled") {
      setPostCopyNewFormSeed(null);
      setCopyMismatchCategories([]);
      setCopySourceVoucherSnapshot(null);
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
  
    if (!keepDialogAsNew && !skipDialogCloseForSaveCopy) {
      onOpenChange?.(false);
    }
  }, [onOpenChange, companyId, defaultVoucherData?.unassignedFile?.id, props, voucher?.id, router, isMobile]);

  // Mobile: header padding + title + banners jitna chhota ho sake (zyada form space); desktop: purana drag header.
  const headerBlock = (
    <DialogHeader
      className={cn(
        "border-b bg-[#b8c8f5] dark:bg-[#7a8ed8] text-gray-900 dark:text-white flex flex-col justify-center shrink-0",
        isDesktop
          ? cn("px-3 py-2 md:px-4 md:py-2 cursor-grab active:cursor-grabbing select-none", (isEditLockedByLinks || historyBlocksEdit) && "min-h-[unset]")
          : "px-2 py-1.5 pb-1.5 gap-1"
      )}
      onMouseDown={isDesktop ? handleDragStart : undefined}
    >
      {isDesktop && isEditLockedByLinks ? (
        // 3-equal wing grid: beechna ribbon header ke geometric center rahe — company dropdown width se shift na ho.
        <div className="grid min-h-[2.75rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
          {/* Copied-draft badge title ke niche nahin — same baseline row me taaki "Edit Trxn" ke bilkul dahine center-align dikhe */}
          <div className="flex min-w-0 shrink flex-row flex-wrap items-center gap-x-2 gap-y-0 justify-self-start self-center pr-2">
            <DialogTitle className="m-0 font-bold font-headline text-inherit text-xl leading-tight">
              {!!voucher?.id ? "Edit Trxn" : "New Trxn"}
            </DialogTitle>
            {postCopyNewFormSeed && (
              <p className="m-0 text-[10px] md:text-xs font-semibold leading-tight text-emerald-700">
                Copied Draft (New)
                {/* Header copy-draft status: category names (party/account/expense) hide karke sirf generic fix hint dikhana. */}
                {copyMismatchCategories.length > 0 ? " - Fix red fields" : ""}
              </p>
            )}
          </div>
          <div
            className="justify-self-center self-center shrink-0 rounded-full bg-gray-600 px-2 py-1.5 md:px-3 md:py-2 inline-flex w-fit max-w-[min(52vw,560px)]"
          >
            <p className="font-semibold text-center text-[#ff0000] m-0 leading-snug text-sm whitespace-nowrap">
              Voucher Edit disabled — To convert or edit, unlink linked transactions first.
            </p>
          </div>
          <div className="flex shrink-0 flex-row items-center justify-end justify-self-end self-center gap-[10px]">
            {postCopyNewFormSeed && (
              // Desktop header company: sirf copied-draft (Save & Copy To); navin Add/Edit me hide.
              <Select value={targetCompanyId || ""} onValueChange={(v) => setTargetCompanyId(v)}>
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
            )}
            <DialogClose className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none shrink-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>
      ) : (
        <div className={cn("flex w-full min-w-0 gap-2", isDesktop ? "flex-nowrap items-center" : "items-start justify-between")}>
          <div
            className={cn(
              "flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0",
              isDesktop ? "flex-1" : "pr-8"
            )}
          >
            <DialogTitle className={cn("m-0 font-bold font-headline text-inherit", isDesktop ? "text-xl leading-tight" : "text-base leading-tight")}>
              {!!voucher?.id ? "Edit Trxn" : "New Trxn"}
            </DialogTitle>
            {postCopyNewFormSeed && (
              // Copy ke turant baad user ko clear signal: title ke saath ek hi line — niche stack na ho.
              <p className="m-0 text-[10px] md:text-xs font-semibold leading-tight text-emerald-700">
                Copied Draft (New)
                {/* Mobile header: same generic message; bracketed mismatch category labels intentionally hidden. */}
                {copyMismatchCategories.length > 0 ? " - Fix red fields" : ""}
              </p>
            )}
          </div>
          {isEditLockedByLinks && !isDesktop && (
            // Mobile: title ke saath flex row — desktop locked upar 3-col grid.
            <div className="flex-1 min-w-0 max-w-full rounded-full bg-gray-600 px-2 py-1.5">
              <p className="m-0 text-center text-[10px] font-semibold leading-snug text-[#ff0000]">To Edit Unlink Linked trxn 1st</p>
            </div>
          )}
          {isDesktop && (
            <div className="ml-auto flex shrink-0 items-center gap-[10px]">
              {postCopyNewFormSeed && (
                <Select value={targetCompanyId || ""} onValueChange={(v) => setTargetCompanyId(v)}>
                  {/* Company selector: desktop par item-section tone match (soft green ribbon family). */}
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
              )}
              <DialogClose className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          )}
        </div>
      )}
      {/* Saved + linked: warn; New Transaction par local links se yeh banner nahin (misleading). */}
      {isEditLockedByLinks && !isDesktop && false && (
        <div
          className={cn(
            "w-full max-w-full mx-auto bg-gray-600 rounded-md flex items-center justify-center self-center",
            isDesktop ? "mt-3 min-h-[52px] px-4 py-3 w-fit" : "mt-1 px-2 py-1"
          )}
        >
          <p className={cn("font-semibold text-center text-[#ff0000] m-0", isDesktop ? "text-base md:text-xl" : "text-[11px] leading-snug")}>
            Voucher Edit disabled — To convert or edit, unlink linked transactions first.
          </p>
        </div>
      )}
      {/* Block edit rule: when history full + setting "Block edit", show message and disable Save */}
      {historyBlocksEdit && !isEditLockedByLinks && (
        <div
          className={cn(
            "w-full max-w-full mx-auto bg-amber-600 rounded-md flex items-center justify-center self-center",
            isDesktop ? "mt-3 min-h-[52px] px-4 py-3 w-fit" : "mt-1 px-2 py-1"
          )}
        >
          <p className={cn("font-semibold text-center text-white m-0", isDesktop ? "text-base md:text-xl" : "text-[11px] leading-snug")}>
            Voucher history is full. Clear history in History dialog to edit and save changes.
          </p>
        </div>
      )}
    </DialogHeader>
  );

  const voucherAttachmentFallbackValue =
    companyId && effectiveVoucher?.id ? { companyId, voucherId: String(effectiveVoucher.id) } : null;

  // Dialog-scope CompanyContext override: dropdown se chuni hui target company sirf dialog ke andar `companyId`/`company`
  // ko shift karti hai. Outer page (pages, sidebar, header) apni original company me hi rehta hai — save target sirf
  // forms ke liye target company hota hai. Save complete hone par dialog band hota hai aur user back to same page
  // par same previous company ke saath rehta hai.
  const overriddenCompanyContextValue = useMemo(() => {
    const targetCompanyDoc =
      allCompanies.find((c) => c.id === (targetCompanyId || "")) ?? ctxCompany ?? null;
    return {
      ...outerCompanyContext,
      companyId: targetCompanyId || outerCompanyContext.companyId,
      company: targetCompanyDoc,
    };
  }, [outerCompanyContext, targetCompanyId, allCompanies, ctxCompany]);

  const bodyBlock = (
    <>
    <CompanyContext.Provider value={overriddenCompanyContextValue}>
     {/* Dialog-scope VoucherProvider: target company ke parties/accounts/staff/items/vouchers ke listeners
         dialog ke andar attach hote hain — outer page ki useVouchers context unaffected rehti hai. */}
     <VoucherProvider>
     <VoucherAttachmentFallbackContext.Provider value={voucherAttachmentFallbackValue}>
      <>
        <VoucherDialogContent
          {...rest}
          // Journal ledger list: copied-draft me target company scope (compare edit me `editCompanyId`).
          ledgerScopeCompanyId={postCopyNewFormSeed ? targetCompanyId || undefined : editCompanyId}
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
          editingDisabled={editingDisabled || historyBlocksEdit}
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
          onTargetCompanyChange={setTargetCompanyId}
          formInstanceKey={copyDraftSeedVersion}
          showHeaderCompanySelector={!!postCopyNewFormSeed}
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
        />
      </>
     </VoucherAttachmentFallbackContext.Provider>
     </VoucherProvider>
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
   * APK mobile: voucher dialog close par `/dashboard` redirect guard — polling window restore (native ~8s).
   * Desktop / web par no-op (`isStaticAppBuild`).
   */
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        armDashboardRedirectGuard(router, { isMobile });
      }
      onOpenChange?.(open);
    },
    [onOpenChange, router, isMobile]
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
            {/* Resize handle - top edge */}
            <div
              className="absolute left-0 right-0 top-0 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-t"
              onMouseDown={(e) => handleResizeStart(e, "n")}
              aria-hidden
            />
            {/* Resize handle - top-left corner */}
            <div
              className="absolute left-0 top-0 w-4 h-4 cursor-nw-resize hover:bg-primary/20 transition-colors rounded-tl"
              onMouseDown={(e) => handleResizeStart(e, "nw")}
              aria-hidden
            />
            {/* Resize handle - top-right corner */}
            <div
              className="absolute right-0 top-0 w-4 h-4 cursor-ne-resize hover:bg-primary/20 transition-colors rounded-tr"
              onMouseDown={(e) => handleResizeStart(e, "ne")}
              aria-hidden
            />
            {/* Resize handle - left edge */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-l"
              onMouseDown={(e) => handleResizeStart(e, "w")}
              aria-hidden
            />
            {/* Resize handle - right edge */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-r"
              style={{ top: 0, bottom: 0 }}
              onMouseDown={(e) => handleResizeStart(e, "e")}
              aria-hidden
            />
            {/* Resize handle - bottom edge */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-b"
              onMouseDown={(e) => handleResizeStart(e, "s")}
              aria-hidden
            />
            {/* Resize handle - bottom-left corner */}
            <div
              className="absolute left-0 bottom-0 w-4 h-4 cursor-sw-resize hover:bg-primary/20 transition-colors rounded-bl"
              onMouseDown={(e) => handleResizeStart(e, "sw")}
              aria-hidden
            />
            {/* Resize handle - bottom-right corner */}
            <div
              className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize hover:bg-primary/20 transition-colors rounded-br"
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
      {copyButtonMountNode &&
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
            disabled={isCopyingToCompany || !targetCompanyId}
            onClick={async () => {
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