
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
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
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Checkbox } from "../ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "../ui/alert-dialog";

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp, ArrowRight, Link2, History, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { toast as sonnerToast } from "sonner";

import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { LinkAdvancesToVoucherDialog } from "@/components/vouchers/LinkAdvancesToVoucherDialog";
import { getLinkedAmountsToVoucher, hasPaymentLinks } from "@/lib/payment-allocation-utils";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";

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
import { compressFile } from "@/lib/compression";
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
import { CreateBankAccountDialog } from "../bank-cash/CreateBankAccountDialog";
import { AddVoucherDialog } from "./AddVoucherDialog";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";


const fileSchema = z.object({
  file: z.instanceof(File),
  preview: z.string(),
});

const lineItemSchema = z.object({
  type: z.enum(["item", "service"]),
  itemId: z.string().min(1, "Item/Service is required."),
  quantity: z.coerce.number().min(0, "Quantity must be positive."),
  rate: z.coerce.number().min(0, "Rate must be positive."),
  unit: z.string().optional(),
  amount: z.coerce.number(),
  taxAccountId: z.string().optional(),
  taxAmount: z.coerce.number().optional(),
  isTaxInclusive: z.boolean(),
});

const formSchema = z.object({
  partyId: z.string().min(1, "Please select a customer."),
  salesAccountId: z.string().optional(),
  date: z.date({ message: "A date is required." }),
  voucherNumber: z.string().min(1, "Voucher number is required."),
  lineItems: z.array(lineItemSchema).min(1, "Please add at least one item."),
  narration: z.string().optional(),
  dueDate: z.date().optional().nullable(),
  subTotal: z.coerce.number(),
  totalPurchasePrice: z.coerce.number().optional(),
  discount: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).optional(),
  total: z.coerce.number(),
  unassignedFile: z.any().optional(), // Keep unassignedFile data
  isApproved: z.boolean().optional(),
});

export type SaleFormValues = z.infer<typeof formSchema>;

/* --------------------------------- CONSTS -------------------------------- */

const MAX_FILE_SIZE_MB = 0.5;
// MAX_ATTACHMENTS is now from permissions: fileAttachmentLimits.maxFileCount

const COLS =
  "grid grid-cols-[2fr_0.5fr_0.6fr_0.8fr_1fr_0.7fr_0.8fr_48px] gap-0";
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
    return (prefixes?.sale_service && prefixes.sale_service[0]) || "SS-";
  }
  return (prefixes?.sale && prefixes.sale[0]) || "SALE-";
};

