"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CheckCircle, History, Loader2, PlusCircle, Printer, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { type Resolver, useForm } from "react-hook-form";
import { startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { firestore } from "@/lib/firebase";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { useToast } from "@/hooks/use-toast";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { assertCan, assertCanPerformBackdated, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { getNextVoucherNumberForCompany } from "@/lib/nextVoucherNumber";
import { saveVoucher, softDeleteVoucherMoveToRecycleBin } from "@/lib/voucherActionsClient";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { cn } from "@/lib/utils";
import {
  BTN_APPROVE_CLASS,
  BTN_CANCEL_CLASS,
  BTN_HISTORY_CLASS,
  BTN_PRINT_CLASS,
  BTN_SAVE_CLASS,
  BTN_SAVE_NEW_CLASS,
  VOUCHER_BUTTONS_CLASS,
} from "@/components/vouchers/voucherButtonStyles";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { VoucherPdfAsImageToggle } from "@/components/vouchers/VoucherPdfAsImageToggle";
import {
  appendCompressedVoucherAttachmentsToState,
  handleVoucherAttachmentInputChange,
} from "@/lib/appendCompressedVoucherAttachments";
import {
  convertPdfAttachmentsToJpegIfEnabled,
  shouldSuggestPdfAsImage,
} from "@/lib/voucherAttachmentPdfAsImage";
import { voucherAttachmentUrlsForFormState } from "@/lib/voucherAttachmentNormalize";

type AdjustmentTarget = {
  id: string;
  entityType: "party" | "staff" | "account" | "expense" | "tax";
  name: string;
};

const schema = z.object({
  voucherNumber: z.string().min(1, "Voucher number is required."),
  date: z.date({ message: "Date is required." }),
  direction: z.enum(["increase", "decrease"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  narration: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function adjustmentBankCashMasterSuffix(account: { accountType?: string | null }): string {
  return account.accountType === "Cash" ? "Cash" : "Bank";
}

function adjustmentBankCashMasterLabel(account: { accountName?: string; name?: string; accountType?: string | null }): string {
  const name = account.accountName || account.name || "Account";
  return `${name} (${adjustmentBankCashMasterSuffix(account)})`;
}

function isAdjustmentSystemExpenseAccount(account: { name?: string; isSystemAccount?: boolean }): boolean {
  return account.isSystemAccount === true || String(account.name || "").trim().toLowerCase() === "adjustment";
}

async function ensureAdjustmentExpenseAccount(companyId: string, existing: Array<{ id: string; name?: string; type?: string }>) {
  const found = existing.find((a) => String(a.name || "").trim().toLowerCase() === "adjustment");
  if (found?.id) return found.id;

  try {
    const q = query(collection(firestore, `companies/${companyId}/expense_accounts`), where("name", "==", "Adjustment"));
    const snap = await getDocs(q);
    const doc0 = snap.docs[0];
    if (doc0?.id) return doc0.id;
  } catch {
    /* local/offline fallback below */
  }

  const ref = doc(collection(firestore, `companies/${companyId}/expense_accounts`));
  const payload = {
    id: ref.id,
    companyId,
    name: "Adjustment",
    type: "Expense",
    groupId: "ungrouped_expense",
    openingBalance: 0,
    debit: 0,
    credit: 0,
    balance: 0,
    isSystemAccount: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch {
    /* offline queue still keeps it available */
  }
  await upsertCompanyDocInBrowserDb(companyId, "expense_accounts", ref.id, { ...payload, createdAt: new Date(), updatedAt: new Date() });
  await enqueueCompanyDocOutbox(companyId, "expense_accounts", "create", ref.id, { ...payload, createdAt: new Date(), updatedAt: new Date() });
  return ref.id;
}

export function CreateAdjustmentForm({
  voucher,
  defaultVoucherData,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
  recurringVoucherSaveBlocked = false,
  recurringVoucherAuxiliaryDirty = false,
}: {
  voucher?: any;
  defaultVoucherData?: any;
  onVoucherAction?: (status: "saved" | "cancelled", isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  recurringVoucherSaveBlocked?: boolean;
  recurringVoucherAuxiliaryDirty?: boolean;
}) {
  const { user, customUser } = useAuth();
  const { toast: uiToast } = useToast();
  const { companyId, company } = useCompany();
  const { dateSystem, formatDate } = useDate();
  const { can, canPerformBackdatedAction, canDeleteVoucher, allowAttachments, fileAttachmentLimits } = usePermissions();
  const {
    processedPartiesForSelection,
    processedStaff,
    processedAccounts,
    processedExpenseAccounts,
    processedTaxes,
  } = useVouchers();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [files, setFiles] = useState<(File | string)[]>(() =>
    voucherAttachmentUrlsForFormState(voucher)
  );
  const [savePdfAsImage, setSavePdfAsImage] = useState(() =>
    shouldSuggestPdfAsImage(voucherAttachmentUrlsForFormState(voucher))
  );
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const lastResetVoucherIdRef = useRef<string | null>(null);
  const initialFilesRef = React.useRef<string[]>(
    voucherAttachmentUrlsForFormState(voucher).filter((f): f is string => typeof f === "string")
  );
  const seedTarget = (defaultVoucherData?.adjustmentTarget || voucher?.adjustmentTarget) as AdjustmentTarget | undefined;
  const [selectedTarget, setSelectedTarget] = useState<AdjustmentTarget | null>(seedTarget?.id ? seedTarget : null);
  const initialTargetRef = React.useRef<AdjustmentTarget | null>(seedTarget?.id ? seedTarget : null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      voucherNumber: voucher?.voucherNumber || "",
      date: voucher?.date?.toDate ? voucher.date.toDate() : (voucher?.date ? new Date(voucher.date) : startOfDay(new Date())),
      direction: voucher?.adjustmentDirection === "decrease" ? "decrease" : "increase",
      amount: Number(voucher?.total || voucher?.amount || 0) || 0,
      narration: voucher?.narration || "",
    },
  });

  useEffect(() => {
    if (!companyId || form.getValues("voucherNumber")) return;
    void getNextVoucherNumberForCompany({
      companyId,
      companyDoc: company as any,
      voucherLike: { type: "adjustment" },
    }).then((n) => form.setValue("voucherNumber", n));
  }, [companyId, company, form]);

  useEffect(() => {
    const next = (defaultVoucherData?.adjustmentTarget || voucher?.adjustmentTarget) as AdjustmentTarget | undefined;
    if (!next?.id) return;
    setSelectedTarget(next);
    initialTargetRef.current = next;
  }, [voucher?.id, voucher?.adjustmentTarget, defaultVoucherData?.adjustmentTarget]);

  const masterAccountsWithEntity = useMemo(() => {
    const parts: { value: string; label: string; nameOnly: string; balance?: number; entityType: AdjustmentTarget["entityType"] }[] = [];
    (processedPartiesForSelection || []).forEach((p: any) =>
      parts.push({ value: p.id, label: `${p.name} (Party)`, nameOnly: p.name, balance: p.balance, entityType: "party" })
    );
    (processedStaff || []).forEach((s: any) =>
      parts.push({ value: s.id, label: `${s.name} (Staff)`, nameOnly: s.name, balance: s.balance, entityType: "staff" })
    );
    (processedAccounts || []).forEach((a: any) =>
      parts.push({
        value: a.id,
        label: adjustmentBankCashMasterLabel(a),
        nameOnly: a.accountName || a.name || "Account",
        balance: a.balance,
        entityType: "account",
      })
    );
    (processedExpenseAccounts || []).forEach((a: any) => {
      if (isAdjustmentSystemExpenseAccount(a)) return;
      parts.push({
        value: a.id,
        label: `${a.name || "Expense"} (Expense)`,
        nameOnly: a.name || "Expense",
        balance: (a as any).balance,
        entityType: "expense",
      });
    });
    (processedTaxes || []).forEach((t: any) =>
      parts.push({
        value: t.id,
        label: `${t.name || "Tax"} (Tax)`,
        nameOnly: t.name || "Tax",
        balance: (t as any).balance,
        entityType: "tax",
      })
    );
    return parts.sort((a, b) => a.label.localeCompare(b.label));
  }, [processedPartiesForSelection, processedStaff, processedAccounts, processedExpenseAccounts, processedTaxes]);

  const masterAccountOptions = useMemo(
    () => masterAccountsWithEntity.map(({ value, label, balance }) => ({ value, label, balance })),
    [masterAccountsWithEntity]
  );

  const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f): f is string => typeof f === "string");
    const newFiles = files.filter((f): f is File => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u, i) => u !== init[i]);
  })();
  const _isTargetDirty =
    String(selectedTarget?.id || "") !== String(initialTargetRef.current?.id || "") ||
    String(selectedTarget?.entityType || "") !== String(initialTargetRef.current?.entityType || "");
  const isFormDirty = _isFormFieldsDirty || _isFileDirty || _isTargetDirty || recurringVoucherAuxiliaryDirty;

  useEffect(() => {
    const NEW_ADJUSTMENT = "__new_adjustment__";
    if (!voucher) {
      lastResetVoucherIdRef.current = null;
      return;
    }
    const vid = voucher.id as string | undefined;
    if (vid) {
      if (lastResetVoucherIdRef.current === vid) return;
      lastResetVoucherIdRef.current = vid;
      setSavedVoucherId(vid);
      const urls = voucherAttachmentUrlsForFormState(voucher);
      setFiles(urls);
      initialFilesRef.current = urls.filter((f): f is string => typeof f === "string");
      setSavePdfAsImage(shouldSuggestPdfAsImage(urls));
      form.reset({
        voucherNumber: voucher.voucherNumber || "",
        date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
        direction: voucher.adjustmentDirection === "decrease" ? "decrease" : "increase",
        amount: Number(voucher.total || voucher.amount || 0) || 0,
        narration: voucher.narration || "",
      });
    } else {
      if (lastResetVoucherIdRef.current === NEW_ADJUSTMENT && isFormDirty) return;
      const isFirstNewHydrate = lastResetVoucherIdRef.current !== NEW_ADJUSTMENT;
      lastResetVoucherIdRef.current = NEW_ADJUSTMENT;
      setSavedVoucherId(null);
      if (isFirstNewHydrate) {
        const urls = voucherAttachmentUrlsForFormState(voucher);
        setFiles(urls);
        initialFilesRef.current = urls.filter((f): f is string => typeof f === "string");
        setSavePdfAsImage(shouldSuggestPdfAsImage(urls));
      }
    }
  }, [voucher, form, isFormDirty]);

  const attachmentClientFileUrlsForPreview = useMemo(
    () => files.filter((f): f is string => typeof f === "string"),
    [files]
  );

  const direction = form.watch("direction");
  const targetSide = direction === "increase" ? "Dr" : "Cr";
  const adjustmentSide = direction === "increase" ? "Cr" : "Dr";

  const saveAdjustment = async (
    data: FormValues,
    saveAndNew = false,
    approveAfterSave = false,
    printAfter = false,
    onSuccess?: () => void
  ) => {
    if (!companyId || !user?.uid) {
      toast.error("Company or user missing.");
      return;
    }
    if (!selectedTarget?.id) {
      toast.error("Please select an account.");
      return;
    }
    if (!can(voucher?.id ? "edit_adjustment_voucher" : "add_adjustment_voucher")) {
      toast.error("You do not have permission for adjustment vouchers.");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading("Saving adjustment...");
    try {
      const adjustmentExpenseId = await ensureAdjustmentExpenseAccount(companyId, processedExpenseAccounts as any[]);
      const amount = Number(data.amount) || 0;
      const increase = data.direction === "increase";
      const entries = increase
        ? [
            { accountId: selectedTarget.id, debit: amount, credit: 0 },
            { accountId: adjustmentExpenseId, debit: 0, credit: amount },
          ]
        : [
            { accountId: adjustmentExpenseId, debit: amount, credit: 0 },
            { accountId: selectedTarget.id, debit: 0, credit: amount },
          ];
      const approverName = customUser?.displayName || user.displayName || user.email || user.uid;
      const filesForSave = savePdfAsImage ? await convertPdfAttachmentsToJpegIfEnabled(files, true) : files;
      const fileUrls = filesForSave.filter((f): f is string => typeof f === "string");
      const newFiles = filesForSave.filter((f): f is File => f instanceof File);
      for (const file of newFiles) {
        const storageRef = ref(storage, `voucher-files/${companyId}/adjustment/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        fileUrls.push(await getDownloadURL(snapshot.ref));
      }
      const saved = await saveVoucher(
        companyId,
        user.uid,
        {
          type: "adjustment",
          voucherNumber: data.voucherNumber,
          date: data.date.toISOString(),
          total: amount,
          amount,
          narration: data.narration || "",
          adjustmentDirection: data.direction,
          adjustmentTarget: selectedTarget,
          adjustmentExpenseAccountId: adjustmentExpenseId,
          entries,
          fileUrls,
        },
        voucher?.id,
        approveAfterSave ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
      );
      setSavedVoucherId(saved.id);
      initialFilesRef.current = fileUrls;
      initialTargetRef.current = selectedTarget;
      setFiles(fileUrls);
      setSavePdfAsImage(shouldSuggestPdfAsImage(fileUrls));
      toast.success("Adjustment saved.", { id: toastId, duration: 1200 });
      if (printAfter && typeof window !== "undefined") {
        window.setTimeout(() => window.print(), 250);
      }
      if (saveAndNew) {
        form.reset({ ...form.getValues(), amount: 0, narration: "" });
        setFiles([]);
        initialFilesRef.current = [];
      } else {
        form.reset(data);
      }
      if (approveAfterSave && voucher?.id) onSuccess?.();
      else if (!approveAfterSave) onSuccess?.();
      onVoucherAction?.("saved", saveAndNew, saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Adjustment save failed.", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (
    e?: React.FormEvent,
    options: { saveAndNew?: boolean; approveAfterSave?: boolean; print?: boolean } = {}
  ) => {
    e?.preventDefault();
    void form.handleSubmit((data) =>
      saveAdjustment(
        data,
        options.saveAndNew ?? false,
        options.approveAfterSave ?? false,
        options.print ?? false,
        options.approveAfterSave ? onApprove : undefined
      )
    )();
  };

  const handleDelete = async () => {
    const voucherIdToDelete = savedVoucherId || voucher?.id || null;
    if (!voucherIdToDelete || !companyId || !user?.uid) return;
    try {
      assertCan(can, "delete_records");
      if (!canDeleteVoucher(voucher)) {
        toast.error("You do not have permission to delete this voucher.");
        return;
      }
      const voucherDate = voucher?.date?.toDate
        ? voucher.date.toDate()
        : voucher?.date
          ? new Date(voucher.date)
          : new Date();
      assertCanPerformBackdated(canPerformBackdatedAction, "delete", voucherDate);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to check permissions.");
      }
      return;
    }
    setIsLoading(true);
    try {
      await softDeleteVoucherMoveToRecycleBin(companyId, voucherIdToDelete, user.uid);
      toast.success("Adjustment moved to bin.");
      onVoucherAction?.("cancelled", false, savedVoucherId || undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete adjustment.");
    } finally {
      setIsLoading(false);
    }
  };

  const canSaveAdjustment = can(voucher?.id ? "edit_adjustment_voucher" : "add_adjustment_voucher");
  const canAddMoreFiles = allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount;
  const showPdfAsImageToggle =
    allowAttachments &&
    fileAttachmentLimits.maxFileCount > 0 &&
    (fileAttachmentLimits.allowPDF || shouldSuggestPdfAsImage(files));
  const attachFileInputId = React.useId();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleVoucherAttachmentInputChange(e, {
      currentFiles: files,
      maxFiles: fileAttachmentLimits.maxFileCount || 0,
      allowImage: fileAttachmentLimits.allowImage,
      allowPDF: fileAttachmentLimits.allowPDF,
      setFiles,
      toast: uiToast,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border bg-white p-3 text-sm">
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground">Account</FormLabel>
              <div className="mt-1 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Combobox
                    options={masterAccountOptions}
                    value={selectedTarget?.id || ""}
                    onChange={(value) => {
                      const acc = masterAccountsWithEntity.find((a) => a.value === value);
                      if (!acc) return;
                      setSelectedTarget({
                        id: acc.value,
                        entityType: acc.entityType,
                        name: acc.nameOnly,
                      });
                    }}
                    placeholder="Select account"
                    searchPlaceholder="Search party, staff, bank, expense, tax..."
                    disabled={editingDisabled}
                    highlightBalanceInOptions
                    popoverModal={false}
                    autoFocusSearchOnOpen
                  />
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", targetSide === "Dr" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                  {targetSide}
                </span>
              </div>
            </FormItem>
          </div>
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs font-medium text-muted-foreground">Adjustment</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-semibold">Adjustment</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", adjustmentSide === "Dr" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                {adjustmentSide}
              </span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField control={form.control} name="voucherNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>Voucher No.</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <div className="grid gap-2 md:grid-cols-2">
                {(dateSystem === "BS" || dateSystem === "Both") && (
                  <BsDatePicker valueAD={field.value} onChangeAD={(d) => d && field.onChange(d)} isRange={false} className="h-10 w-full" />
                )}
                {(dateSystem === "AD" || dateSystem === "Both") && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : "Pick AD date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={field.value} onSelect={(d) => d && field.onChange(d)} initialFocus />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="amount" render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="direction" render={({ field }) => (
          <FormItem>
            <FormLabel>Adjustment Type</FormLabel>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
                <Checkbox checked={field.value === "increase"} onCheckedChange={() => field.onChange("increase")} />
                <ArrowUp className="h-4 w-4 text-green-600" /> Increase
              </label>
              <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
                <Checkbox checked={field.value === "decrease"} onCheckedChange={() => field.onChange("decrease")} />
                <ArrowDown className="h-4 w-4 text-red-600" /> Decrease
              </label>
            </div>
            <FormMessage />
          </FormItem>
        )} />
        <div className="rounded-lg border border-indigo-300/80 bg-indigo-50 p-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormItem>
              <FormLabel>Attach Files (Optional)</FormLabel>
              {showPdfAsImageToggle ? (
                <VoucherPdfAsImageToggle
                  id="voucher-save-pdf-as-image-adjustment"
                  checked={savePdfAsImage}
                  onCheckedChange={setSavePdfAsImage}
                  disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                  className="mb-2"
                />
              ) : null}
              <RestrictedFileUploader>
                <div className="flex flex-wrap gap-4">
                  {files.map((file, index) => (
                    <FilePreview
                      key={`${typeof file === "string" ? file : file.name}-${index}`}
                      file={file}
                      attachmentClientFileUrls={attachmentClientFileUrlsForPreview}
                      onRemove={
                        allowAttachments && fileAttachmentLimits.allowDelete
                          ? () => setFiles((prev) => prev.filter((_, i) => i !== index))
                          : undefined
                      }
                      className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                    />
                  ))}
                  {canAddMoreFiles ? (
                    <>
                      <AttachmentHoldPasteSurface
                        enabled={canAddMoreFiles}
                        onShortActivate={() => fileInputRef.current?.click()}
                        onPastedFiles={(incoming) =>
                          void appendCompressedVoucherAttachmentsToState({
                            incomingFiles: incoming,
                            currentFiles: files,
                            maxFiles: fileAttachmentLimits.maxFileCount || 0,
                            allowImage: fileAttachmentLimits.allowImage,
                            allowPDF: fileAttachmentLimits.allowPDF,
                            setFiles,
                            toast: uiToast,
                          })
                        }
                        voucherAttachmentReuse={{ currentFiles: files, setFiles, maxFiles: fileAttachmentLimits.maxFileCount }}
                        className="relative flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary"
                      >
                        <PlusCircle className="h-6 w-6" />
                        <span className="mt-1 text-xs">Add File</span>
                      </AttachmentHoldPasteSurface>
                      <Input
                        id={attachFileInputId}
                        type="file"
                        className="sr-only"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={
                          [fileAttachmentLimits.allowImage ? "image/*" : "", fileAttachmentLimits.allowPDF ? "application/pdf" : ""]
                            .filter(Boolean)
                            .join(",") || "image/*,application/pdf"
                        }
                        multiple={fileAttachmentLimits.maxFileCount > 1}
                      />
                    </>
                  ) : null}
                </div>
              </RestrictedFileUploader>
            </FormItem>
            <FormField control={form.control} name="narration" render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Narration</FormLabel>
                <FormControl><Textarea className="min-h-[120px]" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
        <div className={cn(
          "mt-auto border-t min-w-0 max-w-full overflow-x-hidden shrink-0 bg-background",
          isMobile ? "pt-[3px] pb-[max(6px,env(safe-area-inset-bottom,0px))]" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4"
        )}>
          {isMobile ? (
            <div className={cn("grid grid-cols-3 gap-2 w-full", VOUCHER_BUTTONS_CLASS)}>
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}
                  >
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
              <Button
                type="button"
                onClick={onOpenHistory ?? (() => {})}
                disabled={!voucher?.id || !showHistoryButton || !onOpenHistory}
                className={cn("w-full", BTN_HISTORY_CLASS)}
              >
                History
              </Button>
              <Button
                type="button"
                disabled={isLoading || !canSaveAdjustment || editingDisabled}
                className={cn("w-full", BTN_PRINT_CLASS)}
                onClick={(e) => handleFormSubmit(e, { print: true })}
              >
                Save & Print
              </Button>
              <Button type="button" onClick={() => onVoucherAction?.("cancelled")} className={cn("w-full", BTN_CANCEL_CLASS)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !canSaveAdjustment || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)}
                className={cn("w-full", BTN_SAVE_CLASS)}
              >
                {isLoading ? "..." : "Save"}
              </Button>
              {voucher?.id ? (
                <Button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true });
                    else onApprove?.();
                  }}
                  disabled={
                    editingDisabled ||
                    !showApproveButton ||
                    !onApprove ||
                    isApproving ||
                    (!!voucher?.isApproved && !isFormDirty)
                  }
                  className={cn("w-full", BTN_APPROVE_CLASS)}
                >
                  {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                </Button>
              ) : showSaveAndApproveOnCreate ? (
                <Button
                  type="button"
                  disabled={isLoading || !canSaveAdjustment || editingDisabled}
                  className={cn("w-full", BTN_APPROVE_CLASS)}
                  onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })}
                >
                  {isLoading ? "..." : "Save & Approve"}
                </Button>
              ) : (
                <Button type="button" disabled className="w-full bg-muted text-muted-foreground border-0 opacity-50">
                  —
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                <Button
                  type="button"
                  onClick={onOpenHistory ?? (() => {})}
                  disabled={!voucher?.id || !showHistoryButton || !onOpenHistory}
                  className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}
                >
                  <History className="mr-2 h-4 w-4" />
                  History
                </Button>
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full md:w-auto shrink-0 rounded-full"
                      disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
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
                        Move to Bin
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className={cn("flex gap-2 justify-end flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                <Button type="button" onClick={() => onVoucherAction?.("cancelled")} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!!voucher || isLoading || !canSaveAdjustment || editingDisabled}
                  className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}
                  onClick={(e) => handleFormSubmit(e, { saveAndNew: true })}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & New
                </Button>
                <Button
                  type="button"
                  disabled={isLoading || !canSaveAdjustment || editingDisabled}
                  className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}
                  onClick={(e) => handleFormSubmit(e, { print: true })}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Save & Print
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !canSaveAdjustment || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)}
                  className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
                {voucher?.id ? (
                  <Button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true });
                      else onApprove?.();
                    }}
                    disabled={
                      editingDisabled ||
                      !showApproveButton ||
                      !onApprove ||
                      isApproving ||
                      (!!voucher?.isApproved && !isFormDirty)
                    }
                    className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}
                  >
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    {isFormDirty ? "Save & Approve" : "Approve"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })}
                    disabled={!showSaveAndApproveOnCreate || isLoading || !canSaveAdjustment || editingDisabled}
                    className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}
                  >
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
  );
}
