
"use client";

import {
  BookText,
  Briefcase,
  Factory,
  FilePenLine,
  Flame,
  LayoutDashboard,
  LogOut,
  Landmark,
  Receipt,
  Settings,
  FileText,
  PanelLeft,
  FilePieChart,
  Trash2,
  DollarSign,
  Banknote,
  Shield,
  Loader2,
  ListTree,
  CreditCard,
  UserPlus,
  Building2,
  ImageIcon,
  Database,
  Mail, // Added Mail icon
  Users,
  Table,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { pruneRememberedLoginEmailIfDisabled } from "@/lib/loginRememberEmail";
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { firestore, auth, signOutWithFirestoreTeardown } from "@/lib/firebase";
import type { Permission } from "@/lib/permissions";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { appNavHref } from "@/lib/appNavHref";
import { CompanyActions } from "@/components/company/CompanySelector";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { Badge } from "../ui/badge";
import { disableLocalGuest, isLocalGuestEnabled } from "@/lib/localGuestSession";
import { useCachedFeatureConfig } from "@/hooks/useCachedFeatureConfig";
import { collectPartyIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesPartyLedger";
import { collectBankAccountIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesBankLedger";
import { collectItemIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesItemLedger";
import { collectStaffIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesStaffLedger";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";


type MenuItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  permissionAny?: Permission[];
};

const allMenuItems: MenuItem[] = [
  { id: 'dashboard', href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: 'party', href: "/party", label: "Parties", icon: Users },
  { id: 'bank-cash', href: "/bank-cash", label: "Bank/Cash", icon: Landmark },
  { id: 'staff', href: "/staff", label: "Staff", icon: Briefcase },
  { id: 'tax', href: "/tax", label: "Tax", icon: Banknote },
  { id: 'incomes', href: "/incomes", label: "Income & Expense", icon: DollarSign },
  { id: 'items', href: "/items", label: "Items & Service", icon: BookText },
  { id: 'reports', href: "/reports", label: "Reports", icon: FilePieChart, permission: "export_data" },
  { id: 'gallery', href: "/gallery", label: "Gallery", icon: ImageIcon },
  { id: 'production', href: "/production", label: "Production", icon: Factory },
  { id: 'sale-note', href: "/sale-note", label: "Sale Note", icon: FileText },
  { id: 'purchase-note', href: "/purchase-note", label: "Purchase Note", icon: FileText },
  { id: 'quotations', href: "/quotations", label: "Quotations", icon: FilePenLine },
];

export const bottomMenuItems: MenuItem[] = [
    { id: 'messages', href: "/messages", label: "Messages", icon: Mail },
    { id: 'billing', href: "/billing", label: "Billing & Plans", icon: CreditCard, permission: "configure_company_settings" },
    { id: 'distributor-signup', href: "/distributor-signup", label: "Be a Distributor", icon: UserPlus },
    { id: 'backup', href: "/backup", label: "Backup & Restore", icon: Database, permissionAny: ["export_data", "import_data"] },
    { id: 'import-export', href: "/import-export", label: "Import/Export", icon: Table, permissionAny: ["export_data", "import_data"] },
    { id: 'recycle-bin', href: "/recycle-bin", label: "Recycle Bin", icon: Trash2, permission: "delete_records" },
    { id: 'settings', href: "/settings", label: "Settings", icon: Settings },
];

export type Feature = {
    id: string;
    label: string;
}

export const ALL_FEATURES: Feature[] = [...allMenuItems, ...bottomMenuItems].map(item => ({ id: item.id, label: item.label }));


function filterByPermission<T extends { permission?: Permission; permissionAny?: Permission[] }>(
  items: T[],
  can: (p: Permission) => boolean
): T[] {
  return items.filter((item) => {
    if (item.permissionAny?.length) {
      return item.permissionAny.some((p) => can(p));
    }
    if (item.permission) {
      return can(item.permission);
    }
    return true;
  });
}

const ENTITY_IDS = ['party', 'bank-cash', 'staff', 'tax', 'items', 'incomes'] as const;

/** Sidebar ke pehle chrome-card ke liye: party/tax/bank… core navigation */
const CORE_NAV_IDS = new Set<string>([
  "dashboard",
  "party",
  "bank-cash",
  "staff",
  "tax",
  "incomes",
]);

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, customUser } = useAuth();
  const { can } = usePermissions();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const {
    vouchers,
    processedStaff,
    processedTaxes,
    processedExpenseAccounts,
    processedParties,
    processedAccounts,
    processedItems,
  } = useVouchers();
  const { isOpen, isMobile, setIsOpen } = useSidebar();
  /** Static/Capacitor: sirf <Link> se route kabhi load nahi hota — router.push se SPA navigation pakka */
  const isStaticApp = isStaticAppBuild();
  const onNavLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (isStaticApp) {
        e.preventDefault();
        router.push(appNavHref(href));
      }
      if (isMobile) setIsOpen(false);
    },
    [isStaticApp, router, isMobile, setIsOpen]
  );
  const [featureConfig, setFeatureConfig] = useState<Record<string, boolean> | null>(null);
  const defaultFeatureConfig = useMemo(() => {
    // Offline fallback: basic profile ke hisaab se selected premium menus default off rakho.
    return {
      dashboard: true,
      party: true,
      "bank-cash": true,
      staff: true,
      tax: true,
      incomes: true,
      items: true,
      reports: true,
      gallery: true,
      production: false,
      "sale-note": false,
      "purchase-note": false,
      quotations: false,
      messages: true,
      billing: true,
      "distributor-signup": false,
      backup: true,
      "import-export": true,
      "recycle-bin": true,
      settings: true,
    } as Record<string, boolean>;
  }, []);
  const { featureConfig: cachedFeatureConfig, loading: loadingFeatures } = useCachedFeatureConfig(defaultFeatureConfig);
  const [pendingHandovers, setPendingHandovers] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const myUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.uid) ids.add(user.uid);
    if (customUser?.userDocId) ids.add(customUser.userDocId);
    return Array.from(ids);
  }, [user?.uid, customUser?.userDocId]);

  const showApproveInSidebar =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onEntity !== false;

  const partyIdSetForSidebar = useMemo(
    () => new Set((processedParties || []).map((p: { id: string }) => p.id).filter(Boolean)),
    [processedParties]
  );
  // Bank/items: list-page jaisa — sirf is company ke master ids jo voucher line me dikhte hain
  const bankAccountIdSetForSidebar = useMemo(
    () => new Set((processedAccounts || []).map((a: { id: string }) => a.id).filter(Boolean)),
    [processedAccounts]
  );
  const itemIdSetForSidebar = useMemo(
    () => new Set((processedItems || []).map((i: { id: string }) => i.id).filter(Boolean)),
    [processedItems]
  );

  const pendingCountByEntity = useMemo(() => {
    const out: Record<string, number> = {};
    if (!showApproveInSidebar || !vouchers?.length) return out;
    const pending = vouchers.filter((v: any) => v.isApproved !== true);
    const staffIdSet = new Set((processedStaff || []).map((s: any) => s.id));
    const taxIdSet = new Set((processedTaxes || []).map((t: any) => t.id));
    const expenseAccountIdSet = new Set((processedExpenseAccounts || []).map((a: any) => a.id));
    out.party = 0;
    out["bank-cash"] = 0;
    out.staff = 0;
    out.tax = 0;
    out.items = 0;
    out.incomes = 0;

    pending.forEach((v: any) => {
      // Party ledger jaisa: journal `entries` bina `partyId` — list/header pe count hai, sidebar pe pehle miss ho raha tha
      const hasParty = partyIdSetForSidebar.size > 0 && collectPartyIdsTouchedByUnapprovedVoucher(v, partyIdSetForSidebar).size > 0;
      const hasBankCash =
        bankAccountIdSetForSidebar.size > 0 &&
        collectBankAccountIdsTouchedByUnapprovedVoucher(v, bankAccountIdSetForSidebar).size > 0;
      const hasStaff =
        staffIdSet.size > 0 && collectStaffIdsTouchedByUnapprovedVoucher(v, staffIdSet).size > 0;
      const hasTax =
        (v.taxAccountId && taxIdSet.has(v.taxAccountId)) ||
        (Array.isArray(v.lineItems) &&
          v.lineItems.some((l: any) => l.taxAccountId && taxIdSet.has(l.taxAccountId))) ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => e.accountId && taxIdSet.has(e.accountId)));
      const hasItems =
        itemIdSetForSidebar.size > 0 && collectItemIdsTouchedByUnapprovedVoucher(v, itemIdSetForSidebar).size > 0;
      const hasIncomes =
        (v.incomeAccountId && expenseAccountIdSet.has(v.incomeAccountId)) ||
        (v.expenseAccountId && expenseAccountIdSet.has(v.expenseAccountId)) ||
        (v.accountId && expenseAccountIdSet.has(v.accountId)) ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => e.accountId && expenseAccountIdSet.has(e.accountId)));

      if (hasParty) out.party += 1;
      if (hasBankCash) out["bank-cash"] += 1;
      if (hasStaff) out.staff += 1;
      if (hasTax) out.tax += 1;
      if (hasItems) out.items += 1;
      if (hasIncomes) out.incomes += 1;
    });
    return out;
  }, [
    vouchers,
    processedStaff,
    processedTaxes,
    processedExpenseAccounts,
    showApproveInSidebar,
    partyIdSetForSidebar,
    bankAccountIdSetForSidebar,
    itemIdSetForSidebar,
  ]);

  useEffect(() => {
    // Centralized cached feature hook use karo so super-admin settings local mode me bhi apply ho.
    setFeatureConfig(cachedFeatureConfig || defaultFeatureConfig);
  }, [cachedFeatureConfig, defaultFeatureConfig]);

  useEffect(() => {
    if (!user?.email || !user?.uid) return;

    // Handover notifications
    const handoverQuery = query(
      collection(firestore, "companies"),
      where("handoverTo", "==", user.email),
      where("handoverStatus", "==", "pending")
    );
    const unsubHandovers = onSnapshot(handoverQuery, (snapshot) => setPendingHandovers(snapshot.size));

    // Admin/Alarm/transaction alerts — sirf abhi selected company (cross-company badge galat na ho).
    const unreadAlertsByRecipient: Record<string, Set<string>> = {};
    const alertsUnsubscribers: (() => void)[] = [];
    const recomputeUnreadAlerts = () => {
      const merged = new Set<string>();
      Object.values(unreadAlertsByRecipient).forEach((set) => set.forEach((id) => merged.add(id)));
      setUnreadAlerts(merged.size);
    };
    const cid = companyId?.trim() || "";
    if (!cid) {
      setUnreadAlerts(0);
    } else {
      myUserIds.forEach((id) => {
        const alertsQuery = query(
          collection(firestore, "admin_notifications"),
          where("recipientUserId", "==", id),
          where("companyId", "==", cid),
          where("isRead", "==", false)
        );
        const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
          unreadAlertsByRecipient[id] = new Set(snapshot.docs.map((d) => d.id));
          recomputeUnreadAlerts();
        });
        alertsUnsubscribers.push(unsubAlerts);
      });
    }

    // Unread Chat Messages (supports both uid + legacy userDocId participants/receiverId)
    const conversationUnreadCounts = new Map<string, number>();
    let messageUnsubscribers: (() => void)[] = [];
    const conversationDocsById = new Map<string, any>();
    const conversationUnsubscribers: (() => void)[] = [];

    const attachMessageListeners = () => {
      messageUnsubscribers.forEach((unsub) => unsub());
      messageUnsubscribers = [];
      conversationUnreadCounts.clear();

      const convDocs = Array.from(conversationDocsById.values());
      if (convDocs.length === 0) {
        setUnreadMessages(0);
        return;
      }

      convDocs.forEach((convDoc: any) => {
        const messagesQuery = query(collection(firestore, "conversations", convDoc.id, "messages"));
        const messageUnsub = onSnapshot(messagesQuery, (messageSnap) => {
          const unreadVisibleCount = messageSnap.docs.filter((messageDoc) => {
            const messageData: any = messageDoc.data();
            const deletedFor = Array.isArray(messageData?.deletedFor) ? messageData.deletedFor : [];
            return myUserIds.includes(messageData?.receiverId) && messageData?.status !== "read" && !deletedFor.includes(user.uid);
          }).length;
          conversationUnreadCounts.set(convDoc.id, unreadVisibleCount);
          const totalUnread = Array.from(conversationUnreadCounts.values()).reduce((a, b) => a + b, 0);
          setUnreadMessages(totalUnread);
        });
        messageUnsubscribers.push(messageUnsub);
      });
    };

    myUserIds.forEach((id) => {
      const conversationsQuery = query(
        collection(firestore, "conversations"),
        where("participants", "array-contains", id)
      );
      const unsubConversations = onSnapshot(conversationsQuery, (convSnap) => {
        convSnap.docs.forEach((d) => {
          conversationDocsById.set(d.id, { id: d.id, ...d.data() });
        });
        attachMessageListeners();
      });
      conversationUnsubscribers.push(unsubConversations);
    });


    return () => {
      unsubHandovers();
      alertsUnsubscribers.forEach((unsub) => unsub());
      conversationUnsubscribers.forEach((unsub) => unsub());
      messageUnsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.email, user?.uid, myUserIds, companyId]);
  
  const displayName = user?.displayName || user?.email?.split('@')[0] || "User";

  const handleLogout = async () => {
    const { clearNavigationMemory } = await import("@/lib/navigation-memory");
    clearNavigationMemory();
    pruneRememberedLoginEmailIfDisabled();
    // Local guest logout: local session band karke user ko online login page par le jao.
    if (isLocalGuestEnabled()) {
      disableLocalGuest();
      router.replace("/");
      return;
    }
    await signOutWithFirestoreTeardown(auth);
    // Firebase user logout ke baad explicit login redirect to avoid stale dashboard screen.
    router.replace("/");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("");
  };
  
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isAdmin = customUser?.role === "SuperAdmin" || isSuperAdminByEmail;
  /** Static EXE/APK: `/admin` bundle me hota hi nahi — role ya super-admin email ho tab bhi sidebar link mat dikhao */
  const showAdminNavLink = isAdmin && !isStaticApp;
  
  // Default to showing when not explicitly off (so ticked/default = show without needing save). Alerts only for company owner.
  const transactionAlerts = effectiveNotificationSettings?.transactionAlerts;
  const includeAlertsInSidebar = transactionAlerts?.on !== false && transactionAlerts?.onEntity !== false && company?.isOwned === true;
  const totalNotifications = unreadMessages + (includeAlertsInSidebar ? unreadAlerts : 0);
  const messageSettings = effectiveNotificationSettings?.message;
  const showMessageBadgeInSidebar =
    (messageSettings?.on !== false && messageSettings?.onEntity !== false) || includeAlertsInSidebar;
  const messagesBadgeCount = showMessageBadgeInSidebar ? totalNotifications : 0;
  const isMenuItemActive = useCallback(
    (item: MenuItem) => pathname.startsWith(item.href.replace(/\/$/, "")),
    [pathname]
  );

  const visibleMenuItems = React.useMemo(() => {
    if (!featureConfig) return allMenuItems;
    const byFeature = allMenuItems.filter((item) => featureConfig[item.id] !== false);
    return filterByPermission(byFeature, can);
  }, [featureConfig, can]);

  const { coreMenuItems, catalogMenuItems } = React.useMemo(() => {
    const core = visibleMenuItems.filter((i) => CORE_NAV_IDS.has(i.id));
    // Gallery, Items, Reports, etc. yahi "More" (emerald) card me — CORE_NAV_IDS me sirf main rail
    const catalog = visibleMenuItems.filter((i) => !CORE_NAV_IDS.has(i.id));
    return { coreMenuItems: core, catalogMenuItems: catalog };
  }, [visibleMenuItems]);

  // Hide Billing & Plans for shared company access — only owner buys / upgrades subscription.
  const visibleBottomMenuItems = React.useMemo(() => {
    const hideBilling = company != null && company.isOwned === false;
    const stripBilling = (items: typeof bottomMenuItems) =>
      hideBilling ? items.filter((item) => item.id !== "billing") : items;

    if (!featureConfig) return filterByPermission(stripBilling(bottomMenuItems), can);
    const byFeature = stripBilling(bottomMenuItems).filter((item) => {
      if (item.id === "distributor-signup" && customUser?.role === "Distributor") {
        return false;
      }
      return featureConfig[item.id] !== false;
    });
    return filterByPermission(byFeature, can);
  }, [featureConfig, customUser, can, company]);

  /** Ek nav row — core / catalog dono cards reuse (dashboard-style list) */
  function renderMainNavRow(item: MenuItem) {
    const pendingCount = ENTITY_IDS.includes(item.id as (typeof ENTITY_IDS)[number])
      ? (pendingCountByEntity[item.id] ?? 0)
      : 0;
    const showPendingBadge = pendingCount > 0;
    const tooltipText = pendingCount > 0 ? `${item.label} (${pendingCount} pending approval)` : item.label;
    return (
      <SidebarMenuItem key={item.href}>
        <Link href={appNavHref(item.href)} passHref onClick={(e) => onNavLinkClick(e, item.href)}>
          <SidebarMenuButton isActive={isMenuItemActive(item)} tooltip={tooltipText} data-theme-nav={item.id}>
            <span className="relative flex shrink-0 items-center justify-center [&_svg]:size-5">
              <item.icon />
              {showPendingBadge && (
                <span className="absolute top-0 right-0 h-4 min-w-[1rem] translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 px-1 text-[10px] font-medium text-white flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </span>
            {isOpen && (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="truncate">{item.label}</span>
                {item.id === "reports" ? (
                  <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] leading-none">
                    Experimental
                  </Badge>
                ) : null}
              </span>
            )}
          </SidebarMenuButton>
        </Link>
      </SidebarMenuItem>
    );
  }

  function renderBottomNavRow(item: MenuItem) {
    const badgeCount = item.id === "settings" ? pendingHandovers : item.id === "messages" ? messagesBadgeCount : 0;
    const showBadge = badgeCount > 0;
    return (
      <SidebarMenuItem key={item.href}>
        <Link href={appNavHref(item.href)} passHref onClick={(e) => onNavLinkClick(e, item.href)}>
          <SidebarMenuButton isActive={isMenuItemActive(item)} tooltip={item.label} data-theme-nav={item.id}>
            <span className="relative flex shrink-0 items-center justify-center [&_svg]:size-5">
              <item.icon />
              {showBadge && (
                <span className="absolute top-0 right-0 h-4 min-w-[1rem] translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 px-0.5 text-[10px] text-white flex items-center justify-center">
                  {badgeCount}
                </span>
              )}
            </span>
            {isOpen && <span className="flex-1 truncate">{item.label}</span>}
          </SidebarMenuButton>
        </Link>
      </SidebarMenuItem>
    );
  }

  const userProfileSection = (
      <div className={cn("flex items-center gap-3", "p-2")}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.photoURL ?? undefined} alt={displayName ?? "User"} />
            <AvatarFallback>{getInitials(displayName ?? user?.email)}</AvatarFallback>
          </Avatar>
          {isOpen && (
            <div className="flex flex-col overflow-hidden">
                <p className="truncate text-sm font-medium">
                {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                {user?.email}
                </p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={handleLogout}
            aria-label="Log out"
          >
            <LogOut />
          </Button>
        </div>
  );


  return (
    <Sidebar>
      <SidebarHeader className="shrink-0">
        {/* User request: top brand card ko green tone me dikhana */}
        <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald w-full flex items-center justify-center gap-2 p-2">
          {/* Web + static desktop/APK: ek hi jagah bada icon — Electron tab strip ka chhota OS logo alag cheez hai. */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                  <img
                    src="/app-icon.png"
                    alt=""
                    className="h-full w-full object-contain"
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                  <span className="hidden h-full w-full items-center justify-center text-primary [&_svg]:size-6">
                    <Flame />
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="max-w-[200px] rounded-md border p-2 text-xs">
                Pocket Ledger
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isOpen && (
            <h1 className="font-headline min-w-0 truncate text-center text-base font-semibold leading-tight sm:text-lg">
              Pocket Ledger
            </h1>
          )}
          {!isOpen && <span className="sr-only">Pocket Ledger</span>}
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 flex-1">
        {loadingFeatures ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-0.5">
            {/* User request: Main group ko pink tone card me dikhana */}
            <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-pink w-full shrink-0 p-2">
              {isOpen ? (
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Main</p>
              ) : null}
              <SidebarMenu className="gap-0.5 py-1">{coreMenuItems.map(renderMainNavRow)}</SidebarMenu>
            </div>

            {(catalogMenuItems.length > 0 || showAdminNavLink) && (
              <div
                className={cn(
                  "pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald flex w-full min-h-0 flex-1 flex-col overflow-hidden p-2",
                  /* Sheet menu me jagah kam: sirf More block andar scroll — Main + Account sticky feel */
                  isMobile && "max-h-[min(52vh,380px)]"
                )}
              >
                {isOpen ? (
                  <p className="mb-1 shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    More
                  </p>
                ) : null}
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-x-hidden",
                    isMobile ? "overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]" : "overflow-y-auto"
                  )}
                >
                  <SidebarMenu className="gap-0.5 py-1">
                    {catalogMenuItems.map(renderMainNavRow)}
                    {showAdminNavLink && (
                      <SidebarMenuItem>
                        <Link href={appNavHref("/admin")} onClick={(e) => onNavLinkClick(e, "/admin")}>
                          <SidebarMenuButton
                            isActive={pathname.startsWith("/admin".replace(/\/$/, ""))}
                            tooltip="Admin Panel"
                            data-theme-nav="admin"
                          >
                            <Shield />
                            {isOpen && <span>Admin Panel</span>}
                          </SidebarMenuButton>
                        </Link>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </div>
              </div>
            )}

            {/* Account/profile bottom cluster: More flex hone par bhi yeh screen ke niche aligned rahein */}
            <div className="mt-auto flex flex-col gap-0.5">
              <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-amber w-full shrink-0 p-2">
                {isOpen ? (
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
                ) : null}
                <SidebarMenu className="gap-0.5 py-1">{visibleBottomMenuItems.map(renderBottomNavRow)}</SidebarMenu>
              </div>
              {/* User request: profile/user card ko green tone me dikhana */}
              <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald w-full shrink-0 overflow-hidden p-0">{userProfileSection}</div>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

    