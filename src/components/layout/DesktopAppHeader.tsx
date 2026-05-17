
"use client";

import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Landmark,
  Briefcase,
  BookText,
  ChevronsRight,
  Users,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Expand,
  Minimize,
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  FileDigit,
  Smartphone,
  LogOut,
  Monitor,
  FileText,
  Settings,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { filterSharedOnlyCompaniesForSuperAdminInMainApp } from "@/lib/companySuperAdminFilter";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore, auth, signOutWithFirestoreTeardown } from "@/lib/firebase";
import { format } from "date-fns";
import { CompanyActions } from "@/components/company/CompanySelector";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { createPortal } from "react-dom";
import { useDate } from "@/hooks/useDate";
import { useToast } from "@/hooks/use-toast";
import { DateFormatSettingsDialog } from "@/components/settings/DateFormatSettingsDialog";
import { CreatePartyDialog } from "../party/CreatePartyDialog";
import { CreateItemDialog } from "../items/CreateItemDialog";
import { CreateBankAccountDialog } from "../bank-cash/CreateBankAccountDialog";
import { CreateStaffDialog } from "../staff/CreateStaffDialog";
import { useIsMobile, useMobileView } from "@/hooks/use-mobile";
import { useCompany } from "@/hooks/useCompany";
import { estimateUserFirestoreBytes } from "@/lib/storageUsageClient";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { pruneRememberedLoginEmailIfDisabled } from "@/lib/loginRememberEmail";
import type { Company } from "@/hooks/useCompany";
import {
  DEFAULT_PLANS,
  getNextPaidUpgrade,
  normalizePlanIdForClient,
  numericEntitlement,
  companyStorageIsLocal,
  type PlanId,
} from "@/config/plans";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { Badge } from "../ui/badge";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { planSyncFailureUserMessage } from "@/lib/companyPlanServerSync";
import { cn } from "@/lib/utils";
import { useMasterDetailHeaderIdSnapshot } from "@/hooks/useMasterDetailHeaderIdSnapshot";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isLocalOnlyMode } from "@/lib/localMode";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { disableLocalGuest, isLocalGuestEnabled } from "@/lib/localGuestSession";
import { highestPlanIdAmongOwnedCompanies, resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import {
  countLocalCompanySlotsForOwner,
  countOnlineCompanySlotsForOwner,
  maxOnlineCompaniesForPlan,
} from "@/lib/companyOnlineSlots";
import { GlobalFileHoverPreviewSwitch } from "@/components/layout/GlobalFileHoverPreviewSwitch";
import { CopyLedgerHeaderButton } from "@/components/ledger/CopyLedgerHeaderButton";
import { RenewProrationPills } from "@/components/billing/RenewProrationPills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { getCompanyPlanExpiryMsFromDoc } from "@/lib/companyPlanExpiryMs";

import { useEmbeddedAttachmentPrefetch } from "@/contexts/EmbeddedAttachmentPrefetchContext";

/** APK/static: background attachment cache — header ke niche patli strip (kam visible). */
function EmbeddedAttachmentHeaderProgress() {
  const { headerAttachmentPercent } = useEmbeddedAttachmentPrefetch();
  if (headerAttachmentPercent == null) return null;
  const w = Math.min(100, Math.max(0, Math.round(headerAttachmentPercent)));
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 z-40 h-[2px] overflow-hidden bg-muted/25 opacity-70"
      aria-hidden
    >
      <div
        className="h-full bg-primary/30 transition-[width] duration-500 ease-out"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

/** Electron desktop: header quick-action buttons strip collapsed — `main.js` View menu se bhi toggle */
const PL_DESKTOP_QUICK_ACTIONS_KEY = "pl-desktop-header-quick-actions-collapsed";

/** Static export trailingSlash: URL /party/ vs /party — normalize for route checks */
function pathRoot(pathname: string | null, segment: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  return p === `/${segment}`;
}

/** Header company dropdown guard: admin-hidden/deleted company normal app header me hide rahe. */
function isCompanyVisibleInHeader(c: Company & { movedToAdminRecycleAt?: unknown }): boolean {
  return c.isDeleted !== true && c.movedToAdminRecycleAt == null;
}


function ScreenControls() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Capacitor / static APK: app already near-fullscreen — header se expand icon hata
  if (isStaticAppBuild()) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleFullscreen}
      title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      className="bg-background shadow-sm flex-shrink-0 h-9 w-9"
    >
      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
    </Button>
  );
}


function AddNewButtonOnReportPage() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const isReportPage = pathname != null && (pathname.includes("/reports/party-statement") || pathname.includes("/reports/tax-statement") || pathname.includes("/reports/item-statement"));
  if (!isReportPage || isMobile) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push("/sale")}
      title="Add new"
    >
      <Plus className="h-4 w-4" />
      <span>Add New</span>
    </Button>
  );
}

function ReportButtonForPartyOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("party");
  // Path-based: /party/[id] or /party/group/[id]; Query-based (mobile/APK): /party?selected=id or /party?view=groups&selected=id
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/party\/group\/[^/]+$/.test(pathname);
  const isPartyFromPath = pathname != null && /^\/party\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isPartyPage = pathRoot(pathname, "party");
  const isGroupDetails = isGroupFromPath || (isPartyPage && viewFromQuery === "groups");
  const isPartyDetails = isPartyFromPath || (isPartyPage && viewFromQuery !== "groups");
  // sessionStorage fallback: router.replace / searchParams race se ~20ms flicker hatane
  const id = idFromPath || (isPartyPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isPartyDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/party-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/party-statement?partyId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function ReportButtonForBankAccountOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("bank-cash");
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/bank-cash\/group\/[^/]+$/.test(pathname);
  const isAccountFromPath = pathname != null && /^\/bank-cash\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isBankPage = pathRoot(pathname, "bank-cash");
  const isGroupDetails = isGroupFromPath || (isBankPage && viewFromQuery === "groups");
  const isAccountDetails = isAccountFromPath || (isBankPage && viewFromQuery !== "groups");
  const id = idFromPath || (isBankPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isAccountDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/bank-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/bank-statement?accountId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function ReportButtonForStaffOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("staff");
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/staff\/group\/[^/]+$/.test(pathname);
  const isStaffFromPath = pathname != null && /^\/staff\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isStaffPage = pathRoot(pathname, "staff");
  const isGroupDetails = isGroupFromPath || (isStaffPage && viewFromQuery === "groups");
  const isStaffDetails = isStaffFromPath || (isStaffPage && viewFromQuery !== "groups");
  const id = idFromPath || (isStaffPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isStaffDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/staff-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/staff-statement?staffId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function ReportButtonForItemOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("items");
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/items\/group\/[^/]+$/.test(pathname);
  const isItemFromPath = pathname != null && /^\/items\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isItemsPage = pathRoot(pathname, "items");
  const isGroupDetails = isGroupFromPath || (isItemsPage && viewFromQuery === "groups");
  const isItemDetails = isItemFromPath || (isItemsPage && viewFromQuery !== "groups");
  const id = idFromPath || (isItemsPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isItemDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/item-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/item-statement?itemId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function ReportButtonForTaxOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("tax");
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/tax\/group\/[^/]+$/.test(pathname);
  const isTaxFromPath = pathname != null && /^\/tax\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isTaxPage = pathRoot(pathname, "tax");
  const isGroupDetails = isGroupFromPath || (isTaxPage && viewFromQuery === "groups");
  const isTaxDetails = isTaxFromPath || (isTaxPage && viewFromQuery !== "groups");
  const id = idFromPath || (isTaxPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isTaxDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/tax-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/tax-statement?taxId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function ReportButtonForExpenseAccountOrGroup() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useLocationSearchParams();
  const router = useRouter();
  const idFromStore = useMasterDetailHeaderIdSnapshot("incomes");
  const idFromPath = params?.id as string | undefined;
  const idFromQuery = searchParams?.get("selected") ?? undefined;
  const viewFromQuery = searchParams?.get("view");
  const isGroupFromPath = pathname != null && /^\/incomes\/group\/[^/]+$/.test(pathname);
  const isAccountFromPath = pathname != null && /^\/incomes\/[^/]+$/.test(pathname) && !pathname.includes("/group");
  const isIncomesPage = pathRoot(pathname, "incomes");
  const isGroupDetails = isGroupFromPath || (isIncomesPage && viewFromQuery === "groups");
  const isAccountDetails = isAccountFromPath || (isIncomesPage && viewFromQuery !== "groups");
  const id = idFromPath || (isIncomesPage ? (idFromQuery ?? idFromStore) : undefined);

  if (!id || (!isAccountDetails && !isGroupDetails)) return null;

  const href = isGroupDetails
    ? `/reports/expense-statement?groupId=${encodeURIComponent(id)}`
    : `/reports/expense-statement?accountId=${encodeURIComponent(id)}`;

  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-background shadow-sm flex-shrink-0 h-9 gap-1.5"
      onClick={() => router.push(href)}
      title="Open report"
    >
      <FileText className="h-4 w-4" />
      <span>Report</span>
    </Button>
  );
}

function MobileReportButtonsOnly() {
  const isMobile = useIsMobile();
  // User request: report shortcut buttons should be visible only on mobile layout, not desktop web/EXE header.
  if (!isMobile) return null;
  return (
    <>
      <ReportButtonForPartyOrGroup />
      <ReportButtonForBankAccountOrGroup />
      <ReportButtonForStaffOrGroup />
      <ReportButtonForTaxOrGroup />
      <ReportButtonForExpenseAccountOrGroup />
      <ReportButtonForItemOrGroup />
    </>
  );
}

function HeaderActions() {
  const { isMobile } = useMobileView();
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);

  // ✅ voucher dialogs controlled open states
  const [openSale, setOpenSale] = useState(false);
  const [openPurchase, setOpenPurchase] = useState(false);
  const [openPaymentIn, setOpenPaymentIn] = useState(false);
  const [openPaymentOut, setOpenPaymentOut] = useState(false);
  const [openJournal, setOpenJournal] = useState(false);
  const [openSalary, setOpenSalary] = useState(false);

  const buttonClass = "whitespace-nowrap flex-grow min-w-fit";

  // Hide quick actions whenever mobile view is selected (including on PC)
  if (isMobile) {
    return null;
  }

  return (
    <>
      {/* ✅ Sale — global preview switch ab fullscreen icon ke paas (right cluster) */}
      <AddVoucherDialog defaultTab="sale" voucher={undefined} isOpen={openSale} onOpenChange={setOpenSale}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenSale(true)} data-theme-btn="add-sale">
          <ShoppingBag className="mr-1 h-4 w-4" /> Add Sale
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Purchase */}
      <AddVoucherDialog defaultTab="purchase" voucher={undefined} isOpen={openPurchase} onOpenChange={setOpenPurchase}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenPurchase(true)} data-theme-btn="add-purchase">
          <ShoppingCart className="mr-1 h-4 w-4" /> Add Purchase
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Payment In */}
      <AddVoucherDialog defaultTab="payment_in" voucher={undefined} isOpen={openPaymentIn} onOpenChange={setOpenPaymentIn}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenPaymentIn(true)} data-theme-btn="payment-in">
          <ArrowRight className="mr-1 h-4 w-4" /> Payment In
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Payment Out */}
      <AddVoucherDialog defaultTab="payment_out" voucher={undefined} isOpen={openPaymentOut} onOpenChange={setOpenPaymentOut}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenPaymentOut(true)} data-theme-btn="payment-out">
          <ArrowLeft className="mr-1 h-4 w-4" /> Payment Out
        </PermissionButton>
      </AddVoucherDialog>

      {/* Journal – opens AddVoucherDialog with journal tab */}
      <AddVoucherDialog defaultTab="journal" voucher={undefined} isOpen={openJournal} onOpenChange={setOpenJournal}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenJournal(true)}>
          <FileText className="mr-1 h-4 w-4" /> Journal
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Salary */}
      <AddVoucherDialog defaultTab="add_salary" voucher={undefined} isOpen={openSalary} onOpenChange={setOpenSalary}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} onClick={() => setOpenSalary(true)} data-theme-btn="add-salary">
          <FileDigit className="mr-1 h-4 w-4" /> Add Salary
        </PermissionButton>
      </AddVoucherDialog>

      <CreatePartyDialog onPartyCreated={() => {}} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} data-theme-btn="add-party">
          <Users className="mr-1 h-4 w-4" /> Add Party
        </PermissionButton>
      </CreatePartyDialog>

      <CreateItemDialog onItemCreated={() => {}} isOpen={isCreateItemOpen} onOpenChange={setIsCreateItemOpen}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} data-theme-btn="add-item">
          <BookText className="mr-1 h-4 w-4" /> Add Item
        </PermissionButton>
      </CreateItemDialog>

      <CreateBankAccountDialog onAccountCreated={() => {}} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} data-theme-btn="add-bank">
          <Landmark className="mr-1 h-4 w-4" /> Add Bank
        </PermissionButton>
      </CreateBankAccountDialog>

      <CreateStaffDialog onStaffCreated={() => {}} groups={[]} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen}>
        <PermissionButton permission="create_records" variant="chromePill" size="sm" className={buttonClass} data-theme-btn="add-staff">
          <Briefcase className="mr-1 h-4 w-4" /> Add Staff
        </PermissionButton>
      </CreateStaffDialog>
    </>
  );
}

/** Opaque “stucco-like” surface in code only — no image, no translucent stacks (clear HD read). */
function ProfileDropdownPlanCard({
  borderClassName,
  tone,
  roundedClassName = "rounded-lg",
  children,
}: {
  borderClassName: string;
  tone: "emerald" | "sky";
  /** Stack cards flush: e.g. `rounded-t-lg rounded-b-none` */
  roundedClassName?: string;
  children: React.ReactNode;
}) {
  const fill =
    tone === "emerald"
      ? {
          backgroundColor: "#f6faf7",
          backgroundImage: `
            linear-gradient(165deg, #ffffff 0%, #f2fbf6 38%, #e8f0ec 100%),
            repeating-linear-gradient(
              -11deg,
              transparent,
              transparent 4px,
              rgba(15, 23, 42, 0.028) 4px,
              rgba(15, 23, 42, 0.028) 8px
            )
          `,
        } as const
      : {
          backgroundColor: "#f5f8fc",
          backgroundImage: `
            linear-gradient(165deg, #ffffff 0%, #f0f7ff 38%, #e8edf5 100%),
            repeating-linear-gradient(
              -11deg,
              transparent,
              transparent 4px,
              rgba(15, 23, 42, 0.028) 4px,
              rgba(15, 23, 42, 0.028) 8px
            )
          `,
        } as const;

  return (
    <div
      className={cn(
        "relative w-full max-w-full box-border overflow-hidden border-4 px-3 py-3 sm:px-4 shadow-sm",
        roundedClassName,
        borderClassName
      )}
      style={fill}
    >
      <div className="relative z-[1] w-full min-w-0">{children}</div>
    </div>
  );
}

