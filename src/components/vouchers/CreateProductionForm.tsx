"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useRef, useCallback, useMemo, useId } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../ui/alert-dialog";
import { PlusCircle, Trash2, Loader2, CheckCircle, History, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { saveVoucher, isVoucherLimitError, patchVoucherFields } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { isLocalOnlyMode } from "@/lib/localMode";
import { appendLocalOnlyVoucherFilesToUrls } from "@/lib/voucherLocalAttachmentUpload";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { firestore } from "@/lib/firebase";
import { collection, query, where, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Combobox } from "../ui/combobox";
import { CreateItemDialog } from "@/components/items/CreateItemDialog";
import { CreateFinishedGoodDialog } from "@/components/items/CreateFinishedGoodDialog";
import type { Item } from "@/components/items/types";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { VoucherPdfAsImageToggle } from "@/components/vouchers/VoucherPdfAsImageToggle";
import {
  convertPdfAttachmentsToJpegIfEnabled,
  shouldSuggestPdfAsImage,
} from "@/lib/voucherAttachmentPdfAsImage";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { Upload } from "lucide-react";
import { compressVoucherAttachment } from "@/lib/compression";
import { attachmentMaxBytes, attachmentStillTooLargeToastFields } from "@/lib/attachmentCompressionUi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS, VOUCHER_NARRATION_TEXTAREA_CLASS } from "@/components/vouchers/voucherButtonStyles";

const rawMaterialSchema = z.object({
  itemId: z.string().min(1, "Item is required."),
  quantity: z.number().min(0.0001, "Quantity must be positive."),
  unit: z.string().optional(),
  rate: z.number().min(0, "Rate must be positive."),
  amount: z.number(),
  hsCode: z.string().optional(),
});

const finishedGoodSchema = z.object({
  itemId: z.string().min(1, "Item is required."),
  quantity: z.number().min(0.0001, "Quantity must be positive."),
  unit: z.string().optional(),
  rate: z.number().min(0, "Rate must be positive."),
  amount: z.number(),
  hsCode: z.string().optional(),
});

const formSchema = z.object({
  date: z.date({ message: "A date is required." }),
  productionNumber: z.string().min(1, "Production number is required."),
  rawMaterials: z.array(rawMaterialSchema).min(1, "Please add at least one raw material."),
  finishedGoods: z.array(finishedGoodSchema).min(1, "Please add at least one finished good."),
  narration: z.string().optional(),
  totalCost: z.number(),
  totalOutput: z.number(),
  unassignedFile: z.any().optional(),
});

export type ProductionFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>) => {
  return (prefixes?.production && prefixes.production[0]) || "PROD-";
};

function getInitialFormValues(voucher?: any): ProductionFormValues {
  if (!voucher) {
    return {
      date: startOfDay(new Date()),
      productionNumber: "",
      rawMaterials: [{ itemId: "", quantity: 1, unit: "", rate: 0, amount: 0, hsCode: "" }],
      finishedGoods: [{ itemId: "", quantity: 1, unit: "", rate: 0, amount: 0, hsCode: "" }],
      narration: "",
      totalCost: 0,
      totalOutput: 0,
      unassignedFile: null,
    };
  }

  return {
    ...voucher,
    date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
    rawMaterials: voucher.rawMaterials?.map((rm: any) => ({ ...rm, hsCode: rm.hsCode || "" })) || [{ itemId: "", quantity: 1, unit: "", rate: 0, amount: 0, hsCode: "" }],
    finishedGoods: [(voucher.finishedGoods?.map((fg: any) => ({ ...fg, hsCode: fg.hsCode || "" })) || [{ itemId: "", quantity: 1, unit: "", rate: 0, amount: 0, hsCode: "" }])[0]],
    totalCost: voucher.totalCost || 0,
    totalOutput: voucher.totalOutput || 0,
    unassignedFile: voucher.unassignedFile || null,
  };
}

const ROW_HEADERS = (
  <>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Item</span>
    <span className="col-span-1 text-xs font-medium text-muted-foreground">Qty</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Unit</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Rate</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Total</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">HS Code</span>
    <span className="col-span-1" />
  </>
);

const FG_ROW_HEADERS = (
  <>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Finished Item</span>
    <span className="col-span-1 text-xs font-medium text-muted-foreground">Qty</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Unit</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Rate</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">Total</span>
    <span className="col-span-2 text-xs font-medium text-muted-foreground">HS Code</span>
    <span className="col-span-1" />
  </>
);

