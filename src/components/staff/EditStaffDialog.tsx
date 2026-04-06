
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon, Upload } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { CreateStaffGroupDialog } from "./CreateStaffGroupDialog";
import { Textarea } from "../ui/textarea";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { toast as sonnerToast } from "sonner";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";

const formSchema = z.object({
  name: z.string().min(2, { message: "Staff name must be at least 2 characters." }),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  salary: z.coerce.number().optional(),
  openingBalance: z.coerce.number().optional(),
  openingBalanceDate: z.date().optional(),
  salaryPeriod: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]).optional(),
  groupId: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function EditStaffDialog({ staff, allGroups = [], allStaff, onStaffUpdated, onStaffDeleted, children, isOpen, onOpenChange, hasTransactions }: {
  staff: Staff;
  allGroups?: StaffGroup[];
  allStaff?: Staff[];
  onStaffUpdated: (updatedStaff: Partial<Staff>) => void;
  onStaffDeleted: () => void;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hasTransactions?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const dialogOpen = isOpen !== undefined ? isOpen : internalIsOpen;
  const setDialogOpen = onOpenChange ?? setInternalIsOpen;

  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync, company } = useCompany();
  const { canAddAvatar } = usePermissions();
  const { dateSystem } = useDate();
  const [groups, setGroups] = useState<StaffGroup[]>(allGroups);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [file, setFile] = useState<File | string | null>(staff.fileUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: staff.name,
      email: staff.email || "",
      phone: staff.phone || "",
      address: staff.address || "",
      salary: staff.salary,
      openingBalance: staff.openingBalance || 0,
      openingBalanceDate: (staff as any).openingBalanceDate?.toDate ? (staff as any).openingBalanceDate.toDate() : undefined,
      salaryPeriod: staff.salaryPeriod || "Monthly",
      groupId: staff.groupId || "",
    },
  });

  useEffect(() => {
    if (dialogOpen) {
      const dateValue = (staff as any).openingBalanceDate;
      let finalDate;
      if (dateValue?.toDate) {
          finalDate = dateValue.toDate();
      } else if (dateValue instanceof Date) {
          finalDate = dateValue;
      } else if (dateValue) {
          finalDate = new Date(dateValue);
      } else {
          finalDate = undefined;
      }
      form.reset({
        name: staff.name,
        email: staff.email || "",
        phone: staff.phone || "",
        address: staff.address || "",
        salary: staff.salary,
        openingBalance: staff.openingBalance || 0,
        openingBalanceDate: finalDate,
        salaryPeriod: staff.salaryPeriod || "Monthly",
        groupId: staff.groupId || "",
      });
      setFile(staff.fileUrl || null);
    }
  }, [dialogOpen, staff, form]);
  
  useEffect(() => {
    if (!dialogOpen || !companyId) return;
    
    const q = query(collection(firestore, `companies/${companyId}/staff_groups`));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        setGroups(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffGroup)));
    }, (error) => {
        console.error("Error fetching groups:", error);
        toast({ variant: "destructive", title: "Could not load groups" });
    });
    
    return () => unsubscribe();
  }, [dialogOpen, companyId, toast]);

  async function onSubmit(values: z.infer<typeof formSchema>): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    
    setDialogOpen(false);
    
    const toastId = sonnerToast.loading("Updating staff member...");
    try {
      let fileUrl = typeof file === 'string' ? file : null;
      if (file instanceof File && companyId && canAddAvatar) {
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: file.size, storageBytes: file.size });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          return;
        }
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
          fileUrl = res.url;
          await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
        }
      }
      
      const oldOpeningBalance = staff.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      
      const staffRef = doc(firestore, `companies/${companyId}/staff`, staff.id);
      await updateDoc(staffRef, { 
          ...values,
          openingBalance: newOpeningBalance,
          openingBalanceDate: values.openingBalanceDate || null,
          fileUrl, 
          groupId: values.groupId || null
      });

      // Automatically balance opening balance change with Capital Account
      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, 'staff', staff.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Staff Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      onStaffUpdated({ id: staff.id, ...values, fileUrl: fileUrl || '' });
      triggerSync();

    } catch (error) {
      console.error("Error updating staff:", error);
      sonnerToast.error("Error Updating Staff", { id: toastId, description: "An error occurred. Please try again." });
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This staff member has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/staff`, staff.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
        });
        toast({ title: "Staff Member Moved to Bin", description: `"${staff.name}" has been moved.`});
        onStaffDeleted();
      setDialogOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting staff: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the staff member.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding or changing avatar/file." });
      return;
    }
    const inputFile = e.target.files[0];

    if (inputFile.size > MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Please select a file smaller than ${MAX_IMAGE_MB_BEFORE_COMPRESS}MB to compress.`,
      });
      return;
    }

    if (inputFile) {
      try {
        const compressedFile = await compressFile(inputFile);
         if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({
              variant: "destructive",
              title: "File Too Large After Compression",
              description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
            });
            return;
        }
        setFile(compressedFile);
      } catch (err) {
        console.error("File compression error:", err);
        toast({
            variant: "destructive",
            title: "File Error",
            description: "Could not process the file.",
        });
      }
    }
  };


  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {dialogOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className="sm:max-w-2xl z-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update the details for {staff.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                  <FormItem className="flex flex-col space-y-1 w-full">
                      <FormLabel>Group/Department (Optional)</FormLabel>
                      <FormControl>
                        <div className="w-full">
                           <Combobox
                              options={groups
                                .filter(g => !(g as any).isSystemReserved)
                                .map(g => ({ value: g.id, label: g.name }))}
                              value={field.value}
                              onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                      document.dispatchEvent(new CustomEvent('prefill-create-staff-group-name', { detail: newName }));
                                    }, 100);
                                  } else {
                                    field.onChange(val === 'none' ? '' : val);
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
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                           <div className={cn("grid", dateSystem === 'Both' && "grid-cols-1 sm:grid-cols-2 gap-2")}>
                                {(dateSystem === 'BS' || dateSystem === 'Both') && (
                                    <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                                )}
                                {(dateSystem === 'AD' || dateSystem === 'Both') && (
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
                 <FormItem>
                    <FormLabel>Avatar/File (Optional)</FormLabel>
                    {!canAddAvatar ? (
                      <p className="text-xs text-muted-foreground">
                        Upgrade plan to add or change avatar/file.{" "}
                        <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
                      </p>
                    ) : (
                    <div className="flex items-center gap-4">
                        {file && (
                        <FilePreview file={file} onRemove={() => setFile(null)} />
                        )}
                        {!file && (
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
                    )}
                </FormItem>
              </div>

              <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="destructive" disabled={isLoading || hasTransactions}>
                              <Trash2 className="mr-2 h-4 w-4" /> Move to Bin
                            </Button>
                          </AlertDialogTrigger>
                        </span>
                      </TooltipTrigger>
                      {hasTransactions && (
                        <TooltipContent>
                          <p>Cannot delete a staff member with existing transactions.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                              This action will move the staff member <span className="font-semibold text-foreground">{staff.name}</span> to the recycle bin.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                              Move to Bin
                          </AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button type="submit" className="col-span-2 sm:col-span-1">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <CreateStaffGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}