/**
 * White fill + colored border; text hamesha black / normal weight (layout me `font-normal`).
 */
const PROFILE_STAT_TONE_CLASSES = {
  expiry: "border-cyan-300 bg-white dark:border-cyan-400 dark:bg-white",
  companyStorage: "border-violet-300 bg-white dark:border-violet-400 dark:bg-white",
  dailyVoucher: "border-amber-300 bg-white dark:border-amber-400 dark:bg-white",
  monthlyVoucher: "border-orange-300 bg-white dark:border-orange-400 dark:bg-white",
  onlineSlots: "border-teal-300 bg-white dark:border-teal-400 dark:bg-white",
  offlineSlots: "border-indigo-300 bg-white dark:border-indigo-400 dark:bg-white",
  usersDevices: "border-rose-300 bg-white dark:border-rose-400 dark:bg-white",
  attachments: "border-lime-300 bg-white dark:border-lime-400 dark:bg-white",
  storage: "border-fuchsia-300 bg-white dark:border-fuchsia-400 dark:bg-white",
} as const;

type ProfileStatTone = keyof typeof PROFILE_STAT_TONE_CLASSES;

/** Shared layout — normal weight, black text (`tone` sirf border color). */
const PROFILE_PLAN_STAT_PILL_LAYOUT =
  "flex w-full max-w-full min-w-0 flex-wrap items-center gap-x-1 rounded-full border-2 px-2.5 py-0.5 text-left text-xs font-normal tabular-nums leading-tight text-black shadow-sm dark:text-black";

