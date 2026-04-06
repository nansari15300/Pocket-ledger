
"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDoc, collection, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, query, onSnapshot, where, getDocs } from "firebase/firestore";
import { firestore, storage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Loader2, Trash2, CalendarIcon, PlusCircle, CheckCircle, History, Printer } from "lucide-react";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { FilePreview } from "./FilePreview";
import { compressFile } from "@/lib/compression";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Combobox } from "../ui/combobox";
import type { Party } from "@/components/party/types";
import type { Account } from "@/components/bank-cash/types";
import type { Staff } from "@/components/staff/types";
import type { Tax } from "@/components/tax/types";
import type { Item } from "@/components/items/types";
import type { ExpenseAccount } from "@/components/expenses/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDate } from "@/hooks/useDate";
import { openPrintDirect } from "@/lib/printDirect";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { format, startOfDay } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { toast as sonnerToast } from "sonner";
import { useVouchers } from "@/hooks/useVouchers";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { CreateItemDialog } from "@/components/items/CreateItemDialog";
import { CreateExpenseAccountDialog } from "@/components/expenses/CreateExpenseAccountDialog";

const formSchema = z.object({
  voucherNumber: z.string().min(1, "Voucher number is required."),
  date: z.date(),
  title: z.string().min(2, { message: "Note title is required." }),
  content: z.string().optional(),
  context: z.string().min(1, "Please select a context."),
  entityId: z.string().min(1, "Please select a specific entity."),
});

type NoteFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>) => (prefixes?.note && prefixes.note[0]) || "NOTE-";
const MAX_FILE_SIZE_MB = 0.5;

function getInitialFormValues(initialContext?: string, initialEntityId?: string): NoteFormValues {
    return {
        voucherNumber: "",
        date: startOfDay(new Date()),
        title: "",
        content: "",
        context: initialContext || "",
        entityId: initialEntityId || "",
    };
}


