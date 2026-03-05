
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast as sonnerToast } from "sonner";

import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { saveVoucher } from "@/lib/voucherActionsClient";

import { firestore } from "@/lib/firebase";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

import type { Item, ItemGroup } from "@/components/items/types";
import type { Tax, TaxGroup } from "@/components/tax/types";

import BsDatePicker from "@/components/ui/BsDatePicker";
import { Combobox } from "../ui/combobox";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { CreateItemGroupDialog } from "./CreateItemGroupDialog";
import { CreateTaxDialog } from "../tax/CreateTaxDialog";
import { isSystemParentGroup } from "@/lib/system-groups";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import Image from 'next/image';


const fileSchema = z.object({
  file: z.instanceof(File),
  preview: z.string(),
});

const unitConversionSchema = z.object({
  fromUnit: z.string().min(1, "Unit name is required"),
  toUnit: z.string().min(1, "Unit name is required"),
  conversionFactor: z.coerce.number().min(0.001, "Factor must be positive"),
});

const formSchema = z.object({
  name: z.string().min(2, { message: "Item name must be at least 2 characters." }),
  type: z.enum(['item', 'service', 'finished_good']),
  hsCode: z.string().optional(),
  salePrice: z.coerce.number().min(0, "Price must be a positive number."),
  isSalePriceTaxInclusive: z.boolean(),
  purchasePrice: z.coerce.number().min(0, "Price must be a positive number."),
  isPurchasePriceTaxInclusive: z.boolean(),
  openingBalance: z.coerce.number().min(0, "Opening stock must be a positive number."),
  openingBalanceUnit: z.string().optional(),
  openingBalanceTaxId: z.string().optional(),
  openingBalanceDate: z.date().optional(),
  openingBalanceRate: z.coerce.number().min(0),
  isOpeningBalanceTaxInclusive: z.boolean().optional(),
  groupId: z.string().optional(),
  unitConversions: z.array(unitConversionSchema).optional(),
  salePriceUnit: z.string().optional(),
  purchasePriceUnit: z.string().optional(),
  saleTaxId: z.string().optional(),
  purchaseTaxId: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

function getInitialFormValues(itemType: 'item' | 'service' | 'finished_good' = 'item'): z.infer<typeof formSchema> {
    return {
        name: "",
        type: itemType,
        hsCode: "",
        salePrice: 0,
        isSalePriceTaxInclusive: false,
        purchasePrice: 0,
        isPurchasePriceTaxInclusive: false,
        openingBalance: 0,
        openingBalanceRate: 0,
        isOpeningBalanceTaxInclusive: false,
        groupId: "",
        unitConversions: [{ fromUnit: "", toUnit: "", conversionFactor: 1 }],
        openingBalanceUnit: "",
        openingBalanceTaxId: "",
        openingBalanceDate: undefined,
        salePriceUnit: "",
        purchasePriceUnit: "",
        saleTaxId: "",
        purchaseTaxId: "",
    };
}


export function CreateItemDialog({ 
  onItemCreated, 
  children,
  isOpen: parentIsOpen,
  onOpenChange: parentOnOpenChange,
  defaultType,
}: { 
  onItemCreated?: (newId: string) => void, 
  children?: React.ReactNode,
  isOpen?: boolean,
  onOpenChange?: (open: boolean) => void,
  defaultType?: 'item' | 'service' | 'finished_good',
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync, company } = useCompany();
  const { canAddAvatar } = usePermissions();
  const { dateSystem, formatDate } = useDate();
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const [prefillTaxName, setPrefillTaxName] = useState("");
  const [taxRowIndex, setTaxRowIndex] = useState<number | null>(null);
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  const isOpen = parentIsOpen !== undefined ? parentIsOpen : false;
  const setIsOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : () => {};
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formValuesBackupRef = useRef<z.infer<typeof formSchema> | null>(null);
  const taxFieldToApplyRef = useRef<"purchaseTaxId" | "saleTaxId" | "openingBalanceTaxId" | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: getInitialFormValues(defaultType),
  });

  const itemType = form.watch('type');
  
  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
        const detail = event.detail;
        // Handle both string (legacy) and object formats
        if (typeof detail === 'string') {
          form.setValue('name', detail);
          form.setValue('type', defaultType || 'item');
        } else if (detail && typeof detail === 'object') {
          form.setValue('name', detail.name || '');
          form.setValue('type', detail.type || defaultType || 'item');
        }
    };
    // @ts-ignore
    document.addEventListener('prefill-create-item-name', handlePrefill);
    return () => {
        // @ts-ignore
      document.removeEventListener('prefill-create-item-name', handlePrefill);
    };
  }, [form, defaultType]);
  
  // Only reset form when main dialog opens (not when nested dialogs open/close)
  const prevIsOpenRef = useRef(false);
  const defaultTypeRef = useRef(defaultType);
  
  // Update defaultTypeRef when it changes
  useEffect(() => {
    defaultTypeRef.current = defaultType;
  }, [defaultType]);
  
  useEffect(() => {
    // Only reset if dialog is opening (was closed, now open)
    // This ensures form only resets when the main dialog first opens, not when nested dialogs open/close
    if (isOpen && !prevIsOpenRef.current) {
      form.reset(getInitialFormValues(defaultTypeRef.current));
      setFiles([]);
    }
    prevIsOpenRef.current = isOpen;
    // Remove defaultType from dependencies to prevent reset when it changes
  }, [isOpen, form]);

  const { fields: unitFields, append: appendUnit, remove: removeUnit } = useFieldArray({
    control: form.control,
    name: "unitConversions"
  });
  
  const watchedUnitConversions = useWatch({ control: form.control, name: 'unitConversions' });
  const watchedPurchasePrice = useWatch({ control: form.control, name: 'purchasePrice' });
  const watchedSalePrice = useWatch({ control: form.control, name: 'salePrice' });
  const watchedPurchasePriceUnit = useWatch({ control: form.control, name: 'purchasePriceUnit' });
  const watchedSalePriceUnit = useWatch({ control: form.control, name: 'salePriceUnit' });
  const watchedOpeningBalanceUnit = useWatch({ control: form.control, name: 'openingBalanceUnit' });
  const watchedIsPurchaseTaxInclusive = useWatch({ control: form.control, name: 'isPurchasePriceTaxInclusive' });
  const watchedIsSalePriceTaxInclusive = useWatch({ control: form.control, name: 'isSalePriceTaxInclusive' });
  const watchedIsOpeningBalanceTaxInclusive = useWatch({ control: form.control, name: 'isOpeningBalanceTaxInclusive' });
  const watchedOpeningBalanceTaxId = useWatch({ control: form.control, name: 'openingBalanceTaxId' });
  const watchedPurchaseTaxId = useWatch({ control: form.control, name: 'purchaseTaxId' });
  const watchedSaleTaxId = useWatch({ control: form.control, name: 'saleTaxId' });


  const handleGroupCreated = (newGroupId: string) => {
    // Restore form values if they were backed up
    if (formValuesBackupRef.current) {
      const backup = formValuesBackupRef.current;
      form.reset(backup);
      form.setValue('groupId', newGroupId);
      formValuesBackupRef.current = null;
    } else {
      form.setValue('groupId', newGroupId);
    }
    setIsCreateGroupOpen(false);
  };
  
  // Backup form values when group or tax dialog opens (same logic for both - like group field)
  useEffect(() => {
    if ((isCreateGroupOpen || isCreateTaxOpen) && !formValuesBackupRef.current) {
      formValuesBackupRef.current = form.getValues();
    }
    // Don't clear backup here - let handlers clear it after restore
  }, [isCreateGroupOpen, isCreateTaxOpen, form]);

  // Hide system item groups (Stock Items, Services) from dropdown — only user-created groups
  const itemGroupOptions = React.useMemo(
    () =>
      groups
        .filter((g) => !isSystemParentGroup("item_groups", g.id))
        .map((g) => ({ value: g.id, label: g.name })),
    [groups]
  );

  const taxOptions = React.useMemo(
    () => [
      { value: "", label: "None" },
      ...taxes.map((t) => ({ value: t.id, label: `${t.name} @ ${t.rate}%` })),
    ],
    [taxes]
  );

  const handleTaxCreated = (newTaxId: string, newTax?: { id: string; name: string; rate: number; balance?: number; companyId: string; groupId?: string }) => {
    if (newTaxId) {
      const fieldToApply = taxFieldToApplyRef.current; // Get from ref
      
      // Restore form values if they were backed up (same logic as handleGroupCreated)
      if (formValuesBackupRef.current) {
        const backup = formValuesBackupRef.current;
        form.reset(backup);
        // Set the tax field immediately after restore
        if (fieldToApply) {
          form.setValue(fieldToApply, newTaxId);
        }
        formValuesBackupRef.current = null;
      } else {
        // If no backup, just set the tax field directly
        if (fieldToApply) {
          form.setValue(fieldToApply, newTaxId);
        } else if (taxRowIndex !== null) {
          form.setValue('saleTaxId', newTaxId);
        }
      }
      
      if (newTax) {
        setTaxes((prev) => (prev.some((t) => t.id === newTaxId) ? prev : [...prev, { ...newTax, balance: newTax.balance ?? 0 } as Tax]));
      }
    }
    setIsCreateTaxOpen(false);
    setTaxRowIndex(null);
    taxFieldToApplyRef.current = null; // Clear ref
  }
  
  
  useEffect(() => {
    if (!isOpen || !companyId) return;
    
    const qGroups = query(collection(firestore, `companies/${companyId}/item_groups`));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
        setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemGroup)));
    }, (error) => {
        console.error("Error fetching groups:", error);
        toast({ variant: "destructive", title: "Could not load groups" });
    });

    const qTaxes = query(collection(firestore, `companies/${companyId}/taxes`));
    const unsubTaxes = onSnapshot(qTaxes, (snapshot) => {
        setTaxes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tax)));
    });
    
    return () => {
        unsubGroups();
        unsubTaxes();
    };
  }, [isOpen, companyId, toast]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding files." });
      return;
    }
    const newFiles = Array.from(e.target.files);
    for (const file of newFiles) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: "destructive", title: "File too large", description: `Please select a file smaller than 5MB to compress.` });
        continue;
      }
      try {
        const compressedFile = await compressFile(file);
        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({ variant: "destructive", title: "File Too Large After Compression", description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.` });
            continue;
        }
        if (files.length < 3) {
          setFiles(prev => [...prev, compressedFile]);
        } else {
          toast({ variant: "destructive", title: "Limit Reached", description: "You can only upload up to 3 files."});
          break;
        }
      } catch (err) {
        console.error("File compression error:", err);
        toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
      }
    }
  };
  
  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    if (!options.saveAndNew) {
      setIsOpen(false);
    }
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in and have a company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Saving item...");
    setIsLoading(true);

    try {
      const q = query(
        collection(firestore, `companies/${companyId}/items`),
        where("name", "==", values.name.trim())
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        sonnerToast.error("Duplicate Item Name", {
          id: toastId,
          description: "An item with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      
      const fileUrls: string[] = [];
      const newFilesToUpload = files.filter(f => typeof f !== 'string') as File[];
      if (newFilesToUpload.length > 0 && companyId && canAddAvatar) {
        const totalNewBytes = newFilesToUpload.slice(0, 3).reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        for (const file of newFilesToUpload) {
          if (fileUrls.length >= 3) break;
          const res = await uploadFile(
            { name: file.name, type: file.type, arrayBuffer: await file.arrayBuffer() },
            companyId,
            company?.name,
            "avatar",
            undefined,
            undefined,
            undefined,
            new Date()
          );
          if (res.success && res.url) {
            fileUrls.push(res.url);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
          }
        }
      }
      
      const balance = (values.openingBalance || 0) * (values.openingBalanceRate || 0);

      // Get Stock Qty in smallest unit
      const conversions = (values.unitConversions || []) as any[];
      const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : (values.openingBalanceUnit || '');
      let stockQty = 0;
      if (values.type === 'item') {
          let factor = 1;
          let currentUnit = values.openingBalanceUnit;
          if (currentUnit && currentUnit !== smallestUnit) {
              for (let i=0; i < 10; i++) { // safety break
                  const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                  if (!conv) { factor = 0; break; }
                  factor *= Number(conv.conversionFactor) || 1;
                  currentUnit = conv.toUnit;
                  if (currentUnit === smallestUnit) break;
              }
          }
          stockQty = (values.openingBalance || 0) * (factor || 1);
      }

      const submissionData = {
          name: values.name,
          type: values.type,
          hsCode: values.hsCode || null,
          ownerId: user.uid,
          companyId: companyId,
          groupId: values.groupId || null,
          salePrice: values.salePrice,
          purchasePrice: values.purchasePrice,
          openingBalance: values.openingBalance,
          openingBalanceUnit: values.openingBalanceUnit || null,
          openingBalanceTaxId: values.openingBalanceTaxId || null,
          isOpeningBalanceTaxInclusive: values.isOpeningBalanceTaxInclusive || false,
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceRate: values.openingBalanceRate || 0,
          unitConversions: values.unitConversions || [],
          fileUrls: fileUrls,
          debit: 0,
          credit: 0,
          balance: balance,
          stockQty: stockQty,
          createdAt: serverTimestamp(),
          salePriceUnit: values.salePriceUnit || null,
          purchasePriceUnit: values.purchasePriceUnit || null,
          saleTaxId: values.saleTaxId || null,
          purchaseTaxId: values.purchaseTaxId || null,
          isPurchasePriceTaxInclusive: values.isPurchasePriceTaxInclusive || false,
          isSalePriceTaxInclusive: values.isSalePriceTaxInclusive || false,
          isDeleted: false,
      };

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/items`), submissionData);

      sonnerToast.success("Item Created!", { id: toastId, description: `"${values.name}" has been successfully created.` });
      
      if (onItemCreated) {
        onItemCreated(docRef.id);
      }
      triggerSync();

      if (saveAndNew) {
        form.reset(getInitialFormValues(itemType));
        setFiles([]);
      }

    } catch (error) {
      console.error("Error creating item:", error);
      sonnerToast.error("Error Creating Item", { id: toastId, description: "Item details could not be saved. Please try again." });
    } finally {
        setIsLoading(false);
    }
  }

  
  const allUnits = [...new Set(watchedUnitConversions?.flatMap(uc => [uc.fromUnit, uc.toUnit]) || [])].filter(Boolean);
  const openingStockQty = form.watch('openingBalance') || 0;
  const openingStockRate = form.watch('openingBalanceRate') || 0;
  
  const unitPrices = useMemo(() => {
    const prices: Record<string, { purchase: number; sale: number; purchaseTax: number; saleTax: number; }> = {};
    const conversions = watchedUnitConversions || [];
    if (conversions.length === 0 || !conversions[0].toUnit) return prices;

    const smallestUnit = conversions[conversions.length - 1].toUnit;

    const purchaseTaxRate = taxes.find(t => t.id === watchedPurchaseTaxId)?.rate || 0;
    const saleTaxRate = taxes.find(t => t.id === watchedSaleTaxId)?.rate || 0;

    let basePurchasePrice = Number(watchedPurchasePrice) || 0;
    if (watchedIsPurchaseTaxInclusive) {
        basePurchasePrice = parseFloat((basePurchasePrice / (1 + purchaseTaxRate / 100)).toFixed(10));
    }
    if (watchedPurchasePriceUnit && smallestUnit && watchedPurchasePriceUnit !== smallestUnit) {
        let factor = 1;
        let current = watchedPurchasePriceUnit;
        while (current !== smallestUnit) {
            const conv = conversions.find((c) => c.fromUnit === current);
            if (!conv) { factor = 0; break; }
            factor *= Number(conv.conversionFactor) || 1;
            current = conv.toUnit;
        }
        basePurchasePrice /= (factor || 1);
    }

    let baseSalePrice = Number(watchedSalePrice) || 0;
    if (watchedIsSalePriceTaxInclusive) {
        baseSalePrice = parseFloat((baseSalePrice / (1 + saleTaxRate / 100)).toFixed(10));
    }
    if (watchedSalePriceUnit && smallestUnit && watchedSalePriceUnit !== smallestUnit) {
        let factor = 1;
        let current = watchedSalePriceUnit;
        while (current !== smallestUnit) {
            const conv = conversions.find((c) => c.fromUnit === current);
            if (!conv) { factor = 0; break; }
            factor *= Number(conv.conversionFactor) || 1;
            current = conv.toUnit;
        }
        baseSalePrice /= (factor || 1);
    }

    allUnits.forEach((unit) => {
        let purchasePriceForUnit = basePurchasePrice;
        let salePriceForUnit = baseSalePrice;

        if (unit !== smallestUnit) {
            let factor = 1;
            let current = unit;
             while (current !== smallestUnit) {
                const conv = conversions.find((c) => c.fromUnit === current);
                if (!conv) { factor = 0; break; }
                factor *= Number(conv.conversionFactor) || 1;
                current = conv.toUnit;
            }
            purchasePriceForUnit *= factor;
            salePriceForUnit *= factor;
        }

        prices[unit] = {
            purchase: purchasePriceForUnit,
            sale: salePriceForUnit,
            purchaseTax: purchasePriceForUnit * (purchaseTaxRate / 100),
            saleTax: salePriceForUnit * (saleTaxRate / 100),
        };
    });

    return prices;
}, [allUnits, watchedUnitConversions, watchedPurchasePrice, watchedSalePrice, watchedPurchasePriceUnit, watchedSalePriceUnit, watchedPurchaseTaxId, watchedSaleTaxId, taxes, watchedIsPurchaseTaxInclusive, watchedIsSalePriceTaxInclusive]);
  
  useEffect(() => {
    const openingStockUnit = form.getValues('openingBalanceUnit');
    const currentRate = form.getValues('openingBalanceRate');

    if (openingStockUnit && unitPrices[openingStockUnit]) {
        const isInclusive = form.getValues('isOpeningBalanceTaxInclusive');
        const taxId = form.getValues('openingBalanceTaxId');
        const taxRate = taxes.find(t => t.id === taxId)?.rate || 0;
        
        let baseRate = Number(unitPrices[openingStockUnit]?.purchase) || 0;
        
        let finalRate = isInclusive 
          ? parseFloat((baseRate * (1 + taxRate / 100)).toFixed(2)) 
          : parseFloat(baseRate.toFixed(2));
        
        if (currentRate !== finalRate) {
           form.setValue('openingBalanceRate', finalRate, { shouldValidate: true });
        }
    }
}, [watchedOpeningBalanceUnit, watchedIsOpeningBalanceTaxInclusive, watchedOpeningBalanceTaxId, unitPrices, taxes, form]);

