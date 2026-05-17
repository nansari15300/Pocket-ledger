
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
import { CountryCurrencyCombobox } from "@/components/shared/CountryCurrencyCombobox";
import { getDefaultCurrencyForCountry } from "@/lib/worldCurrencies";

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
import { generateCompanyId } from "@/lib/generateCompanyId";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { numericEntitlement, type PlanId } from "@/config/plans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { countOnlineCompanySlotsForOwner, maxOnlineCompaniesForPlan } from "@/lib/companyOnlineSlots";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import { isForceLocalCompanyCreationBuild } from "@/lib/localMode";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { type LocalCompanyUserRecord, upsertUserInList } from "@/lib/localCompanyUsers";

const MAX_FILE_SIZE_MB = 0.5;

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
    billingCurrencyCountry: z.string().min(1, { message: "Please select a currency." }),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    fiscalYearStart: z.date().optional(),
    fiscalYearEnd: z.date().optional(),
    companyUserName: z.string().optional(),
    companyUserUsername: z.string().optional(),
    companyUserRole: z.string().optional(),
    companyUserPassword: z.string().optional(),
    /** Local company login username (Firestore online companies use email share instead). */
    adminUsername: z.string().optional(),
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
type LocalCompanyUserDraft = { name: string; username: string; role: string; password: string };

