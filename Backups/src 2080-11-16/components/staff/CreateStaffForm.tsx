
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload, CalendarIcon } from "lucide-react";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, onSnapshot } from "firebase/firestore";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "../ui/textarea";
import { Combobox } from "../ui/combobox";
import { FilePreview } from "../vouchers/FilePreview";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { DateRange } from "react-day-picker";

import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { firestore } from "@/lib/firebase";
import { compressFile } from "@/lib/compression";
import { useDate } from "@/hooks/useDate";

import type { StaffGroup } from "@/components/staff/types";
import { CreateStaffGroupDialog } from "./CreateStaffGroupDialog";

const formSchema = z.object({
  name: z.string().min(2, { message: "Staff name must be at least 2 characters." }),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  salary: z.coerce.number().optional(),
  openingBalance: z.coerce.number().optional(),
  openingBalanceDate: z.date().optional(),
  salaryPeriod: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]).optional(),
  groupId: z.string().min(1, "Group is required."),
});

const MAX_FILE_SIZE_MB = 0.5;

type FormValues = z.infer<typeof formSchema>;

export function CreateStaffForm({
  onStaffCreated,
  groups: initialGroups,
  onClose,
  onNestedDialogOpenChange,
  defaultName,
}: {
  onStaffCreated?: (isSaveAndNew: boolean, newId: string) => void;
  groups: StaffGroup[];
  onClose?: () => void;
  onNestedDialogOpenChange?: (open: boolean) => void;
  defaultName?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync, company } = useCompany();
  const { canAddAvatar } = usePermissions();

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  React.useEffect(() => { onNestedDialogOpenChange?.(isCreateGroupOpen); }, [isCreateGroupOpen, onNestedDialogOpenChange]);
  const [groups, setGroups] = useState<StaffGroup[]>(initialGroups || []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // ---------------------------
  // ✅ Unique helper (fix duplicate keys)
  // ---------------------------
  const uniqueByValue = useMemo(() => {
    return (opts: { value: string; label: string }[]) => {
      const seen = new Set<string>();
      return opts.filter((o) => {
        if (!o?.value) return false;
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
    };
  }, []);

  // ---------------------------
  // Form
  // ---------------------------
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      salary: 0,
      openingBalance: 0,
      salaryPeriod: "Monthly",
      groupId: "",
    },
  });

  // ---------------------------
  // Load groups from Firestore
  // ---------------------------
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(firestore, `companies/${companyId}/staff_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as StaffGroup));
      setGroups(fetchedGroups);
    });
    return () => unsubscribe();
  }, [companyId]);

  // ---------------------------
  // ✅ Build combobox options (duplicate-safe)
  // ---------------------------
  const groupOptions = useMemo(() => {
    // Only user-defined staff groups; hide system parent groups
    const userGroups = (groups || []).filter(g => !(g as any).isSystemReserved);
    return uniqueByValue(
      userGroups.map((g) => ({
        value: g.id,
        label: g.name,
      }))
    );
  }, [groups, uniqueByValue]);

  // ---------------------------
  // ✅ If current groupId doesn't exist in options, auto-fix
  // ---------------------------
  useEffect(() => {
    const current = form.getValues("groupId");
    const exists = groupOptions.some((o) => o.value === current);

    if (!exists && groupOptions.length > 0) {
      // choose first non-system option if available
      const fallback = groupOptions[0]?.value;
      if (fallback) form.setValue("groupId", fallback);
    }
  }, [groupOptions, form]);

  // ---------------------------
  // Prefill: defaultName prop (e.g. from Add Salary staff search) or custom event
  // ---------------------------
  useEffect(() => {
    if (defaultName != null && defaultName !== "") {
      form.setValue("name", defaultName);
    }
  }, [defaultName, form]);

  useEffect(() => {
    const handlePrefill = (event: any) => {
      form.setValue("name", event.detail || "");
    };
    document.addEventListener("prefill-create-staff-name", handlePrefill as any);
    return () => document.removeEventListener("prefill-create-staff-name", handlePrefill as any);
  }, [form]);

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue("groupId", newGroupId);
    setIsCreateGroupOpen(false);
  };

  // ---------------------------
  // File upload
  // ---------------------------
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding avatar/file." });
      return;
    }
    const inputFile = e.target.files[0];
    if (!inputFile) return;

    if (inputFile.size > 5 * 1024 * 1024) { // 5MB pre-check
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Please select a file smaller than 5MB to compress.`,
      });
      return;
    }

    try {
      const compressedFile = await compressFile(inputFile);

      if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large After Compression",
          description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
        });
        setFileToUpload(null);
        return;
      }
      
      const preview = URL.createObjectURL(compressedFile);
      setFileToUpload({ file: compressedFile, preview });
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "File Error",
        description: "Could not process the file.",
      });
    }
  };

  const removeFile = () => {
    if (fileToUpload?.preview) URL.revokeObjectURL(fileToUpload.preview);
    setFileToUpload(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---------------------------
  // Submit
  // ---------------------------
  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    // Optimistic close
    onStaffCreated?.(options.saveAndNew || false, '');

    await processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: FormValues, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in and have a company selected.",
      });
      return;
    }

    const toastId = sonnerToast.loading("Saving staff member...");
    setIsLoading(true);

    try {
      let fileUrl: string | null = null;

      if (fileToUpload && companyId && canAddAvatar) {
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: fileToUpload.file.size, storageBytes: fileToUpload.file.size });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        const res = await uploadFile(
          { name: fileToUpload.file.name, type: fileToUpload.file.type, arrayBuffer: await fileToUpload.file.arrayBuffer() },
          companyId,
          company?.name,
          "avatar",
          undefined,
          undefined,
          undefined,
          new Date()
        );
        if (res.success && res.url) {
          fileUrl = res.url;
          await incrementCompanyStorage(companyId, { attachmentsBytes: fileToUpload.file.size, storageBytes: fileToUpload.file.size });
        }
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/staff`), {
        ...values,
        openingBalance: values.openingBalance || 0,
        openingBalanceDate: values.openingBalanceDate || null,
        ownerId: user.uid,
        companyId,
        groupId: values.groupId || null,
        balance: values.openingBalance || 0,
        isDeleted: false,
        createdAt: serverTimestamp(),
        fileUrl,
      });

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId!, 'staff', docRef.id, 0, values.openingBalance);
      }

      sonnerToast.success("Staff Member Created!", {
        id: toastId,
        description: `"${values.name}" has been successfully added.`,
      });

      triggerSync();

      if (saveAndNew) {
        form.reset({
          name: "",
          email: "",
          phone: "",
          address: "",
          salary: 0,
          openingBalance: 0,
          salaryPeriod: "Monthly",
          groupId: groupOptions[0]?.value || "loans_liabilities",
        });
        removeFile();
      }

      // Final callback with the actual ID
      onStaffCreated?.(saveAndNew, docRef.id);
    } catch (error) {
      console.error("Error creating staff member:", error);
      sonnerToast.error("Error", {
        id: toastId,
        description: "Failed to create staff member. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------
  // UI
  // ---------------------------
  const { dateSystem } = require("@/hooks/useDate").useDate?.() || { dateSystem: "AD" }; // (keep safe if hook refactor)

  return (
    <>
      <Form {...form}>
        <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Group */}
            <FormField
              control={form.control}
              name="groupId"
              render={({ field }: any) => (
                <FormItem className="flex flex-col space-y-1 w-full">
                  <FormLabel>Group/Department</FormLabel>
                  <FormControl>
                    <div className="w-full">
                      <Combobox
                        options={groupOptions}
                        value={field.value}
                        onChange={(val, newName) => {
                          if (val === "add-new") {
                            setIsCreateGroupOpen(true);
                            setTimeout(() => {
                              document.dispatchEvent(
                                new CustomEvent("prefill-create-staff-group-name", {
                                  detail: newName,
                                })
                              );
                            }, 100);
                          } else {
                            field.onChange(val === "none" ? "" : val);
                          }
                        }}
                        placeholder="Select a group"
                        addNewLabel="+ Add New Group"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter phone number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Salary + Period */}
            <FormItem>
              <FormLabel>Salary</FormLabel>
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="salary"
                  render={({ field }: any) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="salaryPeriod"
                  render={({ field }: any) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value || "Monthly"}>
                        <FormControl>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Daily">Daily</SelectItem>
                          <SelectItem value="Weekly">Weekly</SelectItem>
                          <SelectItem value="Monthly">Monthly</SelectItem>
                          <SelectItem value="Yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormItem>

            {/* Address */}
            <FormField
              control={form.control}
              name="address"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter full address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Opening Balance + Date */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="openingBalance"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Opening Balance</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="openingBalanceDate"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>As on Date</FormLabel>
                    <div className={cn("grid", dateSystem === "Both" && "grid-cols-1 sm:grid-cols-2 gap-2")}>
                      {(dateSystem === "BS" || dateSystem === "Both") && (
                        <BsDatePicker valueAD={field.value} onChangeAD={(d?: Date | DateRange) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                      )}

                      {(dateSystem === "AD" || dateSystem === "Both") && (
                        <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "MMM-dd-yyyy") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-[102]" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIsCalendarOpen(false);
                              }}
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
            </div>

            {/* Avatar/File */}
            <FormItem>
              <FormLabel>Avatar/File (Optional)</FormLabel>
              {!canAddAvatar ? (
                <p className="text-xs text-muted-foreground">
                  Upgrade plan to add avatar/file.{" "}
                  <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
                </p>
              ) : (
              <RestrictedFileUploader>
                <div className="flex items-center gap-4">
                  {fileToUpload ? (
                    <FilePreview file={fileToUpload.file} onRemove={removeFile} />
                  ) : (
                    <FormControl>
                      <div
                        className="relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-6 w-6" />
                        <span className="text-xs mt-1">Add File</span>
                        <Input
                          type="file"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*,application/pdf"
                        />
                      </div>
                    </FormControl>
                  )}
                </div>
              </RestrictedFileUploader>
              )}
            </FormItem>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & New
            </Button>

            <Button type="submit" disabled={isLoading || !companyId}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Staff Member
            </Button>
          </div>
        </form>
      </Form>

      <CreateStaffGroupDialog
        onGroupCreated={handleGroupCreated}
        isOpen={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
        groups={groups}
      />
    </>
  );
}