function ProfilePlanStatPill({ tone, children }: { tone: ProfileStatTone; children: React.ReactNode }) {
  return (
    <div className={cn(PROFILE_PLAN_STAT_PILL_LAYOUT, PROFILE_STAT_TONE_CLASSES[tone])}>
      {/* Lambi label/value dropdown width ke andar wrap */}
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

function UserProfileButton() {
  const router = useRouter();
  const { user } = useAuth();
  const { company, allCompanies, refreshAuthoritativePlan } = useCompany();
  const { displaySymbol } = useDisplayCurrency();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const livePlans = useLivePlans();
  const [profileOpen, setProfileOpen] = useState(false);
  const [userStorageUsedBytes, setUserStorageUsedBytes] = useState<number | null>(null);
  /** Avatar menu: manual Firestore → local plan sync (SQLite/cache align). */
  const [planManualSyncing, setPlanManualSyncing] = useState(false);
  /** Delayed close so mouse can move from avatar to portaled menu without flashing shut. */
  const profileHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProfileHoverClose = useCallback(() => {
    if (profileHoverCloseTimerRef.current != null) {
      clearTimeout(profileHoverCloseTimerRef.current);
      profileHoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleProfileHoverClose = useCallback(() => {
    clearProfileHoverClose();
    profileHoverCloseTimerRef.current = setTimeout(() => {
      profileHoverCloseTimerRef.current = null;
      setProfileOpen(false);
    }, 220);
  }, [clearProfileHoverClose]);

  const openProfileFromHover = useCallback(() => {
    clearProfileHoverClose();
    setProfileOpen(true);
  }, [clearProfileHoverClose]);

  const handleProfileOpenChange = useCallback(
    (open: boolean) => {
      if (!open) clearProfileHoverClose();
      setProfileOpen(open);
    },
    [clearProfileHoverClose]
  );

  useEffect(() => () => clearProfileHoverClose(), [clearProfileHoverClose]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  };

  const handleLogout = async () => {
    const { clearNavigationMemory } = await import("@/lib/navigation-memory");
    clearNavigationMemory();
    pruneRememberedLoginEmailIfDisabled();
    // Local guest logout: local no-login flag off karo so app true online login screen par aaye.
    if (isLocalGuestEnabled()) {
      disableLocalGuest();
      router.replace("/");
      return;
    }
    await signOutWithFirestoreTeardown(auth);
    // Firebase logout ke baad bhi explicit redirect rakho for predictable online-login UX.
    router.replace("/");
  };

  /** Avatar menu: POST `/api/company/sync-plan` — SQLite + plan cache ko Firestore authoritative row se align (checkout/profile mismatch fix). */
  const handleManualPlanSync = async () => {
    if (!company || planManualSyncing || !isOnline) return;
    clearProfileHoverClose();
    setPlanManualSyncing(true);
    try {
      const r = await refreshAuthoritativePlan();
      if (r.ok && r.applied) {
        toast({
          title: "Plan synced",
          description: "Local row updated from the server for this company.",
        });
      } else if (r.ok && !r.applied) {
        toast({
          title: "Already aligned",
          description:
            r.reason === "no_local_sqlite_row"
              ? "No offline copy of this company to patch."
              : "Server responded; nothing to change locally.",
        });
      } else {
        // Offline / flight mode: sirf short copy — raw `network` machine reason mat dikhao (APK profile toast).
        const navOff = typeof navigator !== "undefined" && !navigator.onLine;
        const offlineUi =
          r.reason === "offline" || (navOff && (r.reason === "network" || r.reason === "timeout"));
        if (offlineUi) {
          toast({ title: "You are offline" });
        } else {
          toast({
            variant: "destructive",
            title: "Could not sync plan",
            description: planSyncFailureUserMessage(r.reason),
          });
        }
      }
    } finally {
      setPlanManualSyncing(false);
    }
  };

  useEffect(() => {
    if (!profileOpen || allCompanies.length === 0) {
      setUserStorageUsedBytes(null);
      return;
    }
    const companyIds = allCompanies.map((c) => c.id);
    estimateUserFirestoreBytes(companyIds)
      .then(setUserStorageUsedBytes)
      .catch(() => setUserStorageUsedBytes(null));
  }, [profileOpen, allCompanies.length, allCompanies.map((c) => c.id).join(",")]);

  // Shared / no-owned fallback ke liye aggregate; **owner + apni company** par badge & caps = `selectedCompanyPlan*` (Billing page jaisa — doosri owned row ka pro-plus yahan mix na ho).
  const accountPlanId = user?.uid
    ? resolveEffectiveAccountPlanId(allCompanies, user.uid, company?.planId)
    : ((company?.planId as PlanId) || "basic");
  const selectedCompanyPlanId: PlanId = normalizePlanIdForClient(company?.planId);
  const selectedCompanyPlanName = DEFAULT_PLANS[selectedCompanyPlanId]?.name ?? String(selectedCompanyPlanId);
  // Profile dropdown: selected company local ho to uske liye *Local caps dikhao (admin Plans).
  const storageIsLocal = companyStorageIsLocal(company?.storageOption);
  const ownedForUsage = React.useMemo(
    () =>
      allCompanies.filter(
        (c) =>
          c.isOwned === true && !!user?.uid && String(c.ownerId || "").trim() === String(user.uid).trim()
      ),
    [allCompanies, user?.uid]
  );
  const hasOwnedCompanies = ownedForUsage.length > 0;
  const isSelectedCompanyOwned =
    !!company &&
    (company.ownerId === user?.uid || (!!user?.email && company.ownerEmail === user.email));

  const ownedOnlyPlanId: PlanId = (() => {
    const best = user?.uid ? highestPlanIdAmongOwnedCompanies(allCompanies, user.uid) : null;
    return best ?? "basic";
  })();

  /** Shared company: aapke account ka best owned SKU; **khud ki company** open ho to isi row ka `planId` (Firestore/Billing ke saath match). */
  const limitsPlanId: PlanId =
    !isSelectedCompanyOwned && hasOwnedCompanies ? ownedOnlyPlanId : selectedCompanyPlanId;
  const limitsPlan = getPlanFromPlans(livePlans, limitsPlanId);
  const limitsUseLocalForSelected =
    isSelectedCompanyOwned ? storageIsLocal : hasOwnedCompanies ? false : storageIsLocal;

  const maxAttGB =
    !isSelectedCompanyOwned && hasOwnedCompanies
      ? Math.max(
          numericEntitlement(limitsPlan?.entitlements, "maxAttachmentsGB", false),
          numericEntitlement(limitsPlan?.entitlements, "maxAttachmentsGB", true)
        )
      : numericEntitlement(limitsPlan?.entitlements, "maxAttachmentsGB", limitsUseLocalForSelected);
  const attUsedGB =
    ownedForUsage.reduce((s, c) => s + Number((c as Company).attachmentsUsedBytes ?? 0), 0) / 1e9;
  const attFreeGB = Math.max(0, maxAttGB - attUsedGB);
  const GB_TO_MB = 1024;
  const attUsedMB = attUsedGB * GB_TO_MB;
  const attFreeMB = attFreeGB * GB_TO_MB;
  const userStorUsedMB = userStorageUsedBytes != null ? userStorageUsedBytes / (1024 * 1024) : 0;
  const accountMaxStorGB =
    !isSelectedCompanyOwned && hasOwnedCompanies
      ? Math.max(
          numericEntitlement(limitsPlan?.entitlements, "maxStorageGB", false),
          numericEntitlement(limitsPlan?.entitlements, "maxStorageGB", true)
        )
      : numericEntitlement(limitsPlan?.entitlements, "maxStorageGB", limitsUseLocalForSelected);
  const totalMaxStorMB = accountMaxStorGB * GB_TO_MB;
  const storFreeMB = Math.max(0, totalMaxStorMB - userStorUsedMB);
  const maxStorGB = accountMaxStorGB;
  const onlineSlotMax = maxOnlineCompaniesForPlan(
    selectedCompanyPlanId,
    getPlanFromPlans(livePlans, selectedCompanyPlanId)
  );
  const onlineSlotUsed =
    user?.uid != null && user.uid !== "" ? countOnlineCompanySlotsForOwner(allCompanies, user.uid) : 0;
  /** Owner apni company dekh raha ho to upgrade ladder isi SKU se — aggregate `accountPlanId` se mat bandho. */
  const selectedCompanyCanUpgradeToPaidTier = getNextPaidUpgrade(selectedCompanyPlanId) != null;

  const ownedPlanLive = getPlanFromPlans(livePlans, ownedOnlyPlanId);
  const ownedMaxUsersOnline = Math.max(
    1,
    numericEntitlement(ownedPlanLive.entitlements, "maxUsers", false) || 1
  );
  const ownedMaxUsersLocal = Math.max(
    1,
    numericEntitlement(ownedPlanLive.entitlements, "maxUsers", true) || 1
  );
  const ownedOnlineSlotMax = maxOnlineCompaniesForPlan(ownedOnlyPlanId, ownedPlanLive);
  const ownedCanUpgrade = getNextPaidUpgrade(ownedOnlyPlanId) != null;

  /** Shared: "Your account" = best owned tier; zero-owned shared = `resolveEffectiveAccountPlanId` fallback. */
  const sharedProfilePlanId: PlanId = hasOwnedCompanies ? ownedOnlyPlanId : accountPlanId;
  const sharedProfilePlanName =
    DEFAULT_PLANS[sharedProfilePlanId]?.name ?? String(sharedProfilePlanId);
  const sharedProfileCanUpgrade = getNextPaidUpgrade(sharedProfilePlanId) != null;

  const selectedCompanyPlanLive = getPlanFromPlans(livePlans, selectedCompanyPlanId);
  const selectedCompanyMaxDevices =
    selectedCompanyPlanLive.entitlements.hasMultiDeviceSync === true
      ? Math.max(1, Number(selectedCompanyPlanLive.entitlements.maxDevices) || 1)
      : 1;
  const thisCompanyStorageLocal = company ? companyStorageIsLocal(company.storageOption) : false;
  const thisCompanyMaxUsers = Math.max(
    1,
    numericEntitlement(selectedCompanyPlanLive.entitlements, "maxUsers", thisCompanyStorageLocal) || 1
  );

  /** Profile card: plan voucher caps — `numericEntitlement` + company local flag (Billing matrix jaisa). */
  const dailyVoucherPlanCap = numericEntitlement(
    selectedCompanyPlanLive.entitlements,
    "dailyVoucherLimit",
    storageIsLocal
  );
  const monthlyVoucherPlanCap = numericEntitlement(
    selectedCompanyPlanLive.entitlements,
    "monthlyVoucherLimit",
    storageIsLocal
  );
  /** Offline SQLite-first companies count vs `maxCompaniesLocal` (online slot ke parallel). */
  const localCompanySlotMax = numericEntitlement(selectedCompanyPlanLive.entitlements, "maxCompanies", true);
  const localCompanySlotUsed =
    user?.uid != null && user.uid !== ""
      ? countLocalCompanySlotsForOwner(allCompanies, user.uid)
      : 0;

  const ownedPlanExpiryCompany = React.useMemo(() => {
    const withExpiry = ownedForUsage.filter((c) => c.planExpiry);
    if (withExpiry.length === 0) return null;
    return (
      withExpiry.find((c) => String(c.planId || "basic").trim() === ownedOnlyPlanId) ?? withExpiry[0]
    );
  }, [ownedForUsage, ownedOnlyPlanId]);

  /** Owner profile: billing jaisa proration quote — `planExpiry` / `planExpiryMs` se ms (shared user branch me pills nahi). */
  const profileProrationExpiryMs = React.useMemo(
    () => (company ? getCompanyPlanExpiryMsFromDoc(company) : null),
    [company]
  );

  if (!user) return null;

  return (
    <>
      <DropdownMenu open={profileOpen} onOpenChange={handleProfileOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full p-0 touch-manipulation"
            onMouseEnter={openProfileFromHover}
            onMouseLeave={scheduleProfileHoverClose}
          >
            {/* Sirf plan dropdown — avatar par `EntityFileAttachmentHover` mat lagao warna hover pe Preview modal + dropdown dono fight karte hain. */}
            <div
              className={cn(
                "relative h-9 w-9 rounded-full inline-flex [&:focus-visible]:outline-none",
                isOnline ? "ring-2 ring-green-500 ring-offset-0" : "ring-2 ring-black ring-offset-0"
              )}
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={user.photoURL?.trim() ? user.photoURL : undefined} alt={user.displayName ?? "User"} />
                <AvatarFallback>{getInitials(user.displayName ?? user.email)}</AvatarFallback>
              </Avatar>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn(
            "p-0 min-w-0 w-[min(96vw,440px)] sm:w-[min(92vw,520px)] rounded-xl shadow-lg border bg-popover text-popover-foreground",
            /* Lamba profile card: mobile par viewport ke andar scroll — overflow clip na ho */
            "max-h-[85dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          align="end"
          sideOffset={8}
          forceMount
          onMouseEnter={openProfileFromHover}
          onMouseLeave={scheduleProfileHoverClose}
        >
          {!company ? (
            <DropdownMenuLabel className="font-normal px-3 pt-3 pb-2">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium leading-none truncate">{user.displayName}</p>
                <p className="text-xs leading-none text-muted-foreground break-words">{user.email}</p>
              </div>
            </DropdownMenuLabel>
          ) : null}

          {company ? (
              <div className="w-full max-w-full px-0 py-0 space-y-0">
                {/* Plan: owned company = single block; shared company = your account vs this company (owner plan). */}
                {isSelectedCompanyOwned ? (
                <ProfileDropdownPlanCard
                  borderClassName="border-green-500"
                  tone="emerald"
                  roundedClassName="rounded-t-lg rounded-b-lg"
                >
                <div>
                  {user.displayName ? (
                    <p className="text-sm font-medium text-foreground break-words leading-snug mb-1">{user.displayName}</p>
                  ) : null}
                  {user.email ? (
                    <p className="text-xs text-muted-foreground break-words leading-snug mb-3">{user.email}</p>
                  ) : null}
                  <div className="text-xs text-muted-foreground mb-1">Current Plan</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="secondary" className="shrink-0">{selectedCompanyPlanName}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Sync plan from server"
                        aria-label="Sync plan from server"
                        disabled={!isOnline || planManualSyncing || !company}
                        onClick={(e) => {
                          e.preventDefault();
                          void handleManualPlanSync();
                        }}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", planManualSyncing && "animate-spin")} />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        clearProfileHoverClose();
                        setProfileOpen(false);
                        router.push("/billing");
                      }}
                    >
                      {selectedCompanyCanUpgradeToPaidTier ? "Upgrade" : "Billing"}
                    </Button>
                  </div>
                  {/* Sab stats vertical pills — expiry sabse niche; Balance / Usage upar */}
                  {/* Pills ke beech fixed 5px vertical gap */}
                  <div className="mt-1.5 flex w-full min-w-0 flex-col gap-[5px]">
                    {/* Sirf company owner: Billing page jaisa Balance / Usage pills — shared company card me nahi. */}
                    {!selectedCompanyPlanLive.isFree ? (
                      <RenewProrationPills
                        plan={selectedCompanyPlanLive}
                        currentExpiryMs={profileProrationExpiryMs}
                        currencySymbol={displaySymbol}
                      />
                    ) : null}
                    <ProfilePlanStatPill tone="companyStorage">
                      {/* Label: account-wide storage mode + baaki MB — "All storage" user-facing copy. */}
                      All storage:{" "}
                      {storageIsLocal ? "Device local (offline-first)" : "Online (cloud-linked)"}
                      {/* Plan par storage cap ho to yahin total baaki MB — neeche Storage pill jaisa `storFreeMB`. */}
                      {maxStorGB > 0 ? (
                        <>
                          <span aria-hidden className="mx-0.5 opacity-90">
                            ·
                          </span>
                          {userStorageUsedBytes != null ? (
                            <>{storFreeMB.toFixed(0)} MB left</>
                          ) : (
                            <>… MB left</>
                          )}
                        </>
                      ) : null}
                    </ProfilePlanStatPill>
                    <ProfilePlanStatPill tone="dailyVoucher">
                      Daily vouchers (plan cap):{" "}
                      {dailyVoucherPlanCap <= 0 ? "Unlimited" : dailyVoucherPlanCap} /day
                    </ProfilePlanStatPill>
                    <ProfilePlanStatPill tone="monthlyVoucher">
                      Monthly vouchers (plan cap):{" "}
                      {monthlyVoucherPlanCap <= 0 ? "Unlimited" : monthlyVoucherPlanCap} /month
                    </ProfilePlanStatPill>
                    {onlineSlotMax > 0 && user?.uid ? (
                      <ProfilePlanStatPill tone="onlineSlots">
                        Online company slots (cloud-linked): {onlineSlotUsed} / {onlineSlotMax}
                      </ProfilePlanStatPill>
                    ) : null}
                    {user?.uid ? (
                      <ProfilePlanStatPill tone="offlineSlots">
                        Offline / local company slots: {localCompanySlotUsed} /{" "}
                        {localCompanySlotMax <= 0 ? "Unlimited" : localCompanySlotMax}
                      </ProfilePlanStatPill>
                    ) : null}
                    <ProfilePlanStatPill tone="usersDevices">
                      Max users / devices (this company): {thisCompanyMaxUsers} users ·{" "}
                      {selectedCompanyMaxDevices} devices
                    </ProfilePlanStatPill>
                    {maxAttGB > 0 ? (
                      <ProfilePlanStatPill tone="attachments">
                        Attachments: {attUsedMB.toFixed(0)} MB used / {attFreeMB.toFixed(0)} MB free
                      </ProfilePlanStatPill>
                    ) : null}
                    {maxStorGB > 0 ? (
                      <ProfilePlanStatPill tone="storage">
                        Storage:{" "}
                        {userStorageUsedBytes != null ? userStorUsedMB.toFixed(0) : "…"} MB used /{" "}
                        {userStorageUsedBytes != null ? storFreeMB.toFixed(0) : "…"} MB free
                      </ProfilePlanStatPill>
                    ) : null}
                    {company?.planExpiry && (() => {
                      const raw = company.planExpiry;
                      const expiryDate =
                        typeof raw?.toDate === "function"
                          ? raw.toDate()
                          : raw?.seconds
                            ? new Date(raw.seconds * 1000)
                            : null;
                      if (!expiryDate) return null;
                      const expiryMs =
                        profileProrationExpiryMs ??
                        (Number.isFinite(expiryDate.getTime()) ? expiryDate.getTime() : null);
                      const nowMsExp = Date.now();
                      // Pill par sirf expiry date — din count Balance/Usage pills mein; yahan past date = Expired.
                      const expiredPlan = expiryMs != null && expiryMs <= nowMsExp;
                      return (
                        <ProfilePlanStatPill tone="expiry">
                          Expires on: {format(expiryDate, "MMM d, yyyy")}
                          {expiredPlan ? (
                            <>
                              <span aria-hidden className="mx-0.5 opacity-90">
                                ·
                              </span>
                              <span>Expired</span>
                            </>
                          ) : null}
                        </ProfilePlanStatPill>
                      );
                    })()}
                  </div>
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="py-2.5 px-2 mx-0 rounded-md cursor-pointer w-full focus:bg-accent/80"
                  >
                    <LogOut className="mr-2 h-4 w-4 shrink-0" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </div>
                </ProfileDropdownPlanCard>
                ) : (
                <div className="w-full max-w-full space-y-0">
                  <ProfileDropdownPlanCard
                    borderClassName="border-green-500"
                    tone="emerald"
                    roundedClassName="rounded-t-lg rounded-b-none"
                  >
                  <div>
                    {user.displayName ? (
                      <p className="text-sm font-medium text-foreground break-words leading-snug mb-1">{user.displayName}</p>
                    ) : null}
                    {user.email ? (
                      <p className="text-xs text-muted-foreground break-words leading-snug mb-3">{user.email}</p>
                    ) : null}
                    <div className="text-xs text-muted-foreground mb-1">
                      {hasOwnedCompanies ? "Your account" : "Plan while using this company"}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant="secondary" className="shrink-0">{sharedProfilePlanName}</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Sync plan from server"
                          aria-label="Sync plan from server"
                          disabled={!isOnline || planManualSyncing || !company}
                          onClick={(e) => {
                            e.preventDefault();
                            void handleManualPlanSync();
                          }}
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", planManualSyncing && "animate-spin")} />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={() => {
                          clearProfileHoverClose();
                          setProfileOpen(false);
                          router.push("/billing");
                        }}
                      >
                        {sharedProfileCanUpgrade ? "Upgrade" : "Billing"}
                      </Button>
                    </div>
                    {!hasOwnedCompanies ? (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        You don&apos;t own a company yet. Limits in this workspace follow this company&apos;s
                        subscription (see &quot;This company (shared)&quot; below).
                      </p>
                    ) : null}
                    {ownedPlanExpiryCompany?.planExpiry && (() => {
                      const raw = ownedPlanExpiryCompany.planExpiry;
                      const expiryDate = typeof raw?.toDate === "function" ? raw.toDate() : (raw?.seconds ? new Date(raw.seconds * 1000) : null);
                      if (!expiryDate) return null;
                      const expiryMsOwned =
                        getCompanyPlanExpiryMsFromDoc(ownedPlanExpiryCompany) ??
                        (Number.isFinite(expiryDate.getTime()) ? expiryDate.getTime() : null);
                      const nowMsOwn = Date.now();
                      const expiredOwned = expiryMsOwned != null && expiryMsOwned <= nowMsOwn;
                      return (
                        <div className="text-xs text-muted-foreground mt-1.5">
                          Your plan renews / expires:{" "}
                          <span className="font-medium text-foreground">{format(expiryDate, "MMM d, yyyy")}</span>
                          {expiredOwned ? (
                            <>
                              {" "}
                              · <span className="font-medium text-destructive">Expired</span>
                            </>
                          ) : null}
                        </div>
                      );
                    })()}
                    {/* Online slots sirf jab aapki khud ki companies hon — shared-only par 0/9 galat signal tha. */}
                    {hasOwnedCompanies && ownedOnlineSlotMax > 0 && user?.uid ? (
                      <div className="text-xs text-muted-foreground mt-1.5">
                        Your online company slots:{" "}
                        <span className="font-medium text-foreground">{onlineSlotUsed}</span> /{" "}
                        <span className="font-medium text-foreground">{ownedOnlineSlotMax}</span>
                      </div>
                    ) : null}
                    {hasOwnedCompanies ? (
                      <div className="text-xs text-muted-foreground mt-1.5">
                        Max users per company (your plan):{" "}
                        <span className="font-medium text-foreground">{ownedMaxUsersOnline}</span> online
                        {ownedMaxUsersLocal !== ownedMaxUsersOnline ? (
                          <>
                            , <span className="font-medium text-foreground">{ownedMaxUsersLocal}</span> local
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {hasOwnedCompanies && (maxAttGB > 0 || maxStorGB > 0) ? (
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-1">
                        {maxAttGB > 0 ? (
                          <div>
                            Attachments (your companies):{" "}
                            <span className="font-medium text-foreground">{attUsedMB.toFixed(0)}</span> MB used /{" "}
                            <span className="font-medium text-foreground">{attFreeMB.toFixed(0)}</span> MB free
                          </div>
                        ) : null}
                        {maxStorGB > 0 ? (
                          <div>
                            Storage (your account):{" "}
                            <span className="font-medium text-foreground">
                              {userStorageUsedBytes != null ? userStorUsedMB.toFixed(0) : "…"}
                            </span>{" "}
                            MB used /{" "}
                            <span className="font-medium text-foreground">
                              {userStorageUsedBytes != null ? storFreeMB.toFixed(0) : "…"}
                            </span>{" "}
                            MB free
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {!hasOwnedCompanies && (maxAttGB > 0 || maxStorGB > 0) ? (
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-1">
                        {maxAttGB > 0 ? (
                          <div>
                            Attachments: <span className="font-medium text-foreground">{attUsedMB.toFixed(0)}</span> MB used /{" "}
                            <span className="font-medium text-foreground">{attFreeMB.toFixed(0)}</span> MB free
                          </div>
                        ) : null}
                        {maxStorGB > 0 ? (
                          <div>
                            Storage: <span className="font-medium text-foreground">{userStorageUsedBytes != null ? userStorUsedMB.toFixed(0) : "…"}</span> MB used /{" "}
                            <span className="font-medium text-foreground">{userStorageUsedBytes != null ? storFreeMB.toFixed(0) : "…"}</span> MB free
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <DropdownMenuSeparator className="my-2" />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="py-2.5 px-2 mx-0 rounded-md cursor-pointer w-full focus:bg-accent/80"
                    >
                      <LogOut className="mr-2 h-4 w-4 shrink-0" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </div>
                  </ProfileDropdownPlanCard>
                  <ProfileDropdownPlanCard
                    borderClassName="border-blue-500"
                    tone="sky"
                    roundedClassName="rounded-b-lg rounded-t-none"
                  >
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">This company (shared)</div>
                    <div className="text-xs font-medium text-foreground break-words" title={company.name}>
                      {company.name}
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Owner plan</span>
                      <Badge variant="outline" className="shrink-0 text-xs">{selectedCompanyPlanName}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sync devices (owner plan): up to{" "}
                      <span className="font-medium text-foreground">{selectedCompanyMaxDevices}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Max users (this company):{" "}
                      <span className="font-medium text-foreground">{thisCompanyMaxUsers}</span>
                    </div>
                  </div>
                  </ProfileDropdownPlanCard>
                </div>
                )}
              </div>
          ) : null}

          {!company ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="py-2.5 px-3 mx-0 rounded-none cursor-pointer w-full">
                <LogOut className="mr-2 h-4 w-4 shrink-0" />
                <span>Log out</span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {profileOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-40 backdrop-blur-[2px] bg-black/15 pointer-events-none"
          aria-hidden
        />,
        document.body
      )}
    </>
  );
}


function DateSystemSwitcher() {
  const { dateSystem, setDateSystem } = useDate();
  const { isMobile, forcedViewMode, setForcedMode } = useMobileView();
  const { company } = useCompany();
  const [dateFormatDialogOpen, setDateFormatDialogOpen] = React.useState(false);
  
  // Hide date system switcher if country is not Nepal
  if (company?.country && company.country !== "Nepal") {
    return null;
  }

  const handleMobileClick = () => {
    setForcedMode('mobile');
  };

  const handlePCClick = () => {
    setForcedMode('pc');
  };

  const dateMenuContent = (
    <>
      <DropdownMenuItem onSelect={() => setDateSystem("BS")}>Bikram Samvat (BS)</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setDateSystem("AD")}>Anno Domini (AD)</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setDateSystem("Both")}>Both</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setDateFormatDialogOpen(true)}>
        <Settings className="mr-2 h-4 w-4" />
        Setting
      </DropdownMenuItem>
    </>
  );

  // Date + BS/AD + PC/Mobile toggle (phone par bhi — PC view sirf icon se)
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn("whitespace-nowrap h-9", isMobile && "px-3")} data-theme-header="date-selector">
            {!isMobile && <CalendarDays className="mr-2 h-4 w-4" />}
            <span>{dateSystem}</span>
            {/* User request: date trigger par chevron hata — menu ab bhi Dropdown se khulta hai. */}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {dateMenuContent}
        </DropdownMenuContent>
      </DropdownMenu>
      <DateFormatSettingsDialog open={dateFormatDialogOpen} onOpenChange={setDateFormatDialogOpen} />
      {/* Web + APK: PC Chrome jaisa 768 default + ye icon se force mobile/pc (`use-mobile`). */}
      {forcedViewMode === "mobile" ? (
        <Button
          variant="outline"
          size="icon"
          title="Switch to PC View"
          onClick={handlePCClick}
          className="h-9 w-9"
          data-theme-header="view-toggle"
        >
          <Monitor className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          title="Switch to Mobile View"
          onClick={handleMobileClick}
          className="h-9 w-9"
          data-theme-header="view-toggle"
        >
          <Smartphone className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}


/**
 * Company dropdown: sirf yahi usePathname + route-based list filter — sidebar navigate par parent header strip unnecessary re-render na ho.
 */
function HeaderCompanyPickerIsland({
  unfilteredHeaderCompanies,
  loading,
  user,
  isSuperAdminUser,
  onCompanyCreated,
  mobileStrip,
}: {
  unfilteredHeaderCompanies: Company[];
  loading: boolean;
  user: { uid: string; email: string | null } | null | undefined;
  isSuperAdminUser: boolean;
  onCompanyCreated: () => void;
  // Mobile header row: pulse skeleton par shrink-0 (layout)
  mobileStrip?: boolean;
}) {
  const pathname = usePathname();
  const companies = useMemo(
    () =>
      filterSharedOnlyCompaniesForSuperAdminInMainApp(
        unfilteredHeaderCompanies,
        user,
        isSuperAdminUser,
        pathname
      ),
    [unfilteredHeaderCompanies, user, isSuperAdminUser, pathname]
  );
  // Pehli load: skeleton; data aane ke baad loading dubara true ho to bhi purana box dikhate raho (sidebar navigate flash band).
  if (loading && unfilteredHeaderCompanies.length === 0) {
    return (
      <div
        className={cn(
          "h-8 animate-pulse rounded-md bg-background/60",
          // Mobile: company slot poori width — skeleton bhi stretch.
          mobileStrip ? "w-full min-w-0" : "w-32 shrink-0"
        )}
      />
    );
  }
  return (
    <CompanyActions
      companies={companies}
      onCompanyCreated={onCompanyCreated}
      triggerLayout={mobileStrip ? "mobile" : "desktop"}
    />
  );
}

export function DesktopAppHeader() {
  const { user, customUser } = useAuth();
  const { allCompanies: contextCompanies, loading: companyContextLoading } = useCompany();
  // Firestore merge alag; pathname sirf HeaderCompanyPickerIsland — sidebar navigate par parent header strip unnecessary re-render na ho.
  const [unfilteredHeaderCompanies, setUnfilteredHeaderCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = customUser?.role === "SuperAdmin";
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isSuperAdminUser = isSuperAdmin || isSuperAdminByEmail;

  // Local / static: CompanyProvider context yahi deps; navigate par Firestore effect na chale (company box flicker band).
  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    // Local-first: header list = owned + local + mirrored online/shared (CompanySelector ke saath align)
    setLoading(Boolean(companyContextLoading));
    const isOwnedByUser = (c: Company) =>
      (!!user?.uid && c.ownerId === user?.uid) ||
      (!!user?.email &&
        !!c.ownerEmail &&
        c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
    const mappedBase = (contextCompanies || [])
      .filter((c) => isCompanyVisibleInHeader(c as Company & { movedToAdminRecycleAt?: unknown }))
      .map((c) => ({ ...c, isOwned: isOwnedByUser(c) })) as Company[];
    setUnfilteredHeaderCompanies(mappedBase);
    if (!companyContextLoading && (!contextCompanies || contextCompanies.length === 0)) {
      listLocalCompanies()
        .then((rows) => {
          const mappedRows = rows
            // Local fallback me bhi hidden tab companies suppress rakho.
            .filter((r: { isDeleted?: boolean; movedToAdminRecycleAt?: unknown }) => !r?.isDeleted && r?.movedToAdminRecycleAt == null)
            .map((r) => {
              const c = { ...(r as unknown as Company) };
              return { ...c, isOwned: isOwnedByUser(c) } as Company;
            });
          setUnfilteredHeaderCompanies(mappedRows);
        })
        .finally(() => setLoading(false));
    }
  }, [user, contextCompanies, companyContextLoading]);

  // Firebase web: Firestore listeners — sirf user / SuperAdmin; sidebar navigate par dubara setLoading(true) / skeleton na ho.
  useEffect(() => {
    if (isLocalOnlyMode()) return;
    if (!user || !user.email) {
      setLoading(false);
      setUnfilteredHeaderCompanies([]);
      return;
    }
    setLoading(true);

    const ownedQuery = query(
      collection(firestore, "companies"),
      where("ownerId", "==", user.uid)
    );
    const sharedQuery = query(
      collection(firestore, "companies"),
      where("sharedWithEmails", "array-contains", user.email)
    );
    // SuperAdmin: also show companies where ownerEmail matches, so they can use app like a normal user
    const ownedByEmailQuery = isSuperAdminUser
      ? query(
          collection(firestore, "companies"),
          where("ownerEmail", "==", user.email)
        )
      : null;

    let ownedCompaniesCache: Company[] = [];
    let sharedCompaniesCache: Company[] = [];
    let ownedByEmailCache: Company[] = [];
    let localCompaniesCache: Company[] = [];
    const isOwnedByCurrentUser = (c: Company) =>
      c.ownerId === user?.uid ||
      (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email.toLowerCase().trim());
    // Keep first paint stable: wait for all initial listeners before publishing header data.
    let ownedReady = false;
    let sharedReady = false;
    let ownedByEmailReady = !ownedByEmailQuery;

    const combineAndSet = () => {
      if (!ownedReady || !sharedReady || !ownedByEmailReady) return;
      const companyMap = new Map<string, Company>();

      // Server-owned companies are authoritative for online ownership categorization.
      ownedCompaniesCache.forEach((c) =>
        companyMap.set(c.id, { ...c, isOwned: true })
      );
      // SuperAdmin: add companies owned by email (in case ownerId differs)
      ownedByEmailCache.forEach((c) => {
        if (!companyMap.has(c.id))
          companyMap.set(c.id, { ...c, isOwned: true });
      });
      // Add shared companies if not already in map
      sharedCompaniesCache.forEach((c) => {
        if (!companyMap.has(c.id))
          companyMap.set(c.id, { ...c, isOwned: false });
      });
      // Add local-only leftovers after server merge; this prevents shared online companies from being misclassified.
      localCompaniesCache.forEach((c) => {
        if (!companyMap.has(c.id)) {
          companyMap.set(c.id, { ...c, isOwned: isOwnedByCurrentUser(c) });
        }
      });

      const merged = Array.from(companyMap.values());
      // Avoid no-op state writes — lekin sirf id/isOwned mat compare karo; rename (name) change par bhi next apply ho (selector live rahe)
      setUnfilteredHeaderCompanies((prev) => {
        const sameLength = prev.length === merged.length;
        if (!sameLength) return merged;
        const rowSig = (c: Company) =>
          `${c.id}\0${Boolean(c.isOwned)}\0${c.name ?? ""}\0${String((c as Company & { storageOption?: string }).storageOption ?? "")}`;
        const same =
          prev.length === merged.length &&
          prev.every((p, i) => rowSig(p) === rowSig(merged[i] as Company));
        return same ? prev : merged;
      });
      setLoading(false);
    };

    // Load local companies in parallel with Firestore so dropdown can show local + cloud together.
    listLocalCompanies()
      .then((rows) => {
        localCompaniesCache = rows
          .filter((c: any) => isCompanyVisibleInHeader(c as Company & { movedToAdminRecycleAt?: unknown }))
          .map((c) => ({ ...(c as unknown as Company), isOwned: isOwnedByCurrentUser(c as unknown as Company) }));
        combineAndSet();
      })
      .catch(() => {
        // Local list optional; ignore errors and continue with cloud/shared data.
      });

    const unsubOwned = onSnapshot(
      ownedQuery,
      (snap) => {
        ownedCompaniesCache = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Company))
          .filter((c) => isCompanyVisibleInHeader(c as Company & { movedToAdminRecycleAt?: unknown }));
        ownedReady = true;
        combineAndSet();
      },
      (error) => {
        console.error("Error fetching owned companies:", error);
        setLoading(false);
      }
    );

    const unsubShared = onSnapshot(
      sharedQuery,
      (snap) => {
        sharedCompaniesCache = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Company))
          .filter((c) => isCompanyVisibleInHeader(c as Company & { movedToAdminRecycleAt?: unknown }));
        sharedReady = true;
        combineAndSet();
      },
      (error) => {
        console.error("Error fetching shared companies:", error);
        setLoading(false);
      }
    );

    const unsubOwnedByEmail = ownedByEmailQuery
      ? onSnapshot(
          ownedByEmailQuery,
          (snap) => {
            ownedByEmailCache = snap.docs
              .map((doc) => ({ id: doc.id, ...doc.data() } as Company))
              .filter((c) => isCompanyVisibleInHeader(c as Company & { movedToAdminRecycleAt?: unknown }));
            ownedByEmailReady = true;
            combineAndSet();
          },
          (error) => {
            console.error("Error fetching companies by owner email:", error);
            setLoading(false);
          }
        )
      : () => {};

    return () => {
      unsubOwned();
      unsubShared();
      unsubOwnedByEmail();
    };
  }, [user, isSuperAdminUser]);

  const onCompanyCreated = () => {
    // This is now handled automatically by the onSnapshot listeners.
    // The prop is still required by CompanyActions but can be a no-op.
  };

  /** Mobile: lambi toolbar — expand/chevron hata kar horizontal swipe scroll (footer toggle bhi hataya user ne) */
  const headerIsMobile = useIsMobile();

  /** Electron `.exe`: pink header ki quick-action strip (Add Sale…) hide/show — localStorage + View menu sync */
  const isElectronDesk = isElectronDesktopApp();
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(PL_DESKTOP_QUICK_ACTIONS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        setQuickActionsCollapsed(localStorage.getItem(PL_DESKTOP_QUICK_ACTIONS_KEY) === "1");
      } catch {
        setQuickActionsCollapsed(false);
      }
    };
    window.addEventListener("pl-desktop-quick-actions-toggle", sync);
    return () => window.removeEventListener("pl-desktop-quick-actions-toggle", sync);
  }, []);

  const toggleElectronQuickActionsRibbon = useCallback(() => {
    try {
      const nextHidden = localStorage.getItem(PL_DESKTOP_QUICK_ACTIONS_KEY) !== "1";
      if (nextHidden) localStorage.setItem(PL_DESKTOP_QUICK_ACTIONS_KEY, "1");
      else localStorage.removeItem(PL_DESKTOP_QUICK_ACTIONS_KEY);
      setQuickActionsCollapsed(nextHidden);
      window.dispatchEvent(new Event("pl-desktop-quick-actions-toggle"));
    } catch {
      setQuickActionsCollapsed((v) => !v);
    }
  }, []);

  return (
    <header className="relative sticky top-0 z-30 border-b border-sidebar-border bg-background px-[2px] py-0.5">
      <EmbeddedAttachmentHeaderProgress />
      {/* Static/Electron: icon sirf sidebar green brand card me — yahan extra black strip nahi (tab strip + duplicate lagta tha). */}
      {/* User request: single header card, but control alignment purane header flow jaisa rakho */}
      {/* User request: header container ko pink tone me dikhana */}
      {/* User request: dono taraf ~2px — sidebar kinaare, avatar daen; beech me company truncate. */}
      {/* Mobile: yahan horizontal padding 0 — sirf outer header `px-[2px]` se sidebar kinaare 2px; desktop par andar +2px. */}
      <div
        className={cn(
          "pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-pink w-full min-w-0 py-1",
          headerIsMobile ? "px-0" : "px-[2px]"
        )}
      >
        {headerIsMobile ? (
          <div className="flex w-full min-w-0 items-center">
            {/* Sidebar ↔ company: exactly 4px (`mr-1`); outer header se sidebar ~2px. */}
            {/* `data-pl-no-edge-swipe-capture`: document capture `preventDefault` edge strip is touch se header button na mare */}
            <div className="mr-1 flex shrink-0 items-center" data-pl-no-edge-swipe-capture>
              <SidebarTrigger className="touch-manipulation" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <HeaderCompanyPickerIsland
                  unfilteredHeaderCompanies={unfilteredHeaderCompanies}
                  loading={loading}
                  user={user}
                  isSuperAdminUser={isSuperAdminUser}
                  onCompanyCreated={onCompanyCreated}
                  mobileStrip
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DateSystemSwitcher />
                <MobileReportButtonsOnly />
                <AddNewButtonOnReportPage />
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center">
              <UserProfileButton />
            </div>
          </div>
        ) : (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            {/* `min-w-0` ta company `truncate` narrow window par kaam kare — sidebar↔company 4px (`gap-1`). */}
            <div className="flex min-w-0 items-center gap-1">
              <SidebarTrigger />
              {isElectronDesk ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0"
                  onClick={toggleElectronQuickActionsRibbon}
                  title={
                    quickActionsCollapsed
                      ? "Show quick actions (Add Sale, Payment…)"
                      : "Hide quick actions ribbon"
                  }
                  aria-label={
                    quickActionsCollapsed ? "Show quick actions ribbon" : "Hide quick actions ribbon"
                  }
                >
                  {quickActionsCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
              <HeaderCompanyPickerIsland
                unfilteredHeaderCompanies={unfilteredHeaderCompanies}
                loading={loading}
                user={user}
                isSuperAdminUser={isSuperAdminUser}
                onCompanyCreated={onCompanyCreated}
              />
              <DateSystemSwitcher />
            </div>

            {!(isElectronDesk && quickActionsCollapsed) ? <HeaderActions /> : null}

            <div className="h-0 w-0 grow-[9999] shrink-0 basis-0" />

            <div className="flex min-w-0 flex-shrink-0 items-center gap-2">
              {/* Desktop: pehle Add New (mobile pe stripe me profile ke pehle) — purani daen-cluster order */}
              <AddNewButtonOnReportPage />
              <UserProfileButton />
              <CopyLedgerHeaderButton />
              <GlobalFileHoverPreviewSwitch />
              <ScreenControls />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