export function CreateNoteForm({
    voucher,
    onVoucherAction,
    onOpenHistory,
    showHistoryButton,
    initialContext,
    initialEntityId,
    editingDisabled = false,
    showApproveButton = false,
    showSaveAndApproveOnCreate = false,
    onApprove,
    isApproving = false,
    compactFooter = false,
}: {
    voucher?: any,
    onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void,
    onOpenHistory?: () => void,
    showHistoryButton?: boolean,
    initialContext?: string,
    initialEntityId?: string,
    editingDisabled?: boolean,
    showApproveButton?: boolean,
    showSaveAndApproveOnCreate?: boolean,
    onApprove?: () => void,
    isApproving?: boolean,
    /** When true, hide History / Save & New / Save & Print / Delete (used in entity "Add a New Note for..." dialogs; keep full buttons in New Transaction → Note for edit) */
    compactFooter?: boolean,
}) {
  const { user, customUser } = useAuth();
  const { company, companyId, triggerSync } = useCompany();
  const { toast } = useToast();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const { vouchers } = useVouchers();
  const { can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  /** Edit dialog: AddVoucherDialog live Firestore snapshot har ~1s naya voucher object deta hai — same id + user ne edit shuru kiya ho to reset mat chalao */
  const syncedNoteVoucherIdRef = useRef<string | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  /** Delete confirmation open state (only used when !compactFooter i.e. New Transaction → Note) */
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  /** Specific entity combobox se "Add new" — search mein match na ho to bhi yahi dialogs (Payment In / Direct Income jaisa flow) */
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [isCreateBankOpen, setIsCreateBankOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  /** CreateTaxDialog prefillTaxName → CreateTaxForm name field (document event yahan use nahi) */
  const [taxCreatePrefillName, setTaxCreatePrefillName] = useState("");
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateIncomeAccountOpen, setIsCreateIncomeAccountOpen] = useState(false);
  const [isCreateExpenseAccountOpen, setIsCreateExpenseAccountOpen] = useState(false);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getInitialFormValues(voucher?.context || initialContext, voucher?.entityId || initialEntityId),
    mode: "onChange", // Run validation on change so Save enables when form is valid
  });

  const { isDirty: _isFormFieldsDirty, isValid: isFormValid } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f: unknown) => typeof f === "string") as string[];
    const newFiles = files.filter((f: unknown): f is File => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u, i) => u !== init[i]);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty;
  const selectedContext = form.watch("context");
  // Page-level Add Note dialogs always use compact footer for consistent button set.
  const isEntityAddNoteDialog = !voucher?.id && Boolean(initialContext) && Boolean(initialEntityId);
  // Compact footer removes Delete/History/Save&New/Save&Print and keeps only Cancel/Save/Save&Approve.
  const useCompactFooter = compactFooter || isEntityAddNoteDialog;
  // Role-based permission for Save & Approve button state.
  const canApproveTransactions = can("approve_transactions");
  // Entity Add Note create-flow should show Save & Approve consistently across all pages.
  const canShowCreateApproveButton = showSaveAndApproveOnCreate || isEntityAddNoteDialog;
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.note ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.note ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.note ?? false;
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.note || [getVoucherPrefix(company?.voucherPrefixes as Record<string, string[]> | undefined)], [company]);

  const transactionDates = useMemo(() => {
    if (!vouchers?.length) return [];
    return vouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [vouchers]);

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.note || [getVoucherPrefix(company.voucherPrefixes as Record<string, string[]> | undefined)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "note"));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().voucherNumber as string);
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if (!numStr || (!numStr.startsWith(normalizePrefix(VOUCHER_PREFIX)) && !numStr.startsWith(VOUCHER_PREFIX))) return;
        const num = parseVoucherNumberPart(numStr, VOUCHER_PREFIX);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      form.setValue("voucherNumber", formatVoucherNumber(VOUCHER_PREFIX, maxNum + 1));
      // Re-run validation so "Voucher number is required" clears and Save enables after auto number is set
      form.trigger();
    } catch (error) { console.error(error); }
  }, [companyId, company, form, isAutoVoucherEnabled]);

  useEffect(() => { if (!voucher?.id) fetchVoucherNumber(); }, [voucher?.id, fetchVoucherNumber]);

  // Run validation once when form mounts so Save/Save & Approve enable when required fields are pre-filled (e.g. from Income/Expense page)
  useEffect(() => {
    form.trigger();
  }, [form]);

  useEffect(() => {
    if (!voucher) {
      syncedNoteVoucherIdRef.current = undefined;
      return;
    }
    const vid = voucher.id as string | undefined;
    if (vid && syncedNoteVoucherIdRef.current === vid && form.formState.isDirty) {
      return;
    }
    syncedNoteVoucherIdRef.current = vid;

    form.reset({
      ...voucher,
      date: voucher.date instanceof Date ? voucher.date : (voucher.date?.toDate ? voucher.date.toDate() : new Date()),
    });
    if (voucher.fileUrls) {
      setFiles(voucher.fileUrls);
      initialFilesRef.current = Array.isArray(voucher.fileUrls) ? [...voucher.fileUrls] : [];
    } else {
      setFiles([]);
      initialFilesRef.current = [];
    }
  }, [voucher, form]);

  useEffect(() => {
    if (!companyId) return;
    const unsubFns = [
      onSnapshot(query(collection(firestore, `companies/${companyId}/parties`)), (snap) => setParties(snap.docs.map(d=>({id: d.id, ...d.data()} as Party)))),
      onSnapshot(query(collection(firestore, `companies/${companyId}/bank_accounts`)), (snap) => setAccounts(snap.docs.map(d=>({id: d.id, ...d.data()} as Account)))),
      onSnapshot(query(collection(firestore, `companies/${companyId}/staff`)), (snap) => setStaff(snap.docs.map(d=>({id: d.id, ...d.data()} as Staff)))),
      onSnapshot(query(collection(firestore, `companies/${companyId}/taxes`)), (snap) => setTaxes(snap.docs.map(d=>({id: d.id, ...d.data()} as Tax)))),
      onSnapshot(query(collection(firestore, `companies/${companyId}/items`)), (snap) => setItems(snap.docs.map(d=>({id: d.id, ...d.data()} as Item)))),
      onSnapshot(query(collection(firestore, `companies/${companyId}/expense_accounts`)), (snap) => setExpenseAccounts(snap.docs.map(d=>({id: d.id, ...d.data()} as ExpenseAccount)).filter((a: ExpenseAccount) => !(a as any).isDeleted))),
    ];
    return () => unsubFns.forEach(fn => fn());
  }, [companyId]);

  const getEntityOptions = useCallback(() => {
    switch (selectedContext) {
      case "Party": return parties.map(p => ({ value: p.id, label: p.name }));
      case "Bank/Cash": return accounts.map(a => ({ value: a.id, label: a.accountName }));
      case "Staff": return staff.map(s => ({ value: s.id, label: s.name }));
      case "Tax": return taxes.map(t => ({ value: t.id, label: t.name }));
      case "Items": return items.map(i => ({ value: i.id, label: i.name }));
      case "Income": return expenseAccounts.filter((a: ExpenseAccount) => a.type === "Income").map(a => ({ value: a.id, label: a.name }));
      case "Expense": return expenseAccounts.filter((a: ExpenseAccount) => (a.type === "Expense" || a.type === "Salary" || !a.type)).map(a => ({ value: a.id, label: a.name }));
      default: return [];
    }
  }, [selectedContext, parties, accounts, staff, taxes, items, expenseAccounts]);

  // Note → Specific entity Combobox: user ko typed filter dikhane ke liye context-specific placeholder
  const entityComboboxSearchPlaceholder = useMemo(() => {
    switch (selectedContext) {
      case "Party": return "Search party by name…";
      case "Bank/Cash": return "Search bank / cash account…";
      case "Staff": return "Search staff…";
      case "Tax": return "Search tax…";
      case "Items": return "Search item…";
      case "Income": return "Search income account…";
      case "Expense": return "Search expense account…";
      default: return "Search…";
    }
  }, [selectedContext]);

  // Combobox empty-state: "+ Add new …" label (context ke hisaab)
  const entityAddNewLabel = useMemo(() => {
    switch (selectedContext) {
      case "Party": return "+ Add New Party";
      case "Bank/Cash": return "+ Add New Account";
      case "Staff": return "+ Add New Staff";
      case "Tax": return "+ Add New Tax Ledger";
      case "Items": return "+ Add New Item";
      case "Income": return "+ Add New Income Account";
      case "Expense": return "+ Add New Expense Account";
      default: return undefined;
    }
  }, [selectedContext]);

  /** Search se kuch na mile / add-new row: naya entity banakar entityId set karo + prefill event (Create* forms sunte hain) */
  const openCreateEntityFromCombobox = useCallback(
    (newName?: string) => {
      const name = typeof newName === "string" ? newName : "";
      const fire = (event: string, detail: unknown) => {
        setTimeout(() => document.dispatchEvent(new CustomEvent(event, { detail })), 100);
      };
      switch (selectedContext) {
        case "Party":
          setIsCreatePartyOpen(true);
          fire("prefill-create-party-name", name);
          break;
        case "Bank/Cash":
          setIsCreateBankOpen(true);
          fire("prefill-create-bank-account-name", name);
          break;
        case "Staff":
          setIsCreateStaffOpen(true);
          fire("prefill-create-staff-name", name);
          break;
        case "Tax":
          setTaxCreatePrefillName(name);
          setIsCreateTaxOpen(true);
          break;
        case "Items":
          setIsCreateItemOpen(true);
          fire("prefill-create-item-name", { name, type: "item" });
          break;
        case "Income":
          setIsCreateIncomeAccountOpen(true);
          fire("prefill-create-expense-account-name", name);
          break;
        case "Expense":
          setIsCreateExpenseAccountOpen(true);
          fire("prefill-create-expense-account-name", name);
          break;
        default:
          break;
      }
    },
    [selectedContext]
  );

  // When Link to (context) changes, clear entityId if current value is not in the new options
  useEffect(() => {
    const opts = getEntityOptions();
    const currentId = form.getValues("entityId");
    if (currentId && opts.length > 0 && !opts.some((o: { value: string }) => o.value === currentId)) {
      form.setValue("entityId", "");
    }
  }, [selectedContext, getEntityOptions, form]);

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
            title: "File Still Too Large",
            description: `कम्प्रेस गर्दा पनि फाइल ${MAX_FILE_SIZE_MB}MB भन्दा ठुलो भयो।`,
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

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean; saveAndPrint?: boolean; approveAfterSave?: boolean } = {}) {
    e?.preventDefault?.();
    const isValid = await form.trigger();
    if (!isValid) {
        sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
        return;
    }
    onVoucherAction?.('saved', options.saveAndNew);
    await processAndSave(form.getValues(), options.saveAndNew, options.approveAfterSave ? onApprove : undefined, options.approveAfterSave, options.saveAndPrint);
  }

  async function processAndSave(values: NoteFormValues, saveAndNew: boolean = false, onSuccess?: () => void, approveAfterSave?: boolean, saveAndPrint?: boolean) {
    if (!user || !companyId) return;
    
    try {
      // Permission check: create or edit
      const isEdit = !!voucher?.id;
      const voucherDate = values.date instanceof Date ? values.date : new Date(values.date);
      
      if (isEdit) {
        // Check edit permission - determine ownership
        const fetchVoucher = async (cid: string, vid: string) => {
          const voucherDoc = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
          return voucherDoc.exists() ? voucherDoc.data() : null;
        };
        const isOwnRecord = await determineVoucherOwnership(voucher, voucher?.id || null, [], user.uid, companyId, fetchVoucher);
        assertCanEdit(canEditRecord, isOwnRecord);
        
        // Check backdate limit for edit - use ORIGINAL voucher date, not form date
        let originalVoucherDate = voucherDate;
        if (voucher?.date) {
          originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
        } else if (voucher?.id && companyId) {
          const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, voucher.id));
          if (voucherDoc.exists()) {
            const voucherData = voucherDoc.data();
            originalVoucherDate = voucherData.date?.toDate ? voucherData.date.toDate() : new Date(voucherData.date);
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
        sonnerToast.error("Permission Denied", { description: error.message });
      } else {
        sonnerToast.error("Error", { description: "Failed to check permissions." });
      }
      return;
    }
    
    const toastId = sonnerToast.loading("Saving note...");
    setIsLoading(true);

    try {
        const fileUrls = [...files.filter(f => typeof f === 'string')];
        const toUpload = files.filter(f => typeof f !== 'string') as File[];

        if (toUpload.length > 0) {
          const totalNewBytes = toUpload.reduce((s, f) => s + (f.size || 0), 0);
          const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
            setIsLoading(false);
            return;
          }
        }
        for (const file of toUpload) {
            const storageRef = ref(storage, `voucher-files/${companyId}/note/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            fileUrls.push(url);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
        }

        const options = getEntityOptions();
        const entityName = options.find(opt => opt.value === values.entityId)?.label || values.entityId;
        
        const submissionData = { 
          voucherNumber: values.voucherNumber,
          date: values.date,
          title: values.title,
          content: values.content || "",
          context: values.context,
          entityId: values.entityId,
          entityName: entityName,
          fileUrls: fileUrls,
          type: 'note',
          amount: 0
        };

        const isEdit = !!voucher?.id;
        const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
        const result = await saveVoucher(
          companyId,
          user.uid,
          submissionData,
          voucher?.id,
          approveAfterSave && isEdit ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
        );

        if (approveAfterSave && result?.id) {
          if (!isEdit) {
            await approveVoucherWithHistory(companyId, result.id, user.uid, approverName);
          }
          sonnerToast.success(isEdit ? "Note updated and approved." : "Note saved and approved.", { id: toastId });
        } else {
          sonnerToast.success(isEdit ? "Note updated!" : "Note Saved!", { id: toastId });
        }
        triggerSync();

        if (onVoucherAction && !saveAndNew) {
          onVoucherAction('saved', false, result?.id ?? undefined);
        }

        if (saveAndNew) {
            form.reset(getInitialFormValues(initialContext, initialEntityId));
            setFiles([]);
            fetchVoucherNumber();
        }

        onSuccess?.();

        // Save & Print: open print preview with this note as custom content
        if (saveAndPrint && result?.id && company) {
          const noteDate = values.date instanceof Date ? values.date : new Date(values.date);
          const dateStr = dateSystem === "Both" ? `${formatDateBS(noteDate)} / ${formatDate(noteDate)}` : (dateSystem === "BS" ? formatDateBS(noteDate) : formatDate(noteDate));
          openPrintDirect({
            company: { name: company.name, pan: company.pan, phone: company.phone, address: company.address, logoUrl: company.logoUrl },
            title: `Note: ${values.voucherNumber}`,
            context: "daybook",
            dateSystem: dateSystem as "AD" | "BS" | "Both",
            dateRangeText: dateStr,
            vouchersCount: 1,
            openingBalance: 0,
            transactions: [],
            customContent: [
              { text: "Note", fontSize: 14, bold: true, margin: [0, 0, 0, 8] },
              {
                table: {
                  body: [
                    ["Note No.", values.voucherNumber],
                    ["Date", dateStr],
                    ["Title", values.title || "—"],
                    ["Link to", values.context || "—"],
                    ["Entity", entityName || "—"],
                    ["Details", (values.content || "—") as string],
                  ],
                  widths: [100, "*"],
                },
              },
            ],
          }, true);
        }
    } catch (err) {
        if (err instanceof PermissionDeniedError) {
          sonnerToast.error("Permission Denied", { id: toastId, description: err.message });
        } else if (isVoucherLimitError(err)) {
          sonnerToast.error("Voucher limit reached", { id: toastId, description: err.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
        } else {
          sonnerToast.error("Save failed", { id: toastId });
        }
    } finally {
        setIsLoading(false);
    }
  }

  /** Soft-delete note (move to bin). Used only when !compactFooter; enabled in edit when canDeleteVoucher. */
  const handleDelete = async () => {
    if (!voucher?.id || !companyId || !user) return;
    try {
      assertCan(can, "delete_records");
      if (!canDeleteVoucher(voucher)) {
        sonnerToast.error("Permission Denied", { description: "You cannot delete this voucher." });
        return;
      }
      const voucherDate = voucher?.date?.toDate ? voucher.date.toDate() : (voucher?.date ? new Date(voucher.date) : new Date());
      assertCanPerformBackdated(canPerformBackdatedAction, "delete", voucherDate);
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { description: err.message });
      } else {
        sonnerToast.error("Error", { description: "Failed to check permissions." });
      }
      return;
    }
    setIsLoading(true);
    try {
      await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, voucher.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.uid,
      });
      sonnerToast.success("Note moved to bin.");
      onVoucherAction?.("cancelled");
      triggerSync();
    } catch (err) {
      console.error("Error deleting note:", err);
      sonnerToast.error("Error", { description: "Failed to delete note." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="h-full flex flex-col min-w-0 w-full max-w-full">
        <ScrollArea className={cn("flex-1 min-h-0 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className={cn(
              "space-y-4 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
              isMobile ? "" : "px-[2px]"
            )}>
              {/* Voucher No. and Date */}
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Note No. + Date(s) in one row, 2/3/4 equal-sized boxes */}
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
                                      <FormLabel className="text-xs truncate">Note No.</FormLabel>
                                      <FormControl>
                                        <Input {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
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
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                          <PopoverTrigger asChild>
                                            <FormControl>
                                              <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")}>
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
                          <FormLabel>Note No.</FormLabel>
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
                                  <Button 
                                    variant="outline" 
                                    className="h-10 pl-3 text-left font-normal"
                                  >
                                    {field.value instanceof Date && !isNaN(field.value.getTime()) ? formatDate(field.value) : "Select Date"}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
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
                <FormField control={form.control} name="title" render={({ field }: any) => (<FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="Note title" {...field} /></FormControl></FormItem>)} />
                <div className="grid grid-cols-2 gap-4">
                     <FormField control={form.control} name="context" render={({ field }: any) => (
                        <FormItem><FormLabel>Link to</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select context" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Party">Party</SelectItem><SelectItem value="Bank/Cash">Bank/Cash Account</SelectItem><SelectItem value="Staff">Staff</SelectItem><SelectItem value="Tax">Tax</SelectItem><SelectItem value="Items">Items</SelectItem><SelectItem value="Income">Income</SelectItem><SelectItem value="Expense">Expense</SelectItem></SelectContent></Select></FormItem>
                     )} />
                    {selectedContext && (
                         <FormField control={form.control} name="entityId" render={({ field }: any) => (
                            <FormItem>
                              <FormLabel>Specific {selectedContext}</FormLabel>
                              {/* Combobox + filter: Dialog ke andar popoverModal=false taaki search input focus / list filter sahi kaam kare */}
                              <FormControl>
                                <Combobox
                                  options={getEntityOptions()}
                                  value={field.value}
                                  onChange={(id, newName) => {
                                    if (id === "add-new") {
                                      openCreateEntityFromCombobox(newName);
                                      return;
                                    }
                                    field.onChange(id);
                                  }}
                                  placeholder="Select entity"
                                  searchPlaceholder={entityComboboxSearchPlaceholder}
                                  addNewLabel={entityAddNewLabel}
                                  disabled={editingDisabled}
                                  contentWidthMode="auto"
                                  popoverModal={false}
                                  autoFocusSearchOnOpen
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                         )} />
                    )}
                </div>
                <FormField control={form.control} name="content" render={({ field }: any) => (<FormItem><FormLabel>Details</FormLabel><FormControl><Textarea placeholder="Details..." {...field} rows={6} /></FormControl></FormItem>)} />
                <div className="space-y-2">
                  <FormLabel>Attachments</FormLabel>
                  <RestrictedFileUploader>
                    <div className="flex flex-wrap gap-4">
                      {files.map((file, idx) => (
                        <FilePreview 
                          key={idx} 
                          file={file} 
                          onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== idx)) : undefined}
                          className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                        />
                      ))}
                      {allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                        <div 
                          className={cn(
                            "w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors",
                            allowAttachments && fileAttachmentLimits.maxFileCount > 0
                              ? "cursor-pointer hover:border-primary"
                              : "cursor-not-allowed opacity-50"
                          )}
                          onClick={() => {
                            if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                              fileInputRef.current?.click();
                            }
                          }}
                        >
                          <PlusCircle className="h-6 w-6 text-muted-foreground" />
                          <span className="text-[10px] mt-1">Add File</span>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
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
                </div>
            </div>
        </ScrollArea>
        <div className={cn("border-t min-w-0 max-w-full overflow-x-hidden shrink-0 bg-background", isMobile ? "mt-[3px] pt-[3px] pb-[max(6px,env(safe-area-inset-bottom,0px))]" : "pt-4 flex flex-col md:flex-row items-stretch md:items-center gap-4", !isMobile && useCompactFooter && "justify-end", !isMobile && !useCompactFooter && "justify-between")}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full min-w-0", VOUCHER_BUTTONS_CLASS)}>
                {!useCompactFooter && (
                  <>
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="w-full" disabled={!voucher?.id || editingDisabled || (!!voucher && !canDeleteVoucher(voucher))}>Delete</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>This will move the note to the recycle bin.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS, (!voucher || !showHistoryButton || !onOpenHistory) && "opacity-60")}>History</Button>
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading || editingDisabled || !isFormValid} className={cn("w-full", BTN_SAVE_NEW_CLASS)}>Save & New</Button>
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndPrint: true })} disabled={isLoading || editingDisabled || !isFormValid} className={cn("w-full", BTN_PRINT_CLASS)}>Save & Print</Button>
                  </>
                )}
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>Cancel</Button>
                {voucher?.id ? (
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>{isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}</Button>
                ) : canShowCreateApproveButton ? (
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={!canApproveTransactions || isLoading || editingDisabled || !isFormValid} className={cn("w-full", BTN_APPROVE_CLASS)}>{isLoading ? "..." : "Save & Approve"}</Button>
                ) : (
                  <Button type="button" disabled className="w-full bg-muted text-muted-foreground border-0 opacity-50">—</Button>
                )}
                <Button type="submit" disabled={isLoading || editingDisabled || !isFormValid} className={cn("w-full", BTN_SAVE_CLASS)}>{isLoading ? "..." : "Save"}</Button>
              </div>
            ) : (
              <>
                {!useCompactFooter && (
                  <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="shrink-0 rounded-full" disabled={!voucher?.id || editingDisabled || (!!voucher && !canDeleteVoucher(voucher))}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>This will move the note to the recycle bin.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Move to Bin</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !showHistoryButton || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS, (!voucher || !showHistoryButton || !onOpenHistory) && "opacity-60")}>
                      <History className="mr-2 h-4 w-4" /> History
                    </Button>
                  </div>
                )}
                <div className={cn("flex gap-2 justify-end flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>Cancel</Button>
                  {!useCompactFooter && <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading || editingDisabled || !isFormValid} className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>Save & New</Button>}
                  {!useCompactFooter && <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndPrint: true })} disabled={isLoading || editingDisabled || !isFormValid} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}><Printer className="mr-2 h-4 w-4" /> Save & Print</Button>}
                  <Button type="submit" disabled={isLoading || editingDisabled || !isFormValid} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
                  {voucher?.id ? (
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                      {isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={!canShowCreateApproveButton || !canApproveTransactions || isLoading || editingDisabled || !isFormValid} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & Approve
                    </Button>
                  )}
                </div>
              </>
            )}
        </div>
      </form>
    </Form>

    <CreatePartyDialog
      isOpen={isCreatePartyOpen}
      onOpenChange={setIsCreatePartyOpen}
      onPartyCreated={(id) => {
        setIsCreatePartyOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    />
    <CreateBankAccountDialog
      isOpen={isCreateBankOpen}
      onOpenChange={setIsCreateBankOpen}
      onAccountCreated={(id) => {
        setIsCreateBankOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    />
    <CreateStaffDialog
      isOpen={isCreateStaffOpen}
      onOpenChange={setIsCreateStaffOpen}
      onStaffCreated={(id) => {
        setIsCreateStaffOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
      groups={[]}
    >
      <span className="hidden" />
    </CreateStaffDialog>
    <CreateTaxDialog
      isOpen={isCreateTaxOpen}
      onOpenChange={(open) => {
        setIsCreateTaxOpen(open);
        if (!open) setTaxCreatePrefillName("");
      }}
      prefillTaxName={taxCreatePrefillName}
      onTaxCreated={(id) => {
        setIsCreateTaxOpen(false);
        setTaxCreatePrefillName("");
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    />
    <CreateItemDialog
      isOpen={isCreateItemOpen}
      onOpenChange={setIsCreateItemOpen}
      defaultType="item"
      onItemCreated={(id) => {
        setIsCreateItemOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    >
      <span className="hidden" />
    </CreateItemDialog>
    <CreateExpenseAccountDialog
      isOpen={isCreateIncomeAccountOpen}
      onOpenChange={setIsCreateIncomeAccountOpen}
      defaultGroupType="income"
      onExpenseAccountCreated={(id) => {
        setIsCreateIncomeAccountOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    >
      <span className="hidden" />
    </CreateExpenseAccountDialog>
    <CreateExpenseAccountDialog
      isOpen={isCreateExpenseAccountOpen}
      onOpenChange={setIsCreateExpenseAccountOpen}
      defaultGroupType="expense"
      onExpenseAccountCreated={(id) => {
        setIsCreateExpenseAccountOpen(false);
        form.setValue("entityId", id);
        void form.trigger("entityId");
      }}
    >
      <span className="hidden" />
    </CreateExpenseAccountDialog>
    </>
  );
}
