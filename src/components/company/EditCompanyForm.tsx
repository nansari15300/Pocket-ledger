
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CalendarIcon, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { compressFile } from "@/lib/compression";
import { FilePreview } from "../vouchers/FilePreview";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { countries } from "@/lib/countries";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { firestore } from "@/lib/firebase";
import { Textarea } from "../ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Separator } from "../ui/separator";
import { PasswordUpdateConfirmationDialog } from "./PasswordUpdateConfirmationDialog";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
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
import { useVouchers } from "@/hooks/useVouchers";
import Link from "next/link";
import { Tooltip, TooltipProvider, TooltipContent } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import { Card, CardContent } from "../ui/card";


const MAX_FILE_SIZE_MB = 5;

const formSchema = z.object({
  name: z.string().min(2, { message: "Company name must be at least 2 characters." }),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal("")),
  pan: z.string().optional(),
  country: z.string().min(1, { message: "Please select a country." }),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  fiscalYearStart: z.date().optional(),
  fiscalYearEnd: z.date().optional(),
  confirmPasswordToSave: z.string().optional(),
}).refine(data => {
    if (data.password || data.confirmPassword) {
        return data.password === data.confirmPassword;
    }
    return true;
}, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
});


export function EditCompanyForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { company, companyId, loading: companyLoading, clearCompanyId } = useCompany();
  const { toast } = useToast();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const { user } = useAuth();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showConfirmPasswordToSave, setShowConfirmPasswordToSave] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState<{
    newPasswordValue: string;
    usersToUpdate: any[];
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const { vouchers } = useVouchers();
  const hasTransactions = vouchers.length > 0;
  const { canAddAvatar } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  // When plan does not allow avatar, clear any queued file
  useEffect(() => {
    if (!canAddAvatar && fileToUpload?.preview) {
      URL.revokeObjectURL(fileToUpload.preview);
      setFileToUpload(null);
    }
  }, [canAddAvatar]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding or changing company logo." });
      return;
    }
    const inputFile = e.target.files[0]; // Only one logo allowed
    if (!inputFile) return;

    if (inputFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
      });
      e.target.value = "";
      return;
    }

    const compressedFile = await compressFile(inputFile);
    const preview = URL.createObjectURL(compressedFile);
    setFileToUpload({ file: compressedFile, preview });
    e.target.value = ""; // Reset so same file can be re-selected; keeps single-file
  };

  const removeFile = () => {
    if (fileToUpload?.preview) {
      URL.revokeObjectURL(fileToUpload.preview);
    }
    setFileToUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      pan: "",
      country: "Nepal",
      password: "",
      confirmPassword: "",
      confirmPasswordToSave: "",
    },
  });
  
  const companyNameValue = form.watch("name");
  const confirmPasswordToSaveValue = form.watch("confirmPasswordToSave");
  const isDeleteEnabled = !company?.password || (company.password && confirmPasswordToSaveValue === company.password);


  useEffect(() => {
    if (company) {
        const safeGetDate = (dateValue: any): Date | undefined => {
            if (!dateValue) return undefined;
            if (dateValue instanceof Timestamp) return dateValue.toDate();
            if (dateValue instanceof Date) return dateValue;
            if (dateValue && typeof dateValue.toDate === 'function') return dateValue.toDate();
            const parsed = new Date(dateValue);
            return isNaN(parsed.getTime()) ? undefined : parsed;
        };

        form.reset({
            name: company.name,
            address: company.address || "",
            phone: company.phone || "",
            email: company.email || "",
            pan: company.pan || "",
            country: company.country || "Nepal",
            fiscalYearStart: safeGetDate(company.fiscalYearStart),
            fiscalYearEnd: safeGetDate(company.fiscalYearEnd),
            password: "",
            confirmPassword: "",
            confirmPasswordToSave: "",
        });
    }
  }, [company, form]);
  
  const displayDate = (date?: Date) => {
    if (!date) return "Pick a date";
    switch(dateSystem) {
        case 'AD': return formatDate(date);
        case 'BS': return formatDateBS(date);
        case 'Both': return `${formatDate(date)} / ${formatDateBS(date)}`;
        default: return formatDate(date);
    }
  }

  const proceedWithSave = async (values: z.infer<typeof formSchema>, updatedSharedUsers?: any[]) => {
    if (!companyId || !company) return;

    setIsLoading(true);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      
      let logoUrl: string | null = company.logoUrl || null;
      
      // Handle logo removal
      if (removeLogo && company.logoUrl) {
        try {
          const oldLogoRef = ref(storage, company.logoUrl);
          await deleteObject(oldLogoRef);
        } catch (error) {
          console.error("Error deleting old logo:", error);
        }
        logoUrl = null;
      }
      
      // Handle logo upload (only when plan allows avatar)
      if (fileToUpload && user && canAddAvatar) {
        // Delete old logo if exists
        if (company.logoUrl && !removeLogo) {
          try {
            const oldLogoRef = ref(storage, company.logoUrl);
            await deleteObject(oldLogoRef);
          } catch (error) {
            console.error("Error deleting old logo:", error);
          }
        }
        
        // Upload new logo
        const storageRef = ref(storage, `company-logos/${user.uid}/${Date.now()}_${fileToUpload.file.name}`);
        const snapshot = await uploadBytes(storageRef, fileToUpload.file);
        logoUrl = await getDownloadURL(snapshot.ref);
      }
      
      const updateData: Record<string, any> = {
          name: values.name,
          address: values.address,
          phone: values.phone,
          email: values.email,
          pan: values.pan,
          country: values.country,
          logoUrl: logoUrl,
          fiscalYearStart: values.fiscalYearStart || null,
          fiscalYearEnd: values.fiscalYearEnd || null,
      };
      
      // Set default date system based on country
      if (values.country !== "Nepal") {
        localStorage.setItem("dateSystem", "AD");
      }

      if (values.password) {
        updateData.password = values.password;
      }
      
      if (updatedSharedUsers) {
        updateData.sharedWith = updatedSharedUsers;
      }
      
      await updateDoc(companyRef, updateData);
      
      // Clear file upload state after successful save
      if (fileToUpload?.preview) {
        URL.revokeObjectURL(fileToUpload.preview);
      }
      setFileToUpload(null);
      setRemoveLogo(false);
      
      toast({
        title: "Company Updated!",
        description: "Your company details have been successfully updated.",
      });
      form.reset({ ...form.getValues(), password: "", confirmPassword: "", confirmPasswordToSave: "" });

    } catch (error) {
      console.error("Error updating company:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update company details. Please try again.",
      });
    } finally {
      setIsLoading(false);
      setPasswordConfirmation(null);
    }
  };


  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!companyId || !company) {
      toast({ variant: "destructive", title: "Error", description: "No company is selected." });
      return;
    }
    
    // Authorization check only if a company password exists
    if (company.password && values.confirmPasswordToSave !== company.password) {
        form.setError("confirmPasswordToSave", { message: "The entered password does not match the current company password." });
        return;
    }
    
    // Check if new password is set
    if (values.password) {
        const usersToUpdate = (company.sharedWith || []).filter(u => !u.password);
        if (usersToUpdate.length > 0) {
            setPasswordConfirmation({ newPasswordValue: values.password, usersToUpdate });
            return;
        }
    }
    
    proceedWithSave(values);
  }
  
  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      await updateDoc(doc(firestore, `companies/${companyId}`), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || "",
      });
      toast({ title: "Company Moved to Bin", description: `"${company?.name}" has been moved.` });
      clearCompanyId();
    } catch (error) {
      console.error("Error moving to bin:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to move company to bin." });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };


  if (companyLoading) {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
             <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-1/4 ml-auto" />
        </div>
    );
  }

  return (
    <Card>
    <CardContent className="p-6">
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                    <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Innovate Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="pan"
                render={({ field }: any) => (
                    <FormItem>
                    <FormLabel>PAN/VAT No.</FormLabel>
                    <FormControl>
                        <Input placeholder="Company PAN/VAT" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
            control={form.control}
            name="address"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                    <Textarea placeholder="Company's full address" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="phone"
                render={({ field }: any) => (
                    <FormItem>
                    <FormLabel>Phone No.</FormLabel>
                    <FormControl>
                        <Input placeholder="Company phone number" {...field} />
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
                        <Input placeholder="Company email address" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Company Logo (Optional)</FormLabel>
                <div className="flex items-center gap-2 sm:gap-4">
                  {!canAddAvatar ? (
                    company?.logoUrl && !removeLogo ? (
                      <img
                        src={company.logoUrl}
                        alt="Company logo"
                        className="w-16 h-16 sm:w-24 sm:h-24 object-cover rounded-lg border"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Upgrade plan to add or change company logo.{" "}
                        <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                          Click here to upgrade
                        </Link>
                      </p>
                    )
                  ) : fileToUpload ? (
                    <FilePreview
                      file={fileToUpload.file}
                      onRemove={removeFile}
                      isCompressing={false}
                      compressionResult={null}
                      size={64}
                    />
                  ) : company?.logoUrl && !removeLogo ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <img 
                          src={company.logoUrl} 
                          alt="Company logo" 
                          className="w-16 h-16 sm:w-24 sm:h-24 object-cover rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            setRemoveLogo(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0"
                      >
                        <Upload className="h-4 w-4 mr-1.5" />
                        Change
                      </Button>
                      <Input 
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple={false}
                      />
                    </div>
                  ) : (
                    <FormControl>
                      <div 
                        className="relative w-16 h-16 sm:w-24 sm:h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 sm:h-6 sm:w-6" />
                        <span className="text-[10px] sm:text-xs mt-0.5 sm:mt-1">Add Logo</span>
                        <Input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple={false}
                        />
                      </div>
                    </FormControl>
                  )}
                </div>
              </FormItem>

              <FormField
                  control={form.control}
                  name="country"
                  render={({ field }: any) => (
                      <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                          <Combobox
                              options={countries.map(country => ({ value: country, label: country }))}
                              value={field.value}
                              onChange={(value) => field.onChange(value)}
                              placeholder="Select country"
                          />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
              />
            </div>
            
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }: any) => (
                            <FormItem>
                            <FormLabel>{company?.password ? "New Password" : "Set Password"}</FormLabel>
                            <div className="relative">
                                <FormControl>
                                    <Input
                                      type={showNewPassword ? "text" : "password"}
                                      placeholder="Set a password to protect this company"
                                      autoComplete="new-password"
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                </FormControl>
                                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowNewPassword(!showNewPassword)}>
                                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }: any) => (
                            <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <div className="relative">
                                <FormControl>
                                    <Input
                                      type={showConfirmPassword ? "text" : "password"}
                                      placeholder="Confirm new password"
                                      autoComplete="new-password"
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                </FormControl>
                                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fiscalYearStart"
                render={({ field }: any) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fiscal Year Start</FormLabel>
                    <BsDatePicker
                      valueAD={field.value}
                      onChangeAD={(d) => field.onChange(d as Date)}
                      numberOfMonths={1}
                      isRange={false}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fiscalYearEnd"
                render={({ field }: any) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fiscal Year End</FormLabel>
                    <BsDatePicker
                      valueAD={field.value}
                      onChangeAD={(d) => field.onChange(d as Date)}
                      numberOfMonths={1}
                      isRange={false}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {company?.password && (
                <>
                    <Separator />
                    <div className="space-y-4 pt-4">
                        <FormField
                            control={form.control}
                            name="confirmPasswordToSave"
                            render={({ field }: any) => (
                                <FormItem>
                                <FormLabel>Confirm Password to Save</FormLabel>
                                <div className="relative max-w-sm">
                                    <FormControl>
                                        <Input
                                          type={showConfirmPasswordToSave ? "text" : "password"}
                                          placeholder="Enter current password to authorize"
                                          autoComplete="current-password"
                                          {...field}
                                          value={field.value ?? ""}
                                        />
                                    </FormControl>
                                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowConfirmPasswordToSave(!showConfirmPasswordToSave)}>
                                        {showConfirmPasswordToSave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <FormDescription>Enter the current company password to save any changes.</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </>
            )}


            <div className="flex justify-end items-center">
                <Button type="submit" disabled={isLoading} variant="default">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </form>
        </Form>
    
        {passwordConfirmation && (
            <PasswordUpdateConfirmationDialog
                isOpen={!!passwordConfirmation}
                onOpenChange={() => setPasswordConfirmation(null)}
                newPassword={passwordConfirmation.newPasswordValue}
                affectedUsers={passwordConfirmation.usersToUpdate}
                onConfirm={async (updatedUsers) => {
                    await proceedWithSave(form.getValues(), updatedUsers);
                    setPasswordConfirmation(null);
                }}
            />
        )}
      </CardContent>
    </Card>
  );
}
