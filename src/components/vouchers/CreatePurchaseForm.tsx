
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch, type Resolver, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
  MutableRefObject,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Checkbox } from "../ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "../ui/alert-dialog";

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp, ArrowRight, Link2, History, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { toast as sonnerToast } from "sonner";
import { replaceVoucherSaveLoadingWithShortSuccess } from "@/lib/voucherSaveUi";

import { useToast } from "@/hooks/use-toast";
import {
  mergeUnitsForDropdown,
  parseCustomUnitsArray,
  persistCustomUnitIfNew,
  unitListHas,
} from "@/lib/companyCustomUnits";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { useIsMobile } from "@/hooks/use-mobile";
import { useResetLinkStateOnCopyTargetCompany } from "@/hooks/useResetLinkStateOnCopyTargetCompany";
import { useCopyDraftFirstSave } from "@/hooks/useCopyDraftFirstSave";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS, VOUCHER_NARRATION_TEXTAREA_CLASS, VOUCHER_MOBILE_ATTACH_TILE_SLOT, VOUCHER_MOBILE_ATTACH_PREVIEW_CLASS, VOUCHER_MOBILE_ATTACH_ADD_SURFACE_CLASS, VOUCHER_DESKTOP_ATTACH_TILE_SLOT, VOUCHER_DESKTOP_ATTACH_PREVIEW_CLASS, VOUCHER_DESKTOP_ATTACH_ADD_SURFACE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory, patchVoucherFields, softDeleteVoucherMoveToRecycleBin, voucherRecycleBinDeletedAt } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { isLocalOnlyMode } from "@/lib/localMode";
import { preferLocalLedgerReads } from "@/lib/apkOnlineFirestoreWritePolicy";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  appendLocalOnlyVoucherFilesToUrls,
  shouldDeferStorageIncrementUntilPendingUpload,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { LinkAdvancesToVoucherDialog, applyAdvancesAllocationsToServer } from "@/components/vouchers/LinkAdvancesToVoucherDialog";
import { LinkSectionInfoDialog } from "@/components/vouchers/LinkSectionInfoDialog";
import { useAdvancesLinkableCount } from "@/hooks/useAdvancesForVoucher";
import { getLinkedAmountsToVoucher, getLinkedAmountRowsFromPending, getOutgoingLinkedAmountRows, mergeLinkedRows, hasPaymentLinks, getAllocationTotal, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

import { firestore, storage } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter } from 'next/navigation';

import type { Party } from "@/components/party/types";
import type { Item } from "@/components/items/types";
import type { Tax, TaxGroup } from "@/components/tax/types";

import BsDatePicker from "@/components/ui/BsDatePicker";
import { Combobox } from "../ui/combobox";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { compressVoucherAttachment } from "@/lib/compression";
import { appendCompressedVoucherAttachmentsToState } from "@/lib/appendCompressedVoucherAttachments";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { attachmentMaxBytes, attachmentStillTooLargeToastFields } from "@/lib/attachmentCompressionUi";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateItemDialog } from "@/components/items/CreateItemDialog";
import { CreateTaxDialog } from "../tax/CreateTaxDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { VoucherPdfAsImageToggle } from "@/components/vouchers/VoucherPdfAsImageToggle";
import {
  convertPdfAttachmentsToJpegIfEnabled,
  shouldSuggestPdfAsImage,
} from "@/lib/voucherAttachmentPdfAsImage";
import { CreateBankAccountDialog } from "../bank-cash/CreateBankAccountDialog";
import { AddVoucherDialog } from "./AddVoucherDialog";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import {
  buildVoucherLineItemComboboxOptions,
  comboboxValueFromLineItemId,
  lineItemIdFromComboboxValue,
} from "@/components/vouchers/voucherLineItemCombobox";


const fileSchema = z.object({
  file: z.instanceof(File),
  preview: z.string(),
});

const lineItemSchema = z.object({
  type: z.enum(["item", "service"]),
  // itemId optional: user can save with just Qty + Rate (free-form line)
  itemId: z.string().optional(),
  quantity: z.coerce.number().min(0, "Quantity must be positive."),
  rate: z.coerce.number().min(0, "Rate must be positive."),
  unit: z.string().optional(),
  amount: z.coerce.number(),
  taxAccountId: z.string().optional(),
  taxAmount: z.coerce.number().optional(),
  isTaxInclusive: z.boolean(),
  /** Purchase: checkbox beside rate — untick to lock rate to item price. */
  allowManualRate: z.boolean().default(true),
});

const formSchema = z.object({
  partyId: z.string().min(1, "Please select a supplier."),
  purchaseAccountId: z.string().optional(),
  date: z.date({ message: "A date is required." }),
  voucherNumber: z.string().min(1, "Voucher number is required."),
  lineItems: z.array(lineItemSchema).min(1, "Please add at least one item."),
  narration: z.string().optional(),
  dueDate: z.date().optional().nullable(),
  /** Overdue page Important filter — Due Date ke niche tick */
  overdueImportant: z.boolean().optional().default(false),
  subTotal: z.coerce.number(),
  totalPurchasePrice: z.coerce.number().optional(),
  discount: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).optional(),
  total: z.coerce.number(),
  unassignedFile: z.any().optional(), // Keep unassignedFile data
  isApproved: z.boolean().optional(),
});

export type PurchaseFormValues = z.infer<typeof formSchema>;

/** RHF+zod errors को save पर toast description के लिए एक string में बाँधता है */
function formatPurchaseFormValidationErrors(errors: FieldErrors<PurchaseFormValues>): string {
  const errorMessages: string[] = [];
  if (errors.partyId?.message) errorMessages.push(`Supplier: ${errors.partyId.message}`);
  if (errors.date?.message) errorMessages.push(`Date: ${errors.date.message}`);
  if (errors.voucherNumber?.message) errorMessages.push(`Voucher No.: ${errors.voucherNumber.message}`);
  if (errors.lineItems) {
    const lineItems = errors.lineItems as Record<
      number,
      { itemId?: { message?: string }; quantity?: { message?: string }; rate?: { message?: string }; amount?: { message?: string } }
    > | undefined;
    Object.entries(lineItems ?? {}).forEach(([idxStr, itemError]) => {
      const index = parseInt(idxStr, 10);
      if (itemError) {
        if (itemError.itemId?.message) errorMessages.push(`Item ${index + 1}: ${itemError.itemId.message}`);
        if (itemError.quantity?.message) errorMessages.push(`Item ${index + 1} Quantity: ${itemError.quantity.message}`);
        if (itemError.rate?.message) errorMessages.push(`Item ${index + 1} Rate: ${itemError.rate.message}`);
        if (itemError.amount?.message) errorMessages.push(`Item ${index + 1} Amount: ${itemError.amount.message}`);
      }
    });
  }
  if (errors.subTotal?.message) errorMessages.push(`Sub Total: ${errors.subTotal.message}`);
  if (errors.total?.message) errorMessages.push(`Total: ${errors.total.message}`);
  return errorMessages.length > 0 ? errorMessages.join(", ") : "Please check the form and try again.";
}

/* --------------------------------- CONSTS -------------------------------- */

// MAX_ATTACHMENTS is now from permissions: fileAttachmentLimits.maxFileCount

// Desktop line grid: Unit (3rd track) Qty + 15px — header/cell thoda wider; baaki Qty jaisa.
const COLS =
  "grid grid-cols-[minmax(220px,2.2fr)_minmax(8.5rem,0.52fr)_minmax(calc(8.5rem+15px),0.52fr)_minmax(8.5rem,0.52fr)_minmax(3.25rem,0.34fr)_minmax(12rem,1.25fr)_minmax(8.5rem,0.58fr)_minmax(8.5rem,0.62fr)_40px] gap-0";
const TH_BASE = "px-2 py-2 bg-muted/50 font-semibold text-sm box-border";
const TD_BASE = "px-2 py-1 box-border";
const FLAT_INPUT = "h-9 w-full border-0 shadow-none focus-visible:ring-0 rounded-none";
const FLAT_SELECT_TRIGGER = "h-9 w-full border-0 shadow-none focus-visible:ring-0 rounded-none";

/* ------------------------------ HELPER FUNCS ------------------------------ */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const getVoucherPrefix = (
  type: "item" | "service",
  prefixes?: Record<string, string[]>
) => {
  if (type === "service") {
    return (prefixes?.purchase_service && prefixes.purchase_service[0]) || "PS-";
  }
  return (prefixes?.purchase && prefixes.purchase[0]) || "PUR-";
};

function getInitialFormValues(voucher?: any): PurchaseFormValues {
  if (!voucher) {
    return {
      partyId: "",
      purchaseAccountId: "purchase_account",
      date: startOfDay(new Date()),
      voucherNumber: "",
      narration: "",
      dueDate: undefined,
      overdueImportant: false,
      lineItems: [
        {
          type: "item",
          itemId: "",
          quantity: 1,
          rate: 0,
          unit: "",
          amount: 0,
          taxAccountId: "",
          taxAmount: 0,
          isTaxInclusive: false,
          allowManualRate: true,
        },
      ],
      subTotal: 0,
      totalPurchasePrice: 0,
      discount: 0,
      tax: 0,
      total: 0,
      unassignedFile: null, // सुरुमा null राख्ने
      isApproved: false,
    };
  }

  const copiedVoucher = JSON.parse(JSON.stringify(voucher));
  // Restore/cache dueDate may be plain Firestore JSON; parse it exactly like voucher date.
  const dueDate = parseFirestoreDateFieldToJsDate(voucher.dueDate ?? voucher.due_date) ?? undefined;
  const lineItemsNorm = Array.isArray(copiedVoucher.lineItems)
    ? copiedVoucher.lineItems.map((li: any) => ({
        ...li,
        allowManualRate: li?.allowManualRate !== false,
      }))
    : copiedVoucher.lineItems;
  return {
    ...copiedVoucher,
    lineItems: lineItemsNorm,
    // Backup/local cache can store date as plain `{ seconds, nanoseconds }`, so avoid `new Date(object)`.
    date: parseFirestoreDateFieldToJsDate(voucher.date) ?? startOfDay(new Date()),
    dueDate: dueDate ?? undefined,
    overdueImportant: voucher.overdueImportant === true,
    discount: voucher.discount || 0,
    tax: voucher.tax || 0,
    files: voucher.fileUrls ? voucher.fileUrls.map((url: string) => ({ file: null, preview: url })) : [],
    purchaseAccountId: voucher.purchaseAccountId || 'purchase_account',
    unassignedFile: voucher.unassignedFile || null,
    isApproved: voucher.isApproved ?? false,
  };
}

/* --------------------------------- MAIN ---------------------------------- */

