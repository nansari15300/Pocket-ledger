
"use client";
import { DateRange } from "react-day-picker";
import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useFieldArray, useForm, useWatch } from "react-hook-form";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp, UserPlus, Link2, Zap, X, RotateCcw, HelpCircle, History, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { toast as sonnerToast } from "sonner";

import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { saveVoucher, isVoucherLimitError } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { getPaymentOutRemaining, getTaxFromAllocation, getNetFromAllocation, hasPaymentLinks } from "@/lib/payment-allocation-utils";
import type { Allocation } from "@/lib/payment-allocation-utils";

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
import usePermissions from "@/hooks/usePermissions";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import type { Staff } from "@/components/staff/types";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import type { ExpenseAccount } from "../expenses/types";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


const lineItemSchema = z.object({
  staffId: z.string().min(1, "Staff member is required."),
  salary: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
    z
      .number({
        required_error: "Salary amount is required.",
        invalid_type_error: "Salary amount is required.",
      })
      .positive("Salary amount must be greater than 0.")
  ),
  narration: z.string().optional(),
  type: z.enum(["debit", "credit"]),
  taxAccountId: z.string().optional(),
  taxAmount: z.coerce.number(),
  afterTaxSalary: z.coerce.number(),
  rate: z.coerce.number(),
});

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});


const formSchema = z.object({
  voucherNumber: z.string().min(1, "Voucher number is required."),
  date: z.date(),
  debitAccountId: z.string().min(1, "Debit account is required."),
  narration: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one salary entry is required."),
  total: z.coerce.number(),
  accountId: z.string().optional(), // For Pay Salary mode
  files: z.array(fileSchema).optional(),
  unassignedFile: z.any().optional(),
});

type SalaryFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (
  prefixes?: Record<string, string[]>,
  isPayment?: boolean
) => {
  const key = isPayment ? "pay_salary" : "add_salary";
  return (
    (prefixes?.[key] && prefixes[key][0]) || (isPayment ? "PYSAL-" : "ADSAL-")
  );
};

const MAX_FILE_SIZE_MB = 0.5;

const getInitialFormValues = (
  voucher?: any,
  processedStaff?: Staff[],
  processedTaxes?: any[]
): SalaryFormValues => {
  if (!voucher) {
    return {
      voucherNumber: "",
      date: startOfDay(new Date()),
      debitAccountId: "",
      narration: "",
      lineItems: [],
      total: 0,
      accountId: "",
      files: [],
      unassignedFile: null,
    };
  }

  const isSalaryJournal =
    voucher.type === "journal" && voucher.subType === "add_salary";

  let lineItems: any[] = [];
  if (isSalaryJournal) {
    const staffEntries = (voucher.entries || []).filter((e: any) =>
      processedStaff?.some((s) => s.id === e.accountId)
    );

    lineItems = staffEntries.map((staffEntry: any) => {
      const staffCredit = staffEntry.credit || 0;
      const staffMemberId = staffEntry.accountId;
      const taxEntry = (voucher.entries || []).find((taxE: any) =>
          processedTaxes?.some(pt => pt.id === taxE.accountId) && (taxE.narration || "").includes(`(Staff ID: ${staffMemberId})`)
      );

      const taxAmount = taxEntry?.credit || 0;
      const grossSalary = staffCredit + taxAmount;

      return {
        staffId: staffEntry.accountId,
        salary: grossSalary,
        narration: staffEntry.narration,
        type: "credit" as const,
        taxAccountId: taxEntry?.accountId || "",
        taxAmount: taxAmount,
        afterTaxSalary: staffCredit,
        rate: 0, 
      };
    });
  }

  const debitEntry = voucher.entries?.find((e: any) => e.debit > 0);

  return {
    ...voucher,
    date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
    total: voucher.total || voucher.amount,
    debitAccountId: debitEntry?.accountId || "",
    lineItems,
    accountId: voucher.accountId || "",
    files: [],
    unassignedFile: voucher.unassignedFile || null,
  };
};


