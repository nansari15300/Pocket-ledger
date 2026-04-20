
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
  PanelRight,
  Settings,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { collection, query, where, onSnapshot, getDocsFromServer, Timestamp } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, format, differenceInDays } from "date-fns";
import { CompanyActions } from "@/components/company/CompanySelector";
import { useRouter, usePathname, useParams, useSearchParams } from "next/navigation";
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
import { signOut } from "firebase/auth";
import type { Company } from "@/hooks/useCompany";
import {
  DEFAULT_PLANS,
  getNextPaidUpgrade,
  numericEntitlement,
  companyStorageIsLocal,
  type PlanId,
} from "@/config/plans";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { Badge } from "../ui/badge";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { useReportList } from "@/contexts/ReportListContext";
import { useMasterDetailHeaderIdSnapshot } from "@/hooks/useMasterDetailHeaderIdSnapshot";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isLocalOnlyMode } from "@/lib/localMode";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { disableLocalGuest, isLocalGuestEnabled } from "@/lib/localGuestSession";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { countOnlineCompanySlotsForOwner, maxOnlineCompaniesForPlan } from "@/lib/companyOnlineSlots";
import { GlobalFileHoverPreviewSwitch } from "@/components/layout/GlobalFileHoverPreviewSwitch";
import { CopyLedgerHeaderButton } from "@/components/ledger/CopyLedgerHeaderButton";

/** Static export trailingSlash: URL /party/ vs /party — normalize for route checks */
function pathRoot(pathname: string | null, segment: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  return p === `/${segment}`;
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

function ReportListButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setReportListOpen } = useReportList();
  const isMobile = useIsMobile();
  // Only show report list icon on main Reports page ($/reports), not on entity-specific report pages
  // (party-statement, bank-statement, staff-statement, tax-statement, item-statement, expense-statement, etc.)
  const isReportListPage = pathname === "/reports" || pathname === "/reports/";
  // Detail khule tab hi icon — list-only par header halka
  const reportSelected = Boolean(searchParams.get("report"));
  if (!isReportListPage || !isMobile || !reportSelected) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setReportListOpen(true)}
      title="Open report list"
      aria-label="Open report list"
      className="bg-background shadow-sm flex-shrink-0 h-9 w-9"
    >
      <PanelRight className="h-4 w-4" />
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
  const searchParams = useSearchParams();
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
  const searchParams = useSearchParams();
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
  const searchParams = useSearchParams();
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
  const searchParams = useSearchParams();
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
  const searchParams = useSearchParams();
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
  const searchParams = useSearchParams();
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
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenSale(true)} data-theme-btn="add-sale">
          <ShoppingBag className="mr-1 h-4 w-4" /> Add Sale
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Purchase */}
      <AddVoucherDialog defaultTab="purchase" voucher={undefined} isOpen={openPurchase} onOpenChange={setOpenPurchase}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenPurchase(true)} data-theme-btn="add-purchase">
          <ShoppingCart className="mr-1 h-4 w-4" /> Add Purchase
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Payment In */}
      <AddVoucherDialog defaultTab="payment_in" voucher={undefined} isOpen={openPaymentIn} onOpenChange={setOpenPaymentIn}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenPaymentIn(true)} data-theme-btn="payment-in">
          <ArrowRight className="mr-1 h-4 w-4" /> Payment In
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Payment Out */}
      <AddVoucherDialog defaultTab="payment_out" voucher={undefined} isOpen={openPaymentOut} onOpenChange={setOpenPaymentOut}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenPaymentOut(true)} data-theme-btn="payment-out">
          <ArrowLeft className="mr-1 h-4 w-4" /> Payment Out
        </PermissionButton>
      </AddVoucherDialog>

      {/* Journal – opens AddVoucherDialog with journal tab */}
      <AddVoucherDialog defaultTab="journal" voucher={undefined} isOpen={openJournal} onOpenChange={setOpenJournal}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenJournal(true)}>
          <FileText className="mr-1 h-4 w-4" /> Journal
        </PermissionButton>
      </AddVoucherDialog>

      {/* ✅ Salary */}
      <AddVoucherDialog defaultTab="add_salary" voucher={undefined} isOpen={openSalary} onOpenChange={setOpenSalary}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} onClick={() => setOpenSalary(true)} data-theme-btn="add-salary">
          <FileDigit className="mr-1 h-4 w-4" /> Add Salary
        </PermissionButton>
      </AddVoucherDialog>

      <CreatePartyDialog onPartyCreated={() => {}} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} data-theme-btn="add-party">
          <Users className="mr-1 h-4 w-4" /> Add Party
        </PermissionButton>
      </CreatePartyDialog>

      <CreateItemDialog onItemCreated={() => {}} isOpen={isCreateItemOpen} onOpenChange={setIsCreateItemOpen}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} data-theme-btn="add-item">
          <BookText className="mr-1 h-4 w-4" /> Add Item
        </PermissionButton>
      </CreateItemDialog>

      <CreateBankAccountDialog onAccountCreated={() => {}} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} data-theme-btn="add-bank">
          <Landmark className="mr-1 h-4 w-4" /> Add Bank
        </PermissionButton>
      </CreateBankAccountDialog>

      <CreateStaffDialog onStaffCreated={() => {}} groups={[]} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen}>
        <PermissionButton permission="create_records" variant="outline" size="sm" className={buttonClass} data-theme-btn="add-staff">
          <Briefcase className="mr-1 h-4 w-4" /> Add Staff
        </PermissionButton>
      </CreateStaffDialog>
    </>
  );
}

