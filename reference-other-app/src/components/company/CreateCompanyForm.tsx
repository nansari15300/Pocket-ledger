
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CalendarIcon, Eye, EyeOff, CheckCircle, AlertTriangle, Upload } from "lucide-react";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";


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
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { countries } from "@/lib/countries";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { storage, firestore } from "@/lib/firebase";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Calendar } from "@/components/ui/calendar";
import { compressFile } from "@/lib/compression";
import { FilePreview } from "../vouchers/FilePreview";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { doc, setDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { initializeCompanyDataClient } from "@/lib/initializeCompanyDataClient";
import { ensureSuperAdminInSharedEmails } from "@/lib/superAdminEmails";
import { slugify } from "@/lib/slugify";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import type { PlanId } from "@/config/plans";
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";

const MAX_FILE_SIZE_MB = 0.5;

/** Company doc ID: name_shortId so path is readable in Firestore console. */
function generateCompanyId(companyName: string): string {
  const slug = slugify(companyName, 40);
  const shortId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36).slice(-6)}`;
  return `${slug}_${shortId}`;
}


const formSchema = z
  .object({
    // Company name: min 2 chars, no max limit (user requested removal of char limits)
    companyName: z
      .string()
      .min(2, { message: "Company name must be at least 2 characters." }),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z
      .union([z.string().email({ message: "Please enter a valid email." }), z.literal("")])
      .optional(),
    pan: z.string().optional(),
    country: z.string().min(1, { message: "Please select a country." }),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    fiscalYearStart: z.date().optional(),
    fiscalYearEnd: z.date().optional(),
  })
  .refine(
    (data) => {
      if (data.password || data.confirmPassword) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    { message: "Passwords do not match.", path: ["confirmPassword"] }
  );

type FormValues = z.infer<typeof formSchema>;

type FiscalTemplate = {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
};

// Country-specific fiscal templates used when non-Nepal countries are selected.
function getFiscalTemplateForCountry(country?: string): FiscalTemplate {
  const normalized = (country || "").trim().toLowerCase();
  if (normalized === "india") return { startMonth: 3, startDay: 1, endMonth: 2, endDay: 31 }; // Apr 1 - Mar 31
  if (normalized === "bangladesh" || normalized === "pakistan" || normalized === "australia" || normalized === "new zealand") {
    return { startMonth: 6, startDay: 1, endMonth: 5, endDay: 30 }; // Jul 1 - Jun 30
  }
  return { startMonth: 0, startDay: 1, endMonth: 11, endDay: 31 }; // Jan 1 - Dec 31
}

// Returns fiscal start/end dates for the running year by selected country rule.
function getFiscalRangeForCountry(country?: string, baseDate: Date = new Date()) {
  const normalized = (country || "").trim().toLowerCase();
  if (normalized === "nepal") {
    // Nepal: running FY must be Shrawan 1 to Asar last day.
    const bsToday = adToBs(baseDate);
    const runningStartYear = bsToday.m >= 4 ? bsToday.y : bsToday.y - 1;
    const runningEndYear = runningStartYear + 1;
    const asarDays = getBSMonthDays(runningEndYear)[2] || 32;
    return {
      start: bsToAd({ y: runningStartYear, m: 4, d: 1 }),
      end: bsToAd({ y: runningEndYear, m: 3, d: asarDays }),
    };
  }

  const template = getFiscalTemplateForCountry(country);
  const isCrossYear =
    template.endMonth < template.startMonth ||
    (template.endMonth === template.startMonth && template.endDay < template.startDay);
  const year = baseDate.getFullYear();

  let startYear = year;
  let start = new Date(startYear, template.startMonth, template.startDay);
  let end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);

  if (baseDate < start) {
    startYear = startYear - 1;
    start = new Date(startYear, template.startMonth, template.startDay);
    end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);
  } else if (baseDate > end) {
    startYear = startYear + 1;
    start = new Date(startYear, template.startMonth, template.startDay);
    end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);
  }
  return { start, end };
}


export function CreateCompanyForm({
  onCompanyCreated,
}: {
  onCompanyCreated?: (companyId: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);

  const router = useRouter();
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { setCompanyId, allCompanies } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const livePlans = useLivePlans();
  const canAddAvatar = getPlanFromPlans(livePlans, "basic").entitlements.canAddAvatar === true;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      address: "",
      phone: "",
      email: "",
      pan: "",
      country: "Nepal",
      password: "",
      confirmPassword: "",
      fiscalYearStart: undefined,
      fiscalYearEnd: undefined,
    },
    mode: "onChange",
  });
  const selectedCountry = form.watch("country");
  const isNepalCountry = (selectedCountry || "").trim().toLowerCase() === "nepal";

  useEffect(() => {
    if (!selectedCountry) return;
    // Keep fiscal year defaults synced with current selected country.
    const { start, end } = getFiscalRangeForCountry(selectedCountry);
    form.setValue("fiscalYearStart", start, { shouldDirty: false });
    form.setValue("fiscalYearEnd", end, { shouldDirty: false });
  }, [selectedCountry, form]);


  const displayDate = (date?: Date) => {
    if (!date || isNaN(date.getTime())) return "Pick a date";
    switch (dateSystem) {
      case "AD":
        return formatDate(date);
      case "BS":
        return formatDateBS(date);
      case "Both":
        return `${formatDate(date)} / ${formatDateBS(date)}`;
      default:
        return formatDate(date);
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding company logo." });
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
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }


  async function onSubmit(values: FormValues) {
    if (!user?.uid) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to create a company.",
      });
      return;
    }

    const ownedQuery = query(
      collection(firestore, "companies"),
      where("ownerId", "==", user.uid),
      where("isDeleted", "!=", true)
    );
    const ownedSnap = await getDocs(ownedQuery);
    const ownedCount = ownedSnap.size;
    const planId: PlanId = ownedCount === 0 ? "basic" : (ownedSnap.docs[0]?.data()?.planId as PlanId) || "basic";
    const plan = getPlanFromPlans(livePlans, planId);
    const maxCompanies = (plan.entitlements.maxCompanies as number) ?? 1;
    if (ownedCount >= maxCompanies) {
      toast({
        variant: "destructive",
        title: "Plan limit reached",
        description: `Your plan allows up to ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Upgrade to create more.`,
      });
      return;
    }

    const nameNorm = values.companyName.trim().toLowerCase();
    const ownedByName = allCompanies.filter(
      (c) => c.ownerId === user.uid && (c.name || "").trim().toLowerCase() === nameNorm
    );
    if (ownedByName.length > 0) {
      toast({
        variant: "destructive",
        title: "Duplicate company name",
        description: `You already have a company named "${values.companyName.trim()}". Use a different name.`,
      });
      return;
    }

    setIsLoading(true);
    try {
      const companyId = generateCompanyId(values.companyName);
      let logoUrl: string | null = null;

      if (fileToUpload && canAddAvatar) {
        try {
          const storageRef = ref(storage, `company-logos/${user.uid}/${Date.now()}_${fileToUpload.file.name}`);
          const snapshot = await uploadBytes(storageRef, fileToUpload.file);
          logoUrl = await getDownloadURL(snapshot.ref);
        } catch (uploadErr) {
          console.warn("Logo upload failed, saving company without logo:", uploadErr);
        }
      }

      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      const toDate = (v: Date | undefined) => v ? Timestamp.fromDate(v) : null;

      await setDoc(doc(firestore, "companies", companyId), {
        name: values.companyName,
        address: values.address ?? "",
        phone: values.phone ?? "",
        email: values.email ?? "",
        pan: values.pan ?? "",
        country: values.country,
        password: values.password ?? null,
        logoUrl,
        fiscalYearStart: toDate(values.fiscalYearStart) ?? null,
        fiscalYearEnd: toDate(values.fiscalYearEnd) ?? null,
        storageOption: "firebase",
        ownerId: user.uid,
        ownerEmail: user.email ?? null,
        createdAt: serverTimestamp(),
        sharedWith: [],
        sharedWithEmails: ensureSuperAdminInSharedEmails(
          user.email ? [user.email] : [],
          customUser?.email,
          customUser?.role === "SuperAdmin"
        ),
        planId: "basic",
        planExpiry: Timestamp.fromDate(expiryDate),
      });

      await initializeCompanyDataClient(companyId, user.uid);

      if (values.country !== "Nepal") {
        localStorage.setItem("dateSystem", "AD");
      }

      toast({
        title: "Company created",
        description: `"${values.companyName}" has been saved.`,
      });

      if (onCompanyCreated) {
        onCompanyCreated(companyId);
      } else {
        setCompanyId(companyId);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error creating company:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save company. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">Company Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Innovate Inc." className="text-xs sm:text-sm" {...field} />
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
                <FormLabel className="text-xs sm:text-sm">PAN/VAT No.</FormLabel>
                <FormControl>
                  <Input placeholder="Company PAN/VAT" className="text-xs sm:text-sm" {...field} />
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
              <FormLabel className="text-xs sm:text-sm">Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Company's full address" className="text-xs sm:text-sm" rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">Phone No.</FormLabel>
                <FormControl>
                  <Input placeholder="Phone number" className="text-xs sm:text-sm" {...field} />
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
                <FormLabel className="text-xs sm:text-sm">Email</FormLabel>
                <FormControl>
                  <Input placeholder="Email address" className="text-xs sm:text-sm" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          <FormItem>
            <FormLabel className="text-xs sm:text-sm">Company Logo (Optional)</FormLabel>
            <div className="flex items-center gap-2 sm:gap-4">
              {!canAddAvatar ? (
                <p className="text-xs text-muted-foreground">
                Upgrade plan to add company logo.{" "}
                <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                  Click here to upgrade
                </Link>
              </p>
              ) : fileToUpload ? (
                <FilePreview
                  file={fileToUpload.file}
                  onRemove={removeFile}
                  isCompressing={false}
                  compressionResult={null}
                  size={64}
                />
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
                <FormLabel className="text-xs sm:text-sm">Country</FormLabel>
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
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">Password (Optional)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Set password"
                        className="text-xs sm:text-sm pr-8"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => setShowPassword((s) => !s)}
                    >
                      {showPassword ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
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
                  <FormLabel className="text-xs sm:text-sm">Confirm Password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        className="text-xs sm:text-sm pr-8"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => setShowConfirmPassword((s) => !s)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />
        
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <FormField
            control={form.control}
            name="fiscalYearStart"
            render={({ field }: any) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-xs sm:text-sm">Fiscal Year Start</FormLabel>
                {isNepalCountry ? (
                  // Nepal: show BS picker only for fiscal year fields.
                  <BsDatePicker
                    valueAD={field.value}
                    onChangeAD={(d) => field.onChange(d as Date)}
                    numberOfMonths={1}
                    isRange={false}
                  />
                ) : (
                  // Other countries: show AD picker only for fiscal year fields.
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={(date) => field.onChange(date)} initialFocus />
                    </PopoverContent>
                  </Popover>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fiscalYearEnd"
            render={({ field }: any) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-xs sm:text-sm">Fiscal Year End</FormLabel>
                {isNepalCountry ? (
                  // Nepal: show BS picker only for fiscal year fields.
                  <BsDatePicker
                    valueAD={field.value}
                    onChangeAD={(d) => field.onChange(d as Date)}
                    numberOfMonths={1}
                    isRange={false}
                  />
                ) : (
                  // Other countries: show AD picker only for fiscal year fields.
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={(date) => field.onChange(date)} initialFocus />
                    </PopoverContent>
                  </Popover>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Company
          </Button>
        </div>
      </form>
    </Form>
  );
}