export function CreateCompanyForm({
  onCompanyCreated,
}: {
  onCompanyCreated?: (companyId: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [addCompanyUserEnabled, setAddCompanyUserEnabled] = useState(false);
  const [showCompanyUserPassword, setShowCompanyUserPassword] = useState(false);
  const [queuedCompanyUsers, setQueuedCompanyUsers] = useState<LocalCompanyUserDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  /** Jab plan me online slot khali ho tab hi dikhega: local vs Firestore company */
  const [creationMode, setCreationMode] = useState<"local" | "online">("online");

  const router = useRouter();
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  // `company` = abhi selected company (plan hint); owned list se highest tier — pehle hamesha "basic" plan check tha
  const { setCompanyId, allCompanies, company } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const livePlans = useLivePlans();
  const accountPlanId = useMemo(
    () => resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId),
    [allCompanies, user?.uid, company?.planId]
  );
  const canAddAvatar = useMemo(() => {
    return getPlanFromPlans(livePlans, accountPlanId).entitlements.canAddAvatar === true;
  }, [accountPlanId, livePlans]);

  const maxOnlineSlots = useMemo(
    () => maxOnlineCompaniesForPlan(accountPlanId, getPlanFromPlans(livePlans, accountPlanId)),
    [accountPlanId, livePlans]
  );
  const usedOnlineSlots = useMemo(
    () => (user?.uid ? countOnlineCompanySlotsForOwner(allCompanies, user.uid) : 0),
    [allCompanies, user?.uid]
  );
  /** Plan online allow kare + slot bachi ho → user offline/online choose kar sake */
  const hasFreeOnlineSlot = maxOnlineSlots > 0 && usedOnlineSlots < maxOnlineSlots;
  /** Sirf static APK / NEXT_PUBLIC_LOCAL_ONLY_MODE: browse "local" mode se alag (warna option kabhi dikhta hi nahi) */
  const forceLocalCompanyCreation = isForceLocalCompanyCreationBuild();
  /** Web/browser: local company create band — sirf static/APK device-only path */
  const staticBuildAllowsLocalCompany = isStaticAppBuild();
  const willCreateAsLocal =
    staticBuildAllowsLocalCompany &&
    (forceLocalCompanyCreation || !hasFreeOnlineSlot || creationMode === "local");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      address: "",
      phone: "",
      email: "",
      pan: "",
      country: "Nepal",
      billingCurrencyCountry: "Nepal",
      password: "",
      confirmPassword: "",
      fiscalYearStart: undefined,
      fiscalYearEnd: undefined,
      companyUserName: "",
      companyUserUsername: "",
      // "manager" is used as admin-like company user role in existing permission model.
      companyUserRole: "manager",
      companyUserPassword: "",
      adminUsername: "",
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
    form.setValue("billingCurrencyCountry", selectedCountry, { shouldDirty: false });
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
    // Submit waqt latest slot count — doosre tab me company banne par bhi sahi branch
    const planIdForSlots = resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId);
    const maxO = maxOnlineCompaniesForPlan(planIdForSlots, getPlanFromPlans(livePlans, planIdForSlots));
    const usedO = user?.uid ? countOnlineCompanySlotsForOwner(allCompanies, user.uid) : 0;
    const freeOnlineSlotNow = maxO > 0 && usedO < maxO;
    const createAsLocalOnly =
      isStaticAppBuild() &&
      (isForceLocalCompanyCreationBuild() || !freeOnlineSlotNow || creationMode === "local");

    if (!user?.uid) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        // Login is required even in local-only mode so plan/settings can sync per user.
        description: "Please login first to create a company.",
      });
      return;
    }

    // Web: online slot ke bina local company mat banao — device-only static build par hi
    if (!isStaticAppBuild() && !freeOnlineSlotNow) {
      toast({
        variant: "destructive",
        title: "Online company required on web",
        description:
          maxO === 0
            ? "Your plan does not include cloud companies on the browser. Upgrade at Billing, or use the Pocket Ledger app on your device for offline-only companies."
            : `All ${maxO} online slot${maxO === 1 ? "" : "s"} are in use. Free a slot, upgrade, or create an offline company in the mobile app.`,
      });
      return;
    }

      // Login mandatory: local mode me bhi real authenticated user context use karo.
    if (addCompanyUserEnabled) {
      // Multi-user mode: either current draft is complete or at least one queued user must exist.
      const hasName = (values.companyUserName || "").trim().length > 1;
      const hasUsername = (values.companyUserUsername || "").trim().length > 0;
      const hasPassword = (values.companyUserPassword || "").trim().length > 0;
      const currentDraftComplete = hasName && hasUsername && hasPassword;
      if (!currentDraftComplete && queuedCompanyUsers.length === 0) {
        toast({
          variant: "destructive",
          title: "Company user details required",
          description: "Add at least one company user (current draft or queued list).",
        });
        return;
      }
      if (!createAsLocalOnly) {
        toast({
          variant: "destructive",
          title: "Local user only",
          description: "Add Company User works only for local companies on this device.",
        });
        return;
      }
    }

      const effectiveUserId = user?.uid || "";
      const effectiveUserEmail = user?.email || "";

    if (!createAsLocalOnly) {
      const ownedQuery = query(
        collection(firestore, "companies"),
        where("ownerId", "==", effectiveUserId),
        where("isDeleted", "!=", true)
      );
      const ownedSnap = await getDocs(ownedQuery);
      const ownedCount = ownedSnap.size;
      const planId: PlanId = ownedCount === 0 ? "basic" : (ownedSnap.docs[0]?.data()?.planId as PlanId) || "basic";
      const plan = getPlanFromPlans(livePlans, planId);
      const maxCompanies = numericEntitlement(plan.entitlements, "maxCompanies", false);
      if (maxCompanies > 0 && ownedCount >= maxCompanies) {
        toast({
          variant: "destructive",
          title: "Plan limit reached",
          description: `Your plan allows up to ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Upgrade to create more.`,
        });
        return;
      }
    }

    if (createAsLocalOnly) {
      const rows = await listLocalCompanies({ includeDeleted: false });
      const localCount = rows.length;
      // Pehli SQLite row ka planId mat use karo — wo "basic" reh sakta hai jab Pro+ kisi aur company par ho; account-level SKU `planIdForSlots` pehle hi resolve hai.
      const planId: PlanId = planIdForSlots;
      const plan = getPlanFromPlans(livePlans, planId);
      const maxLocalCompanies = numericEntitlement(plan.entitlements, "maxCompanies", true);
      if (maxLocalCompanies > 0 && localCount >= maxLocalCompanies) {
        toast({
          variant: "destructive",
          title: "Plan limit reached",
          description: `Your plan allows up to ${maxLocalCompanies} local compan${maxLocalCompanies === 1 ? "y" : "ies"}. Upgrade to create more.`,
        });
        return;
      }
    }

    const nameNorm = values.companyName.trim().toLowerCase();
    const ownedByName = allCompanies.filter(
      (c) => c.ownerId === effectiveUserId && (c.name || "").trim().toLowerCase() === nameNorm
    );
    if (ownedByName.length > 0) {
      if (createAsLocalOnly) {
        // Local-only UX: same-name company already local DB me hai, direct usi company me enter karo.
        const existingId = ownedByName[0].id;
        toast({
          title: "Using existing company",
          description: `"${values.companyName.trim()}" already exists. Opening it now.`,
        });
        setCompanyId(existingId);
        router.replace("/dashboard");
        return;
      }
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

      // Local SQLite company bhi Edit jaisa logo Firebase Storage pe — dono paths (createAsLocalOnly / online) me upload
      if (fileToUpload && canAddAvatar && user?.uid) {
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
      const isValidDate = (v?: Date): v is Date => !!v && !isNaN(v.getTime());
      const toFirestoreTs = (v?: Date) => (isValidDate(v) ? Timestamp.fromDate(v) : null);
      const toLocalIso = (v?: Date) => (isValidDate(v) ? v.toISOString() : null);
      if (createAsLocalOnly) {
        // Company users bhi isi SQLite row me — local API server optional (client-only path).
        let localCompanyUsers: LocalCompanyUserRecord[] = [];
        // Password ON: offline admin row (Edit Company jaisa) — username default email @ se pehle; "admin" sirf tab jab email na ho.
        const emailPrefixForAdmin =
          effectiveUserEmail.includes("@") ? effectiveUserEmail.split("@")[0].trim().toLowerCase() : "";
        const defaultAdminUsername = emailPrefixForAdmin || "admin";
        const adminLoginUsername = (values.adminUsername || "").trim() || defaultAdminUsername;
        if (passwordEnabled && (values.password || "").trim()) {
          const pw = (values.password || "").trim();
          localCompanyUsers = upsertUserInList(localCompanyUsers, {
            username: adminLoginUsername,
            displayName: "Admin",
            role: "manager",
            password: pw,
          });
        }
        if (addCompanyUserEnabled) {
          const usersToCreate: LocalCompanyUserDraft[] = [...queuedCompanyUsers];
          const currentName = (values.companyUserName || "").trim();
          const currentUsername = (values.companyUserUsername || "").trim();
          const currentPassword = (values.companyUserPassword || "").trim();
          if (currentName && currentUsername && currentPassword) {
            usersToCreate.push({
              name: currentName,
              username: currentUsername,
              role: (values.companyUserRole || "manager").trim().toLowerCase(),
              password: currentPassword,
            });
          }
          for (const localUser of usersToCreate) {
            localCompanyUsers = upsertUserInList(localCompanyUsers, {
              username: localUser.username,
              displayName: localUser.name,
              role: localUser.role,
              password: localUser.password,
            });
          }
        }
        const currencyRow = getDefaultCurrencyForCountry(values.billingCurrencyCountry);
        // Static local-first: company root doc local table me store karo; Firebase write skip.
        await upsertLocalCompany({
          id: companyId,
          name: values.companyName,
          address: values.address ?? "",
          phone: values.phone ?? "",
          email: values.email ?? "",
          pan: values.pan ?? "",
          country: values.country,
          currencyCode: currencyRow.currencyCode,
          currencySymbol: currencyRow.symbol,
          // Password only when toggle enabled; otherwise keep company open without password.
          password: passwordEnabled ? (values.password ?? null) : null,
          logoUrl,
          // Local store JSON-safe date fields (invalid date se save fail na ho).
          fiscalYearStart: toLocalIso(values.fiscalYearStart),
          fiscalYearEnd: toLocalIso(values.fiscalYearEnd),
          storageOption: "local",
          ownerId: effectiveUserId,
          ownerEmail: effectiveUserEmail,
          createdAt: Date.now(),
          sharedWith: [],
          sharedWithEmails: [effectiveUserEmail].filter(Boolean),
          planId: "basic",
          planExpiry: expiryDate.toISOString(),
          isDeleted: false,
          // Sirf jab company password set ho + admin row bhi bani ho — warna galat username doc par na save ho.
          adminUsername:
            passwordEnabled && (values.password || "").trim() ? adminLoginUsername : null,
          localCompanyUsers,
        });
      } else {
        const currencyRowOnline = getDefaultCurrencyForCountry(values.billingCurrencyCountry);
        await setDoc(doc(firestore, "companies", companyId), {
          name: values.companyName,
          address: values.address ?? "",
          phone: values.phone ?? "",
          email: values.email ?? "",
          pan: values.pan ?? "",
          country: values.country,
          currencyCode: currencyRowOnline.currencyCode,
          currencySymbol: currencyRowOnline.symbol,
          // Password only when toggle enabled; otherwise keep company open without password.
          password: passwordEnabled ? (values.password ?? null) : null,
          logoUrl,
          fiscalYearStart: toFirestoreTs(values.fiscalYearStart) ?? null,
          fiscalYearEnd: toFirestoreTs(values.fiscalYearEnd) ?? null,
          storageOption: "firebase",
          ownerId: effectiveUserId,
          ownerEmail: effectiveUserEmail,
          createdAt: serverTimestamp(),
          sharedWith: [],
          sharedWithEmails: ensureSuperAdminInSharedEmails(
            effectiveUserEmail ? [effectiveUserEmail] : [],
            customUser?.email,
            customUser?.role === "SuperAdmin"
          ),
          planId: "basic",
          planExpiry: Timestamp.fromDate(expiryDate),
        });
        // Static/APK: SQLite registry row abhi banao taaki `initializeCompanyDataClient` → `writeEntity` (outbox) path chale, web cloud flow same.
        if (isStaticAppBuild()) {
          await upsertLocalCompany({
            id: companyId,
            name: values.companyName,
            address: values.address ?? "",
            phone: values.phone ?? "",
            email: values.email ?? "",
            pan: values.pan ?? "",
            country: values.country,
            currencyCode: currencyRowOnline.currencyCode,
            currencySymbol: currencyRowOnline.symbol,
            password: passwordEnabled ? (values.password ?? null) : null,
            logoUrl,
            fiscalYearStart: toLocalIso(values.fiscalYearStart),
            fiscalYearEnd: toLocalIso(values.fiscalYearEnd),
            storageOption: "firebase",
            ownerId: effectiveUserId,
            ownerEmail: effectiveUserEmail,
            createdAt: Date.now(),
            sharedWith: [],
            sharedWithEmails: ensureSuperAdminInSharedEmails(
              effectiveUserEmail ? [effectiveUserEmail] : [],
              customUser?.email,
              customUser?.role === "SuperAdmin"
            ),
            planId: "basic",
            planExpiry: expiryDate.toISOString(),
            isDeleted: false,
            syncedFromCloud: true,
            syncPolicy: "online",
            authoritativeCompanyId: companyId,
            adminUsername:
              passwordEnabled && (values.password || "").trim()
                ? (effectiveUserEmail.includes("@")
                    ? effectiveUserEmail.split("@")[0].trim().toLowerCase()
                    : "admin")
                : null,
          } as Parameters<typeof upsertLocalCompany>[0]);
        }
        await initializeCompanyDataClient(companyId, effectiveUserId);
      }

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
        description:
          createAsLocalOnly && error instanceof Error && error.message
            ? `Failed to save company: ${error.message}`
            : "Failed to save company. Please try again.",
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
          <FormField
            control={form.control}
            name="billingCurrencyCountry"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">Currency</FormLabel>
                <FormControl>
                  <CountryCurrencyCombobox
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Search country or currency"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Defaults from country; search by country name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Sirf static/APK: local vs online — web/browser par ye choice nahi */}
        {staticBuildAllowsLocalCompany && !forceLocalCompanyCreation && hasFreeOnlineSlot && (
          <div className="space-y-2 rounded-md border border-black bg-muted/30 p-3">
            <FormLabel className="text-xs sm:text-sm">Save company as</FormLabel>
            <FormDescription className="text-xs">
              Your plan has a free online company slot. Pick cloud sync or keep data only on this device.
            </FormDescription>
            <RadioGroup
              value={creationMode}
              onValueChange={(v) => setCreationMode(v as "local" | "online")}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="online" id="create-company-online" />
                <span className="text-xs sm:text-sm">Online (sync across devices)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="local" id="create-company-local" />
                <span className="text-xs sm:text-sm">Local (this device / offline)</span>
              </label>
            </RadioGroup>
          </div>
        )}
        {staticBuildAllowsLocalCompany && !forceLocalCompanyCreation && !hasFreeOnlineSlot && (
          <p className="rounded-md border border-dashed border-muted-foreground/30 p-2 text-xs text-muted-foreground">
            {maxOnlineSlots === 0
              ? "Your plan does not include online companies. This company will be saved only on this device."
              : `All ${maxOnlineSlots} online company slot${maxOnlineSlots === 1 ? " is" : "s are"} in use (${usedOnlineSlots}/${maxOnlineSlots}). This company will be saved only on this device.`}
          </p>
        )}
        {!staticBuildAllowsLocalCompany && !hasFreeOnlineSlot && (
          <p className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            {maxOnlineSlots === 0
              ? "On web, companies must sync to the cloud. Upgrade your plan at Billing to create a company here."
              : `All ${maxOnlineSlots} online slot${maxOnlineSlots === 1 ? " is" : "s are"} in use (${usedOnlineSlots}/${maxOnlineSlots}). Upgrade or remove an online company first.`}
          </p>
        )}

        <div className="space-y-4 rounded-md border border-black bg-muted/25 p-3 dark:border-black dark:bg-muted/15">
          {/* Admin security section highlight: password protection controls grouped in separate color. */}
          <FormItem>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <FormLabel className="text-xs sm:text-sm">Protect Company With Password</FormLabel>
                <FormDescription className="text-xs">
                  Turn on to require password when opening this company.
                </FormDescription>
              </div>
              {/* Password guard switch is always visible so user can enable/disable directly in create form. */}
              <input
                type="checkbox"
                checked={passwordEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setPasswordEnabled(enabled);
                  if (!enabled) {
                    // Password protection off होने पर company-user setup भी hide/reset करो.
                    setAddCompanyUserEnabled(false);
                    setQueuedCompanyUsers([]);
                    form.setValue("password", "");
                    form.setValue("confirmPassword", "");
                    form.setValue("companyUserName", "");
                    form.setValue("companyUserUsername", "");
                    form.setValue("companyUserRole", "manager");
                    form.setValue("companyUserPassword", "");
                  }
                }}
                className="h-4 w-4 rounded border-input"
              />
            </div>
          </FormItem>
          {passwordEnabled && (
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
          )}
        </div>

        {passwordEnabled && willCreateAsLocal && (
          <FormField
            control={form.control}
            name="adminUsername"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">Username (Company Login)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., admin_user"
                    className="text-xs sm:text-sm"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Login to open this company on this device — together with the password above.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {passwordEnabled && !willCreateAsLocal && (
        <div className="space-y-4 rounded-md border border-black bg-muted/25 p-3 dark:border-black dark:bg-muted/15">
          {/* Online company: optional extra users (email share) — local path me hide. */}
          <FormItem>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <FormLabel className="text-xs sm:text-sm">Add Company User</FormLabel>
                <FormDescription className="text-xs">
                  Add one company user while creating company. Default role is Admin.
                </FormDescription>
              </div>
              {/* User asked: add-company-user तभी दिखे/use हो जब password protection enabled हो. */}
              <input
                type="checkbox"
                checked={addCompanyUserEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setAddCompanyUserEnabled(enabled);
                  if (!enabled) {
                    setQueuedCompanyUsers([]);
                    form.setValue("companyUserName", "");
                    form.setValue("companyUserUsername", "");
                    form.setValue("companyUserRole", "manager");
                    form.setValue("companyUserPassword", "");
                  }
                }}
                className="h-4 w-4 rounded border-input"
              />
            </div>
          </FormItem>

          {addCompanyUserEnabled && queuedCompanyUsers.length > 0 && (
            <div className="rounded-md border p-3">
              {/* Queued local users: created together when company is saved. */}
              <p className="text-xs font-medium text-muted-foreground mb-2">Queued Users ({queuedCompanyUsers.length})</p>
              <div className="space-y-1">
                {queuedCompanyUsers.map((u, index) => (
                  <div key={`${u.username}-${index}`} className="flex items-center justify-between text-xs">
                    <span>{u.name} ({u.username}) - {u.role}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setQueuedCompanyUsers((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {addCompanyUserEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <FormField
                control={form.control}
                name="companyUserName"
                render={({ field }: any) => (
                  <FormItem>
                    {/* User-requested label rename for local company user naming. */}
                    <FormLabel className="text-xs sm:text-sm">Comapny User Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sales User" className="text-xs sm:text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyUserUsername"
                render={({ field }: any) => (
                  <FormItem>
                    {/* User-requested label rename for login identifier field. */}
                    <FormLabel className="text-xs sm:text-sm">Login User name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., sales_user" className="text-xs sm:text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyUserRole"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Company User Role</FormLabel>
                    <FormControl>
                      {/* "manager" value works as admin-level role in current permission presets. */}
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs sm:text-sm"
                        value={field.value || "manager"}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        <option value="manager">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="accountant">Accountant</option>
                        <option value="data-entry">Data Entry</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyUserPassword"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Company User Password (Optional)</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showCompanyUserPassword ? "text" : "password"}
                          placeholder="Set user password"
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
                        onClick={() => setShowCompanyUserPassword((s) => !s)}
                      >
                        {showCompanyUserPassword ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Queue one more local user draft without saving company immediately.
                    const name = (form.getValues("companyUserName") || "").trim();
                    const username = (form.getValues("companyUserUsername") || "").trim();
                    const role = (form.getValues("companyUserRole") || "manager").trim().toLowerCase();
                    const password = (form.getValues("companyUserPassword") || "").trim();
                    if (!name || !username || !password) {
                      toast({
                        variant: "destructive",
                        title: "User details required",
                        description: "Fill name, username and password before adding another user.",
                      });
                      return;
                    }
                    setQueuedCompanyUsers((prev) => [...prev, { name, username, role, password }]);
                    form.setValue("companyUserName", "");
                    form.setValue("companyUserUsername", "");
                    form.setValue("companyUserRole", "manager");
                    form.setValue("companyUserPassword", "");
                  }}
                >
                  Add Another User
                </Button>
              </div>
            </div>
          )}
        </div>
        )}

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
