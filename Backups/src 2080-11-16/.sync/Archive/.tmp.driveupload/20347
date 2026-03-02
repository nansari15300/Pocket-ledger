"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { CalendarIcon, Loader2, Upload } from "lucide-react";
import { format } from "date-fns";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { useDate } from "@/hooks/useDate";
import { firestore } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";

const schema = z.object({
  name: z.string().min(2, "Item name must be at least 2 characters."),
  hsCode: z.string().optional(),
  date: z.date().optional(),
});

type FormValues = z.infer<typeof schema>;

const MAX_FILE_SIZE_MB = 0.5;

export function CreateFinishedGoodDialog({
  isOpen,
  onOpenChange,
  onItemCreated,
  prefillName = "",
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onItemCreated?: (newId: string) => void;
  prefillName?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company, triggerSync } = useCompany();
  const { canAddAvatar } = usePermissions();
  const { dateSystem } = useDate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      name: prefillName,
      hsCode: "",
      date: undefined,
    },
  });

  useEffect(() => {
    if (isOpen && prefillName) {
      form.setValue("name", prefillName);
    }
  }, [isOpen, prefillName, form]);

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ name: prefillName || "", hsCode: "", date: undefined });
    setFiles([]);
  }, [isOpen]);

  const handleSubmit = async (values: FormValues) => {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Error", description: "Login and company required." });
      return;
    }

    const toastId = sonnerToast.loading("Creating finished good...");
    setIsLoading(true);

    try {
      const q = query(
        collection(firestore, `companies/${companyId}/items`),
        where("name", "==", values.name.trim())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        sonnerToast.error("Duplicate name", { id: toastId, description: "An item with this name already exists." });
        setIsLoading(false);
        return;
      }

      const fileUrls: string[] = [];
      const toUpload = files.filter((f): f is File => f instanceof File);
      if (toUpload.length > 0 && canAddAvatar) {
        const totalBytes = toUpload.slice(0, 3).reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalBytes, storageBytes: totalBytes });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        for (const file of toUpload) {
          if (fileUrls.length >= 3) break;
          const compressed = await compressFile(file);
          if (compressed.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            sonnerToast.error("File too large", { id: toastId, description: `Max ${MAX_FILE_SIZE_MB}MB per file.` });
            continue;
          }
          const res = await uploadFile(
            { name: compressed.name, type: compressed.type, arrayBuffer: await compressed.arrayBuffer() },
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
            await incrementCompanyStorage(companyId, { attachmentsBytes: compressed.size, storageBytes: compressed.size });
          }
        }
      }

      const openingBalanceDate = values.date ? (values.date instanceof Date ? values.date : new Date(values.date)) : null;
      const submissionData = {
        name: values.name.trim(),
        type: "finished_good",
        hsCode: values.hsCode?.trim() || null,
        ownerId: user.uid,
        companyId,
        groupId: null,
        salePrice: 0,
        purchasePrice: 0,
        openingBalance: 0,
        openingBalanceUnit: null,
        openingBalanceTaxId: null,
        isOpeningBalanceTaxInclusive: false,
        openingBalanceDate: openingBalanceDate ? Timestamp.fromDate(openingBalanceDate) : null,
        openingBalanceRate: 0,
        unitConversions: [],
        fileUrls,
        debit: 0,
        credit: 0,
        balance: 0,
        stockQty: 0,
        createdAt: serverTimestamp(),
        salePriceUnit: null,
        purchasePriceUnit: null,
        saleTaxId: null,
        purchaseTaxId: null,
        isPurchasePriceTaxInclusive: false,
        isSalePriceTaxInclusive: false,
        isDeleted: false,
      };

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/items`), submissionData);

      sonnerToast.success("Finished good created", { id: toastId, description: `"${values.name}" added.` });
      onItemCreated?.(docRef.id);
      triggerSync();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Create finished good error:", err);
      sonnerToast.error("Could not create item", { id: toastId, description: err?.message || "Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canAddAvatar) return;
    const list = Array.from(e.target.files);
    const max = 3 - files.filter((f): f is string => typeof f === "string").length - files.filter((f): f is File => f instanceof File).length;
    for (const file of list.slice(0, max)) {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") continue;
      try {
        const compressed = await compressFile(file);
        setFiles((prev) => [...prev, compressed]);
      } catch {
        setFiles((prev) => [...prev, file]);
      }
    }
    e.target.value = "";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Finished Good</DialogTitle>
          <DialogDescription>
            Add a new finished good from production. Fill name, date, item code and optional image.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., T-Shirt (Red)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      {dateSystem === "BS" ? (
                        <NepaliCalendar
                          isRange={false}
                          valueAD={field.value}
                          numberOfMonths={1}
                          onSelect={(_bs, adDate) => {
                            const d = adDate instanceof Date ? adDate : new Date(adDate);
                            const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
                            field.onChange(normalized);
                            setDatePopoverOpen(false);
                          }}
                        />
                      ) : (
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            setDatePopoverOpen(false);
                          }}
                          initialFocus
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hsCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item code (HS Code)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter HS Code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormLabel>Avatar / Image (optional)</FormLabel>
              <div className="flex flex-wrap gap-2">
                {files.map((file, idx) => (
                  <div key={idx} className="relative">
                    <FilePreview
                      file={file}
                      onRemove={canAddAvatar ? () => setFiles((p) => p.filter((_, i) => i !== idx)) : undefined}
                    />
                  </div>
                ))}
                {canAddAvatar && files.length < 3 && (
                  <RestrictedFileUploader>
                    <>
                      <input
                        type="file"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*,application/pdf"
                        multiple
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-1" /> Add file
                      </Button>
                    </>
                  </RestrictedFileUploader>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create finished good
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