export function SalaryForm({
  voucher,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  initialMode = "add_salary",
  defaultVoucherData,
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
  initialMode?: "add_salary" | "payment_out";
  defaultVoucherData?: any;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedStaff, processedTaxes, expenseAccounts, processedAccounts, processedExpenseAccounts } = useVouchers();
  const { company, companyId, triggerSync } = useCompany();
  const { can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("party");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [createStaffDefaultName, setCreateStaffDefaultName] = useState("");
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = useState(false);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLinkPaymentDialogOpen, setIsLinkPaymentDialogOpen] = useState(false);
  const [linkPaymentAmounts, setLinkPaymentAmounts] = useState<Record<string, number>>({});
  const [linkPaymentSaving, setLinkPaymentSaving] = useState(false);
  const [autoLinkSaving, setAutoLinkSaving] = useState(false);
  const [linkBalanceKind, setLinkBalanceKind] = useState<"tax" | "net">("net");

  const [activeLineIndex, setActiveLineIndex] = React.useState<number | null>(null);

  const openCreateStaffDialog = React.useCallback((lineIndex: number, newName?: string) => {
    setActiveLineIndex(lineIndex);
    setCreateStaffDefaultName(newName ?? "");
    // Open on next tick so the combobox popover click does not immediately close the dialog.
    setTimeout(() => setIsCreateStaffOpen(true), 0);
  }, []);

  const isPaymentMode = initialMode === "payment_out";
  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && (voucher.type !== 'journal' || voucher.subType !== 'add_salary');
  const isFormEditing = !voucher || isEditing;

  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(formSchema) as Resolver<SalaryFormValues>,
    defaultValues: getInitialFormValues(voucher || defaultVoucherData, processedStaff, processedTaxes),
  });
  
  const [savedVoucherIdRef, setSavedVoucherIdRef] = useState<string | null>(voucher?.id || null);

  useEffect(() => {
        setLoading(vouchersLoading);

    }, [vouchersLoading, companyId]);

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  
  const typeKey = isPaymentMode ? "pay_salary" : "add_salary";
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.[typeKey] ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.[typeKey] ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.[typeKey] ?? false;
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.[typeKey] || [getVoucherPrefix(company?.voucherPrefixes, isPaymentMode)], [company, typeKey, isPaymentMode]);

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!firestore || !companyId || !company) return; 

    const autoEnabled = company?.autoVoucherNumbering?.[typeKey] ?? true;
    if (!autoEnabled) return;

    const voucherType = isPaymentMode ? "payment_out" : "journal";
    const subType = isPaymentMode ? "pay_salary" : "add_salary";

    const prefix =
        selectedPrefix ||
        (company?.voucherPrefixes?.[typeKey]?.[0] ??
        getVoucherPrefix(company?.voucherPrefixes, isPaymentMode));

    try {
        const q = query(
        collection(firestore, `companies/${companyId}/vouchers`),
        where("type", "==", voucherType),
        where("subType", "==", subType)
        );

        const snapshot = await getDocs(q);
        let maxNum = 0;

        snapshot.forEach((doc) => {
        const numStr = doc.data().voucherNumber as string;
        if (numStr && (numStr.startsWith(normalizePrefix(prefix)) || numStr.startsWith(prefix))) {
            const num = parseVoucherNumberPart(numStr, prefix);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        });

        const nextNumber = maxNum + 1;
        form.setValue("voucherNumber", formatVoucherNumber(prefix, nextNumber));
    } catch (error) {
        console.error("Error generating voucher number:", error);
    }
    }, [company, companyId, form, isPaymentMode, typeKey]);


    useEffect(() => {
        const isEditingExisting = !!(voucher?.id || defaultVoucherData?.id);
        if (isEditingExisting) {
            const initialValues = getInitialFormValues(voucher || defaultVoucherData, processedStaff, processedTaxes);
            form.reset(initialValues);
    
            if (voucher) {
                setSavedVoucherIdRef(voucher.id);
                const initialUrls = voucher.fileUrls || [];
                setFiles(initialUrls);
                initialFilesRef.current = initialUrls;
            } else if (defaultVoucherData) {
                const urls = defaultVoucherData.unassignedFile?.url ? [defaultVoucherData.unassignedFile.url] : (defaultVoucherData.fileUrls || []);
                setFiles(urls);
                initialFilesRef.current = urls.filter((f: any) => typeof f === 'string');
            }
        }
    }, [voucher, defaultVoucherData, form, processedStaff, processedTaxes]);

  useEffect(() => {
    if (!isLinkPaymentDialogOpen) setLinkPaymentAmounts({});
  }, [isLinkPaymentDialogOpen]);

  useEffect(() => {
    let isMounted = true;
    if ((!voucher || isEditingAndConverting) && companyId && isMounted) {
        fetchVoucherNumber().catch(console.error);
    }
    return () => { isMounted = false };
  }, [voucher, companyId, fetchVoucherNumber, isEditingAndConverting]);


  const handleSelectAllStaff = () => {
    const currentStaffIds = new Set(form.getValues("lineItems").map((l) => l.staffId));
    processedStaff.forEach((staff) => {
      if (!currentStaffIds.has(staff.id)) {
        const salary = Number(staff.salary) || 0;
        append({
          staffId: staff.id,
          salary,
          narration: `Salary for ${staff.name}`,
          type: "credit",
          taxAccountId: "",
          taxAmount: 0,
          afterTaxSalary: salary,
          rate: 0
        });
      }
    });
  };
  
  const handleTaxCreated = (newTaxId: string) => {
    if(activeLineIndex !== null) {
      form.setValue(`lineItems.${activeLineIndex}.taxAccountId`, newTaxId);
    }
    setIsCreateTaxOpen(false);
  }

  const handleStaffCreated = (newStaffId: string) => {
    if (activeLineIndex !== null) {
      update(activeLineIndex, { ...fields[activeLineIndex], staffId: newStaffId });
    }
    setIsCreateStaffOpen(false);
  };
  
   const handleExpenseAccountCreated = (newAccountId: string) => {
    form.setValue("debitAccountId", newAccountId);
    setIsCreateExpenseOpen(false);
  };

  const handleLinkPayment = async () => {
    if (!companyId || !voucher?.id) return;
    const paymentOutIdsToUpdate = new Set<string>([
      ...Object.keys(linkPaymentAmounts),
      ...linkedPayments.map((p) => p.id),
    ]);
    if (paymentOutIdsToUpdate.size === 0) {
      sonnerToast.info("Enter amount(s) to link or edit.");
      return;
    }
    // Validate: no link amount > that payment's remaining (cannot save minus balance)
    for (const row of paymentOutsForLinkDialog) {
      const amt = Number(linkPaymentAmounts[row.id] ?? 0);
      const remaining = row.remaining ?? 0;
      if (amt > remaining) {
        sonnerToast.error("Cannot save minus balance", {
          description: `${row.voucherNumber ?? "Payment"} has remaining ${formatCurrency(remaining, { noSuffix: true, noAnimation: true })}. Link amount cannot exceed remaining.`,
        });
        return;
      }
    }
    const totalLinkAmount = Object.values(linkPaymentAmounts).reduce((s, a) => s + Number(a || 0), 0);
    if (totalLinkAmount > totalForView) {
      sonnerToast.error("Cannot save minus balance", {
        description: `Total link amount (${formatCurrency(totalLinkAmount, { noSuffix: true, noAnimation: true })}) cannot exceed voucher ${linkBalanceKind === "tax" ? "tax" : "net"} total (${formatCurrency(totalForView, { noSuffix: true, noAnimation: true })}).`,
      });
      return;
    }
    setLinkPaymentSaving(true);
    try {
      const voucherPath = `companies/${companyId}/vouchers`;
      for (const paymentOutId of paymentOutIdsToUpdate) {
        const newAmount = Number(linkPaymentAmounts[paymentOutId] ?? 0);
        const poRef = doc(firestore, voucherPath, paymentOutId);
        const snap = await getDoc(poRef);
        if (!snap.exists()) continue;
        const data = snap.data();
        const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
        const idx = allocations.findIndex((a) => a.voucherId === voucher.id);
        const existing = idx >= 0 ? allocations[idx] : null;
        const prevTax = existing ? getTaxFromAllocation(existing) : 0;
        const prevNet = existing ? getNetFromAllocation(existing) : 0;
        const newTax = linkBalanceKind === "tax" ? newAmount : prevTax;
        const newNet = linkBalanceKind === "net" ? newAmount : prevNet;
        if (newTax === 0 && newNet === 0) {
          if (idx >= 0) {
            allocations.splice(idx, 1);
            await updateDoc(poRef, { allocations });
          }
        } else {
          const newEntry: Allocation = { voucherId: voucher.id, amount: newTax + newNet, taxAmount: newTax, netAmount: newNet };
          if (idx >= 0) allocations[idx] = newEntry;
          else allocations.push(newEntry);
          await updateDoc(poRef, { allocations });
        }
      }
      sonnerToast.success("Payment link updated.");
      setIsLinkPaymentDialogOpen(false);
    } catch (e) {
      console.error(e);
      sonnerToast.error("Failed to update payment link.");
    } finally {
      setLinkPaymentSaving(false);
    }
  };

  const handleAutoLink = async () => {
    if (!companyId || !voucher?.id) return;
    const outstanding = totalForView - totalLinked;
    if (outstanding <= 0) {
      sonnerToast.info(linkBalanceKind === "tax" ? "Tax balance is already fully linked." : "Net balance is already fully linked.");
      return;
    }
    if (paymentOutsOldestFirst.length === 0) {
      sonnerToast.info("No payment outs with remaining amount to link.");
      return;
    }
    setAutoLinkSaving(true);
    try {
      const voucherPath = `companies/${companyId}/vouchers`;
      let remainingToAllocate = outstanding;
      for (const po of paymentOutsOldestFirst) {
        if (remainingToAllocate <= 0) break;
        const allocate = Math.min(po.remaining, remainingToAllocate);
        if (allocate <= 0) continue;
        const poRef = doc(firestore, voucherPath, po.id);
        const snap = await getDoc(poRef);
        if (!snap.exists()) continue;
        const data = snap.data();
        const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
        const idx = allocations.findIndex((a) => a.voucherId === voucher.id);
        const existing = idx >= 0 ? allocations[idx] : null;
        const prevTax = existing ? getTaxFromAllocation(existing) : 0;
        const prevNet = existing ? getNetFromAllocation(existing) : 0;
        const newTax = linkBalanceKind === "tax" ? prevTax + allocate : prevTax;
        const newNet = linkBalanceKind === "net" ? prevNet + allocate : prevNet;
        const newEntry: Allocation = { voucherId: voucher.id, amount: newTax + newNet, taxAmount: newTax, netAmount: newNet };
        if (idx >= 0) allocations[idx] = newEntry;
        else allocations.push(newEntry);
        await updateDoc(poRef, { allocations });
        remainingToAllocate -= allocate;
      }
      sonnerToast.success("Auto link completed.");
    } catch (e) {
      console.error(e);
      sonnerToast.error("Failed to auto link.");
    } finally {
      setAutoLinkSaving(false);
    }
  };

  const watchedLineItems = useWatch({ control: form.control, name: "lineItems" });
  const staffIdsFromSalary = useMemo(
    () => [...new Set(((watchedLineItems ?? []) as any[]).map((l: any) => l.staffId).filter(Boolean))],
    [watchedLineItems]
  );

  useEffect(() => {
    const currentLineItems = form.getValues("lineItems") || [];
    currentLineItems.forEach((item, index) => {
        const taxAccount = processedTaxes.find(t => t.id === item.taxAccountId);
        const taxRate = (taxAccount?.rate || 0) / 100;
        const salary = Number(item.salary) || 0;
        const taxAmount = salary * taxRate;
        const afterTaxSalary = salary - taxAmount;

        const currentTaxAmount = Number(form.getValues(`lineItems.${index}.taxAmount`) || 0).toFixed(2);
        const currentAfterTaxSalary = Number(form.getValues(`lineItems.${index}.afterTaxSalary`) || 0).toFixed(2);

        if (currentTaxAmount !== taxAmount.toFixed(2)) {
            form.setValue(`lineItems.${index}.taxAmount`, taxAmount, { shouldValidate: true });
        }
        if (currentAfterTaxSalary !== afterTaxSalary.toFixed(2)) {
            form.setValue(`lineItems.${index}.afterTaxSalary`, afterTaxSalary, { shouldValidate: true });
        }
    });

    const totalAmount = (form.getValues("lineItems") || []).reduce(
      (sum, item) => sum + (Number(item.salary) || 0), 0
    );
    if(form.getValues('total') !== totalAmount) {
        form.setValue('total', totalAmount);
    }
  }, [watchedLineItems, processedTaxes, form]);

  const { totalSalary, totalTaxAmount, totalAfterTaxSalary } = useMemo(() => {
    const totals = (watchedLineItems || []).reduce(
      (acc, item) => {
        acc.totalSalary += Number(item.salary) || 0;
        acc.totalTaxAmount += Number(item.taxAmount) || 0;
        acc.totalAfterTaxSalary += Number(item.afterTaxSalary) || 0;
        return acc;
      },
      { totalSalary: 0, totalTaxAmount: 0, totalAfterTaxSalary: 0 }
    );
    return totals;
  }, [watchedLineItems]);

  type LinkedPaymentRow = { id: string; voucherNumber?: string; date: unknown; taxAmount: number; netAmount: number };
  const { linkedPayments, totalLinkedTax, totalLinkedNet } = useMemo(() => {
    if (isPaymentMode) return { linkedPayments: [] as LinkedPaymentRow[], totalLinkedTax: 0, totalLinkedNet: 0 };
    const salaryVoucherId = voucher?.id;
    if (!salaryVoucherId || !allVouchers?.length) return { linkedPayments: [] as LinkedPaymentRow[], totalLinkedTax: 0, totalLinkedNet: 0 };
    const paymentOutVouchers = allVouchers.filter((v: any) => v.type === "payment_out" || v.type === "direct_expense");
    const list: LinkedPaymentRow[] = [];
    for (const po of paymentOutVouchers) {
      const allocations = (po.allocations as Allocation[] | undefined) || [];
      for (const a of allocations) {
        if (a.voucherId !== salaryVoucherId) continue;
        const taxAmt = getTaxFromAllocation(a);
        const netAmt = getNetFromAllocation(a);
        if (taxAmt <= 0 && netAmt <= 0) continue;
        list.push({
          id: po.id,
          voucherNumber: po.voucherNumber,
          date: po.date,
          taxAmount: taxAmt,
          netAmount: netAmt,
        });
      }
    }
    const totalLinkedTax = list.reduce((s, p) => s + p.taxAmount, 0);
    const totalLinkedNet = list.reduce((s, p) => s + p.netAmount, 0);
    return { linkedPayments: list, totalLinkedTax, totalLinkedNet };
  }, [voucher?.id, allVouchers, isPaymentMode]);

  const totalLinked = linkBalanceKind === "tax" ? totalLinkedTax : totalLinkedNet;
  const totalForView = linkBalanceKind === "tax" ? totalTaxAmount : totalAfterTaxSalary;
  const linkedPaymentsForView = useMemo(() => linkedPayments.map((p) => ({ ...p, amount: linkBalanceKind === "tax" ? p.taxAmount : p.netAmount })).filter((p) => p.amount > 0), [linkedPayments, linkBalanceKind]);

  const paymentOutsWithRemaining = useMemo(() => {
    if (!allVouchers?.length || staffIdsFromSalary.length === 0) return [];
    const staffSet = new Set(staffIdsFromSalary);
    return allVouchers
      .filter((v: any) => (v.type === "payment_out" || v.type === "direct_expense") && getPaymentOutRemaining(v) > 0 && v.staffId && staffSet.has(v.staffId))
      .map((v: any) => ({
        id: v.id,
        voucherNumber: v.voucherNumber,
        date: v.date,
        amount: Number(v.amount ?? v.total ?? 0),
        remaining: getPaymentOutRemaining(v),
      }))
      .sort((a: { date: unknown }, b: { date: unknown }) => {
        const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
        const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
        return dB - dA;
      });
  }, [allVouchers, staffIdsFromSalary]);

  const paymentOutsOldestFirst = useMemo(() => {
    return [...paymentOutsWithRemaining].sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
  }, [paymentOutsWithRemaining]);

  /** Payment outs shown in Link Payment dialog: with remaining OR already linked (same staff only). */
  const paymentOutsForLinkDialog = useMemo(() => {
    const staffSet = new Set(staffIdsFromSalary);
    const withRemainingIds = new Set(paymentOutsWithRemaining.map((p: { id: string }) => p.id));
    const linkedOnly = linkedPayments
      .filter((p) => {
        const v = allVouchers?.find((v: any) => v.id === p.id);
        return v && v.staffId && staffSet.has(v.staffId);
      })
      .filter((p) => !withRemainingIds.has(p.id))
      .map((p) => ({
        id: p.id,
        voucherNumber: p.voucherNumber,
        date: p.date,
        amount: 0,
        remaining: 0,
      }));
    const combined = [...paymentOutsWithRemaining, ...linkedOnly];
    combined.sort((a: { date: unknown }, b: { date: unknown }) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dB - dA;
    });
    return combined;
  }, [paymentOutsWithRemaining, linkedPayments, staffIdsFromSalary, allVouchers]);

  const { isDirty: isFormDirty } = form.formState;
  const isFileDirty = (() => {
    const currentUrls = files.filter(f => typeof f === 'string') as string[];
    const newFiles    = files.filter(f => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u, i) => u !== init[i]);
  })();
  const isAnyDirty = isFormDirty || isFileDirty;
  const debitAccountId = form.watch("debitAccountId");
  const debitAccountBalance = useMemo(() => {
    if (!debitAccountId) return null;
    return processedExpenseAccounts.find(a => a.id === debitAccountId)?.balance;
  }, [debitAccountId, processedExpenseAccounts]);

  const transactionDates = useMemo(() => {
    if (!allVouchers?.length) return [];
    return allVouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [allVouchers]);
  

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean; approveAfterSave?: boolean } = {}) {
    e?.preventDefault?.();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    onVoucherAction?.('saved', options.saveAndNew);
    
    await processAndSave(form.getValues(), options.saveAndNew, options.approveAfterSave ? onApprove : undefined);
  }


