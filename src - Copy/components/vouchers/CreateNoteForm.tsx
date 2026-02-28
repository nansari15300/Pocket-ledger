
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
import { Loader2, Trash2, CalendarIcon, PlusCircle, CheckCircle } from "lucide-react";
import { FilePreview } from "./FilePreview";
import { compressFile } from "@/lib/compression";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { Party } from "@/components/party/types";
import type { Account } from "@/components/bank-cash/types";
import type { Staff } from "@/components/staff/types";
import type { Tax } from "@/components/tax/types";
import type { Item } from "@/components/items/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { format, startOfDay } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { saveVoucher, isVoucherLimitError } from "@/lib/voucherActionsClient";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { toast as sonnerToast } from "sonner";
import { useVouchers } from "@/hooks/useVouchers";
import { useIsMobile } from "@/hooks/use-mobile";

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
    initialContext,
    initialEntityId,
    editingDisabled = false,
    showApproveButton = false,
    onApprove,
    isApproving = false,
}: { 
    voucher?: any, 
    onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void,
    initialContext?: string,
    initialEntityId?: string,
    editingDisabled?: boolean,
    showApproveButton?: boolean,
    onApprove?: () => void,
    isApproving?: boolean,
}) {
  const { user } = useAuth();
  const { company, companyId, triggerSync } = useCompany();
  const { toast } = useToast();
  const { dateSystem } = useDate();
  const { vouchers } = useVouchers();
  const { can, canPerformBackdatedAction, canEditRecord, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getInitialFormValues(voucher?.context || initialContext, voucher?.entityId || initialEntityId),
  });

  const selectedContext = form.watch("context");
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.note ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.note ?? false;

  const transactionDates = useMemo(() => {
    if (!vouchers?.length) return [];
    return vouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [vouchers]);

  const fetchVoucherNumber = useCallback(async () => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const VOUCHER_PREFIX = getVoucherPrefix(company.voucherPrefixes as Record<string, string[]> | undefined);
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "note"));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().voucherNumber as string);
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if (!numStr || !numStr.startsWith(VOUCHER_PREFIX)) return;
        const num = parseInt(numStr.slice(VOUCHER_PREFIX.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      form.setValue("voucherNumber", `${VOUCHER_PREFIX}${maxNum + 1}`);
    } catch (error) { console.error(error); }
  }, [companyId, company, form, isAutoVoucherEnabled]);

  useEffect(() => { if (!voucher?.id) fetchVoucherNumber(); }, [voucher?.id, fetchVoucherNumber]);

  useEffect(() => {
    if (voucher) {
        form.reset({
            ...voucher,
            date: voucher.date instanceof Date ? voucher.date : (voucher.date?.toDate ? voucher.date.toDate() : new Date()),
        });
        if (voucher.fileUrls) setFiles(voucher.fileUrls);
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
    ];
    return () => unsubFns.forEach(fn => fn());
  }, [companyId]);

  const getEntityOptions = () => {
    switch (selectedContext) {
      case "Party": return parties.map(p => ({ value: p.id, label: p.name }));
      case "Bank/Cash": return accounts.map(a => ({ value: a.id, label: a.accountName }));
      case "Staff": return staff.map(s => ({ value: s.id, label: s.name }));
      case "Tax": return taxes.map(t => ({ value: t.id, label: t.name }));
      case "Items": return items.map(i => ({ value: i.id, label: i.name }));
      default: return [];
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

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
        sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
        return;
    }
    onVoucherAction?.('saved', options.saveAndNew);
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: NoteFormValues, saveAndNew: boolean = false) {
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

        const result = await saveVoucher(companyId, user.uid, submissionData, voucher?.id);
        
        if (onVoucherAction && !saveAndNew) {
          onVoucherAction('saved', false, result?.id ?? undefined);
        }
        

        sonnerToast.success("Note Saved!", { id: toastId });
        triggerSync();

        if (saveAndNew) {
            form.reset(getInitialFormValues(initialContext, initialEntityId));
            setFiles([]);
            fetchVoucherNumber();
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

  return (
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="h-full flex flex-col">
        <ScrollArea className="flex-1 pr-6 -mr-6">
            <div className={cn(
              "space-y-4",
              isMobile ? "w-[calc(100%-4px)] mx-auto px-[2px]" : "px-[2px]"
            )}>
              {/* Voucher No. and Date */}
              {isMobile ? (
                <>
                  {/* Mobile: Voucher No. and Date - Same Row */}
                  <div className="flex gap-[2px] w-full">
                    <FormField 
                      control={form.control} 
                      name="voucherNumber" 
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col flex-1 min-w-0">
                          <FormLabel className="text-xs">Note No.</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              className="h-9 text-xs px-2" 
                              disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    <FormField 
                      control={form.control} 
                      name="date" 
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col flex-1 min-w-0">
                          <FormLabel className="text-xs">Date</FormLabel>
                          <div className={cn("flex gap-1 h-9 w-full", dateSystem === 'Both' && "gap-1")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <div className="flex-1 min-w-0">
                                <BsDatePicker 
                                  valueAD={field.value} 
                                  onChangeAD={(d) => { 
                                    if (d) d.setHours(12, 0, 0, 0);
                                    field.onChange(d as Date); 
                                    setIsCalendarOpen(false); 
                                  }} 
                                  isRange={false} 
                                  transactionDates={transactionDates}
                                  className="h-9 text-xs w-full"
                                />
                              </div>
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <div className="flex-1 min-w-0">
                                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                  <PopoverTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      className="h-9 pl-2 pr-2 text-left font-normal text-xs w-full"
                                    >
                                      {field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, "PP") : "Pick date"}
                                      <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
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
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                  </div>
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
                          <FormControl>
                            <Input 
                              {...field} 
                              className="h-10" 
                              disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} 
                            />
                          </FormControl>
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
                                    {field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, "PPP") : "Select Date"}
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
                        <FormItem><FormLabel>Link to</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select context" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Party">Party</SelectItem><SelectItem value="Bank/Cash">Bank/Cash Account</SelectItem><SelectItem value="Staff">Staff</SelectItem><SelectItem value="Tax">Tax</SelectItem><SelectItem value="Items">Items</SelectItem></SelectContent></Select></FormItem>
                     )} />
                    {selectedContext && (
                         <FormField control={form.control} name="entityId" render={({ field }: any) => (
                            <FormItem><FormLabel>Specific {selectedContext}</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger></FormControl><SelectContent>{getEntityOptions().map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></FormItem>
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
                          onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 ? () => setFiles(prev => prev.filter((_, i) => i !== idx)) : undefined}
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
        <div className={cn("border-t", isMobile ? "mt-[3px] pt-[3px] pb-[3px]" : "pt-4 flex flex-col md:flex-row justify-end gap-2 md:gap-4")}>
            {isMobile ? (
              <div className="grid grid-cols-3 gap-2 w-full [&_button]:h-10">
                <Button type="button" variant="outline" onClick={() => onVoucherAction?.('cancelled')} className="w-full">Cancel</Button>
                <Button type="submit" disabled={isLoading || editingDisabled} className="w-full">{isLoading ? "..." : "Save Note"}</Button>
                {showApproveButton && onApprove && (
                  <Button type="button" variant="default" onClick={onApprove} disabled={isApproving} className="w-full">{isApproving ? "..." : "Approve"}</Button>
                )}
              </div>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onVoucherAction?.('cancelled')} className="w-full md:w-auto h-10">Cancel</Button>
                <Button type="submit" disabled={isLoading || editingDisabled} className="w-full md:w-auto h-10">{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Note</Button>
                {showApproveButton && onApprove && (
                  <Button type="button" variant="default" onClick={onApprove} disabled={isApproving} className="w-full md:w-auto shrink-0 h-10">
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Approve
                  </Button>
                )}
              </>
            )}
        </div>
      </form>
    </Form>
  );
}