function getInitialFormValues(voucher?: any): SaleFormValues {
  if (!voucher) {
    return {
      partyId: "",
      salesAccountId: "sales_account",
      date: startOfDay(new Date()),
      voucherNumber: "",
      narration: "",
      dueDate: undefined,
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
  const dueDateRaw = voucher.dueDate;
  const dueDate = dueDateRaw != null
    ? (dueDateRaw?.toDate ? dueDateRaw.toDate() : new Date(dueDateRaw))
    : undefined;
  return {
    ...copiedVoucher,
    date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
    dueDate: dueDate ?? undefined,
    discount: voucher.discount || 0,
    tax: voucher.tax || 0,
    files: voucher.fileUrls ? voucher.fileUrls.map((url: string) => ({ file: null, preview: url })) : [],
    salesAccountId: voucher.salesAccountId || 'sales_account',
    unassignedFile: voucher.unassignedFile || null,
    isApproved: voucher.isApproved ?? false,
  };
}

/* --------------------------------- MAIN ---------------------------------- */

export function CreateSaleForm({
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
}) {
  /* ------------------------------ HOOKS/STATE ----------------------------- */
  const isMounted = useRef(true);
  type ProcessedItem = Item & { stockInQty?: number; stockOutQty?: number; stockQty?: number; displayStockQty?: number; };
  const { vouchers, processedParties, processedPartiesForSelection, processedTaxes, processedAccounts, expenseAccounts } = useVouchers();
  const [items, setItems] = useState<Item[]>([]);
  const { toast } = useToast();
  const { company, companyId, triggerSync } = useCompany();
  const { user, customUser } = useAuth();
  const { role, can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const { dateSystem, formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS } = useDate();
  const router = useRouter();
  const isMobile = useIsMobile();


  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [files, setFiles] = useState<(File | string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  const [taxRowIndex, setTaxRowIndex] = useState<number | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDueDateCalendarOpen, setIsDueDateCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLinkAdvancesOpen, setIsLinkAdvancesOpen] = useState(false);
  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && voucher.type !== "sale";
  
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(formSchema) as Resolver<SaleFormValues>,
    defaultValues: getInitialFormValues(voucher),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const [itemType, setItemType] = useState<"item" | "service">("item");
  const isCompanyAdmin = role === "owner" || customUser?.role === "CompanyAdmin" || customUser?.role === "SuperAdmin";
  const showApprovalCheckbox = isEditing && !isCompanyAdmin && can("approve_transactions");

const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f: any) => typeof f === 'string') as string[];
    const newFiles    = files.filter((f: any) => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u: any, i: number) => u !== init[i]);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty;
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

  const voucherIdForLinks = voucher?.id ?? savedVoucherId;
  const linkedAmountRows = useMemo(() => getLinkedAmountsToVoucher(vouchers, voucherIdForLinks, "sale", "all"), [vouchers, voucherIdForLinks]);
  const totalLinked = useMemo(() => linkedAmountRows.reduce((s, r) => s + r.amount, 0), [linkedAmountRows]);
  const hasItemEditLock = linkedAmountRows.length > 0;

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
      primaryLineItemType === "service" ? "sale_service" : "sale"
    ] ?? true;

  const isVoucherEditingAllowed =
    company?.allowVoucherNumberEditing?.[
      primaryLineItemType === "service" ? "sale_service" : "sale"
    ] ?? false;

  const isPrefixSelectionEnabled =
    company?.enableVoucherPrefixSelection?.[
      primaryLineItemType === "service" ? "sale_service" : "sale"
    ] ?? false;

  // Check both company setting AND permission for rate editing
  const canEditRates = can('edit_item_rates_in_vouchers');
  const isRateEditingAllowed = (company?.allowRateEditing?.sale ?? true) && canEditRates;

  /* ----------------------------- EFFECTS: DATA ---------------------------- */

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;

     const unsubItems = onSnapshot(
      query(collection(firestore, `companies/${companyId}/items`)),
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Item)).filter(i => !i.isDeleted));
      }
    );

    return () => {
      unsubItems();
    };
  }, [companyId]);

  useEffect(() => {
    if (voucher?.id) {
      form.reset(getInitialFormValues(voucher));
      setSavedVoucherId(voucher.id);
      const urlsToSet = voucher.unassignedFile?.url ? [voucher.unassignedFile.url] : (voucher.fileUrls || []);
      if (Array.isArray(urlsToSet)) {
        setFiles(urlsToSet);
        initialFilesRef.current = urlsToSet.filter((f: any) => typeof f === 'string') as string[];
      }
    } else if (voucher) {
      setSavedVoucherId(null);
      if (voucher.partyId != null) form.setValue("partyId", voucher.partyId);
      if (voucher.date != null) form.setValue("date", voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date));
      const urlsToSet = voucher.unassignedFile?.url ? [voucher.unassignedFile.url] : (voucher.fileUrls || []);
      if (Array.isArray(urlsToSet)) {
        setFiles(urlsToSet);
        initialFilesRef.current = urlsToSet.filter((f: any) => typeof f === 'string') as string[];
      }
    }
  }, [voucher, form]);

  /* ---------------------- AUTO VOUCHER NUMBER GENERATION ------------------ */

  const fetchVoucherNumber = useCallback(
    async (prefix?: string) => {
      const type = primaryLineItemType === "service" ? "sale_service" : "sale";
      if (!companyId || !company || !(company.autoVoucherNumbering?.[type] ?? true)) return;

      const prefixes =
        company?.voucherPrefixes?.[type] || [getVoucherPrefix(primaryLineItemType)];
      const VOUCHER_PREFIX = prefix || prefixes[0];

      try {
        const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "sale"));
        const querySnapshot = await getDocs(q);
        const voucherNumbers = querySnapshot.docs
          .map((doc) => doc.data())
          .filter((data) => (data.lineItems?.[0]?.type || "item") === primaryLineItemType)
          .map((data) => data.voucherNumber as string);

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
    [companyId, company, form, primaryLineItemType]
  );

  useEffect(() => {
    if (!savedVoucherId || isEditingAndConverting) {
      fetchVoucherNumber();
    }
  }, [savedVoucherId, isEditingAndConverting, fetchVoucherNumber, primaryLineItemType, company]);

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
  
  // Ref so handleFormSubmit always calls the latest processAndSave without listing it as a dep
  const processAndSaveRef = useRef<((data: any, opts?: any) => Promise<any>) | null>(null);

  const handleFormSubmit = useCallback(async (e: React.FormEvent, options: { saveAndNew?: boolean, print?: boolean, approveAfterSave?: boolean } = {}) => {
      e.preventDefault();
      const isValid = await form.trigger();
      if (!isValid) {
          const errors = form.formState.errors;
          const errorMessages: string[] = [];
          
          // Collect all validation errors
          if (errors.partyId) errorMessages.push(`Customer: ${errors.partyId.message}`);
          if (errors.date) errorMessages.push(`Date: ${errors.date.message}`);
          if (errors.voucherNumber) errorMessages.push(`Voucher No.: ${errors.voucherNumber.message}`);
          if (errors.lineItems) {
            const lineItems = errors.lineItems as Record<number, { itemId?: { message?: string }; quantity?: { message?: string }; rate?: { message?: string }; amount?: { message?: string } }> | undefined;
            Object.entries(lineItems ?? {}).forEach(([idxStr, itemError]) => {
              const index = parseInt(idxStr, 10);
              if (itemError) {
                if (itemError.itemId) errorMessages.push(`Item ${index + 1}: ${itemError.itemId.message}`);
                if (itemError.quantity) errorMessages.push(`Item ${index + 1} Quantity: ${itemError.quantity.message}`);
                if (itemError.rate) errorMessages.push(`Item ${index + 1} Rate: ${itemError.rate.message}`);
                if (itemError.amount) errorMessages.push(`Item ${index + 1} Amount: ${itemError.amount.message}`);
              }
            });
          }
          if (errors.subTotal) errorMessages.push(`Sub Total: ${errors.subTotal.message}`);
          if (errors.total) errorMessages.push(`Total: ${errors.total.message}`);
          
          const errorText = errorMessages.length > 0 
            ? errorMessages.join(", ") 
            : "Please check the form and try again.";
          
          sonnerToast.error("Validation Failed", { description: errorText });
          return;
      }
      
      // Debounce callback to prevent multiple re-renders and transaction shaking
      // Update happens in background via Firestore onSnapshot listeners
      setTimeout(() => {
        onVoucherAction?.('saved', options.saveAndNew);
      }, 100);

      processAndSave(form.getValues(), options);
      
  }, [form, onVoucherAction, processAndSave]);

   const processAndSave = useCallback(
    async (
      data: SaleFormValues,
      { saveAndNew, print, approveAfterSave }: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}
    ): Promise<string | null> => {
      const toastId = sonnerToast.loading("Saving sale...");
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
        const isEdit = !!voucher?.id || !!savedVoucherId;
        const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
        
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
        }));

        const submissionData = {
          ...data,
          lineItems: lineItemsWithTax,
          type: "sale",
        };

        const existingFileUrls = files.filter(
          (f): f is string => typeof f === "string"
        );
        
        // If an unassignedFile is present, add its URL
        if(data.unassignedFile?.url && !existingFileUrls.includes(data.unassignedFile.url)) {
            existingFileUrls.push(data.unassignedFile.url);
        }

        const newFilesToUpload = files.filter(
          (f): f is File => f instanceof File
        );

        if (newFilesToUpload.length > 0) {
          const totalNewBytes = newFilesToUpload.reduce((s, f) => s + (f.size || 0), 0);
          const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
            setIsLoading(false);
            return null;
          }
          for (const file of newFilesToUpload) {
            if (existingFileUrls.length >= fileAttachmentLimits.maxFileCount) break;
            const storageRef = ref(
              storage,
              `voucher-files/${companyId}/sale/${Date.now()}_${file.name}`
            );
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            existingFileUrls.push(url);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
          }
        }

        let finalData = {
          ...submissionData,
          fileUrls: existingFileUrls,
          unassignedFile: data.unassignedFile || voucher?.unassignedFile || null,
          isApproved: isCompanyAdmin ? true : (data.isApproved ?? voucher?.isApproved ?? false),
        };
        // Keep opening balance link from current voucher (set by Link to Txns); form does not edit this
        const currentSale = (savedVoucherId && vouchers) ? vouchers.find((v: any) => v.id === savedVoucherId) : voucher;
        const obAlloc = currentSale != null ? (currentSale as any).openingBalanceAllocated : undefined;
        if (obAlloc !== undefined && obAlloc !== null && Number(obAlloc) >= 0) {
          (finalData as any).openingBalanceAllocated = Number(obAlloc) || 0;
        }
        
        let docId: string | null | undefined = savedVoucherId;
        let originalVoucherIdToDelete: string | null = null;
        
        if (isEditingAndConverting && voucher.id) {
            originalVoucherIdToDelete = voucher.id;
            docId = null; // Force creation of new voucher
        }

        const isEditForApprove = !!voucher?.id && !originalVoucherIdToDelete;
        const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
        const savedDoc = await saveVoucher(
          companyId,
          user.uid,
          finalData,
          originalVoucherIdToDelete ? null : docId,
          approveAfterSave && isEditForApprove ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
        );

        if (savedDoc && savedDoc.id) {
            docId = savedDoc.id;
            if (isMounted.current) setSavedVoucherId(docId);
            if (originalVoucherIdToDelete) {
                await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                    isDeleted: true,
                    deletedAt: serverTimestamp(),
                    convertedToType: 'sale',
                    convertedToVoucherNumber: finalData.voucherNumber,
                });
            }
        } else {
            throw new Error("Failed to save voucher and get ID.");
        }

        if (approveAfterSave && savedDoc?.id) {
          if (!isEditForApprove) {
            await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
          }
          sonnerToast.success("Success", { id: toastId, description: isEditForApprove ? "Sale updated and approved." : "Sale saved and approved." });
        } else {
          sonnerToast.success("Success", {
            id: toastId,
            description: "Sale invoice saved successfully.",
          });
        }

        // Debounce triggerSync to prevent multiple rapid updates
        // Firestore onSnapshot will handle updates in background
        setTimeout(() => {
          triggerSync();
        }, 150);

        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number((finalData as any).total) || 0;
          const vid = docId ?? voucher?.id;
          if (isEdit) {
            const changes = getChangedFieldLabels(
              { ...voucher, date: voucher?.date, total: (voucher as any)?.total, narration: (voucher as any)?.narration, voucherNumber: (voucher as any)?.voucherNumber, partyId: (voucher as any)?.partyId },
              { ...finalData, date: (finalData as any).date, total: (finalData as any).total, narration: (finalData as any).narration, voucherNumber: (finalData as any).voucherNumber, partyId: (finalData as any).partyId },
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
              voucherType: "sale",
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
              voucherType: "sale",
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
            setSavedVoucherId(null);
            await fetchVoucherNumber();
        }

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
    [companyId, user, files, onVoucherAction, triggerSync, form, savedVoucherId, company, voucher, isEditingAndConverting, fetchVoucherNumber]
  );


  const handleDelete = async () => {
    if (!savedVoucherId || !companyId) return;
    
    try {
      // Permission check: delete (and delete_approved_voucher if voucher is approved)
      const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
      const voucherData = voucherDoc.exists() ? voucherDoc.data() : null;
      if (!canDeleteVoucher(voucherData)) {
        throw new PermissionDeniedError(
          (voucherData as any)?.isApproved ? "You do not have permission to delete approved vouchers." : "You do not have permission to delete records."
        );
      }
      if (voucherData && hasPaymentLinks(voucherData)) {
        toast({ variant: "destructive", title: "Cannot Delete", description: "First unlink linked transactions." });
        return;
      }
      if (voucherDoc.exists() && voucherData) {
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
      await updateDoc(
        doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId),
        {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user?.uid || '',
        }
      );
      toast({
        title: "Voucher Moved to Bin",
        description: "The sale invoice has been moved to the recycle bin.",
      });
      triggerSync();
      if (onVoucherAction) onVoucherAction('cancelled');
    } catch (err) {
      console.error("delete sale error:", err);
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
      const isPDF = file.type === "application/pdf";
      
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
        const compressedFile = await compressFile(file);
        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "File Too Large After Compression",
            description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
          });
          continue;
        }
        
        if (files.length < maxFiles) {
          setFiles(prev => [...prev, compressedFile]);
        } else {
          toast({
            variant: "destructive",
            title: "Limit Reached",
            description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? 's' : ''}.`,
          });
          break;
        }
      } catch (error) {
        console.error("Error handling file:", error);
        toast({
          variant: "destructive",
          title: "File Processing Error",
          description: "Could not process the file. It might be corrupted.",
        });
      }
    }
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
      company?.voucherPrefixes?.[primaryLineItemType === "service" ? "sale_service" : "sale"] ||
      [getVoucherPrefix(primaryLineItemType)],
    [company, primaryLineItemType, files]
  );

  const [subTotal, total, tax, totalPurchasePrice] = useWatch({
    control: form.control,
    name: ["subTotal", "total", "tax", "totalPurchasePrice"],
  });
  
  const filteredItems = useMemo(() => items.filter((i) => i.type === itemType && !i.isDeleted), [items, itemType]);
  
  const itemOptions = useMemo(() => {
    if (!allProcessedItems || !filteredItems) return [];
    return filteredItems.map((item) => {
        const stock = allProcessedItems.find(p => p.id === item.id);
        const stockQty = stock?.displayStockQty ?? 0;
        const stockUnit = (stock as any)?.unitConversions?.[(stock as any).unitConversions.length-1]?.toUnit || '';
        return {
            value: item.id,
            label: `${item.name} (Stock: ${stockQty.toFixed(2)} ${stockUnit})`,
            isSpecial: stockQty <= 0,
        };
    });
  }, [filteredItems, allProcessedItems]);
  
  const availableAccounts = useMemo(() => processedAccounts.filter(acc => !acc.isSpecial), [processedAccounts]);

  /* --------------------------------- RENDER -------------------------------- */

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleFormSubmit} className="h-full flex flex-col min-w-0 w-full max-w-full">
          <ScrollArea className={cn("flex-1 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className={cn(
              "space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
              "px-0"
            )}>
              {/* PC View: All 4 Fields in Same Row with Responsive Wrapping */}
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Invoice No. + Date(s) in one row, 2/3/4 equal-sized boxes */}
                  {(() => {
                    const hasPrefix = isPrefixSelectionEnabled && voucherPrefixes.length > 0;
                    const hasDateBS = dateSystem === 'BS' || dateSystem === 'Both';
                    const hasDateAD = dateSystem === 'AD' || dateSystem === 'Both';
                    const colCount = (hasPrefix ? 1 : 0) + 1 + (hasDateBS ? 1 : 0) + (hasDateAD ? 1 : 0);
                    return (
                      <FormField
                        control={form.control}
                        name="voucherNumber"
                        render={({ field: voucherField }: any) => (
                          <>
                            <FormField
                              control={form.control}
                              name="date"
                              render={({ field: dateField }: any) => (
                                <>
                                  <div className="grid gap-[2px] w-full min-w-0 max-w-full" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                                    {hasPrefix && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Prefix</FormLabel>
                                        <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find((p) => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]}>
                                          <SelectTrigger className="h-9 w-full min-w-0 max-w-full text-xs px-1 [&>span]:truncate">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {voucherPrefixes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                    <FormItem className="min-w-0 w-full overflow-hidden">
                                      <FormLabel className="text-xs truncate">Invoice No.</FormLabel>
                                      <FormControl>
                                        <Input placeholder="e.g. INV-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
                                      </FormControl>
                                    </FormItem>
                                    {hasDateBS && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                                        <div className="min-w-0 w-full overflow-hidden">
                                          <BsDatePicker valueAD={dateField.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" />
                                        </div>
                                      </FormItem>
                                    )}
                                    {hasDateAD && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date</FormLabel>
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                          <PopoverTrigger asChild>
                                            <FormControl>
                                              <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")}>
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
                                  </div>
                                  <FormMessage />
                                </>
                              )}
                            />
                            <FormMessage />
                          </>
                        )}
                      />
                    );
                  })()}
                  {/* Mobile: Customer and Sales Account - 2 columns */}
                  <div className="flex gap-[2px] w-full">
                    <FormField
                      control={form.control}
                      name="partyId"
                      render={({ field }: any) => (
                        <FormItem className="flex-1 min-w-0">
                           <div className="flex justify-between items-baseline mb-1">
                            <FormLabel className="text-xs">Party</FormLabel>
                            {partyBalance !== null && partyBalance !== undefined && (
                              <FormLabel className={cn("text-[10px] font-semibold mr-[2px]", partyBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {formatCurrencyForPrint(partyBalance, { noSuffix: true, noAnimation: true })} {partyBalance >= 0 ? 'Dr' : 'Cr'}
                              </FormLabel>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Combobox
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
                              placeholder="Select customer"
                              addNewLabel="+ Add New Party"
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="salesAccountId"
                      render={({ field }: any) => (
                        <FormItem className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <FormLabel className="text-xs">Sales A/c</FormLabel>
                          </div>
                          <div className="flex gap-1">
                            <Combobox
                              options={expenseAccounts.filter(a => {
                                  const type = (a.type || '').toLowerCase();
                                  const name = (a.name || '').toLowerCase();
                                  return type === 'income'  || type === 'sales' || type === 'purchase' || name.includes('sales');
                              }).map((p) => ({value: p.id, label: p.name}))}
                              value={field.value}
                              onChange={(val) => { field.onChange(val) }}
                              placeholder="Select account"
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
                  {/* PC View: Customer, Sales Account, Prefix, Invoice No., Date(s) in one row, equal width (like mobile) */}
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
                              <div className="flex justify-between items-baseline">
                                <FormLabel className="truncate">Customer (Dr.)</FormLabel>
                                {partyBalance !== null && partyBalance !== undefined && (
                                  <FormLabel className={cn("text-xs font-semibold shrink-0", partyBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
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
                                placeholder="Select a customer"
                                addNewLabel="+ Add New Party"
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salesAccountId"
                          render={({ field }: any) => (
                            <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                              <FormLabel className="truncate">Sales Account (Cr.)</FormLabel>
                              <Combobox
                                triggerClassName="h-10 w-full min-w-0"
                                options={expenseAccounts.filter(a => { const t = (a.type || '').toLowerCase(); const n = (a.name || '').toLowerCase(); return t === 'income' || t === 'sales' || t === 'purchase' || n.includes('sales'); }).map((p) => ({ value: p.id, label: p.name }))}
                                value={field.value}
                                onChange={(val) => field.onChange(val)}
                                placeholder="Select sales account"
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
                                <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find((p) => field.value?.startsWith(normalizePrefix(p)) || field.value?.startsWith(p)) || voucherPrefixes[0]}>
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
                                <Input placeholder="e.g. INV-001" {...field} className="h-10 w-full min-w-0 shrink-0" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
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
                                  <BsDatePicker valueAD={field.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-10 w-full shrink-0" />
                                  <FormMessage />
                                </FormItem>
                              )}
                              {hasDateAD && (
                                <FormItem className="min-w-0 w-full overflow-hidden flex flex-col">
                                  <FormLabel className="truncate">Date</FormLabel>
                                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button variant="outline" className={cn("h-10 w-full min-w-0 shrink-0 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
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

              {/* Items / Services Toggle */}
              <div className={cn(isMobile && "flex justify-start")}>
                <Tabs value={itemType} onValueChange={(v) => setItemType(v as "item" | "service")} className={cn(isMobile && "w-auto")}>
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

              {/* Line Items Grid */}
              <div className={cn(
                "border rounded-lg overflow-hidden relative",
                isMobile ? "w-[calc(100%-4px)] mx-auto px-[2px]" : "px-[2px]"
              )}>
                {hasItemEditLock && (
                  <div className="absolute inset-0 z-10 flex flex-col rounded-lg bg-muted/25">
                    <div className="flex-shrink-0 border-b border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 rounded-t-lg">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 text-center">
                        Items locked — Unlink via &quot;Link to Txns&quot; to edit.
                      </p>
                    </div>
                    <div className="flex-1 min-h-0" aria-hidden />
                  </div>
                )}
                {isMobile ? (
                  // Mobile View: No scrollable container, broken rows
                  <div className="w-full">
                    {/* Mobile Rows */}
                    {fields.map((line, index) => {
                  const selectedItem = allProcessedItems.find(
                    (i) => i.id === form.getValues(`lineItems.${index}.itemId`)
                  );

                  const unitOptions =
                    (selectedItem?.unitConversions as any[])?.flatMap((uc) => [
                      uc.fromUnit,
                      uc.toUnit,
                    ])?.filter((v, i, a) => a.indexOf(v) === i && v) || [];

                  return (
                    isMobile ? (
                      // Mobile View: Broken into multiple rows
                      <div key={line.id} className="border-t px-[2px] py-2 space-y-2">
                        {/* Row 1: Item field (full width) */}
                        <div className="w-full px-[2px]">
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.itemId`}
                            render={({ field }: any) => (
                              <FormItem className="w-full">
                                <Combobox
                                  options={itemOptions}
                                  value={field.value}
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
                                      field.onChange(val);
                                      const sel = allProcessedItems.find((i) => i.id === val);
                                      if (sel) {
                                        const defaultUnit = sel.salePriceUnit || (sel.unitConversions as any)?.[0]?.fromUnit || "";
                                        const rate = getUnitBasedPrice(sel, defaultUnit, 'sale');
                                        form.setValue(`lineItems.${index}.rate`, rate, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.unit`, defaultUnit, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.taxAccountId`, sel.saleTaxId || "", { shouldDirty: true });
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
                                    <Input type="number" {...field} className="h-9 text-xs text-right" />
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
                                  <FormControl>
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="w-full">
                                            <Input
                                              type="number"
                                              {...field}
                                              disabled={!isRateEditingAllowed}
                                              className={cn("h-9 text-xs text-right", !isRateEditingAllowed && 'bg-muted cursor-not-allowed')}
                                              title={!isRateEditingAllowed && !canEditRates ? "No permission to edit rates" : undefined}
                                            />
                                          </div>
                                        </TooltipTrigger>
                                        {!isRateEditingAllowed && !canEditRates && (
                                          <TooltipContent>
                                            <p>No permission to edit item rates</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          {/* Right Column: Unit (top) and Tax (bottom) */}
                          <div className="flex-1 space-y-2">
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.unit`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Unit</FormLabel>
                                  <Select
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      const sel = allProcessedItems.find((i) => i.id === form.getValues(`lineItems.${index}.itemId`));
                                      if (sel) {
                                        const newRate = getUnitBasedPrice(sel, value, 'sale');
                                        form.setValue(`lineItems.${index}.rate`, newRate, { shouldDirty: true });
                                      }
                                    }}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Unit" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {unitOptions?.map((u: string) => (
                                        <SelectItem key={u} value={u}>
                                          {u}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`lineItems.${index}.taxAccountId`}
                              render={({ field }: any) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Tax</FormLabel>
                                  <FormControl>
                                    <div className="[&_button]:h-9 [&_button]:text-xs">
                                      <Combobox
                                        options={processedTaxes.map((t) => ({
                                          value: t.id,
                                          label: `${t.name} @ ${t.rate}%`,
                                        }))}
                                        value={field.value}
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
                                  <FormLabel className="text-xs">Tax Inc.</FormLabel>
                                  <div className="flex items-center h-9">
                                    <FormControl>
                                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                              onClick={() => remove(index)}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Desktop View: Original grid layout
                      <div key={line.id} className={cn(COLS, "divide-x divide-border border-t")}>
                        <div className={cn(TD_BASE, "flex flex-col")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.itemId`}
                            render={({ field }: any) => (
                              <FormItem className="w-full">
                                <Combobox
                                  options={itemOptions}
                                  value={field.value}
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
                                      field.onChange(val);
                                      const sel = allProcessedItems.find((i) => i.id === val);
                                      if (sel) {
                                        const defaultUnit = sel.salePriceUnit || (sel.unitConversions as any)?.[0]?.fromUnit || "";
                                        const rate = getUnitBasedPrice(sel, defaultUnit, 'sale');
                                        form.setValue(`lineItems.${index}.rate`, rate, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.unit`, defaultUnit, { shouldDirty: true });
                                        form.setValue(`lineItems.${index}.taxAccountId`, sel.saleTaxId || "", { shouldDirty: true });
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
                                <Input type="number" {...field} className={cn(FLAT_INPUT, "text-right")} />
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
                                <Select
                                  onValueChange={(value) => {
                                    field.onChange(value);
                                     const sel = allProcessedItems.find((i) => i.id === form.getValues(`lineItems.${index}.itemId`));
                                      if (sel) {
                                        const newRate = getUnitBasedPrice(sel, value, 'sale');
                                        form.setValue(`lineItems.${index}.rate`, newRate, { shouldDirty: true });
                                      }
                                  }}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className={FLAT_SELECT_TRIGGER}>
                                      <SelectValue placeholder="Unit" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {unitOptions.map((u) => (
                                      <SelectItem key={u} value={u}>
                                        {u}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className={cn(TD_BASE, "flex items-center justify-end")}>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.rate`}
                            render={({ field }: any) => (
                              <FormControl>
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full">
                                        <Input
                                          type="number"
                                          {...field}
                                          disabled={!isRateEditingAllowed}
                                          className={cn(FLAT_INPUT, !isRateEditingAllowed && 'bg-muted cursor-not-allowed', "text-right")}
                                          title={!isRateEditingAllowed && !canEditRates ? "No permission to edit rates" : undefined}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    {!isRateEditingAllowed && !canEditRates && (
                                      <TooltipContent>
                                        <p>No permission to edit item rates</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </FormControl>
                            )}
                          />
                        </div>

                        <div className={cn(TD_BASE, "flex items-center justify-center gap-1")}>
                          {/* Inclusive checkbox */}
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.isTaxInclusive`}
                            render={({ field }: any) => (
                              <FormItem className="flex items-center">
                                <FormControl>
                                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          {/* Tax selector */}
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.taxAccountId`}
                            render={({ field }: any) => (
                              <FormItem className="w-full">
                                <Combobox
                                  options={processedTaxes.map((t) => ({
                                    value: t.id,
                                    label: `${t.name} @ ${t.rate}%`,
                                  }))}
                                  value={field.value}
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
                                  className={cn(FLAT_INPUT, "bg-muted text-right")}
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
                                  className={cn(FLAT_INPUT, "bg-muted text-right")}
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
                              onClick={() => remove(index)}
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  );
                })}
                    {/* Add Line Button */}
                    <div className="border-t px-[2px] py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={hasItemEditLock}
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
                          })
                        }
                      >
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Line
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Desktop View: Scrollable container with grid
                  <div className={cn(
                    "overflow-x-auto w-full",
                    "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-full [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-200"
                  )}>
                    <div className="w-full">
                      {/* Header Row */}
                      <div className={cn(COLS, "divide-x divide-border border-b")}>
                        <div className={TH_BASE}>Item</div>
                        <div className={cn(TH_BASE, "text-center")}>Qty</div>
                        <div className={cn(TH_BASE, "text-center")}>Unit</div>
                        <div className={cn(TH_BASE, "text-center")}>Rate</div>
                        <div className={cn(TH_BASE, "flex items-center justify-center")}>
                          <Checkbox
                            checked={(form.watch("lineItems") || []).every((li) => li.isTaxInclusive)}
                            onCheckedChange={handleToggleAllInclusive}
                            id="all-inclusive"
                          />
                          <label htmlFor="all-inclusive" className="cursor-pointer select-none ml-2">
                            Tax Inc.
                          </label>
                        </div>
                        <div className={cn(TH_BASE, "text-right")}>Tax Amt.</div>
                        <div className={cn(TH_BASE, "text-right")}>Amount</div>
                        <div className={TH_BASE}></div>
                      </div>
                      {/* Desktop Rows */}
                      {fields.map((line, index) => {
                        const selectedItem = allProcessedItems.find(
                          (i) => i.id === form.getValues(`lineItems.${index}.itemId`)
                        );

                        const unitOptions =
                          (selectedItem?.unitConversions as any[])?.flatMap((uc) => [
                            uc.fromUnit,
                            uc.toUnit,
                          ])?.filter((v, i, a) => a.indexOf(v) === i && v) || [];

                        return (
                          <div key={line.id} className={cn(COLS, "divide-x divide-border border-t")}>
                            <div className={cn(TD_BASE, "flex flex-col")}>
                              <FormField
                                control={form.control}
                                name={`lineItems.${index}.itemId`}
                                render={({ field }: any) => (
                                  <FormItem className="w-full">
                                    <Combobox
                                      options={itemOptions}
                                      value={field.value}
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
                                          field.onChange(val);
                                          const sel = allProcessedItems.find((i) => i.id === val);
                                          if (sel) {
                                            const defaultUnit = sel.salePriceUnit || (sel.unitConversions as any)?.[0]?.fromUnit || "";
                                            const rate = getUnitBasedPrice(sel, defaultUnit, 'sale');
                                            form.setValue(`lineItems.${index}.rate`, rate, { shouldDirty: true });
                                            form.setValue(`lineItems.${index}.unit`, defaultUnit, { shouldDirty: true });
                                            form.setValue(`lineItems.${index}.taxAccountId`, sel.saleTaxId || "", { shouldDirty: true });
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
                                    <Input type="number" {...field} className={cn(FLAT_INPUT, "text-right")} />
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
                                    <Select
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                         const sel = allProcessedItems.find((i) => i.id === form.getValues(`lineItems.${index}.itemId`));
                                          if (sel) {
                                            const newRate = getUnitBasedPrice(sel, value, 'sale');
                                            form.setValue(`lineItems.${index}.rate`, newRate, { shouldDirty: true });
                                          }
                                      }}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className={FLAT_SELECT_TRIGGER}>
                                          <SelectValue placeholder="Unit" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {unitOptions.map((u) => (
                                          <SelectItem key={u} value={u}>
                                            {u}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                            </div>

                            <div className={cn(TD_BASE, "flex items-center justify-end")}>
                              <FormField
                                control={form.control}
                                name={`lineItems.${index}.rate`}
                                render={({ field }: any) => (
                                  <FormControl>
                                    <TooltipProvider delayDuration={0}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="w-full">
                                            <Input
                                              type="number"
                                              {...field}
                                              disabled={!isRateEditingAllowed}
                                              className={cn(FLAT_INPUT, !isRateEditingAllowed && 'bg-muted cursor-not-allowed', "text-right")}
                                              title={!isRateEditingAllowed && !canEditRates ? "No permission to edit rates" : undefined}
                                            />
                                          </div>
                                        </TooltipTrigger>
                                        {!isRateEditingAllowed && !canEditRates && (
                                          <TooltipContent>
                                            <p>No permission to edit item rates</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </FormControl>
                                )}
                              />
                            </div>

                            <div className={cn(TD_BASE, "flex items-center justify-center gap-1")}>
                              {/* Inclusive checkbox */}
                              <FormField
                                control={form.control}
                                name={`lineItems.${index}.isTaxInclusive`}
                                render={({ field }: any) => (
                                  <FormItem className="flex items-center">
                                    <FormControl>
                                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              {/* Tax selector */}
                              <FormField
                                control={form.control}
                                name={`lineItems.${index}.taxAccountId`}
                                render={({ field }: any) => (
                                  <FormItem className="w-full">
                                    <Combobox
                                      options={processedTaxes.map((t) => ({
                                        value: t.id,
                                        label: `${t.name} @ ${t.rate}%`,
                                      }))}
                                      value={field.value}
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
                                      className={cn(FLAT_INPUT, "bg-muted text-right")}
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
                                      className={cn(FLAT_INPUT, "bg-muted text-right")}
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
                      {/* Add Line Button - Desktop */}
                      <div className="border-t px-2 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={hasItemEditLock}
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
                            })
                          }
                        >
                          <PlusCircle className="mr-2 h-4 w-4" /> Add Line
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom: Narration + Attach / Totals */}
              {isMobile ? (
                <div className="grid grid-cols-2 gap-3 w-[calc(100%-4px)] mx-auto px-[2px]">
                  {/* Mobile: Narration - Left Column */}
                  <div className="col-span-2 px-[2px]">
                    <FormField
                      control={form.control}
                      name="narration"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Narration</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Add any notes for this bill..."
                              {...field}
                              rows={2}
                              className="text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {showApprovalCheckbox && (
                    <div className="col-span-2 px-[2px]">
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
                  {/* Mobile: Due Date */}
                  <div className={cn("col-span-2 px-[2px]", (dateSystem === 'BS' || dateSystem === 'Both') && "flex gap-1")}>
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
                  
                  {/* Mobile: Attach Files - Left Column */}
                  <div className="col-span-2 px-[2px]">
                    <FormItem>
                      <FormLabel className="text-sm">Attach Files</FormLabel>
                      <RestrictedFileUploader>
                        <div className="grid grid-cols-3 gap-2 px-[2px]">
                          {files.map((file, index) => (
                            <FilePreview 
                              key={index} 
                              file={file} 
                              onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                              className={cn(
                                !allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : "",
                                "h-16"
                              )}
                            />
                          ))}
                          {allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                            <FormControl>
                              <div 
                                className={cn(
                                  "h-16 border-2 border-dashed rounded-md flex flex-col justify-center items-center transition-colors",
                                  allowAttachments && fileAttachmentLimits.maxFileCount > 0
                                    ? "text-muted-foreground hover:border-primary cursor-pointer"
                                    : "text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                                )}
                                onClick={() => {
                                  if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                                    fileInputRef.current?.click();
                                  }
                                }}
                              >
                                <Upload className="h-4 w-4" />
                                <span className="text-[9px] mt-0.5">Add</span>
                                <Input 
                                  type="file" 
                                  className="hidden"
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  accept={[
                                    fileAttachmentLimits.allowImage ? "image/*" : "",
                                    fileAttachmentLimits.allowPDF ? "application/pdf" : ""
                                  ].filter(Boolean).join(",") || "image/*,application/pdf"}
                                  multiple={fileAttachmentLimits.maxFileCount > 1}
                                  disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                                />
                              </div>
                            </FormControl>
                          )}
                        </div>
                      </RestrictedFileUploader>
                    </FormItem>
                  </div>
                  
                  {/* Mobile: Totals - 2 Columns Layout */}
                  <div className="col-span-1 bg-muted/20 px-[2px] py-2 rounded-lg border space-y-1.5 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-xs">Sub Total:</span>
                      <span className="text-xs font-medium">{(subTotal || 0).toFixed(2)}</span>
                    </div>
                   
                    <FormField
                      control={form.control}
                      name="discount"
                      render={({ field }: any) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs">Discount:</FormLabel>
                          <FormControl>
                            <Input type="number" className="w-full border rounded p-1 text-right text-xs h-7" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-1 bg-muted/20 px-[2px] py-2 rounded-lg border space-y-1.5 w-full">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                          <FormLabel className="text-xs">Tax:</FormLabel>
                           {selectedTax && (
                              <FormLabel className={cn("text-[10px] font-semibold", selectedTax.balance < 0 ? 'text-red-600' : 'text-green-600')}>
                                 {selectedTax.balance < 0 ? `Pay: ${formatCurrencyForPrint(Math.abs(selectedTax.balance), { noSuffix: true, noAnimation: true })}` : `Rec: ${formatCurrencyForPrint(selectedTax.balance, { noSuffix: true, noAnimation: true })}`}
                              </FormLabel>
                          )}
                        </div>
                        <span className="text-xs font-medium">{(tax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t text-base font-bold">
                      <span className="text-sm">Total:</span>
                      <span className="text-green-600 text-sm">{(total || 0).toFixed(2)}</span>
                    </div>
                    {isEditing && (
                      <>
                        {linkedAmountRows.length > 0 && (
                          <div className="pt-1.5 border-t space-y-1">
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-1 text-[10px] font-medium text-muted-foreground">
                              <span>Date</span>
                              <span>Linked voucher no.</span>
                              <span className="text-right">Amount</span>
                            </div>
                            {linkedAmountRows.map((row, i) => (
                              <div
                                key={i}
                                {...(can('edit_link')
                                  ? { role: "button" as const, tabIndex: 0, className: "grid grid-cols-[1fr_1fr_auto] gap-1 text-[10px] rounded px-1 py-0.5 -mx-1 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 items-center", onClick: () => setIsLinkAdvancesOpen(true), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsLinkAdvancesOpen(true); } } }
                                  : { className: "grid grid-cols-[1fr_1fr_auto] gap-1 text-[10px] rounded px-1 py-0.5 -mx-1 items-center" })}
                              >
                                <span className="text-muted-foreground truncate">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</span>
                                <span className="text-muted-foreground truncate">{row.voucherNumber || "—"}</span>
                                <span className="font-medium shrink-0 text-red-600 text-right">{formatCurrencyForPrint(row.amount, { noSuffix: true, noAnimation: true })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="pt-1.5 border-t">
                          <div className={cn("flex justify-between items-center text-[10px] font-medium", ((total || 0) - totalLinked) <= 0 ? "text-green-600" : "text-green-600")}>
                            <span>{(total || 0) - totalLinked <= 0 ? "Balance: Settled" : "Due Balance:"}</span>
                            <span>{(total || 0) - totalLinked <= 0 ? "" : formatCurrencyForPrint(Math.max(0, (total || 0) - totalLinked), { noSuffix: true, noAnimation: true })}</span>
                          </div>
                        </div>
                        {partyId && company?.enableLinkPaymentToTxns !== false && can('add_link') && (
                          <div className="mt-[5px]">
                            <Button type="button" className="w-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsLinkAdvancesOpen(true)}>
                              <Link2 className="mr-2 h-4 w-4" /> Link to Txns
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {/* Desktop: Left: Narration + Due Date + Files */}
                  <div className="space-y-4 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
                      <FormField
                        control={form.control}
                        name="narration"
                        render={({ field }: any) => (
                          <FormItem>
                            <FormLabel>Narration</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Add any notes for this bill..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                          <FormItem className={cn("md:w-[180px]", dateSystem === 'Both' && "md:w-auto flex-1 min-w-[160px]")}>
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
                    </div>
                    <FormItem>
                      <FormLabel>Attach Files (Optional)</FormLabel>
                      <RestrictedFileUploader>
                        <div className="flex flex-wrap gap-4">
                          {files.map((file, index) => (
                            <FilePreview 
                              key={index} 
                              file={file} 
                              onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                              className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                            />
                          ))}
                          {allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                            <FormControl>
                              <div 
                                className={cn(
                                  "relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors",
                                  allowAttachments && fileAttachmentLimits.maxFileCount > 0
                                    ? "text-muted-foreground hover:border-primary cursor-pointer"
                                    : "text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                                )}
                                onClick={() => {
                                  if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                                    fileInputRef.current?.click();
                                  }
                                }}
                              >
                                <Upload className="h-6 w-6" />
                                <span className="text-xs mt-1">Add File</span>
                                <Input 
                                  type="file" 
                                  className="hidden"
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  accept={[
                                    fileAttachmentLimits.allowImage ? "image/*" : "",
                                    fileAttachmentLimits.allowPDF ? "application/pdf" : ""
                                  ].filter(Boolean).join(",") || "image/*,application/pdf"}
                                  multiple={fileAttachmentLimits.maxFileCount > 1}
                                  disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                                />
                              </div>
                            </FormControl>
                          )}
                        </div>
                      </RestrictedFileUploader>
                    </FormItem>
                  </div>

                  {/* Desktop: Right: Totals */}
                  <div className="space-y-4 border rounded-lg px-[2px] py-4 bg-muted/20 w-full">
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
                            <Input type="number" className="w-32 text-right" {...field} />
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
                      <span className="text-green-600">{(total || 0).toFixed(2)}</span>
                    </div>
                    {isEditing && (
                      <>
                        {linkedAmountRows.length > 0 && (
                          <div className="border-t pt-2 mt-2 space-y-2">
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground">
                              <span>Date</span>
                              <span>Linked voucher no.</span>
                              <span className="text-right">Amount</span>
                            </div>
                            <div className="space-y-1">
                              {linkedAmountRows.map((row, i) => (
                                <div
                                  key={i}
                                  {...(can('edit_link')
                                    ? { role: "button" as const, tabIndex: 0, className: "grid grid-cols-[1fr_1fr_auto] gap-2 text-sm rounded px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 items-center", onClick: () => setIsLinkAdvancesOpen(true), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsLinkAdvancesOpen(true); } } }
                                    : { className: "grid grid-cols-[1fr_1fr_auto] gap-2 text-sm rounded px-2 py-1.5 -mx-2 items-center" })}
                                >
                                  <span className="text-muted-foreground">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</span>
                                  <span className="text-muted-foreground truncate">{row.voucherNumber || "—"}</span>
                                  <span className="font-medium text-red-600 text-right">{formatCurrencyForPrint(row.amount, { noSuffix: true, noAnimation: true })}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="border-t pt-2 mt-2">
                          <div className={cn("flex justify-between items-center text-sm font-medium text-green-600")}>
                            <span>{(total || 0) - totalLinked <= 0 ? "Balance: Settled" : "Due Balance:"}</span>
                            <span>{(total || 0) - totalLinked <= 0 ? "" : formatCurrencyForPrint(Math.max(0, (total || 0) - totalLinked), { noSuffix: true, noAnimation: true })}</span>
                          </div>
                        </div>
                        {partyId && company?.enableLinkPaymentToTxns !== false && can('add_link') && (
                          <div className="mt-2">
                            <Button type="button" className="w-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsLinkAdvancesOpen(true)}>
                              <Link2 className="mr-2 h-4 w-4" /> Link to Txns
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

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
                    <Button type="button" variant="destructive" className="w-full" disabled={!isEditing || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!isEditing || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                  History
                </Button>
                <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                  Save & Print
                </Button>
                {/* Row 1: Cancel (left) | Approve (middle) | Save (right) */}
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                <Button type="button" onClick={showSaveAndApproveOnCreate && !voucher?.id ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (isFormDirty ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (onApprove ?? (() => {})))} disabled={showSaveAndApproveOnCreate && !voucher?.id ? (isLoading || isApproving || editingDisabled) : (!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty))} className={cn("w-full", BTN_APPROVE_CLASS)}>
                  {isApproving ? "..." : (showSaveAndApproveOnCreate && !voucher?.id ? "Save & Approve" : (isFormDirty ? "Save & Approve" : "Approve"))}
                </Button>
                <Button type="submit" disabled={isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                  {isLoading ? "..." : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!isEditing || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </Button>
                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" className="shrink-0 rounded-full" disabled={!isEditing || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                  <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
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
                  <Button type="submit" disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  <Button type="button" onClick={showSaveAndApproveOnCreate && !voucher?.id ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (isFormDirty ? (e: React.MouseEvent) => handleFormSubmit(e as unknown as React.FormEvent, { approveAfterSave: true }) : (onApprove ?? (() => {})))} disabled={showSaveAndApproveOnCreate && !voucher?.id ? (isLoading || isApproving || editingDisabled) : (!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty))} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
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
      {partyId && (voucher?.id ?? savedVoucherId) && (
        <LinkAdvancesToVoucherDialog
          isOpen={isLinkAdvancesOpen}
          onOpenChange={setIsLinkAdvancesOpen}
          mode="sale"
          targetVoucherId={voucher?.id ?? savedVoucherId ?? ""}
          targetPartyId={partyId}
          targetPartyName={processedParties.find((p) => p.id === partyId)?.name ?? "Party"}
          targetLabel={`Sale #${form.watch("voucherNumber") || ""}`}
          balanceKind="all"
          targetOutstandingOverride={Math.max(0, (total || 0) - totalLinked)}
          partyOpeningBalance={processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0}
          onDone={() => triggerSync()}
        />
      )}
    </>
  );
}