export function CreatePurchaseForm({
  voucher,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
  onEffectiveLinksChange,
  copySaveTargetCompanyId,
  copyMismatchCategories,
  onCopyMissingCategory,
  isCopyingMissingMasters = false,
  copyMasterDraftRequest,
  recurringVoucherSaveBlocked = false,
  recurringVoucherAuxiliaryDirty = false,
}: {
  voucher?: any;
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  /** Report effective has-links so dialog can hide banner and enable fields when user unlinks locally. */
  onEffectiveLinksChange?: (hasLinks: boolean | undefined) => void;
  copySaveTargetCompanyId?: string;
  copyMismatchCategories?: string[];
  onCopyMissingCategory?: (category: string) => void;
  isCopyingMissingMasters?: boolean;
  copyMasterDraftRequest?: {
    category: string;
    targetCompanyName: string;
    sourceCollection: string;
    sourceName: string;
    /** AddVoucherDialog `openCopyMasterDraftForCategory` se poori source row (Payment In jaisa). */
    sourceRowPayload?: Record<string, unknown>;
  } | null;
  recurringVoucherSaveBlocked?: boolean;
  recurringVoucherAuxiliaryDirty?: boolean;
}) {
  /* ------------------------------ HOOKS/STATE ----------------------------- */
  const isMounted = useRef(true);
  type ProcessedItem = Item & { stockInQty?: number; stockOutQty?: number; stockQty?: number; displayStockQty?: number; };
  const { vouchers, processedParties, processedPartiesForSelection, processedTaxes, processedAccounts, expenseAccounts, processedExpenseGroups, loading: vouchersLoading } = useVouchers();
  const [items, setItems] = useState<Item[]>([]);
  const { toast } = useToast();
  const { company, companyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const { user, customUser } = useAuth();
  const { role, can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const { dateSystem, formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS } = useDate();
  const router = useRouter();
  const isMobile = useIsMobile();
  const fileAttachLockedByDialog = !!voucher?.id && deleteDisabledWhenLinked;

  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  /** Naye party save ke turant baad parties sync se pehle stale-master effect `partyId` na wipe kare. */
  const pendingPartyIdUntilInPartiesListRef = useRef<string | null>(null);
  /** Items listener pehli snapshot se pehle stale-master effect saved `itemId` na clear kare. */
  const itemsListHydratedRef = useRef(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  // Purchase Account combobox: allow creating a new expense/income account inline.
  const [isCreateExpenseAccountOpen, setIsCreateExpenseAccountOpen] = useState(false);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [files, setFiles] = useState<(File | string)[]>([]);
  /** `FilePreview` stable URL list — inline `.filter` har render naya ref banata tha → preview flash. */
  const attachmentClientFileUrlsForPreview = useMemo(
    () => files.filter((f): f is string => typeof f === "string"),
    [files]
  );
  const [savePdfAsImage, setSavePdfAsImage] = useState(false);
  const showPdfAsImageToggle = useMemo(
    () =>
      allowAttachments &&
      fileAttachmentLimits.maxFileCount > 0 &&
      (fileAttachmentLimits.allowPDF || shouldSuggestPdfAsImage(files)),
    [allowAttachments, fileAttachmentLimits.maxFileCount, fileAttachmentLimits.allowPDF, files]
  );
  const initialFilesRef = useRef<string[]>([]);
  /** Skip reset when same voucher updates (liveVoucher) and user has edits — fixes unlink → change fields → save. */
  const lastResetVoucherIdRef = useRef<string | null>(null);
  const [taxRowIndex, setTaxRowIndex] = useState<number | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDueDateCalendarOpen, setIsDueDateCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLinkAdvancesOpen, setIsLinkAdvancesOpen] = useState(false);
  // Static/copy-draft me rapid multi-click se parallel saves queue ho rahe the; ek hi submit ko allow karo.
  const submitInFlightRef = useRef(false);
  // Link sections are collapsed by default in add/new; edit shows automatically only when already linked.
  const [showLinkSections, setShowLinkSections] = useState(false);
  const [pendingLinkAllocations, setPendingLinkAllocations] = useState<Record<string, number> | null>(null);
  const resetLinksOnCopyTargetChange = useCallback(() => {
    setPendingLinkAllocations(null);
    setShowLinkSections(false);
    setIsLinkAdvancesOpen(false);
    onEffectiveLinksChange?.(false);
  }, [onEffectiveLinksChange]);
  useResetLinkStateOnCopyTargetCompany(copySaveTargetCompanyId, resetLinksOnCopyTargetChange);
  const {
    resolveVoucherIdForSave,
    isPermissionEdit,
    markCopiedDraftPersisted,
    isCopiedDraftFirstInsert,
  } = useCopyDraftFirstSave(copySaveTargetCompanyId);
  // Keep "Read me" help controlled from this form so purchase link section can open the shared multilingual guide.
  const [linkSectionInfoOpen, setLinkSectionInfoOpen] = useState(false);
  const isEditing = !!voucher?.id;
  const isEditingAndConverting = voucher && voucher.type !== "purchase";
  
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(formSchema) as Resolver<PurchaseFormValues>,
    defaultValues: getInitialFormValues(voucher),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const [itemType, setItemType] = useState<"item" | "service">("item");
  const isCompanyAdmin = role === "owner" || customUser?.role === "CompanyAdmin" || customUser?.role === "SuperAdmin";
  const showApprovalCheckbox = false; // Approval is handled via the Approve button, not a checkbox

const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f: any) => typeof f === 'string') as string[];
    const newFiles    = files.filter((f: any) => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u: any, i: number) => u !== init[i]);
  })();
  const isFormDirty =
    _isFormFieldsDirty || _isFileDirty || (pendingLinkAllocations != null) || recurringVoucherAuxiliaryDirty;
  const watchedLineItems = useWatch({ control: form.control, name: "lineItems", defaultValue: [] });
  const watchedDiscount = useWatch({ control: form.control, name: "discount" });
  const partyId = form.watch("partyId");
  const lineItemTaxId = watchedLineItems[0]?.taxAccountId;
  
  const primaryLineItemType = useMemo(() => {
    return watchedLineItems.length > 0 && watchedLineItems[0].type === "service" ? "service" : "item";
  }, [watchedLineItems]);
  
  const partyBalance = useMemo(() => {
    if (!partyId) return null;
    return processedParties.find(p => p.id === partyId)?.balance;
  }, [partyId, processedParties]);
  
  const selectedTax = useMemo(() => processedTaxes.find((t) => t.id === lineItemTaxId), [lineItemTaxId, processedTaxes]);
  // Expense subtree: nested groups (parent = UUID under Direct/Indirect Expense) pehle filter se cut ho rahe the — parent chain se "expenses" tak walk (Sale / Income jaisa)
  const expenseGroupIds = useMemo(() => {
    const groups = processedExpenseGroups || [];
    const groupMap = new Map(groups.map((g: any) => [g.id, g]));
    const ids = new Set<string>();
    const isExpenseRoot = (id: string) => {
      const s = String(id || "").toLowerCase();
      return s === "expenses" || s === "direct_expense" || s === "indirect_expense";
    };
    const hasExpenseAncestor = (g: any, visited = new Set<string>()): boolean => {
      if (!g || visited.has(g.id)) return false;
      visited.add(g.id);
      const parentId = String(g.parentId || "").toLowerCase();
      const type = String(g.type || "").toLowerCase();
      if (isExpenseRoot(g.id) || parentId === "expenses" || type === "expense") return true;
      if (g.parentId && groupMap.has(g.parentId)) return hasExpenseAncestor(groupMap.get(g.parentId), visited);
      return false;
    };
    groups.forEach((g: any) => {
      if (hasExpenseAncestor(g)) ids.add(g.id);
    });
    return ids;
  }, [processedExpenseGroups]);
  const purchaseAccountOptions = useMemo(
    () =>
      expenseAccounts
        .filter(
          (a: any) =>
            (a.groupId && expenseGroupIds.has(a.groupId)) || String((a as any).type || "").toLowerCase() === "expense"
        )
        .map((p: any) => ({ value: p.id, label: p.name })),
    [expenseAccounts, expenseGroupIds]
  );
  // All unique units from all items — merged with `company.customUnits` for blank-item rows
  const allCompanyUnits = useMemo(() => {
    const units = new Set<string>();
    (items || []).forEach((item: any) => {
      const convs = (item.unitConversions || []) as { fromUnit?: string; toUnit?: string }[];
      convs.forEach((uc) => {
        if (uc.fromUnit) units.add(uc.fromUnit);
        if (uc.toUnit) units.add(uc.toUnit);
      });
      const ob = item.openingBalanceUnit;
      if (ob) units.add(ob);
      if (item.salePriceUnit) units.add(String(item.salePriceUnit));
      if (item.purchasePriceUnit) units.add(String(item.purchasePriceUnit));
    });
    return Array.from(units).sort();
  }, [items]);
  const companyUnitsMerged = useMemo(
    () => mergeUnitsForDropdown(allCompanyUnits, parseCustomUnitsArray(company?.customUnits)),
    [allCompanyUnits, company?.customUnits]
  );
  const onPersistNewUnit = useCallback(
    (comboboxVal: string, unitLabel: string) => {
      if (comboboxVal !== "add-new" || !unitLabel.trim()) return;
      void persistCustomUnitIfNew({
        companyId,
        unitLabel,
        reloadLocalCompanyRegistry,
        triggerSync,
      }).catch((e) => {
        console.error("persistCustomUnitIfNew", e);
        toast({ variant: "destructive", title: "Could not save unit list", description: "Check connection and try again." });
      });
    },
    [companyId, reloadLocalCompanyRegistry, triggerSync, toast]
  );

  const voucherIdForLinks = isCopiedDraftFirstInsert ? undefined : (voucher?.id ?? savedVoucherId ?? undefined);
  // Incoming: who allocated to us. Outgoing: we allocated to Sale (purchase return). When pending is set, show only pending so unlink reflects immediately.
  const effectiveLinkedRows = useMemo(() => {
    const incoming = pendingLinkAllocations != null && vouchers?.length
      ? getLinkedAmountRowsFromPending(pendingLinkAllocations, vouchers, "purchase")
      : getLinkedAmountsToVoucher(vouchers, voucherIdForLinks, "purchase", "all");
    let outgoing = getOutgoingLinkedAmountRows(vouchers, voucherIdForLinks, "purchase", "all");
    if (pendingLinkAllocations != null) {
      const pendingIds = new Set(Object.keys(pendingLinkAllocations));
      outgoing = outgoing.filter((r) => r.paymentVoucherId && pendingIds.has(r.paymentVoucherId));
    }
    return mergeLinkedRows(incoming, outgoing);
  }, [vouchers, voucherIdForLinks, pendingLinkAllocations, isCopiedDraftFirstInsert]);
  const linkedAmountRows = effectiveLinkedRows;
  const totalLinked = useMemo(() => linkedAmountRows.reduce((s, r) => s + r.amount, 0), [linkedAmountRows]);
  // Report effective link state to dialog so banner/fields follow local unlink (pending = {} → no links → enable edit)
  useEffect(() => {
    if (!onEffectiveLinksChange) return;
    if (pendingLinkAllocations === null) {
      onEffectiveLinksChange(undefined);
      return;
    }
    onEffectiveLinksChange(linkedAmountRows.length > 0);
  }, [onEffectiveLinksChange, pendingLinkAllocations, linkedAmountRows.length]);
  // Convert to Record for dialog initial state so edit link page shows correct tick (avoids stale vouchers)
  const effectiveLinkedAmountsForDialog = useMemo(() => {
    const r: Record<string, number> = {};
    for (const row of linkedAmountRows) {
      if (row.paymentVoucherId) r[row.paymentVoucherId] = row.amount;
    }
    return r;
  }, [linkedAmountRows]);
  /** Per payment_out: total voucher amount and total allocated (for Amount, Linked on others, Linked on current columns). */
  const paymentVoucherDetails = useMemo(() => {
    const m = new Map<string, { total: number; totalAllocated: number }>();
    if (!vouchers?.length) return m;
    for (const v of vouchers) {
      if (v.type !== "payment_out" && v.type !== "direct_expense") continue;
      const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
      const allocations = ((v as any).allocations as { amount?: number; voucherId?: string }[] | undefined) || [];
      const totalAllocated = allocations.reduce((s, a) => s + getAllocationTotal(a as any), 0);
      m.set(v.id, { total, totalAllocated });
    }
    return m;
  }, [vouchers]);
  /** Bill wise: count of Payment Out / Direct Expense vouchers for this party with unallocated amount (available to link to this purchase). Message uses "bcz" spelling. */
  /** Bill wise: same count as Link to Dr popup (OB row + payment out/sale list). */
  const billWiseLinkableCount = useAdvancesLinkableCount(
    "purchase",
    partyId,
    voucher?.id ?? savedVoucherId ?? undefined,
    vouchers ?? [],
    processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0
  );
  const hasItemEditLock = linkedAmountRows.length > 0;
  const isEditMode = !!voucher?.id;
  const canRenderBillWiseSection = isEditing || !!partyId;
  const shouldShowBillWiseSection = canRenderBillWiseSection && (showLinkSections || (isEditMode && linkedAmountRows.length > 0));
  const shouldShowLinkButton = canRenderBillWiseSection && !shouldShowBillWiseSection;

  useEffect(() => {
    if (isEditMode && linkedAmountRows.length > 0) setShowLinkSections(true);
  }, [isEditMode, linkedAmountRows.length]);

  const transactionDates = useMemo(() => {
    if (!vouchers?.length) return [];
    return vouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [vouchers]);

  const allProcessedItems = useMemo(() => {
    if (!items || !vouchers) return [];
    return items.map((item) => {
        const newItem: ProcessedItem = { 
            ...item, 
            debit: 0, 
            credit: 0, 
            balance: (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0),
            stockInQty: 0,
            stockOutQty: 0,
            stockQty: Number(item.openingBalance) || 0,
        };
        
        const conversions = (item.unitConversions || []) as any[];
        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');

        const getFactor = (unit: string): number => {
            if (!unit || conversions.length === 0) return 1;
            if (unit === smallestUnit) return 1;
            
            let factor = 1;
            let currentUnit = unit;
            
            for (let i=0; i < 10; i++) { // safety break
                const conv = conversions.find(c => c.fromUnit === currentUnit);
                if (!conv) return 0; // Should not happen in a valid chain
                factor *= Number(conv.conversionFactor) || 1;
                currentUnit = conv.toUnit;
                if (currentUnit === smallestUnit) break;
            }
            return factor;
        };
        
        vouchers.forEach((v) => {
          if (v.lineItems?.some((li: any) => li.itemId === item.id)) {
              const itemInVoucher = v.lineItems.find((li: any) => li.itemId === item.id);
              if (v.type === 'purchase') {
                  newItem.debit += (Number(itemInVoucher.quantity) || 0) * (Number(itemInVoucher.rate) || 0);
                  if (newItem.stockInQty !== undefined && itemInVoucher.unit) {
                    newItem.stockInQty += (Number(itemInVoucher.quantity) || 0) * getFactor(itemInVoucher.unit);
                  }
              } else if (v.type === 'sale') {
                  const purchasePrice = Number(item.purchasePrice) || Number(itemInVoucher.rate);
                  const qty = Number(itemInVoucher.quantity) || 0;
                  newItem.credit += v.totalPurchasePrice && v.totalPurchasePrice > 0 ? v.totalPurchasePrice : (qty * purchasePrice);
                  if (newItem.stockOutQty !== undefined && itemInVoucher.unit) {
                    newItem.stockOutQty += (Number(itemInVoucher.quantity) || 0) * getFactor(itemInVoucher.unit);
                  }
              }
          }
        });

        newItem.balance = (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0) + newItem.debit - newItem.credit;
        
        const openingUnit = (item as any).openingBalanceUnit || (conversions.length > 0 ? conversions[0].fromUnit : "");
        const openingStockInSmallest = (Number(item.openingBalance) || 0) * (openingUnit ? getFactor(openingUnit) : 1);
        
        const closingStockInSmallest = openingStockInSmallest + (newItem.stockInQty || 0) - (newItem.stockOutQty || 0);
        
        newItem.stockQty = closingStockInSmallest;
        
        const displayUnitFactor = getFactor((item as any).displayUnit || smallestUnit || '');
        
        newItem.displayStockQty = displayUnitFactor > 0 ? newItem.stockQty / displayUnitFactor : 0;
        
        return newItem;
      });
  }, [items, vouchers]);

  /* --------------------------- COMPANY CONFIG FLAGS ----------------------- */

  const isAutoVoucherEnabled =
    company?.autoVoucherNumbering?.[
      primaryLineItemType === "service" ? "purchase_service" : "purchase"
    ] ?? true;

  const isVoucherEditingAllowed =
    company?.allowVoucherNumberEditing?.[
      primaryLineItemType === "service" ? "purchase_service" : "purchase"
    ] ?? false;

  const isPrefixSelectionEnabled =
    company?.enableVoucherPrefixSelection?.[
      primaryLineItemType === "service" ? "purchase_service" : "purchase"
    ] ?? false;

  const canEditRates = can('edit_item_rates_in_vouchers');
  const companyAllowsLineRatePurchase = company?.allowRateEditing?.purchase ?? true;
  const isRateEditingAllowed = companyAllowsLineRatePurchase && canEditRates;
  /** Same pattern as Sale: line allowManualRate must be true to type in rate. */
  const purchaseRateDisabled = (idx: number, rowLocked: boolean) =>
    rowLocked ||
    !isRateEditingAllowed ||
    watchedLineItems?.[idx]?.allowManualRate === false;

  /* ----------------------------- EFFECTS: DATA ---------------------------- */

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) {
      itemsListHydratedRef.current = false;
      return;
    }
    itemsListHydratedRef.current = false;

     const unsubItems = onSnapshot(
      query(collection(firestore, `companies/${companyId}/items`)),
      (snapshot) => {
        itemsListHydratedRef.current = true;
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Item)).filter(i => !i.isDeleted));
      }
    );

    return () => {
      unsubItems();
    };
  }, [companyId]);

  // Voucher reset: isFormDirty deps mat — file add se dirty → effect → party "" set hone se bug (sale jaisa)
  useEffect(() => {
    if (voucher?.id) {
      const isSameVoucher = lastResetVoucherIdRef.current === voucher.id;
      // Sale jaisa: edit par snapshot se bar‑bar `form.reset` — date save / field edit wipe
      if (isSameVoucher) return;
      lastResetVoucherIdRef.current = voucher.id;
      const initialValues = getInitialFormValues(voucher);
      form.reset(initialValues);
      const li0 = initialValues.lineItems?.[0];
      if (li0?.type === "service" || li0?.type === "item") {
        setItemType(li0.type);
      }
      setSavedVoucherId(voucher.id);
      const urlsToSet = voucher.unassignedFile?.url ? [voucher.unassignedFile.url] : (voucher.fileUrls || []);
      if (Array.isArray(urlsToSet)) {
        setFiles(urlsToSet);
        initialFilesRef.current = urlsToSet.filter((f: any) => typeof f === "string") as string[];
        setSavePdfAsImage(shouldSuggestPdfAsImage(urlsToSet));
      }
    } else if (voucher) {
      // Recon sync draft — poora purchase form hydrate
      const cref = voucher.crossCopySourceRef as { companyId?: string; voucherId?: string } | undefined;
      const syncDraftKey =
        cref?.companyId && cref?.voucherId
          ? `sync:${cref.companyId}|${cref.voucherId}`
          : `new:${String(voucher.type || "purchase")}|${String(voucher.partyId || "")}|${String(voucher.narration || "").slice(0, 40)}`;
      const isFirstNewPurchaseHydrate = lastResetVoucherIdRef.current !== syncDraftKey;
      lastResetVoucherIdRef.current = syncDraftKey;
      setSavedVoucherId(null);
      if (isFirstNewPurchaseHydrate) {
        const initialValues = getInitialFormValues(voucher);
        form.reset(initialValues);
        const li0 = initialValues.lineItems?.[0];
        if (li0?.type === "service" || li0?.type === "item") {
          setItemType(li0.type);
        }
      }
      const urlsToSet = voucher.unassignedFile?.url ? [voucher.unassignedFile.url] : (voucher.fileUrls || []);
      if (Array.isArray(urlsToSet)) {
        setFiles(urlsToSet);
        initialFilesRef.current = urlsToSet.filter((f: any) => typeof f === "string") as string[];
        setSavePdfAsImage(shouldSuggestPdfAsImage(urlsToSet));
      }
    } else {
      lastResetVoucherIdRef.current = null;
    }
  }, [voucher, form]);

  /* ---------------------- AUTO VOUCHER NUMBER GENERATION ------------------ */

  const fetchVoucherNumber = useCallback(
    async (prefix?: string) => {
      const type = primaryLineItemType === "service" ? "purchase_service" : "purchase";
      if (!companyId || !company || !isAutoVoucherEnabled) return;

      const prefixes =
        company?.voucherPrefixes?.[type] || [getVoucherPrefix(primaryLineItemType)];
      const VOUCHER_PREFIX = prefix || prefixes[0];

      try {
        let voucherNumbers: string[] = [];
        // APK/static offline: Firestore `getDocs` hang/empty — SQLite mirror se max number (Payment In jaisa).
        if (preferLocalLedgerReads()) {
          const rows = await listCompanyDocsFromBrowserDb(companyId, "vouchers");
          voucherNumbers = rows
            .filter((r: { type?: string }) => String(r?.type ?? "") === "purchase")
            .filter((r: { lineItems?: { type?: string }[] }) => (r.lineItems?.[0]?.type || "item") === primaryLineItemType)
            .map((r: { voucherNumber?: string }) => String(r?.voucherNumber ?? ""))
            .filter(Boolean);
        } else {
          const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "purchase"));
          const querySnapshot = await getDocs(q);
          voucherNumbers = querySnapshot.docs
            .map((doc) => doc.data())
            .filter((data) => (data.lineItems?.[0]?.type || "item") === primaryLineItemType)
            .map((data) => data.voucherNumber as string);
        }

        let maxNum = 0;
        voucherNumbers.forEach((numStr) => {
          if (numStr && (numStr.startsWith(normalizePrefix(VOUCHER_PREFIX)) || numStr.startsWith(VOUCHER_PREFIX))) {
            const num = parseVoucherNumberPart(numStr, VOUCHER_PREFIX);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });

        const nextVoucherNumber = maxNum + 1;
        form.setValue("voucherNumber", formatVoucherNumber(VOUCHER_PREFIX, nextVoucherNumber));
      } catch (err) {
        console.error("fetchVoucherNumber error:", err);
      }
    },
    [companyId, company, form, primaryLineItemType, isAutoVoucherEnabled]
  );

  useEffect(() => {
    if ((!savedVoucherId || isEditingAndConverting) && isAutoVoucherEnabled && !voucher?.id) {
      fetchVoucherNumber();
    }
  }, [voucher?.id, savedVoucherId, isEditingAndConverting, fetchVoucherNumber, primaryLineItemType, company, isAutoVoucherEnabled]);

  /* ---------------------------- TOTALS CALC LOGIC ------------------------- */

    const getUnitBasedPrice = (item: Item, unit: string, priceType: 'sale' | 'purchase'): number => {
    const conversions = (item.unitConversions || []) as any[];
    if (conversions.length === 0) {
      return priceType === 'sale' ? item.salePrice : item.purchasePrice;
    }

    const smallestUnit = conversions[conversions.length - 1].toUnit;

    const basePrice = priceType === 'sale' ? item.salePrice : item.purchasePrice;
    const baseUnit = priceType === 'sale' ? item.salePriceUnit : (item as any).purchasePriceUnit;

    let smallestUnitPrice = basePrice;
    if (baseUnit && baseUnit !== smallestUnit) {
      let factor = 1;
      let current = baseUnit;
      while (current !== smallestUnit) {
        const conv = conversions.find((c) => c.fromUnit === current);
        if (!conv) { factor = 0; break; }
        factor *= Number(conv.conversionFactor) || 1;
        current = conv.toUnit;
      }
      smallestUnitPrice = basePrice / (factor || 1);
    }
    
    let targetPrice = smallestUnitPrice;
    if (unit !== smallestUnit) {
      let factor = 1;
      let current = unit;
       while (current !== smallestUnit) {
          const conv = conversions.find((c) => c.fromUnit === current);
          if (!conv) { factor = 0; break; }
          factor *= Number(conv.conversionFactor) || 1;
          current = conv.toUnit;
        }
      targetPrice *= factor;
    }
    
    return targetPrice;
  };

  useEffect(() => {
    const taxMap = new Map<string, number>(processedTaxes.map((t) => [t.id, Number(t.rate) / 100]));

    let subTotal = 0;
    let totalTax = 0;
    let totalPurchasePrice = 0;

    (watchedLineItems || []).forEach((item, index) => {
      const qty = Number(item?.quantity ?? 0);
      const rate = Number(item?.rate ?? 0);
      let amount = 0;
      let taxAmount = 0;

      const taxRate = taxMap.get(String(item?.taxAccountId)) ?? 0;

      if (item.isTaxInclusive) {
        amount = round2(qty * (rate / (1 + taxRate)));
        taxAmount = round2(amount * taxRate);
      } else {
        amount = round2(qty * rate);
        taxAmount = round2(amount * taxRate);
      }
      
      const itemData = allProcessedItems.find(i => i.id === item.itemId);
      const purchasePriceForLine = itemData ? getUnitBasedPrice(itemData, item.unit || '', 'purchase') : 0;
      const linePurchasePrice = qty * purchasePriceForLine;
      totalPurchasePrice += linePurchasePrice;


      const currAmount = Number(form.getValues(`lineItems.${index}.amount`) ?? 0);
      const currTaxAmt = Number(form.getValues(`lineItems.${index}.taxAmount`) ?? 0);

      if (currAmount !== amount) {
        form.setValue(`lineItems.${index}.amount`, amount, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
      }
      if (currTaxAmt !== taxAmount) {
        form.setValue(`lineItems.${index}.taxAmount`, taxAmount, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
      }

      subTotal += amount;
      totalTax += taxAmount;
    });

    subTotal = round2(subTotal);
    totalTax = round2(totalTax);
    const discount = round2(Number(watchedDiscount ?? 0));
    const total = round2(subTotal - discount + totalTax);

    const currSubTotal = Number(form.getValues("subTotal") ?? 0);
    const currTotalPurchase = Number(form.getValues("totalPurchasePrice") ?? 0);
    const currTax = Number(form.getValues("tax") ?? 0);
    const currTotal = Number(form.getValues("total") ?? 0);

    if (currSubTotal !== subTotal) {
      form.setValue("subTotal", subTotal, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
    if (currTotalPurchase !== totalPurchasePrice) {
      form.setValue("totalPurchasePrice", totalPurchasePrice, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
    if (currTax !== totalTax) {
      form.setValue("tax", totalTax, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
    if (currTotal !== total) {
      form.setValue("total", total, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
  }, [watchedLineItems, watchedDiscount, processedTaxes, form, allProcessedItems]);

  /* ------------------------------ HANDLERS -------------------------------- */

  const handleToggleAllInclusive = useCallback(
    (checked: boolean | "indeterminate") => {
      const val = checked === true;
      (watchedLineItems || []).forEach((_, idx) => {
        form.setValue(`lineItems.${idx}.isTaxInclusive`, val, {
          shouldDirty: true,
        });
      });
    },
    [form, watchedLineItems]
  );
  
  const processAndSaveRef = useRef<((data: any, opts?: any) => Promise<any>) | null>(null);

  // Validated payload `data` से save — `getValues()` से date कभी-कभी miss होकर coerce में "आज" भर जाता था
  const handleFormSubmit = useCallback(
    (e: React.FormEvent, options: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}) => {
      e.preventDefault();
      if (submitInFlightRef.current || isLoading) return;
      submitInFlightRef.current = true;
      void (async () => {
        try {
          await form.handleSubmit(
            async (data) => {
              await processAndSaveRef.current?.(data, options);
            },
            (errors) => {
              sonnerToast.error("Validation Failed", { description: formatPurchaseFormValidationErrors(errors) });
            }
          )(e);
        } finally {
          submitInFlightRef.current = false;
        }
      })();
    },
    [form, isLoading]
  );

   const processAndSave = useCallback(
    async (
      data: PurchaseFormValues,
      { saveAndNew, print, approveAfterSave }: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}
    ): Promise<string | null> => {
      const toastId = sonnerToast.loading("Saving purchase...");
      if (isMounted.current) setIsLoading(true);

      if (!user || !companyId || !company) {
        sonnerToast.error("Error", {
          id: toastId,
          description: "Login and company selection required.",
        });
        if (isMounted.current) setIsLoading(false);
        return null;
      }

      try {
        // Permission check: create or edit
        const isEdit = isPermissionEdit(!!voucher?.id, savedVoucherId);
        const voucherDateRaw = data.date;
        const voucherDate =
          voucherDateRaw instanceof Date ? voucherDateRaw : new Date(voucherDateRaw as unknown as string);
        // zod-validated values में valid Date आनी चाहिए; invalid पर coerce "आज" न हो
        if (Number.isNaN(voucherDate.getTime())) {
          sonnerToast.error("Error", {
            id: toastId,
            description: "Invalid transaction date. Please pick the date again.",
          });
          if (isMounted.current) setIsLoading(false);
          return null;
        }
        
        if (isEdit) {
          // Check edit permission - determine ownership
          const fetchVoucher = async (cid: string, vid: string) => {
            const voucherDoc = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
            return voucherDoc.exists() ? voucherDoc.data() : null;
          };
          const isOwnRecord = await determineVoucherOwnership(voucher, savedVoucherId, vouchers, user.uid, companyId, fetchVoucher);
          const currentVoucher = voucher ?? (savedVoucherId && vouchers ? vouchers.find((v: any) => v.id === savedVoucherId) : null);
          assertCanEdit(canEditRecord, isOwnRecord, currentVoucher);
          
          // Check backdate limit for edit - use ORIGINAL voucher date, not form date
          let originalVoucherDate = voucherDate;
          if (voucher?.date) {
            originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
          } else if (savedVoucherId) {
            const existingVoucher = vouchers.find(v => v.id === savedVoucherId);
            if (existingVoucher?.date) {
              originalVoucherDate = existingVoucher.date?.toDate ? existingVoucher.date.toDate() : new Date(existingVoucher.date);
            } else if (companyId) {
              const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
              if (voucherDoc.exists()) {
                const voucherData = voucherDoc.data();
                originalVoucherDate = voucherData.date?.toDate ? voucherData.date.toDate() : new Date(voucherData.date);
              }
            }
          }
          assertCanPerformBackdated(canPerformBackdatedAction, "edit", originalVoucherDate);
        } else {
          // Check create permission
          assertCan(can, "create_records");
          
          // Check backdate limit for create
          assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate);
        }
        const lineItemsWithTax = data.lineItems.map((li) => ({
          ...li,
          quantity: Number(li.quantity),
          taxAmount: li.taxAmount || 0,
          // Bina item = blank; select karke save par id Firestore me persist ho.
          itemId: String(li.itemId ?? "").trim(),
        }));

        const submissionData = {
          ...data,
          lineItems: lineItemsWithTax,
          type: "purchase",
        };

        let filesForSave = files;
        if (savePdfAsImage) {
          const convToast = sonnerToast.loading("Converting PDF attachments to image…");
          try {
            filesForSave = await convertPdfAttachmentsToJpegIfEnabled(files, true);
          } finally {
            sonnerToast.dismiss(convToast);
          }
        }

        const originalVoucherIdToDelete: string | null =
          isEditingAndConverting && voucher?.id ? String(voucher.id) : null;
        const idArgForFirestore = resolveVoucherIdForSave({
          savedVoucherId,
          originalVoucherIdToDelete,
        });

        let existingFileUrls = filesForSave.filter(
          (f): f is string => typeof f === "string"
        );
        let preGeneratedVoucherId: string | undefined;

        // If an unassignedFile is present, add its URL
        if(data.unassignedFile?.url && !existingFileUrls.includes(data.unassignedFile.url)) {
            existingFileUrls.push(data.unassignedFile.url);
        }

        const newFilesToUpload = filesForSave.filter(
          (f): f is File => f instanceof File
        );

        if (newFilesToUpload.length > 0) {
          const totalNewBytes = newFilesToUpload.reduce((s, f) => s + (f.size || 0), 0);
          const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes }, company?.storageOption);
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
            setIsLoading(false);
            return null;
          }
          if (await shouldStageNewVoucherFilesAsLocalPending(companyId)) {
            const voucherIdForLocalAttachments =
              isEditingAndConverting && voucher?.id
                ? null
                : idArgForFirestore ?? null;
            const { fileUrls: mergedUrls, preGeneratedVoucherId: preGen } =
              await appendLocalOnlyVoucherFilesToUrls({
                companyId,
                storageFolder: "purchase",
                existingFileUrls,
                newFiles: newFilesToUpload,
                maxFileCount: fileAttachmentLimits.maxFileCount,
                existingVoucherId: voucherIdForLocalAttachments,
              });
            existingFileUrls = mergedUrls;
            if (preGen) preGeneratedVoucherId = preGen;
            if (!shouldDeferStorageIncrementUntilPendingUpload()) {
              try {
                await incrementCompanyStorage(companyId, {
                  attachmentsBytes: totalNewBytes,
                  storageBytes: totalNewBytes,
                });
              } catch {
                /* offline */
              }
            }
          } else {
            for (const file of newFilesToUpload) {
              if (existingFileUrls.length >= fileAttachmentLimits.maxFileCount) break;
              const storageRef = ref(
                storage,
                `voucher-files/${companyId}/purchase/${Date.now()}_${file.name}`
              );
              const snapshot = await uploadBytes(storageRef, file);
              const url = await getDownloadURL(snapshot.ref);
              existingFileUrls.push(url);
              await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
            }
          }
        }

        let finalData = {
          ...submissionData,
          fileUrls: existingFileUrls,
          unassignedFile: data.unassignedFile || voucher?.unassignedFile || null,
          isApproved: isCompanyAdmin ? true : (data.isApproved ?? voucher?.isApproved ?? false),
        };
        // Keep opening balance link from current voucher (set by Link to Txns); copy-draft pehli save par purani row na uthao
        const currentPurchase = isCopiedDraftFirstInsert
          ? null
          : (savedVoucherId && vouchers ? vouchers.find((v: any) => v.id === savedVoucherId) : voucher);
        const obAlloc = currentPurchase != null ? (currentPurchase as any).openingBalanceAllocated : undefined;
        if (obAlloc !== undefined && obAlloc !== null && Number(obAlloc) >= 0) {
          (finalData as any).openingBalanceAllocated = Number(obAlloc) || 0;
        }
        
        if (!idArgForFirestore) delete (finalData as { id?: string }).id;

        const isEditForApprove = !!voucher?.id && !originalVoucherIdToDelete;
        const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
        const savedDoc = await saveVoucher(
          companyId,
          user.uid,
          finalData,
          idArgForFirestore,
          approveAfterSave && isEditForApprove ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined,
          preGeneratedVoucherId ? { preGeneratedVoucherId } : undefined
        );

        let docId: string | null | undefined;
        if (savedDoc && savedDoc.id) {
            markCopiedDraftPersisted();
            docId = savedDoc.id;
            if (isMounted.current) setSavedVoucherId(docId);
            if (originalVoucherIdToDelete) {
                // Converted source voucher ko local/offline me bhi recycle-bin mark karo.
                await patchVoucherFields(companyId, originalVoucherIdToDelete, {
                    isDeleted: true,
                    deletedAt: voucherRecycleBinDeletedAt(),
                    convertedToType: 'purchase',
                    convertedToVoucherNumber: finalData.voucherNumber,
                });
            }
        } else {
            throw new Error("Failed to save voucher and get ID.");
        }

        const successDescription =
          approveAfterSave && savedDoc?.id
            ? isEditForApprove
              ? "Purchase updated and approved."
              : "Purchase saved and approved."
            : "Purchase bill saved successfully.";
        replaceVoucherSaveLoadingWithShortSuccess(toastId, "Success", successDescription);
        if (isMounted.current) setIsLoading(false);

        const postSaveTail = async () => {
          if (pendingLinkAllocations && companyId && docId && vouchers?.length) {
            const partyIdForLink = data.partyId ?? form.getValues("partyId");
            if (partyIdForLink) {
              const partyForOb = processedParties.find((p) => p.id === partyIdForLink);
              const showOBRow = Number(partyForOb?.openingBalance ?? 0) > 0;
              try {
                await applyAdvancesAllocationsToServer({
                  companyId,
                  mode: "purchase",
                  targetVoucherId: docId,
                  targetPartyId: partyIdForLink,
                  balanceKind: "all",
                  linkedAmounts: pendingLinkAllocations,
                  vouchers,
                  showOBRow,
                });
                if (isMounted.current) setPendingLinkAllocations(null);
              } catch (e) {
                console.error(e);
                sonnerToast.error("Purchase saved but linking advances failed.", { duration: 4500 });
              }
            }
          }
          if (approveAfterSave && savedDoc?.id) {
            if (!isEditForApprove) {
              await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
            }
          }
          if (companyId && company) {
            const isEditHist = !!voucher?.id;
            const amount = Number((finalData as any).total) || 0;
            const vid = docId ?? voucher?.id;
            if (isEditHist) {
              const oldV = voucher as any;
              const newV = finalData as any;
              const changes = getChangedFieldLabels(
                { total: oldV?.total, narration: oldV?.narration, date: oldV?.date, voucherNumber: oldV?.voucherNumber, partyId: oldV?.partyId },
                { total: newV?.total, narration: newV?.narration, date: newV?.date, voucherNumber: newV?.voucherNumber, partyId: newV?.partyId },
                [
                  { key: "total", label: "Amount" },
                  { key: "narration", label: "Narration" },
                  { key: "date", label: "Date" },
                  { key: "voucherNumber", label: "Voucher number" },
                  { key: "partyId", label: "Party" },
                ]
              );
              await sendTransactionAlert(companyId, company, {
                kind: "edited",
                voucherId: vid,
                voucherNumber: finalData.voucherNumber,
                voucherType: "purchase",
                performedByUserId: user?.uid,
                performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
                performedByEmail: user?.email ?? undefined,
                changes: changes.length > 0 ? changes : undefined,
              });
            } else if (isAmountOverOneLakh(amount)) {
              await sendTransactionAlert(companyId, company, {
                kind: "large_amount",
                voucherId: vid,
                voucherNumber: finalData.voucherNumber,
                voucherType: "purchase",
                amount,
                performedByUserId: user?.uid,
                performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
                performedByEmail: user?.email ?? undefined,
              });
            }
          }
          if (print && docId) {
            window.open(`/sale/invoice/${docId}`, "_blank");
          }
          if (saveAndNew && isMounted.current) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavePdfAsImage(false);
            setSavedVoucherId(null);
            await fetchVoucherNumber();
          }
          if (saveAndNew && isMounted.current) {
            onVoucherAction?.("saved", true, docId ?? undefined);
          }
        };

        if (!saveAndNew) {
          onVoucherAction?.("saved", false, docId ?? undefined);
          void postSaveTail().catch((err) => {
            console.error("[CreatePurchaseForm] post-save tail", err);
            sonnerToast.error("Saved — background sync issue", {
              description: err instanceof Error ? err.message : "Advances/link or alerts may finish late.",
              duration: 4500,
            });
          });
          return docId;
        }

        await postSaveTail();
        return docId;

      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
        } else if (isVoucherLimitError(error)) {
          sonnerToast.error("Voucher limit reached", { id: toastId, description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
        } else {
          console.error("Error preparing save operation: ", error);
          sonnerToast.error("Error", { id: toastId, description: "An error occurred before saving." });
        }
        return null;
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    // pendingLinkAllocations, vouchers, processedParties: required so link data is persisted to server on Save (avoids stale closure)
    [companyId, user, files, savePdfAsImage, onVoucherAction, form, savedVoucherId, company, voucher, isEditingAndConverting, fetchVoucherNumber, pendingLinkAllocations, vouchers, processedParties, resolveVoucherIdForSave, isPermissionEdit, markCopiedDraftPersisted, isCopiedDraftFirstInsert]
  );


  const handleDelete = async () => {
    // Local/static mode me savedVoucherId kabhi stale/null ho sakta hai; voucher prop fallback se delete reliable banao.
    const voucherIdToDelete = savedVoucherId || voucher?.id || null;
    if (!voucherIdToDelete || !companyId) {
      toast({ variant: "destructive", title: "Delete failed", description: "Voucher id missing." });
      return;
    }
    
    try {
      const isLocalDataMode = isLocalOnlyMode() || company?.storageOption === "local";
      // Local mode permission/date checks ke liye current in-memory voucher row use karo.
      const localVoucherData = voucher ?? vouchers?.find((v: any) => v.id === voucherIdToDelete) ?? null;
      // Permission check: delete (and delete_approved_voucher if voucher is approved)
      const voucherDoc = isLocalDataMode
        ? null
        : await getDoc(doc(firestore, `companies/${companyId}/vouchers`, voucherIdToDelete));
      const voucherData = voucherDoc?.exists() ? voucherDoc.data() : localVoucherData;
      if (!canDeleteVoucher(voucherData)) {
        throw new PermissionDeniedError(
          (voucherData as any)?.isApproved ? "You do not have permission to delete approved vouchers." : "You do not have permission to delete records."
        );
      }
      if (voucherData && hasPaymentLinks(voucherData)) {
        toast({ variant: "destructive", title: "Cannot Delete", description: "First unlink linked transactions." });
        return;
      }
      if (voucherData) {
        const voucherDate = voucherData.date?.toDate ? voucherData.date.toDate() : new Date(voucherData.date);
        assertCanPerformBackdated(canPerformBackdatedAction, "delete", voucherDate);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: error.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to check permissions.",
        });
      }
      return;
    }
    
    setIsLoading(true);
    try {
      // Recycle-bin delete local-first helper se: local DB + online mirror dono consistent rahte hain.
      await softDeleteVoucherMoveToRecycleBin(companyId, voucherIdToDelete, user?.uid || "");
      toast({
        title: "Voucher Moved to Bin",
        description: "The purchase bill has been moved to the recycle bin.",
      });
      if (onVoucherAction) onVoucherAction('cancelled');
    } catch (err) {
      console.error("delete purchase error:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete voucher.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !allowAttachments) return;
    
    const maxFiles = fileAttachmentLimits.maxFileCount || 0;
    if (maxFiles === 0) {
      toast({
        variant: "destructive",
        title: "File Attachments Disabled",
        description: "File attachments are not allowed for your role.",
      });
      return;
    }

    const newFiles = Array.from(e.target.files);
    const remainingSlots = maxFiles - files.length;
    
    if (remainingSlots <= 0) {
      toast({
        variant: "destructive",
        title: "Limit Reached",
        description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? 's' : ''}.`,
      });
      return;
    }

    const filesToProcess = newFiles.slice(0, remainingSlots);
  
    for (const file of filesToProcess) {
      // Check file type
      const isImage = file.type.startsWith("image/");
      const isPDF =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      
      if (!fileAttachmentLimits.allowImage && isImage) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "Image files are not allowed for your role.",
        });
        continue;
      }
      
      if (!fileAttachmentLimits.allowPDF && isPDF) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "PDF files are not allowed for your role.",
        });
        continue;
      }

      if (!isImage && !isPDF) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "Only image and PDF files are allowed.",
        });
        continue;
      }

      try {
        const maxBytes = attachmentMaxBytes();
        const processedFile = await compressVoucherAttachment(file, maxBytes);
        if (processedFile.size > maxBytes) {
          toast({
            variant: "destructive",
            ...attachmentStillTooLargeToastFields(),
          });
          continue;
        }
        setFiles((prev) => {
          if (prev.length >= maxFiles) return prev;
          return [...prev, processedFile];
        });
      } catch (error) {
        console.error("Error handling file:", error);
        toast({
          variant: "destructive",
          title: "Could not process file",
          description: error instanceof Error ? error.message : "Compression or PDF read failed.",
        });
      }
    }
    e.target.value = "";
  };

  const handleTaxCreated = (newTaxId: string) => {
    if (taxRowIndex !== null) {
      form.setValue(`lineItems.${taxRowIndex}.taxAccountId`, newTaxId);
    }
    setIsCreateTaxOpen(false);
    setTaxRowIndex(null);
  };

  /* ------------------------- DERIVED MEMOS / WATCHES ---------------------- */

  const voucherPrefixes = useMemo(
    () =>
      company?.voucherPrefixes?.[primaryLineItemType === "service" ? "purchase_service" : "purchase"] ||
      [getVoucherPrefix(primaryLineItemType)],
    [company, primaryLineItemType, files]
  );
  // Keep ref current so handleFormSubmit always calls latest version
  processAndSaveRef.current = processAndSave;

  const [subTotal, total, tax, totalPurchasePrice] = useWatch({
    control: form.control,
    name: ["subTotal", "total", "tax", "totalPurchasePrice"],
  });
  
  const filteredItems = useMemo(() => items.filter((i) => i.type === itemType && !i.isDeleted), [items, itemType]);
  
  const itemOptions = useMemo(
    () =>
      buildVoucherLineItemComboboxOptions({
        filteredItems,
        allProcessedItems,
        items: items ?? [],
        watchedLineItems,
      }),
    [filteredItems, allProcessedItems, watchedLineItems, items]
  );
  
  const availableAccounts = useMemo(() => processedAccounts.filter(acc => !acc.isSpecial), [processedAccounts]);
  /** Save & Copy To: mismatch categories source-driven rakho; source me item na ho to item Copy chip hide. */
  const copyDraftMasterHelpersEnabled = Boolean(copySaveTargetCompanyId && onCopyMissingCategory);
  // Source voucher me actual item mismatch mila tabhi blank item row par Copy chip dikhao.
  const hasSourceItemMismatch = Boolean(copyMismatchCategories?.includes("item"));
  const purchaseAccountId = form.watch("purchaseAccountId");
  const showCopyPartyFromSource = useMemo(() => {
    if (!copyDraftMasterHelpersEnabled) return false;
    const pid = String(partyId || "").trim();
    if (!pid) return true;
    return !processedParties.some((p: any) => p.id === pid);
  }, [copyDraftMasterHelpersEnabled, partyId, processedParties]);
  const showCopyPurchaseAccountFromSource = useMemo(() => {
    if (!copyDraftMasterHelpersEnabled) return false;
    const paid = String(purchaseAccountId || "").trim();
    // Copy chip tabhi dikhao jab value blank ho ya options me missing ho; fallback-selected value par force na karo.
    if (!paid) return true;
    return !purchaseAccountOptions.some((o: { value: string }) => o.value === paid);
  }, [copyDraftMasterHelpersEnabled, purchaseAccountId, purchaseAccountOptions]);
  const highlightPartyLabelCopyMismatch = showCopyPartyFromSource;
  const highlightPurchaseAccountLabelCopyMismatch = showCopyPurchaseAccountFromSource;
  const purchaseLineNeedsCopyItem = useCallback(
    (idx: number) => {
      if (!copyDraftMasterHelpersEnabled) return false;
      const li = watchedLineItems?.[idx] as Record<string, unknown> | undefined;
      if (!li) return false;
      const iid = String(li.itemId || "").trim();
      // Blank item row par Copy tabhi dikhao jab source voucher me item mismatch aaya ho.
      if (!iid) return hasSourceItemMismatch;
      return !(items || []).some((it: Item) => it.id === iid);
    },
    [copyDraftMasterHelpersEnabled, watchedLineItems, items, hasSourceItemMismatch]
  );
  const purchaseLineNeedsCopyTax = useCallback(
    (idx: number) => {
      if (!copyDraftMasterHelpersEnabled) return false;
      const li = watchedLineItems?.[idx] as Record<string, unknown> | undefined;
      if (!li) return false;
      const tid = String(li.taxAccountId || "").trim();
      // Item jaisa: khali tax field bhi copy-draft mode me mismatch (header Tax + Copy dikhane ke liye).
      if (!tid) return true;
      const taxOk = Boolean(processedTaxes.some((t: any) => t.id === tid));
      if (taxOk) return false;
      return true;
    },
    [copyDraftMasterHelpersEnabled, watchedLineItems, processedTaxes]
  );
  /** Desktop line grid: Copy chip header row me — koi bhi line mismatch ho to dikhao. */
  const desktopHeaderCopyItem = useMemo(
    () =>
      copyDraftMasterHelpersEnabled &&
      (watchedLineItems || []).some((_, idx) => purchaseLineNeedsCopyItem(idx)),
    [copyDraftMasterHelpersEnabled, watchedLineItems, purchaseLineNeedsCopyItem]
  );
  const desktopHeaderCopyTax = useMemo(
    () =>
      copyDraftMasterHelpersEnabled &&
      (watchedLineItems || []).some((_, idx) => purchaseLineNeedsCopyTax(idx)),
    [copyDraftMasterHelpersEnabled, watchedLineItems, purchaseLineNeedsCopyTax]
  );

  /** Copy-draft: sirf prefilled dialogs — auto-create nahin (`AddVoucherDialog` se request). */
  useEffect(() => {
    if (!copyMasterDraftRequest) return;
    const req = copyMasterDraftRequest;
    const targetLabel = req.targetCompanyName || "company";
    const payload = req.sourceRowPayload;
    const sc = String(req.sourceCollection || "");
    const nm = String(req.sourceName || "").trim();

    if (payload && sc === "items") {
      setIsCreateItemOpen(true);
      setTimeout(() => {
        document.dispatchEvent(
          new CustomEvent("prefill-create-item-from-row", {
            detail: {
              rowPayload: payload,
              type: primaryLineItemType === "service" ? "service" : "item",
            },
          })
        );
      }, 90);
      sonnerToast.message(`Item prefilled from source → save adds to "${targetLabel}".`);
      return;
    }
    if (payload && sc === "taxes") {
      setIsCreateTaxOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-tax-from-row", { detail: { rowPayload: payload } }));
      }, 90);
      sonnerToast.message(`Tax prefilled from source → save adds to "${targetLabel}".`);
      return;
    }

    if (!nm) return;
    switch (req.category) {
      case "party":
        setIsCreatePartyOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-party-name", { detail: nm })), 80);
        sonnerToast.message(`Party prefilled → save adds to "${targetLabel}".`);
        return;
      case "tax":
        setIsCreateTaxOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-tax-name", { detail: nm })), 80);
        sonnerToast.message(`Tax prefilled → save adds to "${targetLabel}".`);
        return;
      case "item":
        setIsCreateItemOpen(true);
        setTimeout(() => {
          document.dispatchEvent(
            new CustomEvent("prefill-create-item-name", { detail: { name: nm, type: primaryLineItemType === "service" ? "service" : "item" } })
          );
        }, 80);
        sonnerToast.message(`Item prefilled → save adds to "${targetLabel}".`);
        return;
      case "account":
        setIsCreateExpenseAccountOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-expense-account-name", { detail: nm })), 80);
        sonnerToast.message(`Purchase account prefilled → save adds under "${targetLabel}".`);
        return;
      default:
        break;
    }
  }, [copyMasterDraftRequest, primaryLineItemType]);

  /** Dusra tab/item delete hone par stale master IDs toast + clear. */
  useEffect(() => {
    if (vouchersLoading || !companyId) return;
    // Static APK/EXE: sale jaisa — masters hydrate se pehle khali lists par edit voucher mat todho.
    if (
      voucher?.id &&
      processedParties.length === 0 &&
      items.length === 0 &&
      processedTaxes.length === 0 &&
      expenseAccounts.length === 0
    ) {
      return;
    }
    const missing: string[] = [];
    const pid = String(partyId || "").trim();
    if (pid && !processedParties.some((p: any) => p.id === pid)) {
      if (pendingPartyIdUntilInPartiesListRef.current !== pid) {
        missing.push("supplier");
        form.setValue("partyId", "");
      }
    }
    const pah = String(form.getValues("purchaseAccountId") || "").trim();
    if (pah && pah !== "purchase_account" && !purchaseAccountOptions.some((o: { value: string }) => o.value === pah)) {
      // Save & Copy To: sirf 100% naam-match remap hota hai — target par orphan source-ID pe random pehla expense A/c mat lagaao; placeholder + Copy chip.
      if (copySaveTargetCompanyId) {
        form.setValue("purchaseAccountId", "purchase_account");
      } else {
        missing.push("purchase account");
        form.setValue("purchaseAccountId", purchaseAccountOptions[0]?.value || "purchase_account");
      }
    }
    (watchedLineItems || []).forEach((line: Record<string, unknown>, idx: number) => {
      const iid = String(line?.itemId || "").trim();
      const itemRows = items ?? [];
      // Items listener hydrate hone se pehle saved itemId mat hatao (parties pehle aa jate hain).
      if (iid && itemsListHydratedRef.current && !itemRows.some((it: Item) => it.id === iid)) {
        missing.push(`line ${idx + 1} item`);
        form.setValue(`lineItems.${idx}.itemId`, "");
      }
      const tid = String(line?.taxAccountId || "").trim();
      if (tid && processedTaxes.length > 0 && !processedTaxes.some((t: any) => t.id === tid)) {
        missing.push(`line ${idx + 1} tax`);
        form.setValue(`lineItems.${idx}.taxAccountId`, "");
      }
    });
    if (missing.length > 0) {
      sonnerToast.error("Master no longer exists", {
        description: `Removed: ${[...new Set(missing)].join(", ")}. Pick again.`,
      });
    }
  }, [
    vouchersLoading,
    companyId,
    partyId,
    processedParties,
    purchaseAccountOptions,
    items,
    watchedLineItems,
    processedTaxes,
    form,
    copySaveTargetCompanyId,
  ]);

  // Pending party ab listener ke baad list me — ref clear (create-party vs stale-ID race).
  useEffect(() => {
    const pend = pendingPartyIdUntilInPartiesListRef.current;
    if (!pend) return;
    if (processedParties.some((p: any) => p.id === pend)) {
      pendingPartyIdUntilInPartiesListRef.current = null;
    }
  }, [processedParties]);

  // User ne aur supplier choose kiya to pending-create guard hata do.
  useEffect(() => {
    const pend = pendingPartyIdUntilInPartiesListRef.current;
    const pid = String(partyId || "").trim();
    if (pend && pid && pid !== pend) {
      pendingPartyIdUntilInPartiesListRef.current = null;
    }
  }, [partyId]);

  /* --------------------------------- RENDER -------------------------------- */

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleFormSubmit} className="h-full flex flex-col min-w-0 w-full max-w-full">
          {/* PC: Radix ScrollArea viewport nested overflow clip karti hai—yahan native overflow-auto se horizontal scrollbar milta hai; footer form ke bahar hi rehta hai. */}
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0 w-full",
              isMobile
                ? "overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400/80 [&::-webkit-scrollbar-track]:bg-gray-200/60"
                : /* w-2 = vertical track patla (pehle sirf h-2 tha — horizontal patla, vertical mota) */
                  // Tablet + PC-view touch drag fix: sirf scrollbar thumb nahi, content area se bhi x/y pan allow karo.
                  "overflow-auto pr-6 -mr-6 touch-pan-x touch-pan-y [scrollbar-width:thin] [WebkitOverflowScrolling:touch] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-gray-200"
            )}
          >
            <div
              className={cn(
                "space-y-6 min-w-0 w-full bg-slate-100",
                !isMobile && "min-w-[1320px] px-[2px]",
                isMobile ? "max-w-full overflow-x-hidden [&>*]:max-w-full" : "",
                "[&>*]:min-w-0"
              )}
            >
              <div className="rounded-lg border border-sky-400 bg-sky-100 p-1">
              {/* PC View: All 4 Fields in Same Row with Responsive Wrapping */}
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Invoice + Date एक row में; `date` को `voucherNumber` के अंदर nest नहीं — वरना RHF में date submit तक bind नहीं होती */}
                  {(() => {
                    const hasPrefix = isPrefixSelectionEnabled && voucherPrefixes.length > 0;
                    const hasDateBS = dateSystem === 'BS' || dateSystem === 'Both';
                    const hasDateAD = dateSystem === 'AD' || dateSystem === 'Both';
                    const colCount = (hasPrefix ? 1 : 0) + 1 + (hasDateBS ? 1 : 0) + (hasDateAD ? 1 : 0);
                    return (
                      <>
                        <div className="grid gap-[2px] w-full min-w-0 max-w-full" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          <FormField
                            control={form.control}
                            name="voucherNumber"
                            render={({ field: voucherField }: any) => (
                              <>
                                {hasPrefix && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Prefix</FormLabel>
                                    <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find((p) => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]} disabled={deleteDisabledWhenLinked}>
                                      <SelectTrigger className="h-9 w-full min-w-0 max-w-full text-xs px-1 [&>span]:truncate">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {voucherPrefixes.map((p) => (
                                          <SelectItem key={p} value={p}>
                                            {p}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                                <FormItem className="min-w-0 w-full overflow-hidden">
                                  <FormLabel className="text-xs truncate">Invoice No.</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. PUR-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                                  </FormControl>
                                </FormItem>
                              </>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="date"
                            render={({ field: dateField }: any) => (
                              <>
                                {hasDateBS && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                                    <div className="min-w-0 w-full overflow-hidden">
                                      <BsDatePicker valueAD={dateField.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" disabled={deleteDisabledWhenLinked} />
                                    </div>
                                  </FormItem>
                                )}
                                {hasDateAD && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Date</FormLabel>
                                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")} disabled={deleteDisabledWhenLinked}>
                                            {dateField.value ? formatDate(dateField.value) : <span className="text-xs">Pick date</span>}
                                            <CalendarIcon className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 z-50" align="start">
                                        <Calendar mode="single" selected={dateField.value} onSelect={(date) => { if (date) date.setHours(12, 0, 0, 0); dateField.onChange(date); setIsCalendarOpen(false); }} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
                                      </PopoverContent>
                                    </Popover>
                                  </FormItem>
                                )}
                              </>
                            )}
                          />
                        </div>
                        <div className="flex flex-col gap-0">
                          <FormField control={form.control} name="voucherNumber" render={() => <FormMessage />} />
                          <FormField control={form.control} name="date" render={() => <FormMessage />} />
                        </div>
                      </>
                    );
                  })()}
                  {/* Mobile: Party and Purchase Account - 2 columns */}
                  {/* Mobile row uses fixed 2-column grid so one long account name cannot resize sibling field. */}
                  <div className="grid grid-cols-2 gap-[2px] w-full min-w-0 max-w-full overflow-hidden">

                    <FormField
                      control={form.control}
                      name="partyId"
                      render={({ field }: any) => (
                        <FormItem className="min-w-0 w-full overflow-hidden">
                          <div className="flex justify-between items-center mb-1 gap-1">
                            <FormLabel className={cn("text-xs", highlightPartyLabelCopyMismatch && "font-semibold text-red-600")}>
                              Party
                            </FormLabel>
                            {showCopyPartyFromSource && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-5 shrink-0 px-1.5 text-[9px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                onClick={() => onCopyMissingCategory?.("party")}
                                disabled={isCopyingMissingMasters}
                              >
                                {isCopyingMissingMasters ? "…" : "Copy"}
                              </Button>
                            )}
                            {partyBalance !== null && partyBalance !== undefined && (
                              <FormLabel className={cn("text-[10px] font-semibold mr-[2px]", partyBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {formatCurrencyForPrint(partyBalance, { noSuffix: true, noAnimation: true })} {partyBalance >= 0 ? 'Dr' : 'Cr'}
                              </FormLabel>
                            )}
                          </div>
                          {/* Supplier dropdown wrapper keeps combobox from stretching with long selected text. */}
                          <div className="flex gap-1 w-full min-w-0 overflow-hidden">
                            <Combobox
                              triggerClassName="h-9 w-full min-w-0 max-w-full overflow-hidden"
                              options={processedPartiesForSelection.map((p) => ({
                                value: p.id,
                                label: p.name,
                              }))}
                              value={field.value}
                              onChange={(val, newName) => {
                                if (val === "add-new") {
                                  setIsCreatePartyOpen(true);
                                  setTimeout(() => {
                                    document.dispatchEvent(
                                      new CustomEvent("prefill-create-party-name", {
                                        detail: newName,
                                      })
                                    );
                                  }, 100);
                                } else {
                                  field.onChange(val);
                                }
                              }}
                              placeholder="Select supplier"
                              addNewLabel="+ Add New Party"
                              disabled={deleteDisabledWhenLinked}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="purchaseAccountId"
                      render={({ field }: any) => (
                        <FormItem className="min-w-0 w-full overflow-hidden">
                          <div className="flex justify-between items-center mb-1 gap-1">
                            <FormLabel className={cn("text-xs", highlightPurchaseAccountLabelCopyMismatch && "font-semibold text-red-600")}>
                              Purchase A/c
                            </FormLabel>
                            {showCopyPurchaseAccountFromSource && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-5 shrink-0 px-1.5 text-[9px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                onClick={() => onCopyMissingCategory?.("account")}
                                disabled={isCopyingMissingMasters}
                              >
                                {isCopyingMissingMasters ? "…" : "Copy"}
                              </Button>
                            )}
                          </div>
                          {/* Purchase account dropdown must truncate selected name with ellipsis on mobile. */}
                          <div className="flex gap-1 w-full min-w-0 overflow-hidden">
                            <Combobox
                              triggerClassName="h-9 w-full min-w-0 max-w-full overflow-hidden"
                              // Purchase account should show only Expense-group accounts.
                              options={purchaseAccountOptions}
                              value={field.value}
                              onChange={(val, newName) => {
                                // Support inline account creation from Purchase Account selector.
                                if (val === "add-new") {
                                  setIsCreateExpenseAccountOpen(true);
                                  setTimeout(() => {
                                    document.dispatchEvent(new CustomEvent("prefill-create-expense-account-name", { detail: newName }));
                                  }, 100);
                                } else {
                                  field.onChange(val);
                                }
                              }}
                              placeholder="Select account"
                              addNewLabel="+ Add New Account"
                              disabled={deleteDisabledWhenLinked}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* PC View: Supplier, Purchase Account, Prefix, Invoice No., Date(s) in one row, equal width (like mobile) */}
                  {(() => {
                    const hasPrefix = isPrefixSelectionEnabled && voucherPrefixes.length > 0;
                    const hasDateBS = dateSystem === 'BS' || dateSystem === 'Both';
                    const hasDateAD = dateSystem === 'AD' || dateSystem === 'Both';
                    const colCount = 2 + (hasPrefix ? 1 : 0) + 1 + (hasDateBS ? 1 : 0) + (hasDateAD ? 1 : 0);
                    return (
                      <div className="grid gap-2 w-full min-w-0 max-w-full items-end" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                        <FormField
                          control={form.control}
                          name="partyId"
                          render={({ field }: any) => (
                            <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                              <div className="flex items-center gap-1 flex-wrap w-full">
                                <FormLabel className={cn("truncate shrink-0", highlightPartyLabelCopyMismatch && "font-semibold text-red-600")}>
                                  Supplier (Cr.)
                                </FormLabel>
                                {showCopyPartyFromSource && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 shrink-0 px-2 text-[10px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                    onClick={() => onCopyMissingCategory?.("party")}
                                    disabled={isCopyingMissingMasters}
                                  >
                                    {isCopyingMissingMasters ? "…" : "Copy"}
                                  </Button>
                                )}
                                {partyBalance !== null && partyBalance !== undefined && (
                                  <FormLabel className={cn("text-xs font-semibold ml-auto shrink-0", partyBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                    {partyBalance >= 0 ? `Rec: ${formatCurrencyForPrint(partyBalance, { noSuffix: true, noAnimation: true })} Dr` : `Pay: ${formatCurrencyForPrint(Math.abs(partyBalance), { noSuffix: true, noAnimation: true })} Cr`}
                                  </FormLabel>
                                )}
                              </div>
                              <Combobox
                                triggerClassName="h-10 w-full min-w-0"
                                options={processedPartiesForSelection.map((p) => ({ value: p.id, label: p.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                  if (val === "add-new") {
                                    setIsCreatePartyOpen(true);
                                    setTimeout(() => { document.dispatchEvent(new CustomEvent("prefill-create-party-name", { detail: newName })); }, 100);
                                  } else field.onChange(val);
                                }}
                                placeholder="Select a supplier"
                                addNewLabel="+ Add New Party"
                                disabled={deleteDisabledWhenLinked}
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="purchaseAccountId"
                          render={({ field }: any) => (
                            <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                              <div className="flex items-center justify-between gap-2">
                                <FormLabel className={cn("truncate", highlightPurchaseAccountLabelCopyMismatch && "font-semibold text-red-600")}>
                                  Purchase Account (Dr.)
                                </FormLabel>
                                {showCopyPurchaseAccountFromSource && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 shrink-0 px-2 text-[10px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                    onClick={() => onCopyMissingCategory?.("account")}
                                    disabled={isCopyingMissingMasters}
                                  >
                                    {isCopyingMissingMasters ? "…" : "Copy"}
                                  </Button>
                                )}
                              </div>
                              <Combobox
                                triggerClassName="h-10 w-full min-w-0"
                                // Purchase account should show only Expense-group accounts.
                                options={purchaseAccountOptions}
                                value={field.value}
                                onChange={(val, newName) => {
                                  // Support inline account creation from Purchase Account selector.
                                  if (val === "add-new") {
                                    setIsCreateExpenseAccountOpen(true);
                                    setTimeout(() => {
                                      document.dispatchEvent(new CustomEvent("prefill-create-expense-account-name", { detail: newName }));
                                    }, 100);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                                placeholder="Select purchase account"
                                addNewLabel="+ Add New Account"
                                disabled={deleteDisabledWhenLinked}
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {hasPrefix && (
                          <FormField
                            control={form.control}
                            name="voucherNumber"
                            render={({ field }: any) => (
                              <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                                <FormLabel className="truncate">Prefix</FormLabel>
                                <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find((p) => field.value?.startsWith(normalizePrefix(p)) || field.value?.startsWith(p)) || voucherPrefixes[0]} disabled={deleteDisabledWhenLinked}>
                                  <SelectTrigger className="h-10 w-full min-w-0 shrink-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {voucherPrefixes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        )}
                        <FormField
                          control={form.control}
                          name="voucherNumber"
                          render={({ field }: any) => (
                            <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                              <FormLabel className="truncate">Invoice No.</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. PUR-001" {...field} className="h-10 w-full min-w-0 shrink-0" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="date"
                          render={({ field }: any) => (
                            <>
                              {hasDateBS && (
                                <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                                  <FormLabel className="truncate">Date (BS)</FormLabel>
                                  <BsDatePicker valueAD={field.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-10 w-full shrink-0" disabled={deleteDisabledWhenLinked} />
                                  <FormMessage />
                                </FormItem>
                              )}
                              {hasDateAD && (
                                <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                                  <FormLabel className="truncate">Date</FormLabel>
                                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button variant="outline" className={cn("h-10 w-full min-w-0 shrink-0 pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={deleteDisabledWhenLinked}>
                                          {field.value ? formatDate(field.value) : "Pick a date"}
                                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 z-50" align="start">
                                      <Calendar mode="single" selected={field.value} onSelect={(date) => { if (date) date.setHours(12, 0, 0, 0); field.onChange(date); setIsCalendarOpen(false); }} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            </>
                          )}
                        />
                      </div>
                    );
                  })()}
                </>
              )}
              </div>

              {/* Line Items Grid (same green section treatment as Sale form). */}
                <div className={cn(
                  "border border-emerald-300/80 rounded-lg relative bg-emerald-50 p-1 min-w-0",
                  isMobile ? "w-[calc(100%-4px)] mx-auto px-[2px] overflow-hidden" : "px-[2px] overflow-x-visible"
                )}>
                <div className={cn("mb-2", isMobile && "flex justify-start")}>
                  <Tabs value={itemType} onValueChange={(v) => { if (deleteDisabledWhenLinked) return; setItemType(v as "item" | "service"); }} className={cn(isMobile && "w-auto")}>
                    <TabsList className={cn(
                      isMobile && "flex gap-[2px] px-[2px]"
                    )}>
                      <TabsTrigger
                        value="item"
                        className={cn(isMobile && "flex-shrink-0")}
                        style={isMobile ? { width: '25mm', maxWidth: '25mm' } : undefined}
                      >
                        Items
                      </TabsTrigger>
                      <TabsTrigger
                        value="service"
                        className={cn(isMobile && "flex-shrink-0")}
                        style={isMobile ? { width: '25mm', maxWidth: '25mm' } : undefined}
                      >
                        Services
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {isMobile ? (
                  // Mobile View: No scrollable container, broken rows
                  <div className="w-full">
                    {/* Mobile Rows */}
                    {fields.map((line, index) => {
                      const selectedItem = allProcessedItems.find(
                        (i) => i.id === form.getValues(`lineItems.${index}.itemId`)
                      );

                      // When item selected: use item's units; else use all company units (creatable)
                      const unitOptions =
                        selectedItem
                          ? (selectedItem.unitConversions as any[])?.flatMap((uc) => [uc.fromUnit, uc.toUnit])?.filter((v, i, a) => a.indexOf(v) === i && v) || []
                          : companyUnitsMerged;
                        // New voucher: never lock item fields; existing: lock when payment linked
                        const itemFieldsDisabled = (voucher?.id || savedVoucherId) ? (hasItemEditLock || deleteDisabledWhenLinked) : false;

                      return (
                        <div key={line.id} className="border-t px-[2px] py-2 space-y-2">
                        {/* Row 1: Item + Copy (cross-company master chip item ke right) */}
                        <div className="w-full px-[2px]">
                          <div className="flex items-start gap-1 w-full min-w-0">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.itemId`}
                              render={({ field }: any) => (
                                <FormItem className="min-w-0 flex-1 w-full">
                                <Combobox
                                  options={itemOptions}
                                  value={comboboxValueFromLineItemId(field.value)}
                                  disabled={itemFieldsDisabled}
                                  onChange={(val, newName) => {
                                    if (val === "add-new") {
                                      setIsCreateItemOpen(true);
                                      setTimeout(() => {
                                        document.dispatchEvent(
                                          new CustomEvent("prefill-create-item-name", {
                                            detail: { name: newName, type: itemType },
                                          })
                                        );
                                      }, 100);
                                    } else {
                                      const itemId = lineItemIdFromComboboxValue(val);
                                      field.onChange(itemId);
                                      const sel = itemId
                                        ? allProcessedItems.find((i) => i.id === itemId)
                                        : undefined;
                                      if (sel) {
                                        const defaultUnit = (sel as any).purchasePriceUnit || (sel.unitConversions as any)?.[0]?.fromUnit || "";
                                        const rate = getUnitBasedPrice(sel, defaultUnit, 'purchase');
                                        form.setValue(`lineItems.${index}.rate`, rate, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.unit`, defaultUnit, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.taxAccountId`, sel.purchaseTaxId || "", { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.type`, itemType, { shouldDirty: true });
                                      }
                                    }
                                  }}
                                  placeholder={`Select ${itemType}`}
                                  addNewLabel={`+ Add New ${itemType === "item" ? "Item" : "Service"}`}
                                />
                              </FormItem>
                            )}
                          />
                            {purchaseLineNeedsCopyItem(index) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 shrink-0 px-2 text-[9px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                onClick={() => onCopyMissingCategory?.("item")}
                                disabled={isCopyingMissingMasters}
                              >
                                {isCopyingMissingMasters ? "…" : "Copy"}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Row 2 & 3: Qty/Unit and Rate/Tax in 2 columns with 6px gap */}
                        <div className="flex gap-[6px] mx-[2px]">
                          {/* Left Column: Qty (top) and Rate (bottom) */}
                          <div className="flex-1 space-y-2">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.quantity`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Qty</FormLabel>
                                  <FormControl>
                                    <Input type="number" {...field} className="h-9 text-xs text-right" disabled={itemFieldsDisabled} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.rate`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Rate</FormLabel>
                                  <div className="flex w-full min-w-0 items-center gap-1">
                                    {/* FormControl (Slot) child = Input; TooltipProvider Fragment pe `id` merge na ho */}
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <FormControl>
                                            <Input
                                              type="number"
                                              {...field}
                                              disabled={purchaseRateDisabled(index, itemFieldsDisabled)}
                                              className={cn("h-9 min-w-0 flex-1 text-xs text-right", purchaseRateDisabled(index, itemFieldsDisabled) && 'bg-muted cursor-not-allowed')}
                                              title={
                                                !canEditRates
                                                  ? "No role permission to edit rates"
                                                  : !companyAllowsLineRatePurchase
                                                    ? "Purchase rate editing is off in Voucher Settings"
                                                    : watchedLineItems?.[index]?.allowManualRate === false
                                                      ? "Tick the checkbox to edit rate on this line"
                                                      : undefined
                                              }
                                            />
                                          </FormControl>
                                        </TooltipTrigger>
                                        {!isRateEditingAllowed && !canEditRates ? (
                                          <TooltipContent>
                                            <p>No permission to edit item rates</p>
                                          </TooltipContent>
                                        ) : !isRateEditingAllowed && canEditRates && !companyAllowsLineRatePurchase ? (
                                          <TooltipContent>
                                            <p>Turn on &quot;Allow Rate Editing&quot; for Purchase in Voucher Settings</p>
                                          </TooltipContent>
                                        ) : isRateEditingAllowed && watchedLineItems?.[index]?.allowManualRate === false ? (
                                          <TooltipContent>
                                            <p>Tick the checkbox next to rate to enable editing</p>
                                          </TooltipContent>
                                        ) : null}
                                      </Tooltip>
                                    </TooltipProvider>
                                    {isRateEditingAllowed && !itemFieldsDisabled && (
                                      <FormField
                                        control={form.control}
                                        name={`lineItems.${index}.allowManualRate`}
                                        render={({ field: manualRateField }: any) => (
                                          <FormItem className="m-0 shrink-0 space-y-0">
                                            <FormControl>
                                              <Checkbox
                                                checked={manualRateField.value !== false}
                                                onCheckedChange={(c) => manualRateField.onChange(c === true)}
                                                aria-label="Allow editing item rate on this line"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    )}
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                          {/* Right column: Unit trigger ko chhoti screen par bhi ≥12ch — cramped placeholder avoid. */}
                          <div className="flex-1 min-w-[calc(8.5rem+15px)] space-y-2">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.unit`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Unit</FormLabel>
                                  <FormControl>
                                    <div className="w-full [&_button]:h-9 [&_button]:w-full [&_button]:text-xs">
                                      <Combobox
                                        options={[
                                          ...unitOptions.map((u) => ({ value: u, label: u })),
                                          ...(field.value && !unitListHas(unitOptions, field.value) ? [{ value: field.value, label: field.value }] : []),
                                        ]}
                                        value={field.value}
                                        disabled={itemFieldsDisabled}
                                        onChange={(val, newName) => {
                                          const unitVal = val === "add-new" ? (newName || "").trim() : val;
                                          field.onChange(unitVal);
                                          onPersistNewUnit(val, unitVal);
                                          const sel = allProcessedItems.find((i) => i.id === form.getValues(`lineItems.${index}.itemId`));
                                          if (sel && unitVal) {
                                            const newRate = getUnitBasedPrice(sel, unitVal, 'purchase');
                                            form.setValue(`lineItems.${index}.rate`, newRate, { shouldDirty: true });
                                          }
                                        }}
                                        placeholder="Unit"
                                        addNewLabel="+ Add unit"
                                        triggerLabelMinCh={12}
                                      />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.taxAccountId`}
                              render={({ field }: any) => (
                                <FormItem>
                                  {/* Copy chip visible => Tax label red; resolved selection => normal label color. */}
                                  <FormLabel className={cn("text-xs", purchaseLineNeedsCopyTax(index) && "text-red-600 font-semibold")}>Tax</FormLabel>
                                  <FormControl>
                                    <div className="[&_button]:h-9 [&_button]:text-xs">
                                      <Combobox
                                        options={processedTaxes.map((t) => ({
                                          value: t.id,
                                          label: `${t.name} @ ${t.rate}%`,
                                        }))}
                                        value={field.value}
                                        disabled={itemFieldsDisabled}
                                        onChange={(val, newName) => {
                                          if (val === "add-new") {
                                            setTaxRowIndex(index);
                                            setIsCreateTaxOpen(true);
                                            setTimeout(() => {
                                                document.dispatchEvent(new CustomEvent('prefill-create-tax-name', { detail: newName }));
                                            }, 100);
                                          } else {
                                            field.onChange(val === "none" ? "" : val);
                                          }
                                        }}
                                        placeholder="Tax"
                                        addNewLabel="+ Add New Tax"
                                      />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* Row 4: Tax Inc, Tax Amt and Amount */}
                        <div className="flex gap-[2px] px-[2px]">
                          <div className="flex-1">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.isTaxInclusive`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <div className="flex items-center justify-between gap-1">
                                    {/* Copy chip visible => Tax Inc label red; resolved selection => normal label color. */}
                                    <FormLabel className={cn("text-xs", purchaseLineNeedsCopyTax(index) && "text-red-600 font-semibold")}>Tax Inc.</FormLabel>
                                    {purchaseLineNeedsCopyTax(index) && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-5 shrink-0 px-1.5 text-[9px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                        onClick={() => onCopyMissingCategory?.("tax")}
                                        disabled={isCopyingMissingMasters}
                                      >
                                        {isCopyingMissingMasters ? "…" : "Copy"}
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex items-center h-9">
                                    <FormControl>
                                      <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={itemFieldsDisabled} />
                                    </FormControl>
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.taxAmount`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Tax Amt.</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      readOnly
                                      className="h-9 text-xs text-right bg-muted"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.amount`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Amount</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      readOnly
                                      className="h-9 text-xs text-right bg-muted"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* Remove Line */}
                        {fields.length > 1 && (
                          <div className="flex justify-end px-[2px]">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={itemFieldsDisabled}
                              onClick={() => remove(index)}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                    })}
                    {/* Add Line Button */}
                    <div className="border-t px-[2px] py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={(voucher?.id || savedVoucherId) ? (hasItemEditLock || deleteDisabledWhenLinked) : false}
                        onClick={() =>
                          append({
                            type: itemType,
                            itemId: "",
                            quantity: 1,
                            rate: 0,
                            unit: "",
                            amount: 0,
                            taxAccountId: "",
                            taxAmount: 0,
                            isTaxInclusive: false,
                            allowManualRate: true,
                          })
                        }
                      >
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Line
                      </Button>
                    </div>
                  </div>
                ) : (
                  // PC: wide layout ka horizontal scroll form ke scroll wale parent div me (footer fixed).
                  <div className="w-full min-w-0">
                    <div className={cn(COLS, "divide-x divide-border border-b")}>
                        <div className={cn(TH_BASE, "flex items-center justify-between gap-1 min-w-0")}>
                          {/* Desktop: Item Copy visible ho to Item header red highlight. */}
                          <span className={cn("truncate", desktopHeaderCopyItem && "text-red-600 font-semibold")}>Item</span>
                          {desktopHeaderCopyItem && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-[10px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                              onClick={() => onCopyMissingCategory?.("item")}
                              disabled={isCopyingMissingMasters}
                            >
                              {isCopyingMissingMasters ? "…" : "Copy"}
                            </Button>
                          )}
                        </div>
                        <div className={cn(TH_BASE, "text-center")}>Qty</div>
                        <div className={cn(TH_BASE, "text-center")}>Unit</div>
                        <div className={cn(TH_BASE, "text-center")}>Rate</div>
                        <div className={cn(TH_BASE, "flex flex-col items-center justify-center gap-0.5 px-1 text-center")}>
                          <Checkbox
                            checked={(form.watch("lineItems") || []).every((li) => li.isTaxInclusive)}
                            onCheckedChange={handleToggleAllInclusive}
                            id="all-inclusive"
                          />
                          {/* Header: Tax copy mismatch ho to Tax Inc label red; resolved case me normal. */}
                          <label htmlFor="all-inclusive" className={cn("cursor-pointer select-none text-[10px] leading-tight font-semibold text-foreground", desktopHeaderCopyTax && "text-red-600")}>
                            Tax Inc.
                          </label>
                        </div>
                        <div className={cn(TH_BASE, "flex items-center gap-1 min-w-0 flex-nowrap justify-end")}>
                          {/* Desktop: Tax Copy visible ho to Tax header red highlight. */}
                          <span className={cn("truncate font-semibold text-foreground min-w-0 flex-1 text-left", desktopHeaderCopyTax && "text-red-600")}>Tax</span>
                          {desktopHeaderCopyTax && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-[10px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                              onClick={() => onCopyMissingCategory?.("tax")}
                              disabled={isCopyingMissingMasters}
                            >
                              {isCopyingMissingMasters ? "…" : "Copy"}
                            </Button>
                          )}
                        </div>
                        <div className={cn(TH_BASE, "text-right")}>Tax Amt.</div>
                        <div className={cn(TH_BASE, "text-right")}>Amount</div>
                        <div className={TH_BASE} />
                      </div>
                      {/* Desktop Rows */}
                      {fields.map((line, index) => {
                        const selectedItem = allProcessedItems.find(
                          (i) => i.id === form.getValues(`lineItems.${index}.itemId`)
                        );
                        // When item selected: use item's units; else use all company units (creatable)
                        const unitOptions =
                          selectedItem
                            ? (selectedItem.unitConversions as any[])?.flatMap((uc) => [uc.fromUnit, uc.toUnit])?.filter((v, i, a) => a.indexOf(v) === i && v) || []
                            : companyUnitsMerged;
                        // New voucher: never lock item fields; existing: lock when payment linked
                        const itemFieldsDisabled = (voucher?.id || savedVoucherId) ? (hasItemEditLock || deleteDisabledWhenLinked) : false;

                        return (
                          <div key={line.id} className={cn(COLS, "divide-x divide-border border-t")}>
                        <div className={cn(TD_BASE, "min-w-0")}>
                          <FormField
                              control={form.control}
                              name={`lineItems.${index}.itemId`}
                              render={({ field }: any) => (
                                <FormItem className="min-w-0 w-full">
                                <Combobox
                                  options={itemOptions}
                                  value={comboboxValueFromLineItemId(field.value)}
                                  disabled={itemFieldsDisabled}
                                  onChange={(val, newName) => {
                                    if (val === "add-new") {
                                      setIsCreateItemOpen(true);
                                      setTimeout(() => {
                                        document.dispatchEvent(
                                          new CustomEvent("prefill-create-item-name", {
                                            detail: { name: newName, type: itemType },
                                          })
                                        );
                                      }, 100);
                                    } else {
                                      const itemId = lineItemIdFromComboboxValue(val);
                                      field.onChange(itemId);
                                      const sel = itemId
                                        ? allProcessedItems.find((i) => i.id === itemId)
                                        : undefined;
                                      if (sel) {
                                        const defaultUnit = (sel as any).purchasePriceUnit || (sel.unitConversions as any)?.[0]?.fromUnit || "";
                                        const rate = getUnitBasedPrice(sel, defaultUnit, 'purchase');
                                        form.setValue(`lineItems.${index}.rate`, rate, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.unit`, defaultUnit, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.taxAccountId`, sel.purchaseTaxId || "", { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.type`, itemType, { shouldDirty: true });
                                      }
                                    }
                                  }}
                                  placeholder={`Select ${itemType}`}
                                  addNewLabel={`+ Add New ${itemType === "item" ? "Item" : "Service"}`}
                                />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className={cn(TD_BASE, "flex items-center justify-end")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.quantity`}
                            render={({ field }: any) => (
                              <FormControl>
                                <Input type="number" {...field} className={cn(FLAT_INPUT, "text-right tabular-nums")} disabled={itemFieldsDisabled} />
                              </FormControl>
                            )}
                          />
                        </div>

                        <div className={TD_BASE}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.unit`}
                            render={({ field }: any) => (
                              <FormItem className="w-full">
                                <FormControl>
                                  <div className="w-full [&_button]:h-9 [&_button]:w-full [&_button]:text-xs">
                                    <Combobox
                                      options={[
                                        ...unitOptions.map((u) => ({ value: u, label: u })),
                                        ...(field.value && !unitListHas(unitOptions, field.value) ? [{ value: field.value, label: field.value }] : []),
                                      ]}
                                      value={field.value}
                                      disabled={itemFieldsDisabled}
                                      onChange={(val, newName) => {
                                        const unitVal = val === "add-new" ? (newName || "").trim() : val;
                                        field.onChange(unitVal);
                                        onPersistNewUnit(val, unitVal);
                                        const sel = allProcessedItems.find((i) => i.id === form.getValues(`lineItems.${index}.itemId`));
                                        if (sel && unitVal) {
                                          const newRate = getUnitBasedPrice(sel, unitVal, 'purchase');
                                          form.setValue(`lineItems.${index}.rate`, newRate, { shouldDirty: true });
                                        }
                                      }}
                                      placeholder="Unit"
                                      addNewLabel="+ Add unit"
                                      triggerLabelMinCh={12}
                                    />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className={cn(TD_BASE, "flex items-center justify-end")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.rate`}
                            render={({ field }: any) => (
                              <div className="flex w-full min-w-0 items-center justify-end gap-1">
                                {/* Purchase table rate — Tooltip bahar, FormControl andar Input par */}
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          {...field}
                                          disabled={purchaseRateDisabled(index, itemFieldsDisabled)}
                                          className={cn(FLAT_INPUT, "min-w-0 flex-1 text-right tabular-nums", purchaseRateDisabled(index, itemFieldsDisabled) && 'bg-muted cursor-not-allowed')}
                                          title={
                                            !canEditRates
                                              ? "No role permission to edit rates"
                                              : !companyAllowsLineRatePurchase
                                                ? "Purchase rate editing is off in Voucher Settings"
                                                : watchedLineItems?.[index]?.allowManualRate === false
                                                  ? "Tick the checkbox to edit rate on this line"
                                                  : undefined
                                          }
                                        />
                                      </FormControl>
                                    </TooltipTrigger>
                                    {!isRateEditingAllowed && !canEditRates ? (
                                      <TooltipContent>
                                        <p>No permission to edit item rates</p>
                                      </TooltipContent>
                                    ) : !isRateEditingAllowed && canEditRates && !companyAllowsLineRatePurchase ? (
                                      <TooltipContent>
                                        <p>Turn on &quot;Allow Rate Editing&quot; for Purchase in Voucher Settings</p>
                                      </TooltipContent>
                                    ) : isRateEditingAllowed && watchedLineItems?.[index]?.allowManualRate === false ? (
                                      <TooltipContent>
                                        <p>Tick the checkbox next to rate to enable editing</p>
                                      </TooltipContent>
                                    ) : null}
                                  </Tooltip>
                                </TooltipProvider>
                                {isRateEditingAllowed && !itemFieldsDisabled && (
                                  <FormField
                                    control={form.control}
                                    name={`lineItems.${index}.allowManualRate`}
                                    render={({ field: manualRateField }: any) => (
                                      <FormItem className="m-0 shrink-0 space-y-0">
                                        <FormControl>
                                          <Checkbox
                                            checked={manualRateField.value !== false}
                                            onCheckedChange={(c) => manualRateField.onChange(c === true)}
                                            aria-label="Allow editing item rate on this line"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                )}
                              </div>
                            )}
                          />
                        </div>

                        <div className={cn(TD_BASE, "flex items-center justify-center")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.isTaxInclusive`}
                            render={({ field }: any) => (
                              <FormItem className="flex items-center shrink-0 m-0 space-y-0">
                                <FormControl>
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={itemFieldsDisabled} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className={cn(TD_BASE, "min-w-0")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.taxAccountId`}
                            render={({ field }: any) => (
                              <FormItem className="w-full min-w-0">
                                <Combobox
                                  options={processedTaxes.map((t) => ({
                                    value: t.id,
                                    label: `${t.name} @ ${t.rate}%`,
                                  }))}
                                  value={field.value}
                                  disabled={itemFieldsDisabled}
                                  onChange={(val, newName) => {
                                    if (val === "add-new") {
                                      setTaxRowIndex(index);
                                      setIsCreateTaxOpen(true);
                                      setTimeout(() => {
                                          document.dispatchEvent(new CustomEvent('prefill-create-tax-name', { detail: newName }));
                                      }, 100);
                                    } else {
                                      field.onChange(val === "none" ? "" : val);
                                    }
                                  }}
                                  placeholder="Tax"
                                  addNewLabel="+ Add New Tax"
                                />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Tax Amount */}
                        <div className={cn(TD_BASE, "flex items-center justify-end")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.taxAmount`}
                            render={({ field }: any) => (
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  readOnly
                                  className={cn(FLAT_INPUT, "bg-muted text-right tabular-nums")}
                                />
                              </FormControl>
                            )}
                          />
                        </div>

                        {/* Amount */}
                        <div className={cn(TD_BASE, "flex items-center justify-end")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.amount`}
                            render={({ field }: any) => (
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  readOnly
                                  className={cn(FLAT_INPUT, "bg-muted text-right tabular-nums")}
                                />
                              </FormControl>
                            )}
                          />
                        </div>

                        {/* Remove Line */}
                        <div className={cn(TD_BASE, "flex items-center")}>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={itemFieldsDisabled}
                              onClick={() => remove(index)}
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                      {/* Add Line Button */}
                      <div className="border-t px-2 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={(voucher?.id || savedVoucherId) ? (hasItemEditLock || deleteDisabledWhenLinked) : false}
                          onClick={() =>
                            append({
                              type: itemType,
                              itemId: "",
                              quantity: 1,
                              rate: 0,
                              unit: "",
                              amount: 0,
                              taxAccountId: "",
                              taxAmount: 0,
                              isTaxInclusive: false,
                              allowManualRate: true,
                            })
                          }
                        >
                          <PlusCircle className="mr-2 h-4 w-4" /> Add Line
                        </Button>
                      </div>
                    </div>
                )}
              </div>

              {/* Bottom: Narration + Attach / Totals */}
              {isMobile ? (
                <div className="grid grid-cols-2 gap-3 w-[calc(100%-4px)] mx-auto px-[2px]">
                  {/* Mobile: items ke niche turant Sub Total block — Sale form jaisa flow */}
                  <div className="col-span-2 bg-cyan-50 border-cyan-300/80 px-[2px] py-2 rounded-lg border space-y-1.5 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-xs">Sub Total:</span>
                      <span className="text-xs font-medium">{(subTotal || 0).toFixed(2)}</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="discount"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-row justify-between items-center gap-2 space-y-0">
                          <FormLabel className="text-xs shrink-0">Discount:</FormLabel>
                          <FormControl>
                            <Input type="number" className="w-20 border rounded p-1 text-right text-xs h-7 shrink-0" {...field} disabled={deleteDisabledWhenLinked} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between items-center pt-1 border-t">
                      <div className="flex items-center gap-1">
                        <FormLabel className="text-xs">Tax:</FormLabel>
                        {selectedTax && (
                          <FormLabel className={cn("text-[10px] font-semibold", selectedTax.balance < 0 ? "text-red-600" : "text-green-600")}>
                            {selectedTax.balance < 0 ? `Pay: ${formatCurrencyForPrint(Math.abs(selectedTax.balance), { noSuffix: true, noAnimation: true })}` : `Rec: ${formatCurrencyForPrint(selectedTax.balance, { noSuffix: true, noAnimation: true })}`}
                          </FormLabel>
                        )}
                      </div>
                      <span className="text-xs font-medium">{(tax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t text-base font-bold">
                      <span className="text-sm">Total:</span>
                      <span className="text-red-600 text-sm">{(total || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Mobile: narration + due date grouped container color (same as Sale form). */}
                  <div className="col-span-2 rounded-lg border border-amber-300/80 bg-amber-50 p-2">
                  <div className="px-[2px]">
                    <FormField
                      control={form.control}
                      name="narration"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Narration</FormLabel>
                          <FormControl>
                            {/* Mobile: shared narration resize/scroll — static app me clip na ho */}
                            <Textarea
                              placeholder="Add any notes for this bill..."
                              {...field}
                              rows={2}
                              className={cn("text-sm", VOUCHER_NARRATION_TEXTAREA_CLASS)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {showApprovalCheckbox && (
                    <div className="px-[2px] pt-2">
                      <FormField
                        control={form.control}
                        name="isApproved"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">Approved</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  {/* Mobile: Due Date + Important ek column — date jaisi pill row */}
                  <div className="flex flex-col gap-2 px-[2px] pt-2">
                  <div className={cn((dateSystem === 'BS' || dateSystem === 'Both') && "flex gap-1")}>
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }: any) => (
                        <FormItem className={cn(dateSystem === 'Both' && "flex-1 min-w-0")}>
                          <FormLabel className="text-sm">Due Date</FormLabel>
                          <div className={cn("flex gap-1", dateSystem === 'Both' && "gap-1")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <div className={cn("flex-1 min-w-0", dateSystem === 'Both' && "flex-1")}>
                                <BsDatePicker
                                  valueAD={field.value}
                                  onChangeAD={(d) => { field.onChange(d as Date); }}
                                  isRange={false}
                                  numberOfMonths={1}
                                  className="h-9 text-sm w-full"
                                />
                              </div>
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <div className={cn("flex-1 min-w-0", dateSystem === 'Both' && "flex-1")}>
                                <Popover open={isDueDateCalendarOpen} onOpenChange={setIsDueDateCalendarOpen}>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn("w-full justify-start text-left font-normal text-sm", !field.value && "text-muted-foreground")}
                                      >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? formatDate(field.value) : "Pick date"}
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value ?? undefined}
                                      onSelect={(date) => { field.onChange(date); setIsDueDateCalendarOpen(false); }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                    <FormField
                      control={form.control}
                      name="overdueImportant"
                      render={({ field }: any) => (
                        <FormItem className="w-full">
                          {/* Due Date jaisi pill — Important text pill ke andar */}
                          <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted/85 px-3">
                            <FormControl>
                              <Checkbox
                                id="create-purchase-overdue-important-mobile"
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel
                              htmlFor="create-purchase-overdue-important-mobile"
                              className="cursor-pointer text-sm font-normal leading-none"
                            >
                              Important
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  </div>
                  
                  {/* Mobile: Attach Files - Left Column */}
                  <div className="col-span-2 rounded-lg border border-indigo-300/80 bg-indigo-50 p-2">
                    <FormItem>
                      <FormLabel className="text-sm">Attach Files</FormLabel>
                      {showPdfAsImageToggle && (
                        <VoucherPdfAsImageToggle
                          id="voucher-save-pdf-as-image-purchase-mobile"
                          checked={savePdfAsImage}
                          onCheckedChange={setSavePdfAsImage}
                          disabled={!allowAttachments || fileAttachLockedByDialog || fileAttachmentLimits.maxFileCount === 0}
                          className="mb-2"
                        />
                      )}
                      <RestrictedFileUploader>
                        {/* When linked: add/remove disabled; existing files stay clickable to open. Filter by file identity (not index) so remove works reliably. */}
                        <div className="grid grid-cols-3 gap-2 px-[2px]">
                          {files.map((file, index) => (
                            <FilePreview 
                              key={typeof file === "string" ? file : `file-${index}`} 
                              file={file} 
                              attachmentClientFileUrls={attachmentClientFileUrlsForPreview}
                              onRemove={allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((f) => f !== file)) : undefined}
                              className={cn(
                                !allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : "",
                                VOUCHER_MOBILE_ATTACH_PREVIEW_CLASS
                              )}
                            />
                          ))}
                          {allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                            /* tile slot = square h-24 w-24 (Payment In jaisa) */
                            <div className={VOUCHER_MOBILE_ATTACH_TILE_SLOT}>
                              <AttachmentHoldPasteSurface
                                enabled={
                                  !editingDisabled &&
                                  !fileAttachLockedByDialog &&
                                  allowAttachments &&
                                  fileAttachmentLimits.maxFileCount > 0
                                }
                                onShortActivate={() => {
                                  if (editingDisabled) return;
                                  if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                                    fileInputRef.current?.click();
                                  }
                                }}
                                onPastedFiles={(incoming) =>
                                  void appendCompressedVoucherAttachmentsToState({
                                    incomingFiles: incoming,
                                    currentFiles: files,
                                    maxFiles: fileAttachmentLimits.maxFileCount || 0,
                                    allowImage: fileAttachmentLimits.allowImage,
                                    allowPDF: fileAttachmentLimits.allowPDF,
                                    setFiles,
                                    toast,
                                  })
                                }
                                className={cn(
                                  VOUCHER_MOBILE_ATTACH_ADD_SURFACE_CLASS,
                                  allowAttachments && fileAttachmentLimits.maxFileCount > 0
                                    ? "text-muted-foreground hover:border-primary cursor-pointer"
                                    : "text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                                )}
                              >
                                <Upload className="h-4 w-4" />
                                <span className="text-[9px] mt-0.5">Add</span>
                              </AttachmentHoldPasteSurface>
                              <FormControl>
                                <Input
                                  type="file"
                                  className="hidden"
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  accept={
                                    [
                                      fileAttachmentLimits.allowImage ? "image/*" : "",
                                      fileAttachmentLimits.allowPDF ? "application/pdf" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(",") || "image/*,application/pdf"
                                  }
                                  multiple={fileAttachmentLimits.maxFileCount > 1}
                                  disabled={fileAttachLockedByDialog || !allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                                />
                              </FormControl>
                            </div>
                          )}
                        </div>
                      </RestrictedFileUploader>
                    </FormItem>
                  </div>

                  {/* Bill wise link — mobile par totals/narration/files ke baad */}
                  <div className="col-span-2 flex flex-col gap-[15px] w-full">
                    {/* Link for bill wise — same table/style as Payment Out. Shown for both new and edit so user can link before/after save. */}
                    {shouldShowLinkButton && (
                      <div className="pb-1.5">
                        {/* User request: keep hidden unless Show Link is clicked for add/non-linked edit. */}
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowLinkSections(true)}>Show Link</Button>
                      </div>
                    )}
                    {shouldShowBillWiseSection && (
                      <div className="bg-rose-50 rounded-lg border-2 border-rose-300/80 px-[2px] py-2 pb-[45px] space-y-1.5 w-full">
                        <div className="border-b border-border/60 pb-2">
                          <span className="text-xs font-semibold">Link for bill wise</span>
                          {company?.enableLinkPaymentToTxns && (
                            <p className="text-xs text-blue-600 mt-1">
                              {billWiseLinkableCount > 0
                                ? `${billWiseLinkableCount} voucher${billWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                                : "You can save this voucher without linking, bcz no voucher to link."}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {billWiseLinkableCount} voucher(s) available to link.{linkedAmountRows.length > 0 && ` ${linkedAmountRows.length} linked.`}
                          </p>
                        </div>
                        {linkedAmountRows.length > 0 && (
                          <div className="overflow-x-auto min-w-0 rounded-md border">
                            <table className="w-full text-[10px] border-collapse min-w-0">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-1.5 font-semibold text-black whitespace-nowrap">Date</th>
                                  <th className="text-left p-1.5 font-semibold text-black whitespace-nowrap">Voucher No.</th>
                                  <th className="text-right p-1.5 font-semibold text-black whitespace-nowrap">Amount</th>
                                  <th className="text-right p-1.5 font-semibold text-black whitespace-nowrap">Linked on others</th>
                                  <th className="text-right p-1.5 font-semibold text-black whitespace-nowrap">Linked on current</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linkedAmountRows.map((row, i) => {
                                  const isOB = row.paymentVoucherId === OPENING_BALANCE_VOUCHER_ID;
                                  const details = isOB ? null : paymentVoucherDetails.get(row.paymentVoucherId ?? "");
                                  const rowAmount = details?.total ?? row.amount;
                                  const linkedOnOthers = isOB ? 0 : Math.max(0, (details?.totalAllocated ?? 0) - row.amount);
                                  return (
                                    <tr
                                      key={i}
                                      {...(can("edit_link")
                                        ? { role: "button" as const, tabIndex: 0, className: "border-b border-border/30 last:border-b-0 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1", onClick: () => setIsLinkAdvancesOpen(true), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsLinkAdvancesOpen(true); } } }
                                        : { className: "border-b border-border/30 last:border-b-0" })}
                                    >
                                      <td className="p-1.5 text-muted-foreground whitespace-nowrap">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</td>
                                      <td className="p-1.5 font-medium whitespace-nowrap">{row.voucherNumber || "—"}</td>
                                      <td className="p-1.5 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrencyForPrint(rowAmount, { noSuffix: true, noAnimation: true })}</td>
                                      <td className="p-1.5 text-right text-muted-foreground whitespace-nowrap">{formatCurrencyForPrint(linkedOnOthers, { noSuffix: true, noAnimation: true })}</td>
                                      <td className="p-1.5 text-right text-muted-foreground whitespace-nowrap">{formatCurrencyForPrint(row.amount, { noSuffix: true, noAnimation: true })}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="pt-2 border-t flex justify-end min-w-0">
                          <div className="grid grid-cols-2 gap-1.5 text-[10px] w-fit">
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                              <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate text-right whitespace-nowrap leading-tight">{formatCurrencyForPrint(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate leading-tight">Balance</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className={cn("truncate text-right whitespace-nowrap leading-tight", (total || 0) - totalLinked <= 0 ? "text-green-600 font-semibold" : "")}>
                                {(total || 0) - totalLinked <= 0 ? "Settled" : formatCurrencyForPrint(Math.max(0, (total || 0) - totalLinked), { noSuffix: true, noAnimation: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                        {partyId && can("add_link") && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Button type="button" className="w-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsLinkAdvancesOpen(true)}>
                              <Link2 className="mr-2 h-4 w-4" /> Link to Dr
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                              <Info className="h-4 w-4 shrink-0" />
                              Read me
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Desktop: Left: Narration + Due Date + Files */}
                  <div className="space-y-4">
                    <div className="rounded-lg border border-amber-300/80 bg-amber-50 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
                      <FormField
                        control={form.control}
                        name="narration"
                        render={({ field }: any) => (
                          <FormItem>
                            <FormLabel>Narration</FormLabel>
                            <FormControl>
                              {/* Desktop narration: poora text dikhe */}
                              <Textarea
                                placeholder="Add any notes for this bill..."
                                {...field}
                                className={cn(VOUCHER_NARRATION_TEXTAREA_CLASS)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* PC: Due Date column — date ke niche Important tick (overdue filter) */}
                      <div className="flex min-w-0 flex-col gap-2 md:w-[180px] md:max-w-[240px]">
                      {showApprovalCheckbox && (
                        <FormField
                          control={form.control}
                          name="isApproved"
                          render={({ field }: any) => (
                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">Approved</FormLabel>
                            </FormItem>
                          )}
                        />
                      )}
                      <FormField
                        control={form.control}
                        name="dueDate"
                        render={({ field }: any) => (
                          <FormItem className={cn("w-full", dateSystem === 'Both' && "min-w-[160px]")}>
                            <FormLabel>Due Date</FormLabel>
                            <div className={cn("flex gap-1", dateSystem === 'Both' && "gap-2")}>
                              {(dateSystem === 'BS' || dateSystem === 'Both') && (
                                <div className={cn("flex-1 min-w-0", dateSystem === 'Both' && "flex-1")}>
                                  <BsDatePicker
                                    valueAD={field.value}
                                    onChangeAD={(d) => { field.onChange(d as Date); }}
                                    isRange={false}
                                    numberOfMonths={1}
                                    className="h-9 w-full"
                                  />
                                </div>
                              )}
                              {(dateSystem === 'AD' || dateSystem === 'Both') && (
                                <div className={cn("flex-1 min-w-0", dateSystem === 'Both' && "flex-1")}>
                                  <Popover open={isDueDateCalendarOpen} onOpenChange={setIsDueDateCalendarOpen}>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          className={cn("w-full justify-start text-left font-normal h-9", !field.value && "text-muted-foreground")}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {field.value ? formatDate(field.value) : "Pick date"}
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                      <Calendar
                                        mode="single"
                                        selected={field.value ?? undefined}
                                        onSelect={(date) => { field.onChange(date); setIsDueDateCalendarOpen(false); }}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="overdueImportant"
                        render={({ field }: any) => (
                          <FormItem className="w-full">
                            {/* Due Date jaisi pill — Important text pill ke andar */}
                            <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted/85 px-3">
                              <FormControl>
                                <Checkbox
                                  id="create-purchase-overdue-important-desktop"
                                  checked={!!field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <FormLabel
                                htmlFor="create-purchase-overdue-important-desktop"
                                className="cursor-pointer font-normal leading-none"
                              >
                                Important
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                    </div>
                    </div>
                    <div className="rounded-lg border border-indigo-300/80 bg-indigo-50 p-3">
                    <FormItem>
                      <FormLabel>Attach Files (Optional)</FormLabel>
                      {showPdfAsImageToggle && (
                        <VoucherPdfAsImageToggle
                          id="voucher-save-pdf-as-image-purchase-desktop"
                          checked={savePdfAsImage}
                          onCheckedChange={setSavePdfAsImage}
                          disabled={!allowAttachments || fileAttachLockedByDialog || fileAttachmentLimits.maxFileCount === 0}
                          className="mb-2"
                        />
                      )}
                      <RestrictedFileUploader>
                        {/* When linked: add/remove disabled; existing files stay clickable to open. Filter by file identity (not index) so remove works reliably. */}
                        <div className="flex flex-wrap gap-4">
                          {files.map((file, index) => (
                            <FilePreview 
                              key={typeof file === "string" ? file : `file-${index}`} 
                              file={file} 
                              attachmentClientFileUrls={attachmentClientFileUrlsForPreview}
                              onRemove={allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((f) => f !== file)) : undefined}
                              className={cn(
                                !allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : "",
                                VOUCHER_DESKTOP_ATTACH_PREVIEW_CLASS
                              )}
                            />
                          ))}
                          {allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                            <div className={VOUCHER_DESKTOP_ATTACH_TILE_SLOT}>
                              <AttachmentHoldPasteSurface
                                enabled={
                                  !editingDisabled &&
                                  !fileAttachLockedByDialog &&
                                  allowAttachments &&
                                  fileAttachmentLimits.maxFileCount > 0
                                }
                                onShortActivate={() => {
                                  if (editingDisabled) return;
                                  if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                                    fileInputRef.current?.click();
                                  }
                                }}
                                onPastedFiles={(incoming) =>
                                  void appendCompressedVoucherAttachmentsToState({
                                    incomingFiles: incoming,
                                    currentFiles: files,
                                    maxFiles: fileAttachmentLimits.maxFileCount || 0,
                                    allowImage: fileAttachmentLimits.allowImage,
                                    allowPDF: fileAttachmentLimits.allowPDF,
                                    setFiles,
                                    toast,
                                  })
                                }
                                className={cn(
                                  VOUCHER_DESKTOP_ATTACH_ADD_SURFACE_CLASS,
                                  allowAttachments && fileAttachmentLimits.maxFileCount > 0
                                    ? "text-muted-foreground hover:border-primary cursor-pointer"
                                    : "text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                                )}
                              >
                                <Upload className="h-6 w-6" />
                                <span className="text-xs mt-1">Add File</span>
                              </AttachmentHoldPasteSurface>
                              <FormControl>
                                <Input
                                  type="file"
                                  className="hidden"
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  accept={
                                    [
                                      fileAttachmentLimits.allowImage ? "image/*" : "",
                                      fileAttachmentLimits.allowPDF ? "application/pdf" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(",") || "image/*,application/pdf"
                                  }
                                  multiple={fileAttachmentLimits.maxFileCount > 1}
                                  disabled={fileAttachLockedByDialog || !allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                                />
                              </FormControl>
                            </div>
                          )}
                        </div>
                      </RestrictedFileUploader>
                    </FormItem>
                    </div>
                  </div>

                  {/* Desktop: two containers — (1) Sub total to Total, (2) Link for bill wise — 15px gap, same as mobile */}
                  <div className="flex flex-col gap-[15px] w-full">
                    {/* Container 1: Sub total se total tak */}
                    <div className="space-y-4 border border-cyan-300/80 rounded-lg px-[2px] py-4 bg-cyan-50 w-full">
                      <div className="flex justify-between items-center font-medium">
                        <span>Sub Total:</span>
                        <span>{(subTotal || 0).toFixed(2)}</span>
                      </div>
                      <FormField
                        control={form.control}
                        name="discount"
                        render={({ field }: any) => (
                          <FormItem className="flex justify-between items-center">
                            <FormLabel>Discount:</FormLabel>
                            <FormControl>
                              <Input type="number" className="w-32 text-right" {...field} disabled={deleteDisabledWhenLinked} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <FormLabel>Tax:</FormLabel>
                          {selectedTax && (
                            <FormLabel className={cn("text-xs font-semibold", selectedTax.balance < 0 ? 'text-red-600' : 'text-green-600')}>
                              {selectedTax.balance < 0 ? `Payable: ${formatCurrencyForPrint(Math.abs(selectedTax.balance), { noSuffix: true, noAnimation: true })}` : `Receivable: ${formatCurrencyForPrint(selectedTax.balance, { noSuffix: true, noAnimation: true })}`}
                            </FormLabel>
                          )}
                        </div>
                        <span className="w-32 text-right">{(tax || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-lg font-bold border-t pt-2 mt-2">
                        <span>Total:</span>
                        <span className="text-red-600">{(total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    {/* Container 2: Link for bill wise — same table/style as Payment Out. Shown for both new and edit so user can link before/after save. */}
                    {shouldShowLinkButton && (
                      <div className="pb-1">
                        {/* Desktop add/non-linked edit path uses same reveal button. */}
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowLinkSections(true)}>Show Link</Button>
                      </div>
                    )}
                    {shouldShowBillWiseSection && (
                      <div className="space-y-4 border-2 border-rose-300/80 rounded-lg px-[2px] py-4 pb-[45px] bg-rose-50 w-full">
                        <div className="border-b border-border/60 pb-2">
                          <span className="text-sm font-semibold">Link for bill wise</span>
                          {company?.enableLinkPaymentToTxns && (
                            <p className="text-sm text-blue-600 mt-1">
                              {billWiseLinkableCount > 0
                                ? `${billWiseLinkableCount} voucher${billWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                                : "You can save this voucher without linking, bcz no voucher to link."}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">
                            {billWiseLinkableCount} voucher(s) available to link.{linkedAmountRows.length > 0 && ` ${linkedAmountRows.length} linked.`}
                          </p>
                        </div>
                        {linkedAmountRows.length > 0 && (
                          <div className="overflow-x-auto min-w-0 rounded-md border">
                            <table className="w-full text-sm border-collapse min-w-0">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Date</th>
                                  <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Voucher No.</th>
                                  <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Amount</th>
                                  <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on others</th>
                                  <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on current</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linkedAmountRows.map((row, i) => {
                                  const isOB = row.paymentVoucherId === OPENING_BALANCE_VOUCHER_ID;
                                  const details = isOB ? null : paymentVoucherDetails.get(row.paymentVoucherId ?? "");
                                  const rowAmount = details?.total ?? row.amount;
                                  const linkedOnOthers = isOB ? 0 : Math.max(0, (details?.totalAllocated ?? 0) - row.amount);
                                  return (
                                    <tr
                                      key={i}
                                      {...(can('edit_link')
                                        ? { role: "button" as const, tabIndex: 0, className: "border-b border-border/30 last:border-b-0 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1", onClick: () => setIsLinkAdvancesOpen(true), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsLinkAdvancesOpen(true); } } }
                                        : { className: "border-b border-border/30 last:border-b-0" })}
                                    >
                                      <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</td>
                                      <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber || "—"}</td>
                                      <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrencyForPrint(rowAmount, { noSuffix: true, noAnimation: true })}</td>
                                      <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrencyForPrint(linkedOnOthers, { noSuffix: true, noAnimation: true })}</td>
                                      <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrencyForPrint(row.amount, { noSuffix: true, noAnimation: true })}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="pt-2 border-t flex justify-end min-w-0">
                          <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                              <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate text-right whitespace-nowrap leading-tight">{formatCurrencyForPrint(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate leading-tight">Balance</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className={cn("truncate text-right whitespace-nowrap leading-tight", (total || 0) - totalLinked <= 0 ? "text-green-600 font-semibold" : "")}>
                                {(total || 0) - totalLinked <= 0 ? "Settled" : formatCurrencyForPrint(Math.max(0, (total || 0) - totalLinked), { noSuffix: true, noAnimation: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                        {partyId && can('add_link') && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Button type="button" className="w-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsLinkAdvancesOpen(true)}>
                              <Link2 className="mr-2 h-4 w-4" /> Link to Dr
                            </Button>
                            {/* Read me to the right of Link to Dr, inside the link section box */}
                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                              <Info className="h-4 w-4 shrink-0" />
                              Read me
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className={cn(
            "border-t min-w-0 max-w-full overflow-x-hidden",
            isMobile ? "mt-[3px] pt-[3px] pb-[3px] w-[calc(100%-4px)] mx-auto px-[2px]" : "pt-4 flex flex-row justify-between items-center px-[2px] gap-4"
          )}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full min-w-0", VOUCHER_BUTTONS_CLASS)}>
                {/* Row 0: Delete (left) | History (middle) | Save & Print (right) */}
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full" disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>This will move the voucher to the recycle bin.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                  History
                </Button>
                <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                  Save & Print
                </Button>
                {/* Row 1: Cancel | Save (middle) | Approve — CreateSaleForm jaisa mobile layout */}
                <Button type="button" onClick={() => { setPendingLinkAllocations(null); onVoucherAction?.('cancelled'); }} className={cn("w-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("w-full", BTN_SAVE_CLASS)}>
                  {isLoading ? "..." : "Save"}
                </Button>
                <Button type="button" onClick={showSaveAndApproveOnCreate && !voucher?.id ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (isFormDirty ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (onApprove ?? (() => {})))} disabled={showSaveAndApproveOnCreate && !voucher?.id ? (isLoading || isApproving || editingDisabled) : (editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty))} className={cn("w-full", BTN_APPROVE_CLASS)}>
                  {isApproving ? "..." : (showSaveAndApproveOnCreate && !voucher?.id ? "Save & Approve" : (isFormDirty ? "Save & Approve" : "Approve"))}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || !showHistoryButton || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </Button>
                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" className="shrink-0 rounded-full" disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will move the voucher to the recycle bin.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                          Move to Bin
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className={cn("flex gap-2 justify-end flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={() => { setPendingLinkAllocations(null); onVoucherAction?.('cancelled'); }} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={!!isEditing || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save &amp; New
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Save & Print
                  </Button>
                  <Button type="submit" disabled={isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  <Button type="button" onClick={showSaveAndApproveOnCreate && !voucher?.id ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (isFormDirty ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (onApprove ?? (() => {})))} disabled={showSaveAndApproveOnCreate && !voucher?.id ? (isLoading || isApproving || editingDisabled) : (editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty))} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    {showSaveAndApproveOnCreate && !voucher?.id ? "Save & Approve" : (isFormDirty ? "Save & Approve" : "Approve")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </form>
      </Form>
      
      <CreatePartyDialog
        onPartyCreated={(id) => {
          pendingPartyIdUntilInPartiesListRef.current = id;
          setIsCreatePartyOpen(false);
          form.setValue("partyId", id);
        }}
        isOpen={isCreatePartyOpen}
        onOpenChange={setIsCreatePartyOpen}
      />

      <CreateItemDialog
        onOpenChange={setIsCreateItemOpen}
        onItemCreated={(id) => {
            setIsCreateItemOpen(false);
            if(fields.length > 0) {
                form.setValue(`lineItems.${fields.length-1}.itemId`, id);
            }
        }}
        isOpen={isCreateItemOpen}
        defaultType={itemType}
      />

      <CreateTaxDialog
        onTaxCreated={handleTaxCreated}
        isOpen={isCreateTaxOpen}
        onOpenChange={setIsCreateTaxOpen}
      />
      <CreateExpenseAccountDialog
        // On create, immediately select newly created account in Purchase Account field.
        onExpenseAccountCreated={(id) => form.setValue("purchaseAccountId", id)}
        isOpen={isCreateExpenseAccountOpen}
        onOpenChange={setIsCreateExpenseAccountOpen}
      />
      {partyId && (
        <LinkAdvancesToVoucherDialog
          isOpen={isLinkAdvancesOpen}
          onOpenChange={setIsLinkAdvancesOpen}
          mode="purchase"
          vouchersOverride={vouchers}
          targetVoucherId={voucher?.id ?? savedVoucherId ?? ""}
          targetPartyId={partyId}
          targetPartyName={processedParties.find((p) => p.id === partyId)?.name ?? "Party"}
          targetLabel={`Purchase #${form.watch("voucherNumber") || ""}`}
          balanceKind="all"
          targetOutstandingOverride={Math.max(0, (total || 0) - totalLinked)}
          targetTotalAmount={total ?? 0}
          partyOpeningBalance={processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0}
          onConfirm={(payload) => {
            setPendingLinkAllocations(payload.linkedAmounts && Object.keys(payload.linkedAmounts).length > 0 ? { ...payload.linkedAmounts } : {});
            setIsLinkAdvancesOpen(false);
          }}
          initialLinkedAmounts={pendingLinkAllocations ?? effectiveLinkedAmountsForDialog}
        />
      )}
      <LinkSectionInfoDialog open={linkSectionInfoOpen} onOpenChange={setLinkSectionInfoOpen} />
    </>
  );
}