export function CreateProductionForm({
  voucher,
  onVoucherAction,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
}: {
  voucher?: any;
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate } = useDate();
  const { can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const { processedItems } = useVouchers();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [pendingItemIndex, setPendingItemIndex] = useState<{ type: 'raw' | 'finished', index: number } | null>(null);
  const [prefillFinishedGoodName, setPrefillFinishedGoodName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachFileInputId = useId();
  const [files, setFiles] = useState<(File | string)[]>([]);
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

  const isMobile = useIsMobile();
  const canEditRates = can('edit_item_rates_in_vouchers');
  const canEditHSCode = can('edit_item_rates_in_vouchers'); // Using same permission for now, can be separate
  const isRateEditingAllowed = (company?.allowRateEditing?.production ?? true) && canEditRates;
  const isHSCodeEditingAllowed = (company?.allowRateEditing?.production ?? true) && canEditHSCode;

  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && voucher.type !== 'production';

  const form = useForm<ProductionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getInitialFormValues(voucher),
  });

const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f: any) => typeof f === 'string') as string[];
    const newFiles    = files.filter((f: any) => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u: any, i: number) => u !== init[i]);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty;
  const approveAfterSaveRef = useRef(false);

  const { fields: rawMaterialFields, append: appendRawMaterial, remove: removeRawMaterial } = useFieldArray({
    control: form.control,
    name: "rawMaterials",
  });

  const { fields: finishedGoodFields, append: appendFinishedGood, remove: removeFinishedGood } = useFieldArray({
    control: form.control,
    name: "finishedGoods",
  });

  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.production ?? true;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.production ?? false;
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.production?.length ? company.voucherPrefixes.production : [getVoucherPrefix(company?.voucherPrefixes as Record<string, string[]>)], [company]);

  useEffect(() => {
    if (!companyId) return;
    const itemsQuery = query(collection(firestore, `companies/${companyId}/items`));
    const unsub = onSnapshot(itemsQuery, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Item)));
    });
    return () => unsub();
  }, [companyId]);

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefix = selectedPrefix ?? voucherPrefixes[0];
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "production"));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().productionNumber as string);
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if (numStr) {
          const usedPrefix = voucherPrefixes.find(p => numStr.startsWith(normalizePrefix(p)) || numStr.startsWith(p));
          const num = usedPrefix ? parseVoucherNumberPart(numStr, usedPrefix) : parseInt(numStr.replace(/^\D+/, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const nextVoucherNumber = maxNum + 1;
      form.setValue("productionNumber", formatVoucherNumber(prefix, nextVoucherNumber));
    } catch (error) { console.error(error); }
  }, [companyId, company, form, isAutoVoucherEnabled, voucherPrefixes]);

  useEffect(() => {
    const NEW_PRODUCTION = "__new_production__";
    const hydrateFilesAndUnassigned = (v: any) => {
      const urls = v.unassignedFile?.url ? [v.unassignedFile.url] : (v.fileUrls || []);
      setFiles(urls);
      initialFilesRef.current = urls.filter((f: any) => typeof f === "string");
      setSavePdfAsImage(shouldSuggestPdfAsImage(urls));
      if (v.unassignedFile) {
        form.setValue("unassignedFile", v.unassignedFile);
      }
    };
    if (voucher?.id) {
      const vid = voucher.id;
      const isSameVoucher = lastResetVoucherIdRef.current === vid;
      if (isSameVoucher) return;
      lastResetVoucherIdRef.current = vid;
      const initialValues = getInitialFormValues(voucher);
      if (isEditingAndConverting) {
        initialValues.productionNumber = "";
      }
      form.reset(initialValues);
      hydrateFilesAndUnassigned(voucher);
    } else if (voucher) {
      // Naya production: template bina `id` — pehle yahan har dirty toggle par reset; pick ki File list clear ho jati thi (Contra jaisa guard).
      if (lastResetVoucherIdRef.current === NEW_PRODUCTION && isFormDirty) return;
      lastResetVoucherIdRef.current = NEW_PRODUCTION;
      const initialValues = getInitialFormValues(voucher);
      if (isEditingAndConverting) {
        initialValues.productionNumber = "";
      }
      form.reset(initialValues);
      hydrateFilesAndUnassigned(voucher);
    } else {
      lastResetVoucherIdRef.current = null;
    }
  }, [voucher, form, isEditingAndConverting, isFormDirty]);

  useEffect(() => {
    if (!isEditing || isEditingAndConverting) {
      fetchVoucherNumber();
    }
  }, [isEditing, isEditingAndConverting, fetchVoucherNumber]);

  const watchedRawMaterials = useWatch({ control: form.control, name: "rawMaterials" });
  const watchedFinishedGoods = useWatch({ control: form.control, name: "finishedGoods" });

  useEffect(() => {
    const totalCost = watchedRawMaterials.reduce((sum, rm) => sum + (rm.amount || 0), 0);
    const totalOutput = watchedFinishedGoods.reduce((sum, fg) => sum + (fg.amount || 0), 0);
    form.setValue("totalCost", totalCost);
    form.setValue("totalOutput", totalOutput);
  }, [watchedRawMaterials, watchedFinishedGoods, form]);

  const getItemName = (itemId: string) => {
    const item = items.find(i => i.id === itemId) || processedItems.find(i => i.id === itemId);
    return item?.name || "";
  };

  const getItem = (itemId: string): Item | undefined => {
    return items.find(i => i.id === itemId) || processedItems.find(i => i.id === itemId);
  };

  const getItemUnit = (itemId: string) => {
    const item = getItem(itemId);
    return item?.openingBalanceUnit || (item as any)?.unit || "";
  };

  const getItemHSCode = (itemId: string) => {
    const item = getItem(itemId);
    return (item as any)?.hsCode || "";
  };

  const getUnitBasedPrice = (item: Item, unit: string, priceType: 'purchase' | 'sale'): number => {
    const conversions = (item.unitConversions || []) as any[];
    if (conversions.length === 0) {
      return priceType === 'sale' ? (item.salePrice || 0) : ((item as any).purchasePrice || 0);
    }

    const smallestUnit = conversions[conversions.length - 1].toUnit;
    const basePrice = priceType === 'sale' ? (item.salePrice || 0) : ((item as any).purchasePrice || 0);
    const baseUnit = priceType === 'sale' ? item.salePriceUnit : ((item as any).purchasePriceUnit);

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
    if (unit && unit !== smallestUnit) {
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

  const getItemUnits = (itemId: string): string[] => {
    const item = getItem(itemId);
    if (!item) return [];
    const conversions = (item.unitConversions || []) as any[];
    if (conversions.length === 0) {
      const unit = item.openingBalanceUnit || (item as any)?.unit || "";
      return unit ? [unit] : [];
    }
    const units = conversions.flatMap((uc) => [uc.fromUnit, uc.toUnit]).filter((v, i, a) => a.indexOf(v) === i && v);
    return units;
  };

  const handleRawMaterialChange = (index: number, field: string, value: any) => {
    const current = form.getValues(`rawMaterials.${index}`);
    if (field === 'itemId') {
      const item = getItem(value);
      if (item) {
        const defaultUnit = (item as any).purchasePriceUnit || (item.unitConversions as any)?.[0]?.fromUnit || item.openingBalanceUnit || "";
        const rate = getUnitBasedPrice(item, defaultUnit, 'purchase');
        const hsCode = getItemHSCode(value);
        form.setValue(`rawMaterials.${index}.unit`, defaultUnit);
        form.setValue(`rawMaterials.${index}.rate`, rate);
        form.setValue(`rawMaterials.${index}.hsCode`, hsCode);
        form.setValue(`rawMaterials.${index}.amount`, current.quantity * rate);
      }
    }
    if (field === 'unit') {
      const item = getItem(current.itemId);
      if (item) {
        const rate = getUnitBasedPrice(item, value, 'purchase');
        form.setValue(`rawMaterials.${index}.rate`, rate);
        form.setValue(`rawMaterials.${index}.amount`, current.quantity * rate);
      }
    }
    if (field === 'quantity' || field === 'rate') {
      const qty = field === 'quantity' ? parseFloat(value) || 0 : current.quantity;
      const rate = field === 'rate' ? parseFloat(value) || 0 : current.rate;
      form.setValue(`rawMaterials.${index}.amount`, qty * rate);
    }
  };

  const handleFinishedGoodChange = (index: number, field: string, value: any) => {
    const current = form.getValues(`finishedGoods.${index}`);
    if (field === 'itemId') {
      const item = getItem(value);
      if (item) {
        const defaultUnit = item.salePriceUnit || (item.unitConversions as any)?.[0]?.fromUnit || item.openingBalanceUnit || "";
        const rate = getUnitBasedPrice(item, defaultUnit, 'sale');
        const hsCode = getItemHSCode(value);
        form.setValue(`finishedGoods.${index}.unit`, defaultUnit);
        form.setValue(`finishedGoods.${index}.rate`, rate);
        form.setValue(`finishedGoods.${index}.hsCode`, hsCode);
        form.setValue(`finishedGoods.${index}.amount`, current.quantity * rate);
      }
    }
    if (field === 'unit') {
      const item = getItem(current.itemId);
      if (item) {
        const rate = getUnitBasedPrice(item, value, 'sale');
        form.setValue(`finishedGoods.${index}.rate`, rate);
        form.setValue(`finishedGoods.${index}.amount`, current.quantity * rate);
      }
    }
    if (field === 'quantity' || field === 'rate') {
      const qty = field === 'quantity' ? parseFloat(value) || 0 : current.quantity;
      const rate = field === 'rate' ? parseFloat(value) || 0 : current.rate;
      form.setValue(`finishedGoods.${index}.amount`, qty * rate);
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

  const onSubmit = async (data: ProductionFormValues) => {
    if (!user || !companyId) return;

    try {
      if (isEditing) {
        const isOwnRecord = voucher?.userId === user.uid;
        assertCanEdit(canEditRecord, isOwnRecord, voucher);
        const originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
        assertCanPerformBackdated(canPerformBackdatedAction, "edit", originalVoucherDate);
      } else {
        assertCan(can, "create_records");
        assertCanPerformBackdated(canPerformBackdatedAction, "create", data.date);
      }

      setIsLoading(true);

      let filesForSave = files;
      if (savePdfAsImage) {
        const convToast = sonnerToast.loading("Converting PDF attachments to image…");
        try {
          filesForSave = await convertPdfAttachmentsToJpegIfEnabled(files, true);
        } finally {
          sonnerToast.dismiss(convToast);
        }
      }

      let existingFileUrls = filesForSave.filter((f): f is string => typeof f === 'string');
      if(data.unassignedFile?.url && !existingFileUrls.includes(data.unassignedFile.url)) {
        existingFileUrls.push(data.unassignedFile.url);
      }

      const newFilesToUpload = filesForSave.filter((f): f is File => f instanceof File);
      let preGeneratedVoucherId: string | undefined;
      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes }, company?.storageOption);
        if (!limitCheck.allowed) {
          toast({ variant: "destructive", title: "Storage limit reached", description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        if (isLocalOnlyMode()) {
          const voucherIdForLocalAttachments =
            isEditingAndConverting && voucher?.id
              ? null
              : (isEditing ? voucher.id : null);
          const { fileUrls: merged, preGeneratedVoucherId: preGen } =
            await appendLocalOnlyVoucherFilesToUrls({
              companyId,
              storageFolder: "production",
              existingFileUrls,
              newFiles: newFilesToUpload,
              maxFileCount: fileAttachmentLimits.maxFileCount,
              existingVoucherId: voucherIdForLocalAttachments,
            });
          existingFileUrls = merged;
          if (preGen) preGeneratedVoucherId = preGen;
          try {
            await incrementCompanyStorage(companyId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
          } catch {
            /* offline */
          }
        } else {
          const filePromises = newFilesToUpload.map(async (file) => {
            const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
            const { storage } = await import("@/lib/firebase");
            const fileRef = ref(storage, `companies/${companyId}/vouchers/production/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
            return getDownloadURL(fileRef);
          });
          const newFileUrls = await Promise.all(filePromises);
          existingFileUrls.push(...newFileUrls);
        }
      }

      const voucherData = {
        type: "production",
        date: data.date,
        productionNumber: data.productionNumber,
        rawMaterials: data.rawMaterials.map(rm => ({
          ...rm,
          itemName: getItemName(rm.itemId),
        })),
        finishedGoods: data.finishedGoods.map(fg => ({
          ...fg,
          itemName: getItemName(fg.itemId),
        })),
        narration: data.narration,
        totalCost: data.totalCost,
        totalOutput: data.totalOutput,
        total: data.totalOutput,
        amount: data.totalOutput,
        fileUrls: existingFileUrls,
        unassignedFile: data.unassignedFile,
      };

      const result = await saveVoucher(
        companyId,
        user.uid,
        voucherData,
        isEditing ? voucher.id : null,
        undefined,
        preGeneratedVoucherId ? { preGeneratedVoucherId } : undefined
      );

      toast({
        title: isEditing ? "Production order updated" : "Production order created",
        description: "Successfully saved.",
        // Global snappy toast — same rhythm as voucher Sonner (~1s).
        duration: 1000,
      });
      setIsLoading(false);

      const savedIdForAlert = result?.id ?? voucher?.id;
      onVoucherAction?.("saved", false, result.id || undefined);

      // Alerts / Firebase side-effects background — dialog turant band (core `saveVoucher` poora ho chuka).
      void (async () => {
        if (!companyId || !company || !savedIdForAlert) return;
        try {
          const amount = Number(voucherData.total ?? voucherData.totalCost) || 0;
          const voucherNumber = data.productionNumber ?? voucher?.productionNumber ?? "";
          const vid = savedIdForAlert;
          if (isEditing) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { date: oldV?.date?.toDate?.() ?? oldV?.date, productionNumber: oldV?.productionNumber, narration: oldV?.narration, totalCost: oldV?.totalCost, total: oldV?.total ?? oldV?.totalOutput },
              { date: voucherData.date, productionNumber: voucherData.productionNumber ?? data.productionNumber, narration: voucherData.narration, totalCost: voucherData.totalCost, total: voucherData.total ?? voucherData.totalOutput },
              [
                { key: "date", label: "Date" },
                { key: "productionNumber", label: "Production number" },
                { key: "narration", label: "Narration" },
                { key: "totalCost", label: "Total cost" },
                { key: "total", label: "Total output" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber,
              voucherType: "production",
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
              changes: changes.length > 0 ? changes : undefined,
            });
          } else if (isAmountOverOneLakh(amount)) {
            await sendTransactionAlert(companyId, company, {
              kind: "large_amount",
              voucherId: vid,
              voucherNumber,
              voucherType: "production",
              amount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        } catch (e) {
          console.warn("[CreateProductionForm] transaction alert tail", e);
        }
      })();

      if (approveAfterSaveRef.current) {
        approveAfterSaveRef.current = false;
        onApprove?.();
      }
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        toast({ title: "Permission Denied", description: error.message, variant: "destructive" });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", { description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
      } else {
        toast({ title: "Error", description: error.message || "Failed to save production order", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!voucher?.id || !user || !companyId) return;
    if (voucher && hasPaymentLinks(voucher)) {
      toast({ variant: "destructive", title: "Cannot Delete", description: "First unlink linked transactions." });
      return;
    }
    try {
      const isOwnRecord = voucher?.userId === user.uid;
      assertCanEdit(canEditRecord, isOwnRecord, voucher);
      setIsLoading(true);
      // Local/offline compatible delete: production voucher ko recycle bin me move karo.
      await patchVoucherFields(companyId, voucher.id, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || "",
      });
      toast({ title: "Moved to Bin", description: "Production order moved to recycle bin." });
      onVoucherAction?.('cancelled');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full min-w-0 w-full max-w-full">
        <ScrollArea className="flex-1 min-h-0 overflow-x-hidden min-w-0 w-full px-6 py-4">
          <div className="space-y-4 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full">
            {/* Section 1: Date + Production Number in one ribbon block. */}
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-sky-300/80 bg-sky-50 p-3">
              <FormField
                control={form.control}
                name="date"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <div className={cn("flex gap-2 h-10", dateSystem === "Both" && "gap-2")}>
                      {(dateSystem === "BS" || dateSystem === "Both") && (
                        <BsDatePicker
                          valueAD={field.value}
                          onChangeAD={(d) => field.onChange(d as Date)}
                          isRange={false}
                          className="h-10"
                        />
                      )}
                      {(dateSystem === "AD" || dateSystem === "Both") && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn("h-10 pl-3 text-left font-normal flex-1", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? formatDate(field.value) : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => date && (date.setHours(12, 0, 0, 0), field.onChange(date))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="productionNumber"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Production Number</FormLabel>
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
                        <Input {...field} value={field.value ?? ''} className={cn(isPrefixSelectionEnabled && voucherPrefixes.length > 0 && "flex-1")} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Section 2: Raw materials in one ribbon block. */}
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-50 p-3">
              <div className="flex justify-between items-center mb-2">
                <FormLabel>Raw Materials (Input)</FormLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => appendRawMaterial({ itemId: "", quantity: 1, unit: "", rate: 0, amount: 0, hsCode: "" })}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2 border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 items-center px-1 pb-1 border-b">
                  {ROW_HEADERS}
                </div>
                {rawMaterialFields.map((field, index) => {
                  const selectedItemId = form.watch(`rawMaterials.${index}.itemId`);
                  const selectedItem = getItem(selectedItemId);
                  const availableUnits = getItemUnits(selectedItemId);
                  return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-2">
                      <Combobox
                        options={items.filter(i => i.type === 'item' || !i.type).map(i => ({ value: i.id, label: i.name || "" }))}
                        value={form.watch(`rawMaterials.${index}.itemId`)}
                        onChange={(value, newName) => {
                          if (value === "add-new") {
                            setPendingItemIndex({ type: 'raw', index });
                            setIsCreateItemOpen(true);
                            if (newName) {
                              setTimeout(() => {
                                document.dispatchEvent(new CustomEvent('prefill-create-item-name', { detail: { name: newName, type: 'item' } }));
                              }, 100);
                            }
                          } else {
                            form.setValue(`rawMaterials.${index}.itemId`, value);
                            handleRawMaterialChange(index, 'itemId', value);
                          }
                        }}
                        placeholder="Select item"
                        addNewLabel="+ Add New Item"
                        triggerClassName="h-9 w-full"
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name={`rawMaterials.${index}.quantity`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Qty"
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                field.onChange(val);
                                handleRawMaterialChange(index, 'quantity', e.target.value);
                              }}
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rawMaterials.${index}.unit`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Select
                              value={field.value || ""}
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleRawMaterialChange(index, 'unit', value);
                              }}
                              disabled={!selectedItemId || availableUnits.length === 0}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableUnits.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rawMaterials.${index}.rate`}
                        render={({ field }: any) => (
                          <FormControl>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="w-full">
                                    <Input
                                      type="number"
                                      placeholder="Rate"
                                      value={field.value ?? ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        field.onChange(val);
                                        handleRawMaterialChange(index, 'rate', e.target.value);
                                      }}
                                      disabled={!isRateEditingAllowed}
                                      className={cn(!isRateEditingAllowed && 'bg-muted cursor-not-allowed')}
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
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rawMaterials.${index}.amount`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Input
                              placeholder="Amount"
                              value={field.value ?? ''}
                              readOnly
                              className="bg-muted"
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rawMaterials.${index}.hsCode`}
                        render={({ field }: any) => (
                          <FormControl>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="w-full">
                                    <Input
                                      placeholder="HS Code"
                                      value={field.value ?? ''}
                                      onChange={field.onChange}
                                      disabled={!isHSCodeEditingAllowed}
                                      className={cn(!isHSCodeEditingAllowed && 'bg-muted cursor-not-allowed')}
                                      title={!isHSCodeEditingAllowed && !canEditHSCode ? "No permission to edit HS Code" : undefined}
                                    />
                                  </div>
                                </TooltipTrigger>
                                {!isHSCodeEditingAllowed && !canEditHSCode && (
                                  <TooltipContent>
                                    <p>No permission to edit HS Code</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          if (rawMaterialFields.length > 1) {
                            removeRawMaterial(index);
                          } else {
                            toast({
                              variant: "destructive",
                              title: "Cannot Delete",
                              description: "At least one raw material is required.",
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Finished goods in one ribbon block. */}
            <div className="rounded-lg border border-violet-300/80 bg-violet-50 p-3">
              <div className="flex justify-between items-center mb-2">
                <FormLabel>Finished Goods (Output)</FormLabel>
              </div>
              <div className="space-y-2 border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 items-center px-1 pb-1 border-b">
                  {FG_ROW_HEADERS}
                </div>
                {finishedGoodFields.map((field, index) => {
                  const selectedItemId = form.watch(`finishedGoods.${index}.itemId`);
                  const selectedItem = getItem(selectedItemId);
                  const availableUnits = getItemUnits(selectedItemId);
                  return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-2">
                      <Combobox
                        options={items.filter(i => i.type === 'finished_good').map(i => ({ value: i.id, label: i.name || "" }))}
                        value={form.watch(`finishedGoods.${index}.itemId`)}
                        onChange={(value, newName) => {
                          if (value === "add-new") {
                            setPendingItemIndex({ type: 'finished', index });
                            setPrefillFinishedGoodName(newName || "");
                            setIsCreateItemOpen(true);
                          } else {
                            form.setValue(`finishedGoods.${index}.itemId`, value);
                            handleFinishedGoodChange(index, 'itemId', value);
                          }
                        }}
                        placeholder="Select item"
                        addNewLabel="+ Add New Item"
                        triggerClassName="h-9 w-full"
                      />
                    </div>
                    <div className="col-span-1">
                      <FormField
                        control={form.control}
                        name={`finishedGoods.${index}.quantity`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Qty"
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                field.onChange(val);
                                handleFinishedGoodChange(index, 'quantity', e.target.value);
                              }}
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`finishedGoods.${index}.unit`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Select
                              value={field.value || ""}
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleFinishedGoodChange(index, 'unit', value);
                              }}
                              disabled={!selectedItemId || availableUnits.length === 0}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableUnits.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`finishedGoods.${index}.rate`}
                        render={({ field }: any) => (
                          <FormControl>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="w-full">
                                    <Input
                                      type="number"
                                      placeholder="Rate"
                                      value={field.value ?? ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        field.onChange(val);
                                        handleFinishedGoodChange(index, 'rate', e.target.value);
                                      }}
                                      disabled={!isRateEditingAllowed}
                                      className={cn(!isRateEditingAllowed && 'bg-muted cursor-not-allowed')}
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
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`finishedGoods.${index}.amount`}
                        render={({ field }: any) => (
                          <FormControl>
                            <Input
                              placeholder="Amount"
                              value={field.value ?? ''}
                              readOnly
                              className="bg-muted"
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`finishedGoods.${index}.hsCode`}
                        render={({ field }: any) => (
                          <FormControl>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="w-full">
                                    <Input
                                      placeholder="HS Code"
                                      value={field.value ?? ''}
                                      onChange={field.onChange}
                                      disabled={!isHSCodeEditingAllowed}
                                      className={cn(!isHSCodeEditingAllowed && 'bg-muted cursor-not-allowed')}
                                      title={!isHSCodeEditingAllowed && !canEditHSCode ? "No permission to edit HS Code" : undefined}
                                    />
                                  </div>
                                </TooltipTrigger>
                                {!isHSCodeEditingAllowed && !canEditHSCode && (
                                  <TooltipContent>
                                    <p>No permission to edit HS Code</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="col-span-1" />
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Totals summary in one ribbon block. */}
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-indigo-300/80 bg-indigo-50 p-3">
              <div>
                <p className="text-sm font-medium">Total Cost (Input)</p>
                <p className="text-lg font-bold text-red-600">{form.watch("totalCost").toLocaleString('en-NP', { style: 'currency', currency: 'NPR', minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Total Output (Output)</p>
                <p className="text-lg font-bold text-green-600">{form.watch("totalOutput").toLocaleString('en-NP', { style: 'currency', currency: 'NPR', minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Section 5: Attach + narration together; mobile stack, desktop narration on right. */}
            <div className="rounded-lg border border-amber-300/80 bg-amber-50 p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <FormItem>
                  <FormLabel>Attach Files (Optional)</FormLabel>
                  {showPdfAsImageToggle && (
                    <VoucherPdfAsImageToggle
                      id="voucher-save-pdf-as-image-production"
                      checked={savePdfAsImage}
                      onCheckedChange={setSavePdfAsImage}
                      disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                      className="mb-2"
                    />
                  )}
                  <RestrictedFileUploader>
                    <div className="flex flex-wrap gap-4">
                      {files.map((file, index) => (
                        <FilePreview
                          key={index}
                          file={file}
                          attachmentClientFileUrls={files.filter((f): f is string => typeof f === "string")}
                          onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                          className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                        />
                      ))}
                      {allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                        <>
                          <label
                            htmlFor={attachFileInputId}
                            className={cn(
                              "relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors",
                              allowAttachments && fileAttachmentLimits.maxFileCount > 0
                                ? "text-muted-foreground hover:border-primary cursor-pointer"
                                : "pointer-events-none text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                            )}
                          >
                            <Upload className="h-6 w-6" />
                            <span className="text-xs mt-1">Add File</span>
                          </label>
                          <Input
                            id={attachFileInputId}
                            type="file"
                            className="sr-only"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept={[
                              fileAttachmentLimits.allowImage ? "image/*" : "",
                              fileAttachmentLimits.allowPDF ? "application/pdf" : ""
                            ].filter(Boolean).join(",") || "image/*,application/pdf"}
                            multiple={fileAttachmentLimits.maxFileCount > 1}
                            disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                          />
                        </>
                      )}
                    </div>
                  </RestrictedFileUploader>
                </FormItem>
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }: any) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Narration</FormLabel>
                      <FormControl>
                        {/* Production voucher narration — same resize/scroll as baaki forms */}
                        <Textarea {...field} placeholder="Add notes or description..." className={cn(VOUCHER_NARRATION_TEXTAREA_CLASS)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className={cn("border-t min-w-0 max-w-full overflow-x-hidden", isMobile ? "mt-[3px] pt-[3px] pb-[3px] px-2" : "p-4 flex justify-between items-center")}>
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
                    <AlertDialogTitle>Delete Production Order</AlertDialogTitle>
                    <AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" className={cn("w-full", BTN_HISTORY_CLASS, "opacity-60")} disabled>
                History
              </Button>
              <Button type="button" className={cn("w-full", BTN_PRINT_CLASS, "opacity-60")} disabled>
                Save & Print
              </Button>
              {/* Row 1: Cancel | Save (middle) | Approve (right) — baaki voucher forms jaisa */}
              <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || editingDisabled || (!!voucher?.id && !isFormDirty)} className={cn("w-full", BTN_SAVE_CLASS)}>
                {isLoading ? "..." : "Save"}
              </Button>
              {voucher?.id ? (
                <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) { approveAfterSaveRef.current = true; form.handleSubmit(onSubmit)(); } else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                  {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                </Button>
              ) : showSaveAndApproveOnCreate ? (
                <Button type="button" onClick={(e) => { e.preventDefault(); approveAfterSaveRef.current = true; form.handleSubmit(onSubmit)(); }} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_APPROVE_CLASS)}>
                  {isLoading ? "..." : "Save & Approve"}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                <Button type="button" disabled className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                  <History className="mr-2 h-4 w-4" /> History
                </Button>
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="sm" className="shrink-0 rounded-full" disabled={!isEditing || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Production Order</AlertDialogTitle>
                      <AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className={cn("flex gap-2 justify-end flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                <Button type="button" disabled className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>Save & New</Button>
                <Button type="button" disabled className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}><Printer className="mr-2 h-4 w-4" /> Save & Print</Button>
                <Button type="submit" disabled={isLoading || editingDisabled || (!!voucher?.id && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
                {voucher?.id ? (
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) { approveAfterSaveRef.current = true; form.handleSubmit(onSubmit)(); } else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    {isFormDirty ? "Save & Approve" : "Approve"}
                  </Button>
                ) : showSaveAndApproveOnCreate ? (
                  <Button type="button" onClick={(e) => { e.preventDefault(); approveAfterSaveRef.current = true; form.handleSubmit(onSubmit)(); }} disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Save & Approve
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>

        {pendingItemIndex?.type === "finished" ? (
          <CreateFinishedGoodDialog
            isOpen={isCreateItemOpen}
            onOpenChange={(open) => {
              setIsCreateItemOpen(open);
              if (!open) {
                setPendingItemIndex(null);
                setPrefillFinishedGoodName("");
              }
            }}
            prefillName={prefillFinishedGoodName}
            onItemCreated={(newItemId) => {
              if (pendingItemIndex?.type === "finished") {
                form.setValue(`finishedGoods.${pendingItemIndex.index}.itemId`, newItemId);
                handleFinishedGoodChange(pendingItemIndex.index, "itemId", newItemId);
                setPendingItemIndex(null);
                setPrefillFinishedGoodName("");
              }
            }}
          />
        ) : (
          <CreateItemDialog
            isOpen={isCreateItemOpen}
            onOpenChange={(open) => {
              setIsCreateItemOpen(open);
              if (!open) setPendingItemIndex(null);
            }}
            onItemCreated={(newItemId) => {
              if (pendingItemIndex) {
                if (pendingItemIndex.type === "raw") {
                  form.setValue(`rawMaterials.${pendingItemIndex.index}.itemId`, newItemId);
                  handleRawMaterialChange(pendingItemIndex.index, "itemId", newItemId);
                } else {
                  form.setValue(`finishedGoods.${pendingItemIndex.index}.itemId`, newItemId);
                  handleFinishedGoodChange(pendingItemIndex.index, "itemId", newItemId);
                }
                setPendingItemIndex(null);
              }
            }}
          />
        )}
      </form>
    </Form>
  );
}