const openingStockAmount = (openingStockQty || 0) * (openingStockRate || 0);

const openingStockByUnit = useMemo(() => {
    const stock: Record<string, number> = {};
    const conversions = watchedUnitConversions || [];
    if (conversions.length === 0 || !watchedOpeningBalanceUnit || !openingStockQty) return stock;

    const getFactorToSmallest = (unit: string): number => {
        let factor = 1;
        let current = unit;
        const smallestUnit = conversions[conversions.length - 1].toUnit;

        while (current !== smallestUnit) {
            const conv = conversions.find(c => c.fromUnit === current);
            if (!conv) return 0; // Should not happen in a valid chain
            factor *= Number(conv.conversionFactor);
            current = conv.toUnit;
        }
        return factor;
    };
    
    const factorToSmallest = getFactorToSmallest(watchedOpeningBalanceUnit);
    const qtyInSmallest = openingStockQty * factorToSmallest;

    allUnits.forEach(unit => {
        const factorFromSmallest = getFactorToSmallest(unit);
        stock[unit] = factorFromSmallest > 0 ? qtyInSmallest / factorFromSmallest : 0;
    });

    return stock;
}, [watchedUnitConversions, openingStockQty, watchedOpeningBalanceUnit, allUnits]);


const capitalizeFirstLetter = (str: string) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
};


  return (
    <React.Fragment>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
        <DialogContent
            className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 sm:max-h-none sm:w-full sm:max-w-4xl sm:grid sm:flex-none sm:px-6"

            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Create a New Item</DialogTitle>
            <DialogDescription>Add a new product or service to your records.</DialogDescription>
          </DialogHeader>
          {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
          <Form {...form}>
            <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-4 py-4">

              <Tabs value={itemType} onValueChange={(value) => form.setValue('type', value as 'item' | 'service' | 'finished_good')} className="w-full mb-4">
                  <TabsList>
                      <TabsTrigger value="item">Item</TabsTrigger>
                      <TabsTrigger value="service">Service</TabsTrigger>
                      <TabsTrigger value="finished_good">Finished Good</TabsTrigger>
                  </TabsList>
              </Tabs>
              <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Item Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., T-Shirt (Red)" className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hsCode"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>HS Code</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter HS Code" className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Combobox
                        options={itemGroupOptions}
                        value={field.value}
                        onChange={(value, newName) => {
                          if (value === "add-new") {
                            setIsCreateGroupOpen(true);
                            setTimeout(() => {
                              document.dispatchEvent(new CustomEvent('prefill-create-item-group-name', { detail: newName }));
                            }, 100);
                          } else {
                            field.onChange(value === "none" ? "" : value);
                          }
                        }}
                        placeholder="Select a group"
                        addNewLabel="+ Add New Group"
                        triggerClassName="h-9"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Unit Conversions: horizontal scroll so Base Unit + delete icon visible on small screens (do not remove overflow-x-auto). */}
              <div className="space-y-4 border p-4 rounded-md">
                  <FormLabel className="text-base font-semibold">Unit Conversions</FormLabel>
                  <div className="w-full overflow-x-auto overflow-y-visible -mx-1 px-1">
                  <div className="space-y-2 min-w-[560px] pr-2">

                  {unitFields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-11 items-end gap-2">
                          <div className="col-span-1 flex items-center justify-center font-bold">1</div>
                          <FormField
                              control={form.control}
                              name={`unitConversions.${index}.fromUnit`}
                              render={({ field: fromUnitField }: any) => (
                                  <FormItem className="col-span-3">
                                      <FormControl>
                                        <Input 
                                          className="h-9"
                                          placeholder="e.g. Box" 
                                          {...fromUnitField} 
                                          onBlur={(e) => {
                                            const capitalized = capitalizeFirstLetter(e.target.value);
                                            fromUnitField.onChange(capitalized);
                                            if (index === 0 && !form.getValues('openingBalanceUnit')) form.setValue('openingBalanceUnit', capitalized);
                                            if (index === 0 && !form.getValues('purchasePriceUnit')) form.setValue('purchasePriceUnit', capitalized);
                                            if (index === 0 && !form.getValues('salePriceUnit')) form.setValue('salePriceUnit', capitalized);
                                          }}
                                        />
                                      </FormControl>
                                  </FormItem>
                              )}
                          />
                          <div className="col-span-1 flex items-center justify-center font-bold">=</div>
                          <FormField
                              control={form.control}
                              name={`unitConversions.${index}.conversionFactor`}
                              render={({ field }: any) => (
                                  <FormItem className="col-span-2">
                                      <FormControl><Input type="number" placeholder="e.g. 12" className="h-9" {...field} /></FormControl>
                                  </FormItem>
                              )}
                          />
                          <FormField
                              control={form.control}
                              name={`unitConversions.${index}.toUnit`}
                              render={({ field }: any) => (
                                  <FormItem className="col-span-3">
                                      <div className="relative">
                                          <FormControl><Input placeholder="e.g. Pcs" className="h-9" {...field} onBlur={(e) => {
                                              const capitalized = capitalizeFirstLetter(e.target.value);
                                              field.onChange(capitalized);
                                              if (index < unitFields.length - 1) {
                                                  form.setValue(`unitConversions.${index + 1}.fromUnit`, capitalized);
                                              }
                                          }} /></FormControl>
                                          {index === unitFields.length - 1 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-muted px-2 py-0.5 rounded-sm text-muted-foreground">Base Unit</span>}
                                      </div>
                                  </FormItem>
                              )}
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeUnit(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                      </div>
                  ))}
                  <Button type="button" variant="outline"
                      className="mt-2"
                      onClick={() => {
                          const lastUnit = unitFields.length > 0 ? form.getValues(`unitConversions.${unitFields.length - 1}.toUnit`) : "";
                          appendUnit({ fromUnit: lastUnit || '', toUnit: '', conversionFactor: 1 })
                      }}
                  >
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Unit Conversion
                  </Button>
              </div>
              </div>
              </div>

              {/* Purchase Price, Purchase Unit Prices, Sale Price, Sale Unit Prices: mobile = Purchase Price then Purchase Unit Prices then Sale then Sale Unit Prices; PC = side-by-side (do not remove order classes). */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="order-1 sm:order-1 space-y-4 border p-4 rounded-md">

                    <div className="space-y-2">
                          <FormLabel>Purchase Price</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                              <FormField control={form.control} name="isPurchasePriceTaxInclusive" render={({ field }: any) => (<FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="isPurchasePriceTaxInclusive"/></FormControl><label htmlFor="isPurchasePriceTaxInclusive" className="text-sm font-normal">Inclusive</label></FormItem>)} />
                              <FormField control={form.control} name="purchaseTaxId" render={({ field }: any) => (
                              <FormItem>
                                <Combobox
                                  options={taxOptions}
                                  value={field.value}
                                  onChange={(val) => {
                                    field.onChange(val || "");
                                  }}
                                  placeholder="Select Tax"
                                  triggerClassName="h-9"
                                />
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                          <FormField control={form.control} name="purchasePrice" render={({ field }: any) => (<FormItem><FormControl><Input type="number" placeholder="0.00" className="h-9" {...field} /></FormControl><FormMessage /></FormItem>)} />
                          <FormField control={form.control} name="purchasePriceUnit" render={({ field }: any) => (<FormItem><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="w-28 h-9"><SelectValue placeholder="Unit"/></SelectTrigger></FormControl><SelectContent>{allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      </div>
                </div>
                  <div className="order-3 sm:order-2 space-y-4 border p-4 rounded-md">

                      <div className="space-y-2">
                          <FormLabel>Sale Price</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                              <FormField control={form.control} name="isSalePriceTaxInclusive" render={({ field }: any) => (<FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="isSalePriceTaxInclusive"/></FormControl><label htmlFor="isSalePriceTaxInclusive" className="text-sm font-normal">Inclusive</label></FormItem>)} />
                              <FormField control={form.control} name="saleTaxId" render={({ field }: any) => (
                              <FormItem>
                                <Combobox
                                  options={taxOptions}
                                  value={field.value}
                                  onChange={(val) => {
                                    field.onChange(val || "");
                                  }}
                                  placeholder="Select Tax"
                                  triggerClassName="h-9"
                                />
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                        <FormField control={form.control} name="salePrice" render={({ field }: any) => (<FormItem className="flex-1"><FormControl><Input type="number" placeholder="0.00" className="h-9" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="salePriceUnit" render={({ field }: any) => (<FormItem><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="w-28 h-9"><SelectValue placeholder="Unit"/></SelectTrigger></FormControl><SelectContent>{allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    </div>
                </div>
                  <ScrollArea className="order-2 sm:order-3 w-full">

                      <div className="space-y-2 border p-4 rounded-md min-w-[500px]">
                          <FormLabel className="text-base font-semibold">Purchase Unit Prices</FormLabel>
                          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-x-2 gap-y-2 items-center pr-4">
                              <FormLabel>Unit</FormLabel>
                              <FormLabel className="text-right">Rate</FormLabel>
                              <FormLabel className="text-right">Tax</FormLabel>
                              <FormLabel className="text-right">Total</FormLabel>
                              {allUnits.map((unit) => (
                                  <React.Fragment key={`purchase-${unit}`}>
                                      <p className="font-medium text-sm">{unit}</p>
                                      <Input type="number" value={Number(unitPrices[unit]?.purchase).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                      <Input type="number" value={Number(unitPrices[unit]?.purchaseTax).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                      <Input type="number" value={Number(unitPrices[unit]?.purchase + unitPrices[unit]?.purchaseTax).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                  </React.Fragment>
                              ))}
                          </div>
                      </div>
                      <ScrollBar orientation="horizontal"/>
                  </ScrollArea>
                  <ScrollArea className="order-4 sm:order-4 w-full">

                      <div className="space-y-2 border p-4 rounded-md min-w-[500px]">
                          <FormLabel className="text-base font-semibold">Sale Unit Prices</FormLabel>
                          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-x-2 gap-y-2 items-center pr-4">
                              <FormLabel>Unit</FormLabel>
                              <FormLabel className="text-right">Rate</FormLabel>
                              <FormLabel className="text-right">Tax</FormLabel>
                              <FormLabel className="text-right">Total</FormLabel>
                              {allUnits.map((unit) => (
                                  <React.Fragment key={`sale-${unit}`}>
                                      <p className="font-medium text-sm">{unit}</p>
                                      <Input type="number" value={Number(unitPrices[unit]?.sale).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                      <Input type="number" value={Number(unitPrices[unit]?.saleTax).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                      <Input type="number" value={Number(unitPrices[unit]?.sale + unitPrices[unit]?.saleTax).toFixed(2) || '0.00'} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                                  </React.Fragment>
                              ))}
                          </div>
                      </div>
                      <ScrollBar orientation="horizontal"/>
                  </ScrollArea>
              </div>
              
              {/* Opening Stock first, then Opening Stock Summary below (do not revert to side-by-side). */}
              <div className="space-y-4">
                <div className="space-y-4 border p-4 rounded-md">
                  {/* Opening Stock container: horizontal scroll when fields overflow on small screens (do not remove overflow-x-auto). */}
                  <div className="w-full overflow-x-auto overflow-y-visible -mx-1 px-1">
                  <div className="min-w-[520px] space-y-4">

                  <div className="flex items-center gap-4">
                      <FormLabel className="text-base font-semibold">Opening Stock</FormLabel>
                      <FormField
                          control={form.control}
                          name="openingBalanceDate"
                          render={({ field }: any) => (
                              <FormItem className="flex items-center gap-2">
                                  <FormLabel>On Date</FormLabel>
                                  <div className="flex items-center gap-2">
                                  {(dateSystem === 'BS' || dateSystem === 'Both') && (
                                    <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} numberOfMonths={1} isRange={false} />
                                  )}
                                  {(dateSystem === 'AD' || dateSystem === 'Both') && (
                                    <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant={"outline"}
                                            className={cn("w-[180px] pl-3 text-left font-normal h-9", !field.value && "text-muted-foreground")}
                                          >
                                            {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsCalendarOpen(false); }} initialFocus />
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                  </div>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
                 <div className="grid grid-cols-5 gap-4 items-end">
                     <FormField
                        control={form.control}
                        name="openingBalance"
                        render={({ field }: any) => (
                        <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl><Input type="number" placeholder="0" className="h-9" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="openingBalanceUnit"
                        render={({ field }: any) => (
                        <FormItem>
                            <FormLabel>Unit</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Select Unit"/></SelectTrigger></FormControl>
                                <SelectContent>
                                    {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="openingBalanceRate"
                        render={({ field }: any) => (
                        <FormItem>
                            <FormLabel>Rate</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" className="h-9" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <div className="space-y-2">
                        <FormField control={form.control} name="isOpeningBalanceTaxInclusive" render={({ field }: any) => (<FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox id="isOpeningBalanceTaxInclusive" checked={field.value} onCheckedChange={field.onChange} /></FormControl><label htmlFor="isOpeningBalanceTaxInclusive" className="text-sm font-normal">Inclusive</label></FormItem>)} />
                        <FormField control={form.control} name="openingBalanceTaxId" render={({ field }: any) => (
                        <FormItem>
                           <FormLabel className="sr-only">Tax</FormLabel>
                           <Combobox
                             options={taxOptions}
                             value={field.value}
                             onChange={(val) => {
                               field.onChange(val || "");
                             }}
                             placeholder="Select Tax"
                             triggerClassName="h-9"
                           />
                           <FormMessage />
                        </FormItem>
                        )}/>
                    </div>
                    <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl><Input type="number" value={openingStockAmount.toFixed(2)} readOnly className="h-9 bg-muted"/></FormControl>
                    </FormItem>
                 </div>
                <div className="space-y-2 border p-4 rounded-md">

                      <FormLabel className="text-base font-semibold">Opening Stock Summary</FormLabel>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 items-center pr-4">
                        <FormLabel>Unit</FormLabel>
                        <FormLabel className="text-right">Quantity</FormLabel>
                          {Object.entries(openingStockByUnit).map(([unit, qty]) => (
                              <React.Fragment key={`stock-${unit}`}>
                                  <p className="font-medium text-sm">{unit}</p>
                                  <Input type="number" value={qty.toFixed(2)} readOnly className="h-9 bg-muted cursor-not-allowed text-right"/>
                              </React.Fragment>
                          ))}
                      </div>
                  </div>
              </div>
              </div>
              </div>
              </div>
              </div>

              <DialogFooter className="mt-4 border-t pt-4">
                  <DialogClose asChild>
                      <Button type="button" variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save &amp; New
                  </Button>
                  <Button type="submit" disabled={isLoading || !companyId}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Item
                  </Button>
              </DialogFooter>
            </form>
          </Form>

        </DialogContent>
      </Dialog>
      <CreateItemGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
      <CreateTaxDialog onTaxCreated={handleTaxCreated} isOpen={isCreateTaxOpen} onOpenChange={(open) => { if (!open) { setPrefillTaxName(""); taxFieldToApplyRef.current = null; } setIsCreateTaxOpen(open); }} prefillTaxName={prefillTaxName} />
    </React.Fragment>
  );
}

