
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CalendarIcon, Eye, EyeOff, CheckCircle, AlertTriangle, Upload, UserPlus } from "lucide-react";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { countries } from "@/lib/countries";
import { CountryCurrencyCombobox } from "@/components/shared/CountryCurrencyCombobox";
import { getDefaultCurrencyForCountry } from "@/lib/worldCurrencies";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { uploadCompanyLogo } from "@/lib/storage";
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile } from "@/lib/localPendingFiles";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Calendar } from "@/components/ui/calendar";
import { compressImageForCompany, attachmentImageStillTooLargeToastFields } from "@/lib/attachmentCompressionUi";
import { FilePreview } from "../vouchers/FilePreview";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { doc, setDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { initializeCompanyDataClient } from "@/lib/initializeCompanyDataClient";
import { ensureSuperAdminInSharedEmails } from "@/lib/superAdminEmails";
import { sharedWithEmailsLowerFromList } from "@/lib/sharedWithEmailsQuery";
import { generateCompanyId } from "@/lib/generateCompanyId";
import { pocketLedgerStorageDocFields } from "@/lib/firebaseStoragePaths";
import { generateUniqueInterCompanyAccountNo } from "@/lib/interCompany/interCompanyAccountNo";
import { generateUniqueInterCompanyCompanyCode } from "@/lib/interCompany/interCompanyCompanyCode";
import { CompanyInterCompanyCodeField } from "@/components/inter-company/CompanyInterCompanyCodeField";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { numericEntitlement, type PlanId } from "@/config/plans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { countOnlineCompanySlotsForOwner, maxOnlineCompaniesForPlan } from "@/lib/companyOnlineSlots";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { type LocalCompanyUserRecord, upsertUserInList } from "@/lib/localCompanyUsers";
import { PlServerShareUserDialog } from "@/components/company/PlServerShareUserDialog";
import { planAllowsFirebaseOnline } from "@/lib/planSyncEntitlements";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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
type LocalCompanyUserDraft = {
  name: string;
  username: string;
  role: string;
  password: string;
  shareEmail?: string;
};

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
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [queuedCompanyUsers, setQueuedCompanyUsers] = useState<LocalCompanyUserDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  // `company` = abhi selected company (plan hint); owned list se highest tier — pehle hamesha "basic" plan check tha
  const { setCompanyId, allCompanies, allCompaniesRegistry, company, reloadLocalCompanyRegistry, adoptNewLocalCompany } = useCompany();
  /** Gate-filtered `allCompanies` se alag — create form me local + online dono count/plan ke liye. */
  const companyRowsForCreate = useMemo(
    () => (allCompaniesRegistry?.length ? allCompaniesRegistry : allCompanies),
    [allCompaniesRegistry, allCompanies]
  );
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const livePlans = useLivePlans();
  const accountPlanId = useMemo(
    () => resolveEffectiveAccountPlanId(companyRowsForCreate, user?.uid, company?.planId),
    [companyRowsForCreate, user?.uid, company?.planId]
  );
  const canAddAvatar = useMemo(() => {
    return getPlanFromPlans(livePlans, accountPlanId).entitlements.canAddAvatar === true;
  }, [accountPlanId, livePlans]);

  const accountPlan = useMemo(
    () => getPlanFromPlans(livePlans, accountPlanId),
    [accountPlanId, livePlans]
  );
  const allowFirebaseOnline = planAllowsFirebaseOnline(accountPlanId, accountPlan);
  const maxOnlineSlots = useMemo(
    () => maxOnlineCompaniesForPlan(accountPlanId, accountPlan),
    [accountPlanId, accountPlan]
  );
  const usedOnlineSlots = useMemo(
    () => (user?.uid ? countOnlineCompanySlotsForOwner(companyRowsForCreate, user.uid) : 0),
    [companyRowsForCreate, user?.uid]
  );
  /** Online company creation only; slot guard still applies. */
  const hasFreeOnlineSlot = allowFirebaseOnline && maxOnlineSlots > 0 && usedOnlineSlots < maxOnlineSlots;
  const showCompanyTypeChoice = Boolean(user?.uid);
  const [storageMode, setStorageMode] = useState<"local" | "online">("local");
  const willCreateAsLocal = !showCompanyTypeChoice || !allowFirebaseOnline || storageMode === "local";

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

    setIsFileProcessing(true);
    try {
      const { file: compressedFile, maxBytes, maxKb } = await compressImageForCompany(inputFile, null);
      if (compressedFile.size > maxBytes) {
        toast({
          variant: "destructive",
          ...attachmentImageStillTooLargeToastFields(maxKb),
        });
        e.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(compressedFile);
      setFileToUpload({ file: compressedFile, preview });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not process file",
        description: error instanceof Error ? error.message : "Compression or PDF read failed.",
      });
    } finally {
      e.target.value = "";
      setIsFileProcessing(false);
    }
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
    const planIdForSlots = resolveEffectiveAccountPlanId(companyRowsForCreate, user?.uid, company?.planId);
    const maxO = maxOnlineCompaniesForPlan(planIdForSlots, getPlanFromPlans(livePlans, planIdForSlots));
    const usedO = user?.uid ? countOnlineCompanySlotsForOwner(companyRowsForCreate, user.uid) : 0;
    const freeOnlineSlotNow = maxO > 0 && usedO < maxO;
    const createAsLocalOnly = willCreateAsLocal;

    if (!user?.uid) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        // Login is required even in local-only mode so plan/settings can sync per user.
        description: "Please login first to create a company.",
      });
      return;
    }

    if (!createAsLocalOnly && !freeOnlineSlotNow) {
      toast({
        variant: "destructive",
        title: "Online company required",
        description:
          maxO === 0
            ? "Your plan does not include cloud companies. Upgrade at Billing to create a company."
            : `All ${maxO} online slot${maxO === 1 ? "" : "s"} are in use. Free a slot or upgrade your plan.`,
      });
      return;
    }

      // Login mandatory: local mode me bhi real authenticated user context use karo.
    if (addCompanyUserEnabled) {
      if (queuedCompanyUsers.length === 0) {
        toast({
          variant: "destructive",
          title: "Company user details required",
          description: "Add at least one user with Add Person.",
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
    const registryRows = companyRowsForCreate;
    const ownedByName = registryRows.filter(
      (c, i, arr) =>
        arr.findIndex((x) => x.id === c.id) === i &&
        c.ownerId === effectiveUserId &&
        (c.name || "").trim().toLowerCase() === nameNorm
    );
    if (ownedByName.length > 0) {
      if (createAsLocalOnly) {
        // Local-only UX: same-name company already local DB me hai, direct usi company me enter karo.
        const existingId = ownedByName[0].id;
        toast({
          title: "Using existing company",
          description: `"${values.companyName.trim()}" already exists. Opening it now.`,
        });
        if (onCompanyCreated) {
          onCompanyCreated(existingId);
        } else {
          setCompanyId(existingId);
          router.replace("/dashboard");
        }
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
      // Inter-company: unique A/c No + 12-char alphanumeric Company Code
      const interCompanyAccountNo = await generateUniqueInterCompanyAccountNo(companyId);
      const interCompanyCompanyCode = await generateUniqueInterCompanyCompanyCode(
        companyId,
        values.companyName
      );
      let logoUrl: string | null = null;

      if (fileToUpload && canAddAvatar && user?.uid) {
        if (createAsLocalOnly) {
          const id = generateLocalFileId();
          await putPendingFile({
            id,
            blob: fileToUpload.file,
            contentType: fileToUpload.file.type || "image/jpeg",
            docPath: `companies/${companyId}/parties/${companyId}`,
            field: "logoUrl",
            storagePathPrefix: `companies/${companyId}/company-files/logo`,
            fileName: fileToUpload.file.name,
          });
          logoUrl = `${LOCAL_FILE_PREFIX}${id}`;
        } else {
          logoUrl = await uploadCompanyLogo(companyId, values.companyName, fileToUpload.file, {
            usePocketLedger: true,
          });
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
            uid: effectiveUserId,
          });
        }
        if (addCompanyUserEnabled) {
          for (const localUser of queuedCompanyUsers) {
            localCompanyUsers = upsertUserInList(localCompanyUsers, {
              username: localUser.username,
              displayName: localUser.name,
              role: localUser.role,
              password: localUser.password,
              shareEmail: localUser.shareEmail,
            });
          }
        }
        const currencyRow = getDefaultCurrencyForCountry(values.billingCurrencyCountry);
        // Static local-first: company root doc local table me store karo; Firebase write skip.
        const localCompanyDoc = {
          id: companyId,
          name: values.companyName,
          interCompanyAccountNo,
          interCompanyCompanyCode,
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
          storageOption: "local" as const,
          syncPolicy: "offline" as const,
          syncedFromCloud: false,
          localOnly: true,
          localPersistence: "sqlite" as const,
          firestoreSyncDisabled: true,
          authoritativeCompanyId: "",
          ownerId: effectiveUserId,
          ownerEmail: effectiveUserEmail,
          createdAt: Date.now(),
          sharedWith: [] as string[],
          sharedWithEmails: [effectiveUserEmail].filter(Boolean),
          sharedWithEmailsLower: sharedWithEmailsLowerFromList(
            [effectiveUserEmail].filter(Boolean) as string[]
          ),
          planId: "basic",
          planExpiry: expiryDate.toISOString(),
          isDeleted: false,
          // Sirf jab company password set ho + admin row bhi bani ho — warna galat username doc par na save ho.
          adminUsername:
            passwordEnabled && (values.password || "").trim() ? adminLoginUsername : null,
          localCompanyUsers,
        };
        await upsertLocalCompany(localCompanyDoc);
        adoptNewLocalCompany(localCompanyDoc);
      } else {
        const currencyRowOnline = getDefaultCurrencyForCountry(values.billingCurrencyCountry);
        await setDoc(doc(firestore, "companies", companyId), {
          name: values.companyName,
          interCompanyAccountNo,
          interCompanyCompanyCode,
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
          ...pocketLedgerStorageDocFields(companyId),
          createdAt: serverTimestamp(),
          sharedWith: [],
          ...(() => {
            const sharedWithEmails = ensureSuperAdminInSharedEmails(
              effectiveUserEmail ? [effectiveUserEmail] : [],
              customUser?.email,
              customUser?.role === "SuperAdmin"
            );
            return {
              sharedWithEmails,
              sharedWithEmailsLower: sharedWithEmailsLowerFromList(sharedWithEmails),
            };
          })(),
          planId: "basic",
          planExpiry: Timestamp.fromDate(expiryDate),
        });
        // Static/APK: SQLite registry row abhi banao taaki `initializeCompanyDataClient` → `writeEntity` (outbox) path chale, web cloud flow same.
        if (isStaticAppBuild()) {
          await upsertLocalCompany({
            id: companyId,
            name: values.companyName,
            interCompanyAccountNo,
          interCompanyCompanyCode,
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
            ...pocketLedgerStorageDocFields(companyId),
            createdAt: Date.now(),
            sharedWith: [],
            ...(() => {
              const sharedWithEmails = ensureSuperAdminInSharedEmails(
                effectiveUserEmail ? [effectiveUserEmail] : [],
                customUser?.email,
                customUser?.role === "SuperAdmin"
              );
              return {
                sharedWithEmails,
                sharedWithEmailsLower: sharedWithEmailsLowerFromList(sharedWithEmails),
              };
            })(),
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

      // Background registry mirror — selection/navigation ke baad taaki create dialog dubara na khule.
      reloadLocalCompanyRegistry();
    } catch (error) {
      console.error("Error creating company:", error);
      const code = (error as { code?: string })?.code;
      const errMsg = error instanceof Error ? error.message : "";
      let description = "Failed to save company. Please try again.";
      if (createAsLocalOnly && errMsg) {
        description = `Failed to save company: ${errMsg}`;
      } else if (errMsg === "local_company_storage") {
        description =
          "This company uses device storage and Google Drive sync — not Firebase Storage. Enable cloud sync in company settings, or save without a logo.";
      } else if (code === "storage/unauthorized" || code === "storage/unauthenticated") {
        description =
          "Logo upload failed: cloud storage permission denied. Sign in again, or deploy the latest Firebase storage rules.";
      }
      toast({
        variant: "destructive",
        title: "Error",
        description,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
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

          <CompanyInterCompanyCodeField mode="create" />

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

        {showCompanyTypeChoice ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <Label className="text-sm font-medium text-foreground">Company type</Label>
            <p className="text-xs text-muted-foreground">
              Offline companies stay on this device (SQLite). Online companies sync to Firestore and count toward your
              plan&apos;s online company slots ({usedOnlineSlots}/{maxOnlineSlots || "—"} used).
            </p>
            <RadioGroup
              value={storageMode}
              onValueChange={(v) => setStorageMode(v as "local" | "online")}
              className="grid gap-2"
            >
              <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                <RadioGroupItem value="local" id="create-storage-local" className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Offline (this device)</span> — local SQLite; best for
                  single-PC / no cloud sync.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                <RadioGroupItem
                  value="online"
                  id="create-storage-online"
                  className="mt-0.5"
                  disabled={!allowFirebaseOnline || !hasFreeOnlineSlot}
                />
                <span className={!allowFirebaseOnline || !hasFreeOnlineSlot ? "text-muted-foreground" : ""}>
                  <span className="font-medium text-foreground">Online (Firestore)</span> — cloud company; other
                  devices can sync when signed in with access.
                </span>
              </label>
            </RadioGroup>
            {!allowFirebaseOnline ? (
              <p className="text-xs text-muted-foreground">
                Online companies need a plan with cloud sync. Upgrade at Billing to enable the online option.
              </p>
            ) : null}
          </div>
        ) : null}

        {!willCreateAsLocal && !hasFreeOnlineSlot && (
          <p className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            {maxOnlineSlots === 0
              ? "Companies are cloud-sync only. Upgrade your plan at Billing to create a company."
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

        {passwordEnabled && willCreateAsLocal && (
        <div className="space-y-4 rounded-md border border-black bg-muted/25 p-3 dark:border-black dark:bg-muted/15">
          {/* Local company: optional extra users on this device. */}
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
                    <span>
                      {u.name} ({u.username}) - {u.role}
                      {u.shareEmail ? ` · ${u.shareEmail}` : ""}
                    </span>
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Local company bhi local server par hi share hoti hai — Add Person se hi user banao.
              </p>
              <Button type="button" variant="outline" onClick={() => setAddPersonOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Person
              </Button>
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
            disabled={
              isLoading ||
              isFileProcessing ||
              !form.formState.isValid ||
              (storageMode === "online" && !hasFreeOnlineSlot)
            }
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Company
          </Button>
        </div>
      </form>
      <PlServerShareUserDialog
        companyId={null}
        companyName={form.watch("companyName")}
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        mode="queue"
        onQueueUser={(draft) => setQueuedCompanyUsers((prev) => [...prev, draft])}
      />
    </Form>
  );
}