async function processAndSave(data: SalaryFormValues, saveAndNew: boolean = false, onSuccess?: () => void) {
    const toastId = sonnerToast.loading("Saving salary voucher...");
    setIsLoading(true);

    if (!user || !companyId) {
        sonnerToast.error("Error", { id: toastId, description: "Login and company selection required." });
        setIsLoading(false);
        return;
    }

    const totalDebit = data.lineItems.filter(l => l.type === 'debit').reduce((sum, l) => sum + l.salary, 0);
    const totalCredit = data.lineItems.filter(l => l.type === 'credit').reduce((sum, l) => sum + l.afterTaxSalary, 0);
    const totalTaxCredit = data.lineItems.reduce((sum, l) => sum + (l.taxAmount || 0), 0);

    const debitAccountAmount = totalCredit + totalTaxCredit;

    if (!isPaymentMode && Math.abs(debitAccountAmount - totalSalary) > 0.001) {
        sonnerToast.error("Unbalanced Entry", { id: toastId, description: "Debit (Salary Expense) must equal Credit (Staff + Tax)." });
        setIsLoading(false);
        return;
    }

    try {
      // Permission check: create or edit
      const isEdit = !!voucher?.id || !!savedVoucherIdRef;
      const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
      
      if (isEdit) {
        // Check edit permission - determine ownership
        const fetchVoucher = async (cid: string, vid: string) => {
          const voucherDoc = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
          return voucherDoc.exists() ? voucherDoc.data() : null;
        };
        const isOwnRecord = await determineVoucherOwnership(voucher, savedVoucherIdRef, allVouchers, user.uid, companyId, fetchVoucher);
        assertCanEdit(canEditRecord, isOwnRecord);
        
        // Check backdate limit for edit - use ORIGINAL voucher date, not form date
        let originalVoucherDate = voucherDate;
        if (voucher?.date) {
          originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
        } else if (savedVoucherIdRef) {
          const existingVoucher = allVouchers.find(v => v.id === savedVoucherIdRef);
          if (existingVoucher?.date) {
            originalVoucherDate = existingVoucher.date?.toDate ? existingVoucher.date.toDate() : new Date(existingVoucher.date);
          } else if (companyId) {
            const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherIdRef));
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
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else {
        sonnerToast.error("Error", { id: toastId, description: "Failed to check permissions." });
      }
      setIsLoading(false);
      return;
    }

    try {
      const voucherType = isPaymentMode ? "payment_out" : "journal";
      const subType = isPaymentMode ? "pay_salary" : "add_salary";

      if (voucher?.voucherNumber !== data.voucherNumber) {
        const q = query(
          collection(firestore, `companies/${companyId}/vouchers`),
          where("voucherNumber", "==", data.voucherNumber),
          where("type", "==", voucherType),
          where("subType", "==", subType)
        );
        const existingVoucherSnap = await getDocs(q);
        if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== savedVoucherIdRef) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already used." });
          setIsLoading(false);
          return;
        }
      }
      
      const existingUrls = files.filter(f => typeof f === 'string') as string[];
      const newFiles = files.filter(f => f instanceof File) as File[];

      if (newFiles.length > 0) {
        const totalNewBytes = newFiles.reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
      }

      const newUrls = await Promise.all(
        newFiles.map(async (file) => {
           const docRef = ref(storage, `voucher-files/${companyId}/salary/${Date.now()}_${file.name}`);
           await uploadBytes(docRef, file);
           await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
           return getDownloadURL(docRef);
        })
      );
      
      const allFileUrls = [...existingUrls, ...newUrls];

      let submissionData: any = {
        voucherNumber: data.voucherNumber,
        date: data.date,
        narration: data.narration,
        total: data.total,
        type: voucherType,
        subType: subType,
        fileUrls: allFileUrls,
        unassignedFile: data.unassignedFile || null,
      };

      if (isPaymentMode) {
        submissionData.staffId = data.lineItems[0]?.staffId;
        submissionData.amount = data.lineItems[0]?.salary;
        submissionData.accountId = data.accountId;
      } else {
        let entries: any[] = [];
        data.lineItems.forEach(line => {
            entries.push({
                accountId: line.staffId,
                debit: 0,
                credit: line.afterTaxSalary,
                narration: line.narration || `Salary for ${processedStaff.find(s => s.id === line.staffId)?.name || ''}`
            });
            if (line.taxAccountId && line.taxAmount && line.taxAmount > 0) {
                entries.push({
                    accountId: line.taxAccountId,
                    debit: 0,
                    credit: line.taxAmount,
                    narration: `TDS for ${processedStaff.find(s => s.id === line.staffId)?.name || ''} (Staff ID: ${line.staffId})`
                });
            }
        });
        
        const totalDebitAmount = totalSalary;
        entries.push({
            accountId: data.debitAccountId, 
            debit: totalDebitAmount,
            credit: 0,
            narration: 'Salary expense for the period'
        });

        submissionData.entries = entries;
      }

      let originalVoucherIdToDelete: string | null = null;
      if (isEditingAndConverting && voucher.id) {
          originalVoucherIdToDelete = voucher.id;
      }
      
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        submissionData,
        originalVoucherIdToDelete ? null : savedVoucherIdRef
      );

      if (savedDoc && savedDoc.id) {
          if (isMounted.current) setSavedVoucherIdRef(savedDoc.id);
          if (originalVoucherIdToDelete) {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: 'journal',
                convertedToVoucherNumber: submissionData.voucherNumber,
            });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        sonnerToast.success("Voucher saved successfully!", { id: toastId });
        triggerSync();
        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number(submissionData.total ?? data.total) || 0;
          const vid = savedVoucherIdRef || voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { total: oldV?.total ?? oldV?.amount, narration: oldV?.narration, date: oldV?.date?.toDate?.() ?? oldV?.date, voucherNumber: oldV?.voucherNumber, accountId: oldV?.accountId },
              { total: submissionData.total, narration: submissionData.narration, date: submissionData.date, voucherNumber: submissionData.voucherNumber, accountId: submissionData.accountId },
              [
                { key: "total", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
                { key: "accountId", label: "Account" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: voucherType,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
              changes: changes.length > 0 ? changes : undefined,
            });
          } else if (isAmountOverOneLakh(amount)) {
            await sendTransactionAlert(companyId, company, {
              kind: "large_amount",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: voucherType,
              amount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        }
        if (saveAndNew && isMounted.current) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavedVoucherIdRef(null);
            fetchVoucherNumber();
        }

        onSuccess?.();
    
    } catch (error) {
        if (error instanceof PermissionDeniedError) {
          sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
        } else if (isVoucherLimitError(error)) {
          sonnerToast.error("Voucher limit reached", { id: toastId, description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
        } else {
          console.error("Error saving salary voucher:", error);
          sonnerToast.error("Error saving voucher.", { id: toastId });
        }
    } finally {
        if (isMounted.current) setIsLoading(false);
    }
}

  const handleDelete = async () => {
    if (!savedVoucherIdRef || !companyId) return;
    
    try {
      // Permission check: delete
      assertCan(can, "delete_records");
      
      // Get voucher date for backdate limit check
      const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherIdRef));
      const voucherData = voucherDoc.exists() ? voucherDoc.data() : null;
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
        await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherIdRef), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || '',
        });
        toast({ title: "Voucher Moved to Bin" });
        onVoucherAction?.('cancelled');
        triggerSync();
    } catch (error) {
        console.error("Error deleting voucher:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to delete voucher." });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
  
    for (const file of newFiles) {
      try {
        // १. पहिले कम्प्रेस गर्ने (यसले ठुलो फाइललाई सानो बनाउँछ)
        const compressedFile = await compressFile(file);
  
        // २. कम्प्रेस गरिसकेपछि मात्र साइज चेक गर्ने
        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "File Still Too Large",
            description: `कम्प्रेस गर्दा पनि फाइल ${MAX_FILE_SIZE_MB}MB भन्दा ठुलो भयो।`,
          });
          continue;
        }
  
        const maxFiles = fileAttachmentLimits.maxFileCount || 0;
        if (maxFiles === 0 || !allowAttachments) {
          toast({
            variant: "destructive",
            title: "File Attachments Disabled",
            description: "File attachments are not allowed for your role.",
          });
          return;
        }

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
        console.error("Compression error:", error);
      }
    }
  };

  const handleCreateNew = (type: 'party' | 'account' | 'staff' | 'expense' | 'tax', newName?: string) => {
    if (type === 'party') setIsCreatePartyOpen(true);
    if (type === 'account') setIsCreateAccountOpen(true);
    if (type === 'staff') setTimeout(() => setIsCreateStaffOpen(true), 0);
    if (type === 'expense') setIsCreateExpenseOpen(true);
    if (type === 'tax') setIsCreateTaxOpen(true);

    if (newName) {
       setTimeout(() => {
        const eventName = `prefill-create-${type}-name`;
        document.dispatchEvent(new CustomEvent(eventName, { detail: newName }));
      }, 100);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={(e) => handleFormSubmit(e)} className="h-full flex flex-col min-w-0 w-full max-w-full">
          <ScrollArea className={cn("flex-1 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className={cn(
              "space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
              isMobile ? "" : "px-[2px]"
            )}>
              {/* Voucher No. and Date */}
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Voucher No. + Date(s) in one row, equal-width columns like other forms */}
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
                                        <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find(p => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]}>
                                          <SelectTrigger className="h-9 w-full min-w-0 max-w-full text-xs px-1 [&>span]:truncate">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                    <FormItem className="min-w-0 w-full overflow-hidden">
                                      <FormLabel className="text-xs truncate">Voucher No.</FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder="e.g. ADSAL-001"
                                          {...voucherField}
                                          className="h-9 text-xs px-2 min-w-0 max-w-full w-full"
                                          disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))}
                                        />
                                      </FormControl>
                                    </FormItem>
                                    {hasDateBS && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                                        <div className="min-w-0 w-full overflow-hidden">
                                          <BsDatePicker
                                            valueAD={dateField.value}
                                            onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }}
                                            isRange={false}
                                            transactionDates={transactionDates}
                                            className="h-9 text-xs w-full"
                                          />
                                        </div>
                                      </FormItem>
                                    )}
                                    {hasDateAD && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date</FormLabel>
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                          <PopoverTrigger asChild>
                                            <FormControl>
                                              <Button variant="outline" disabled={!isFormEditing} className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")}>
                                                {dateField.value instanceof Date && !isNaN(dateField.value.getTime()) ? formatDate(dateField.value) : "Pick date"}
                                                <CalendarIcon className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                                              </Button>
                                            </FormControl>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0 z-[102]" align="start">
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
                </>
              ) : (
                <>
                  {/* PC View: Voucher No. and Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:justify-end md:items-end">
                    {/* Voucher No. */}
                    <FormField 
                      control={form.control} 
                      name="voucherNumber" 
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Voucher No.</FormLabel>
                          <div className="flex gap-2 h-10">
                            {isPrefixSelectionEnabled && voucherPrefixes.length > 0 && (
                              <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find(p => field.value?.startsWith(normalizePrefix(p)) || field.value?.startsWith(p)) || voucherPrefixes[0]}>
                                <SelectTrigger className="w-32 h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                            <FormControl>
                              <Input 
                                placeholder="e.g. ADSAL-001" 
                                {...field} 
                                className="h-10" 
                                disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} 
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Date */}
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date</FormLabel>
                          <div className={cn("flex gap-2 h-10", dateSystem === 'Both' && "gap-2")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <BsDatePicker 
                                valueAD={field.value} 
                                onChangeAD={(d) => { 
                                  if (d) d.setHours(12, 0, 0, 0);
                                  field.onChange(d as Date); 
                                  setIsCalendarOpen(false); 
                                }} 
                                isRange={false} 
                                transactionDates={transactionDates} 
                              />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button 
                                      disabled={!isFormEditing} 
                                      variant={"outline"} 
                                      className={cn("h-10 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                      {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                  <Calendar 
                                    mode="single" 
                                    selected={field.value} 
                                    onSelect={(date) => {
                                      if (date) {
                                        date.setHours(12, 0, 0, 0);
                                      }
                                      field.onChange(date);
                                      setIsCalendarOpen(false);
                                    }} 
                                    initialFocus 
                                    modifiers={{ hasTransactions: transactionDates }} 
                                    modifiersClassNames={{ hasTransactions: "has-transactions" }} 
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              {/* Debit Account */}
              <FormField
                control={form.control}
                name="debitAccountId"
                render={({ field }: any) => (
                  <FormItem className={cn(isMobile && "flex-shrink-0")} style={isMobile ? { width: '80mm', maxWidth: '80mm' } : undefined}>
                    <div className={cn("flex justify-between items-baseline", isMobile && "flex-col gap-1")}>
                      <FormLabel className={cn(isMobile && "text-xs")}>Debit Account</FormLabel>
                      {debitAccountBalance !== null && debitAccountBalance !== undefined && (
                        <FormLabel className={cn(
                          isMobile ? "text-[10px] font-semibold" : "text-xs font-semibold",
                          debitAccountBalance <= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {isMobile 
                            ? `Bal: ${formatCurrency(debitAccountBalance, { noSuffix: true, noAnimation: true })} ${debitAccountBalance <= 0 ? 'Dr' : 'Cr'}`
                            : `Bal: ${formatCurrency(debitAccountBalance, { showDrCr: true, noAnimation: true })}`
                          }
                        </FormLabel>
                      )}
                    </div>
                    <div className={cn(isMobile && "[&_button]:h-9 [&_button]:text-xs")}>
                      <Combobox
                        options={processedExpenseAccounts
                          .filter((a) => a.id !== "sales_account" && a.id !== "purchase_account")
                          .map((a) => ({
                            value: a.id,
                            label: a.name,
                          }))}
                        value={field.value}
                        onChange={(val, newName) => {
                            if (val === "add-new") {
                                handleCreateNew("expense", newName);
                            } else {
                                field.onChange(val);
                            }
                        }}
                        placeholder="Select debit account"
                        addNewLabel="+ Add New Expense Account"
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
                
                <div className="space-y-2 px-[2px]">
                  <div className="flex justify-between items-center">
                    <FormLabel className={cn("font-semibold", isMobile ? "text-sm" : "text-base")}>Salary Details</FormLabel>
                    {!isPaymentMode && <Button type="button" variant="outline" size="sm" onClick={handleSelectAllStaff} className={cn(isMobile && "text-xs h-8")}><UserPlus className={cn("h-4 w-4", isMobile && "mr-1")}/> {isMobile ? "Add All" : "Add All Staff"}</Button>}
                  </div>
                  {isMobile ? (
                    <>
                      {/* Mobile: Broken into rows with 2 columns */}
                      <div className="border rounded-lg overflow-hidden px-[2px]">
                        {fields.map((field, index) => {
                          const staffId = form.watch(`lineItems.${index}.staffId`);
                          const balance = processedStaff.find(s => s.id === staffId)?.balance;
                          const taxAccountId = form.watch(`lineItems.${index}.taxAccountId`);
                          const taxBalance = processedTaxes.find(t => t.id === taxAccountId)?.balance;
                          
                          return (
                            <div key={field.id} className="border-t p-[2px] space-y-2">
                              {/* Row 1: Staff Member (full width) */}
                              <div className="w-full">
                                <FormField 
                                  control={form.control} 
                                  name={`lineItems.${index}.staffId`} 
                                  render={({ field }: any) => (
                                    <FormItem>
                                      <div className="[&_button]:h-9 [&_button]:text-xs">
                                        <Combobox
                                          options={processedStaff.map((s) => ({ value: s.id, label: s.name }))}
                                          value={field.value}
                                          onChange={(value, newName) => {
                                            if (value === "add-new") {
                                              openCreateStaffDialog(index, newName);
                                            } else {
                                              field.onChange(value);
                                              const selectedStaff = processedStaff.find(s => s.id === value);
                                              if (selectedStaff) {
                                                form.setValue(`lineItems.${index}.salary`, Number(selectedStaff.salary) || 0);
                                                form.setValue(`lineItems.${index}.narration`, `Salary for ${selectedStaff.name}`);
                                              }
                                            }
                                          }}
                                          placeholder="Select Staff"
                                          addNewLabel="+ Add New Staff"
                                        />
                                      </div>
                                      {balance !== undefined && (
                                        <div className={cn("text-[10px] font-semibold mt-1", balance < 0 ? "text-red-600" : "text-green-600")}>
                                          Bal: {formatCurrency(balance, { noSuffix: true, noAnimation: true })} {balance < 0 ? 'Dr' : 'Cr'}
                                        </div>
                                      )}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              
                              {/* Row 2: Salary Amount and Tax (2 columns) */}
                              <div className="grid grid-cols-2 gap-[2px]">
                                <FormField 
                                  control={form.control} 
                                  name={`lineItems.${index}.salary`} 
                                  render={({ field }: any) => (
                                    <FormItem>
                                      <FormLabel className="text-xs">Salary Amount</FormLabel>
                                      <FormControl>
                                        <Input 
                                          type="number" 
                                          value={field.value || ''} 
                                          onChange={(e) => {
                                            const value = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
                                            field.onChange(value);
                                          }}
                                          onBlur={field.onBlur}
                                          className="h-9 text-xs" 
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField 
                                  control={form.control} 
                                  name={`lineItems.${index}.taxAccountId`} 
                                  render={({ field }: any) => (
                                    <FormItem>
                                      <FormLabel className="text-xs">Tax</FormLabel>
                                      <Select 
                                        onValueChange={(value) => {
                                          if (value === "add-new") { 
                                            setActiveLineIndex(index); 
                                            setIsCreateTaxOpen(true); 
                                          } else { 
                                            field.onChange(value === 'none' ? '' : value); 
                                          }
                                        }} 
                                        value={field.value}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="Select Tax" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="none">None</SelectItem>
                                          {processedTaxes.map((tax) => (
                                            <SelectItem key={tax.id} value={tax.id}>
                                              {tax.name} @ {tax.rate}%
                                            </SelectItem>
                                          ))}
                                          <SelectItem value="add-new" className="text-primary">+ Add New Tax</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {taxBalance !== undefined && (
                                        <div className={cn("text-[10px] font-semibold mt-1", taxBalance < 0 ? "text-red-600" : "text-green-600")}>
                                          Bal: {formatCurrency(taxBalance, { noSuffix: true, noAnimation: true })} {taxBalance < 0 ? 'Dr' : 'Cr'}
                                        </div>
                                      )}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              
                              {/* Row 3: Taxable Amount, Tax Amount, After Tax Salary (3 columns) */}
                              <div className="grid grid-cols-3 gap-[2px]">
                                <div>
                                  <FormLabel className="text-xs">Taxable Amount</FormLabel>
                                  <Input 
                                    value={Number(form.watch(`lineItems.${index}.salary`) || 0).toFixed(2)} 
                                    readOnly 
                                    className="h-9 text-xs bg-muted text-right"
                                  />
                                </div>
                                <div>
                                  <FormLabel className="text-xs">Tax Amount</FormLabel>
                                  <Input 
                                    value={Number(form.watch(`lineItems.${index}.taxAmount`) || 0).toFixed(2)} 
                                    readOnly 
                                    className="h-9 text-xs bg-muted text-right"
                                  />
                                </div>
                                <div>
                                  <FormLabel className="text-xs">After Tax Salary</FormLabel>
                                  <Input 
                                    value={Number(form.getValues(`lineItems.${index}.afterTaxSalary`) || 0).toFixed(2)} 
                                    readOnly 
                                    className="h-9 text-xs bg-muted text-right"
                                  />
                                </div>
                              </div>
                              
                              {/* Row 4: Narration (full width) */}
                              <div className="w-full">
                                <FormField 
                                  control={form.control} 
                                  name={`lineItems.${index}.narration`} 
                                  render={({ field }: any) => (
                                    <FormItem>
                                      <FormLabel className="text-xs">Narration</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="e.g. Salary for Baisakh" 
                                          {...field}
                                          className="h-9 text-xs"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              
                              {/* Remove Button */}
                              {!isPaymentMode && fields.length > 1 && (
                                <div className="flex justify-end">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => remove(index)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive"/>
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* Add Row Button */}
                        {!isPaymentMode && (
                          <div className="border-t px-[2px] py-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm" 
                              onClick={() => append({staffId: "", salary: 0, narration: "", type: "credit", taxAccountId: "", taxAmount: 0, afterTaxSalary: 0, rate: 0 })}
                              className="text-xs h-8"
                            >
                              <PlusCircle className="mr-2 h-4 w-4"/> Add Row
                            </Button>
                          </div>
                        )}
                        {/* Totals Row */}
                        <div className="border-t px-[2px] py-2 space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span>Total Salary:</span>
                            <span>{totalSalary.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold">
                            <span>Total Tax:</span>
                            <span>{totalTaxAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold">
                            <span>Total After Tax:</span>
                            <span>{totalAfterTaxSalary.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Desktop: Original Table */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/4">Staff Member</TableHead>
                            <TableHead>Salary Amount</TableHead>
                            <TableHead>Tax</TableHead>
                            <TableHead>Taxable Amount</TableHead>
                            <TableHead>Tax Amount</TableHead>
                            <TableHead>After Tax Salary</TableHead>
                            <TableHead>Narration</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field, index) => {
                            const staffId = form.watch(`lineItems.${index}.staffId`);
                            const balance = processedStaff.find(s => s.id === staffId)?.balance;
                            const taxAccountId = form.watch(`lineItems.${index}.taxAccountId`);
                            const taxBalance = processedTaxes.find(t => t.id === taxAccountId)?.balance;
                            
                            return (
                              <TableRow key={field.id}>
                                <TableCell>
                                  <FormField control={form.control} name={`lineItems.${index}.staffId`} render={({ field }: any) => (<FormItem>
                                        <Combobox
                                          options={processedStaff.map((s) => ({ value: s.id, label: s.name }))}
                                          value={field.value}
                                          onChange={(value, newName) => {
                                            if (value === "add-new") {
                                              openCreateStaffDialog(index, newName);
                                            } else {
                                              field.onChange(value);
                                              const selectedStaff = processedStaff.find(s => s.id === value);
                                              if (selectedStaff) {
                                                  form.setValue(`lineItems.${index}.salary`, Number(selectedStaff.salary) || 0);
                                                  form.setValue(`lineItems.${index}.narration`, `Salary for ${selectedStaff.name}`);
                                              }
                                            }
                                          }}
                                          placeholder="Select Staff"
                                          addNewLabel="+ Add New Staff"
                                        />
                                         {balance !== undefined && (
                                            <div className={cn("text-xs font-semibold mt-1", balance < 0 ? "text-red-600" : "text-green-600")}>
                                                Bal: {formatCurrency(balance, { showDrCr: true, noAnimation: true })}
                                            </div>
                                        )}
                                        <FormMessage /></FormItem>)}/>
                                </TableCell>
                                <TableCell><FormField control={form.control} name={`lineItems.${index}.salary`} render={({ field }: any) => (<FormItem><FormControl><Input type="number" value={field.value || ''} onChange={(e) => { const value = e.target.value === '' ? '' : parseFloat(e.target.value) || 0; field.onChange(value); }} onBlur={field.onBlur} /></FormControl><FormMessage /></FormItem>)}/></TableCell>
                                 <TableCell>
                                    <FormField control={form.control} name={`lineItems.${index}.taxAccountId`} render={({ field }: any) => (
                                        <FormItem>
                                            <Select onValueChange={(value) => {
                                                if (value === "add-new") { setActiveLineIndex(index); setIsCreateTaxOpen(true); }
                                                else { field.onChange(value === 'none' ? '' : value); }
                                            }} value={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Select Tax" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value="none">None</SelectItem>
                                                    {processedTaxes.map((tax) => (<SelectItem key={tax.id} value={tax.id}>{tax.name} @ {tax.rate}%</SelectItem>))}
                                                    <SelectItem value="add-new" className="text-primary">+ Add New Tax</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {taxBalance !== undefined && (
                                                <div className={cn("text-xs font-semibold mt-1", taxBalance < 0 ? "text-red-600" : "text-green-600")}>
                                                    Bal: {formatCurrency(taxBalance, { showDrCr: true, noAnimation: true })}
                                                </div>
                                            )}
                                        </FormItem>
                                    )}/>
                                </TableCell>
                                <TableCell><Input value={Number(form.watch(`lineItems.${index}.salary`) || 0).toFixed(2)} readOnly className="bg-muted text-right"/></TableCell>
                                <TableCell><Input value={Number(form.watch(`lineItems.${index}.taxAmount`) || 0).toFixed(2)} readOnly className="bg-muted text-right"/></TableCell>
                                <TableCell><Input value={Number(form.getValues(`lineItems.${index}.afterTaxSalary`) || 0).toFixed(2)} readOnly className="bg-muted text-right"/></TableCell>
                                <TableCell><FormField control={form.control} name={`lineItems.${index}.narration`} render={({ field }: any) => (<FormItem><FormControl><Input placeholder="e.g. Salary for Baisakh" {...field}/></FormControl><FormMessage /></FormItem>)}/></TableCell>
                                <TableCell>{!isPaymentMode && (<Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell className="font-bold text-right">{totalSalary.toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="font-bold text-right">{totalSalary.toFixed(2)}</TableCell>
                            <TableCell className="font-bold text-right">{totalTaxAmount.toFixed(2)}</TableCell>
                            <TableCell className="font-bold text-right">{totalAfterTaxSalary.toFixed(2)}</TableCell>
                            <TableCell colSpan={2}></TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                      {!isPaymentMode && (
                        <Button type="button" variant="outline" size="sm" onClick={() => append({staffId: "", salary: 0, narration: "", type: "credit", taxAccountId: "", taxAmount: 0, afterTaxSalary: 0, rate: 0 })}>
                          <PlusCircle className="mr-2 h-4 w-4"/> Add Row
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="narration"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Overall Narration</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g. Salary for the month of Baisakh" className="min-h-[80px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isPaymentMode && (
                    <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                      <div className="flex items-center gap-2 font-medium">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span>Linked Payments</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Only payment outs for the same staff (in this voucher) can be linked.</p>
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="linkBalanceKind"
                            checked={linkBalanceKind === "tax"}
                            onChange={() => setLinkBalanceKind("tax")}
                            className="rounded-full"
                          />
                          <span>Tax balance</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="linkBalanceKind"
                            checked={linkBalanceKind === "net"}
                            onChange={() => setLinkBalanceKind("net")}
                            className="rounded-full"
                          />
                          <span>Net balance</span>
                        </label>
                      </div>
                      {linkedPaymentsForView.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {linkBalanceKind === "tax" ? "No tax-linked payment details." : "No payment outs linked to this voucher (net)."}
                        </p>
                      ) : (
                        <div className="space-y-1.5 text-sm">
                          {linkedPaymentsForView.map((p, idx) => (
                            <div
                              key={`${p.id}-${idx}`}
                              role="button"
                              tabIndex={0}
                              className="flex justify-between items-center rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                              onClick={() => {
                                const initial = linkedPayments.reduce(
                                  (acc, x) => ({ ...acc, [x.id]: linkBalanceKind === "tax" ? x.taxAmount : x.netAmount }),
                                  {} as Record<string, number>
                                );
                                setLinkPaymentAmounts(initial);
                                setIsLinkPaymentDialogOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  const initial = linkedPayments.reduce(
                                    (acc, x) => ({ ...acc, [x.id]: linkBalanceKind === "tax" ? x.taxAmount : x.netAmount }),
                                    {} as Record<string, number>
                                  );
                                  setLinkPaymentAmounts(initial);
                                  setIsLinkPaymentDialogOpen(true);
                                }
                              }}
                            >
                              <span className="truncate">{p.voucherNumber ?? "—"}</span>
                              <span>{formatCurrency(p.amount, { noSuffix: true, noAnimation: true })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="pt-2 border-t space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{linkBalanceKind === "tax" ? "Total (Tax)" : "Total (Net)"}</span>
                          <span>{formatCurrency(totalForView, { noSuffix: true, noAnimation: true })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Linked</span>
                          <span>{formatCurrency(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Net Balance</span>
                          <span>{formatCurrency(totalForView - totalLinked, { noSuffix: true, noAnimation: true })}</span>
                        </div>
                        {voucher?.id && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-fit"
                              disabled={(totalForView - totalLinked) <= 0}
                              onClick={() => {
                                setLinkPaymentAmounts({});
                                setIsLinkPaymentDialogOpen(true);
                              }}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              Link Payment
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-fit"
                              disabled={autoLinkSaving || (totalForView - totalLinked) <= 0 || paymentOutsOldestFirst.length === 0}
                              onClick={handleAutoLink}
                            >
                              {autoLinkSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                              Auto Link
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                           <PlusCircle className="h-6 w-6" />
                          <span className="text-xs mt-1">Add File</span>
                          <input 
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
                      )}
                    </div>
                  </RestrictedFileUploader>
                </FormItem>
            </div>
          </ScrollArea>

          {isFormEditing && (
            <div className={cn(
              "border-t px-[2px] min-w-0 max-w-full overflow-x-hidden",
              isMobile ? "mt-[3px] pt-[3px] pb-[3px] w-full" : "pt-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-center"
            )}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full", VOUCHER_BUTTONS_CLASS)}>
                {/* Row 0: Delete (left) | History (middle) | Save & Print (right) */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full" disabled={!voucher || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                  History
                </Button>
                <Button type="button" className={cn("w-full", BTN_PRINT_CLASS)} disabled>
                  Save & Print
                </Button>
                {/* Row 1: Cancel (left) | Approve (middle) | Save (right) */}
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                <Button type="button" onClick={async (e) => { e.preventDefault(); if (isAnyDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isAnyDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                  {isApproving ? "..." : isAnyDirty ? "Save & Approve" : "Approve"}
                </Button>
                <Button type="submit" disabled={isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                  {isLoading ? "..." : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" className="w-full md:w-auto shrink-0 rounded-full" disabled={!voucher || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                <div className={cn("flex gap-2 justify-end flex-wrap md:gap-4", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={!!voucher || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Save & Print
                  </Button>
                  <Button type="submit" disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isAnyDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isAnyDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    {isAnyDirty ? "Save & Approve" : "Approve"}
                  </Button>
                </div>
              </>
            )}
          </div>
          )}
        </form>
      </Form>
      <Dialog open={isLinkPaymentDialogOpen} onOpenChange={setIsLinkPaymentDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" hideCloseButton>
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Link Payment
              </DialogTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsLinkPaymentDialogOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            {/* Top card: same layout as Payment Out Link to Txns */}
            <div className="rounded-md border flex-shrink-0 p-4 w-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Linking to</span>
                  <span className="text-sm font-medium">{voucher?.voucherNumber ?? "—"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">{linkBalanceKind === "tax" ? "Total (Tax)" : "Total (Net)"}</span>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(totalForView, { noSuffix: true, noAnimation: true })}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Total linked</span>
                  <span className="text-sm tabular-nums">{formatCurrency(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Balance</span>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(Math.max(0, totalForView - totalLinked), { noSuffix: true, noAnimation: true })}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                size="sm"
                disabled={(totalForView - totalLinked) <= 0 || paymentOutsOldestFirst.length === 0}
                onClick={() => {
                  const suggested: Record<string, number> = {};
                  linkedPayments.forEach((p) => {
                    suggested[p.id] = linkBalanceKind === "tax" ? p.taxAmount : p.netAmount;
                  });
                  let remainingToAllocate = totalForView - totalLinked;
                  for (const po of paymentOutsOldestFirst) {
                    if (remainingToAllocate <= 0) break;
                    const allocate = Math.min(po.remaining, remainingToAllocate);
                    if (allocate > 0) {
                      suggested[po.id] = (suggested[po.id] ?? 0) + allocate;
                      remainingToAllocate -= allocate;
                    }
                  }
                  setLinkPaymentAmounts(suggested);
                  sonnerToast.success("Auto link amounts filled. Review and DONE.");
                }}
              >
                <Link2 className="h-4 w-4 mr-2" />
                AUTO LINK
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLinkPaymentAmounts({})}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                RESET
              </Button>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5" />
                Allocate balance to payment outs (same staff, oldest first).
              </span>
            </div>
            <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
              <p className="text-sm font-medium mb-2">Payment outs (same staff)</p>
              <ScrollArea className="h-full w-full">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className={cn(dateSystem === "Both" ? "w-[180px]" : "w-[100px]")}>Date</TableHead>
                      <TableHead className="w-[90px]">Type</TableHead>
                      <TableHead className="min-w-0">Ref/Inv No.</TableHead>
                      <TableHead className="text-right w-[110px]">Total</TableHead>
                      <TableHead className="text-right w-[120px]">Linked Amount</TableHead>
                      <TableHead className="text-right w-[110px]">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentOutsForLinkDialog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {staffIdsFromSalary.length === 0 ? "Add staff in Salary Details first." : "No payment outs for this staff to link or edit."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paymentOutsForLinkDialog.map((row: { id: string; voucherNumber?: string; date?: unknown; amount?: number; remaining?: number }) => {
                        const d = row.date
                          ? typeof (row.date as any)?.toDate === "function"
                            ? (row.date as any).toDate()
                            : new Date(row.date as string | number)
                          : null;
                        const dateStr = d && !isNaN(d.getTime()) ? (dateSystem === "AD" ? formatDate(d) : dateSystem === "BS" ? formatDateBS(d) : `${formatDateBS(d)} (${formatDate(d)})`) : "—";
                        const linked = linkPaymentAmounts[row.id] ?? 0;
                        const remaining = row.remaining ?? 0;
                        const balanceAfterLink = Math.max(0, remaining - linked);
                        return (
                          <TableRow key={row.id}>
                            <TableCell className={cn("align-middle", dateSystem === "Both" ? "w-[180px]" : "w-[100px]")}>{dateStr}</TableCell>
                            <TableCell className="align-middle w-[90px]">payment out</TableCell>
                            <TableCell className="align-middle min-w-0 truncate">{row.voucherNumber ?? "—"}</TableCell>
                            <TableCell className="text-right align-middle w-[110px] tabular-nums">
                              {formatCurrency(row.amount ?? 0, { noSuffix: true, noAnimation: true })}
                            </TableCell>
                            <TableCell className="text-right align-middle w-[120px] p-2">
                              <div className="flex items-center gap-1 justify-end">
                                <Input
                                  type="number"
                                  min={0}
                                  max={Math.max(remaining, linked)}
                                  step={0.01}
                                  placeholder="0"
                                  value={linked > 0 ? linked : ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                                    setLinkPaymentAmounts((prev) => ({ ...prev, [row.id]: v }));
                                  }}
                                  className="h-8 w-full min-w-0 text-right tabular-nums"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setLinkPaymentAmounts((prev) => ({ ...prev, [row.id]: 0 }))}
                                  title="Reset this row"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right align-middle w-[110px] font-medium tabular-nums">
                              {formatCurrency(balanceAfterLink, { noSuffix: true, noAnimation: true })}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
            <div className="flex flex-shrink-0 items-center justify-end gap-4 pt-2 border-t">
              <Button
                type="button"
                disabled={
                  linkPaymentSaving ||
                  paymentOutsForLinkDialog.length === 0 ||
                  (Object.values(linkPaymentAmounts).every((a) => !a || a <= 0) &&
                    !linkedPayments.some((p) => Number(linkPaymentAmounts[p.id]) === 0))
                }
                onClick={handleLinkPayment}
              >
                {linkPaymentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                DONE
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CreateStaffDialog
        onStaffCreated={handleStaffCreated}
        isOpen={isCreateStaffOpen}
        onOpenChange={(open) => {
          setIsCreateStaffOpen(open);
          if (!open) setCreateStaffDefaultName("");
        }}
        groups={[]}
        defaultName={createStaffDefaultName}
      />
      <CreateTaxDialog onTaxCreated={handleTaxCreated} isOpen={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen} />
      <CreateExpenseAccountDialog onExpenseAccountCreated={handleExpenseAccountCreated} isOpen={isCreateExpenseOpen} onOpenChange={setIsCreateExpenseOpen} />
    </>
  );
}