function UserProfileButton() {
  const router = useRouter();
  const { user } = useAuth();
  const { company, allCompanies } = useCompany();
  const { isOnline } = useOnlineStatus();
  const livePlans = useLivePlans();
  const [profileOpen, setProfileOpen] = useState(false);
  const [dailyUsed, setDailyUsed] = useState<number | null>(null);
  const [monthlyUsed, setMonthlyUsed] = useState<number | null>(null);
  const [userStorageUsedBytes, setUserStorageUsedBytes] = useState<number | null>(null);
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
    // Local guest logout: local no-login flag off karo so app true online login screen par aaye.
    if (isLocalGuestEnabled()) {
      disableLocalGuest();
      router.replace("/");
      return;
    }
    await signOut(auth);
    // Firebase logout ke baad bhi explicit redirect rakho for predictable online-login UX.
    router.replace("/");
  };

  useEffect(() => {
    if (!profileOpen || !company?.id) {
      setDailyUsed(null);
      setMonthlyUsed(null);
      return;
    }
    const voucherPath = `companies/${company.id}/vouchers`;
    const now = new Date();
    const todayStart = Timestamp.fromDate(startOfDay(now));
    const todayEnd = Timestamp.fromDate(endOfDay(now));
    const monthStart = Timestamp.fromDate(startOfMonth(now));
    const monthEnd = Timestamp.fromDate(endOfMonth(now));
    const dailyQuery = query(
      collection(firestore, voucherPath),
      where("date", ">=", todayStart),
      where("date", "<=", todayEnd)
    );
    const monthlyQuery = query(
      collection(firestore, voucherPath),
      where("date", ">=", monthStart),
      where("date", "<=", monthEnd)
    );
    Promise.all([
      getDocsFromServer(dailyQuery),
      getDocsFromServer(monthlyQuery),
    ]).then(([dailySnap, monthlySnap]) => {
      setDailyUsed(dailySnap.size);
      setMonthlyUsed(monthlySnap.size);
    }).catch(() => {
      setDailyUsed(null);
      setMonthlyUsed(null);
    });
  }, [profileOpen, company?.id]);

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

  const accountPlanId = user?.uid
    ? resolveEffectiveAccountPlanId(allCompanies, user.uid, company?.planId)
    : ((company?.planId as PlanId) || "basic");
  const planName = DEFAULT_PLANS[accountPlanId]?.name ?? String(accountPlanId);
  const plan = getPlanFromPlans(livePlans, accountPlanId);
  // Profile dropdown: selected company local ho to uske liye *Local caps dikhao (admin Plans).
  const storageIsLocal = companyStorageIsLocal(company?.storageOption);
  const maxAttGB = numericEntitlement(plan?.entitlements, "maxAttachmentsGB", storageIsLocal);
  const dailyLimit = numericEntitlement(plan?.entitlements, "dailyVoucherLimit", storageIsLocal);
  const monthlyLimit = numericEntitlement(plan?.entitlements, "monthlyVoucherLimit", storageIsLocal);
  const ownedForUsage = React.useMemo(
    () =>
      allCompanies.filter(
        (c) =>
          c.isOwned === true && !!user?.uid && String(c.ownerId || "").trim() === String(user.uid).trim()
      ),
    [allCompanies, user?.uid]
  );
  const attUsedGB =
    ownedForUsage.reduce((s, c) => s + Number((c as Company).attachmentsUsedBytes ?? 0), 0) / 1e9;
  const attFreeGB = Math.max(0, maxAttGB - attUsedGB);
  const GB_TO_MB = 1024;
  const attUsedMB = attUsedGB * GB_TO_MB;
  const attFreeMB = attFreeGB * GB_TO_MB;
  const userStorUsedMB = userStorageUsedBytes != null ? userStorageUsedBytes / (1024 * 1024) : 0;
  const accountMaxStorGB = numericEntitlement(plan?.entitlements, "maxStorageGB", storageIsLocal);
  const totalMaxStorMB = accountMaxStorGB * GB_TO_MB;
  const storFreeMB = Math.max(0, totalMaxStorMB - userStorUsedMB);
  const maxStorGB = accountMaxStorGB;
  const onlineSlotMax = maxOnlineCompaniesForPlan(accountPlanId);
  const onlineSlotUsed =
    user?.uid != null && user.uid !== "" ? countOnlineCompanySlotsForOwner(allCompanies, user.uid) : 0;
  /** Pro Plus ke upar koi paid tier nahi — "Upgrade" mat dikhao */
  const accountCanUpgradeToPaidTier = getNextPaidUpgrade(accountPlanId) != null;

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
            {/* Header avatar: hover par bada pic preview mat dikhao — sirf chhota circle + dropdown (entity lists par `EntityFileAttachmentHover` alag). */}
            <div
              className={cn(
                "relative h-9 w-9 rounded-full inline-flex [&:focus-visible]:outline-none",
                isOnline ? "ring-2 ring-green-500 ring-offset-0" : "ring-2 ring-black ring-offset-0"
              )}
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? "User"} />
                <AvatarFallback>{getInitials(user.displayName ?? user.email)}</AvatarFallback>
              </Avatar>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn(
            "w-[min(90vw,320px)] sm:w-64 rounded-xl shadow-lg border bg-popover/95 backdrop-blur supports-[backdrop-filter]:bg-popover/90",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
          align="end"
          sideOffset={8}
          forceMount
          onMouseEnter={openProfileFromHover}
          onMouseLeave={scheduleProfileHoverClose}
        >
          <DropdownMenuLabel className="font-normal px-3 pt-3 pb-2">
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-medium leading-none truncate">{user.displayName}</p>
              <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
            </div>
          </DropdownMenuLabel>

          {company && (
            <>
              <DropdownMenuSeparator />
              <div className="px-3 py-2 space-y-3">
                {/* Plan / upgrade: owner-only — shared company users must not see paid-plan or billing CTAs */}
                {company.isOwned === true && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Current Plan</div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="shrink-0">{planName}</Badge>
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
                      {accountCanUpgradeToPaidTier ? "Upgrade" : "Billing"}
                    </Button>
                  </div>
                  {company?.planExpiry && (() => {
                    const raw = company.planExpiry;
                    const expiryDate = typeof raw?.toDate === "function" ? raw.toDate() : (raw?.seconds ? new Date(raw.seconds * 1000) : null);
                    if (!expiryDate) return null;
                    const now = new Date();
                    const daysLeft = differenceInDays(expiryDate, now);
                    return (
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                        <div>Expires on: <span className="font-medium text-foreground">{format(expiryDate, "MMM d, yyyy")}</span></div>
                        <div>
                          {daysLeft < 0 ? (
                            <span className="font-medium text-destructive">Expired</span>
                          ) : daysLeft === 0 ? (
                            <span className="font-medium text-amber-600">Expires today</span>
                          ) : (
                            <span className="font-medium text-foreground">{daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {onlineSlotMax > 0 && user?.uid ? (
                    <div className="text-xs text-muted-foreground mt-1.5">
                      Online company slots:{" "}
                      <span className="font-medium text-foreground">{onlineSlotUsed}</span> /{" "}
                      <span className="font-medium text-foreground">{onlineSlotMax}</span>
                    </div>
                  ) : null}
                </div>
                )}

                <div className="text-xs space-y-2 pt-2 border-t">
                  {(dailyLimit > 0 || monthlyLimit > 0) && (
                    <div className="space-y-1">
                      {dailyLimit > 0 && (
                        <div className="text-muted-foreground">
                          Daily vouchers: <span className="font-medium text-foreground">{dailyUsed ?? "—"}</span> / <span className="font-medium text-foreground">{dailyLimit}</span>
                        </div>
                      )}
                      {monthlyLimit > 0 && (
                        <div className="text-muted-foreground">
                          Monthly vouchers: <span className="font-medium text-foreground">{monthlyUsed ?? "—"}</span> / <span className="font-medium text-foreground">{monthlyLimit}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(maxAttGB > 0 || maxStorGB > 0) && (
                    <div className="space-y-1">
                      {maxAttGB > 0 && (
                        <div className="text-muted-foreground">
                          Attachments: <span className="font-medium text-foreground">{attUsedMB.toFixed(0)}</span> MB used / <span className="font-medium text-foreground">{attFreeMB.toFixed(0)}</span> MB free
                        </div>
                      )}
                      {maxStorGB > 0 && (
                        <div className="text-muted-foreground">
                          Storage: <span className="font-medium text-foreground">{userStorageUsedBytes != null ? userStorUsedMB.toFixed(0) : "…"}</span> MB used / <span className="font-medium text-foreground">{userStorageUsedBytes != null ? storFreeMB.toFixed(0) : "…"}</span> MB free
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="py-2.5 cursor-pointer">
            <LogOut className="mr-2 h-4 w-4 shrink-0" />
            <span>Log out</span>
          </DropdownMenuItem>
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
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {dateMenuContent}
        </DropdownMenuContent>
      </DropdownMenu>
      <DateFormatSettingsDialog open={dateFormatDialogOpen} onOpenChange={setDateFormatDialogOpen} />
      {forcedViewMode === 'mobile' ? (
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
      <UserProfileButton />
    </div>
  );
}

export function DesktopAppHeader() {
  const { user, customUser } = useAuth();
  const { allCompanies: contextCompanies, loading: companyContextLoading } = useCompany();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = customUser?.role === "SuperAdmin";

  useEffect(() => {
    if (isLocalOnlyMode()) {
      // Local-first: header list = owned + local + mirrored online/shared (CompanySelector ke saath align)
      setLoading(Boolean(companyContextLoading));
      const isOwnedByUser = (c: Company) =>
        (!!user?.uid && c.ownerId === user?.uid) ||
        (!!user?.email &&
          !!c.ownerEmail &&
          c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
      const mapped = (contextCompanies || [])
        .filter((c) => !c.isDeleted)
        .map((c) => ({ ...c, isOwned: isOwnedByUser(c) })) as Company[];
      setCompanies(mapped);
      if (!companyContextLoading && (!contextCompanies || contextCompanies.length === 0)) {
        listLocalCompanies()
          .then((rows) => {
            const mappedRows = rows
              .filter((r: { isDeleted?: boolean }) => !r?.isDeleted)
              .map((r) => {
                const c = { ...(r as unknown as Company) };
                return { ...c, isOwned: isOwnedByUser(c) } as Company;
              });
            setCompanies(mappedRows);
          })
          .finally(() => setLoading(false));
      }
      return;
    }

    if (!user || !user.email) {
      setLoading(false);
      setCompanies([]);
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
    const ownedByEmailQuery = isSuperAdmin
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

      const next = Array.from(companyMap.values());
      // Avoid no-op state writes — lekin sirf id/isOwned mat compare karo; rename (name) change par bhi next apply ho (selector live rahe)
      setCompanies((prev) => {
        const sameLength = prev.length === next.length;
        if (!sameLength) return next;
        const rowSig = (c: Company) =>
          `${c.id}\0${Boolean(c.isOwned)}\0${c.name ?? ""}\0${String((c as Company & { storageOption?: string }).storageOption ?? "")}`;
        const same =
          prev.length === next.length &&
          prev.every((p, i) => rowSig(p) === rowSig(next[i] as Company));
        return same ? prev : next;
      });
      setLoading(false);
    };

    // Load local companies in parallel with Firestore so dropdown can show local + cloud together.
    listLocalCompanies()
      .then((rows) => {
        localCompaniesCache = rows
          .filter((c: any) => !c?.isDeleted)
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
          .filter((c) => !c.isDeleted);
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
          .filter((c) => !c.isDeleted);
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
              .filter((c) => !c.isDeleted);
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
  }, [user, isSuperAdmin, contextCompanies, companyContextLoading]);

  const onCompanyCreated = () => {
    // This is now handled automatically by the onSnapshot listeners.
    // The prop is still required by CompanyActions but can be a no-op.
  };

  /** Mobile: ek hi row + horizontal scroll; Sync ledger / hover switch / fullscreen yahan se hata */
  const headerIsMobile = useIsMobile();

  return (
    <header className="relative sticky top-0 z-30 border-b bg-background px-2 py-2">
      <div
        className={cn(
          "flex items-center gap-2 w-full min-w-0",
          headerIsMobile ? "flex-nowrap overflow-x-auto overscroll-x-contain" : "flex-wrap"
        )}
      >
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <SidebarTrigger />
          {loading ? (
            <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          ) : (
            <CompanyActions companies={companies} onCompanyCreated={onCompanyCreated} />
          )}
          <DateSystemSwitcher />
        </div>

        <HeaderActions />

        {/* Desktop: spacer; mobile par grow hata kar saari cheezein scroll row me */}
        {!headerIsMobile ? <div className="grow-[9999] shrink-0 h-0 w-0 basis-0" /> : null}

        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <AddNewButtonOnReportPage />
          <MobileReportButtonsOnly />
          {!headerIsMobile && (
            <>
              <CopyLedgerHeaderButton />
              <GlobalFileHoverPreviewSwitch />
              <ScreenControls />
            </>
          )}
          <ReportListButton />
        </div>
      </div>
    </header>
  );
}
