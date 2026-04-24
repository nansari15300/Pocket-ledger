
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
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { pruneRememberedLoginEmailIfDisabled } from "@/lib/loginRememberEmail";
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
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
  // Quick access: backup save folder settings near gallery.
  { id: 'device-location', href: "/settings?view=devices&dialog=backup-location", label: "Device location", icon: FolderOpen },
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

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useLocationSearchParams();
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
  const isStaticApp = process.env.NEXT_PUBLIC_STATIC_BUILD === "1";
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
      "device-location": true,
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
  
  const isAdmin = customUser?.role === 'SuperAdmin';
  
  // Default to showing when not explicitly off (so ticked/default = show without needing save). Alerts only for company owner.
  const transactionAlerts = effectiveNotificationSettings?.transactionAlerts;
  const includeAlertsInSidebar = transactionAlerts?.on !== false && transactionAlerts?.onEntity !== false && company?.isOwned === true;
  const totalNotifications = unreadMessages + (includeAlertsInSidebar ? unreadAlerts : 0);
  const messageSettings = effectiveNotificationSettings?.message;
  const showMessageBadgeInSidebar =
    (messageSettings?.on !== false && messageSettings?.onEntity !== false) || includeAlertsInSidebar;
  const messagesBadgeCount = showMessageBadgeInSidebar ? totalNotifications : 0;
  const isMenuItemActive = useCallback(
    (item: MenuItem) => {
      // Query-based nav: keep Device location active only on Settings > devices view.
      if (item.id === "device-location") {
        return pathname.startsWith("/settings") && searchParams.get("view") === "devices";
      }
      return pathname.startsWith(item.href.replace(/\/$/, ""));
    },
    [pathname, searchParams]
  );

  const visibleMenuItems = React.useMemo(() => {
    if (!featureConfig) return allMenuItems;
    const byFeature = allMenuItems.filter((item) => featureConfig[item.id] !== false);
    return filterByPermission(byFeature, can);
  }, [featureConfig, can]);

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
  
  const userProfileSection = (
      <div className={cn("flex items-center gap-3", isMobile ? "p-4 border-t" : "mt-4")}>
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
      <SidebarHeader>
        <div className="flex items-center gap-2">
            {/* App icon: hover pe full-size preview */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="shrink-0 rounded-lg border border-black cursor-pointer">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-white bg-primary/20">
                      <img
                        src="/app-icon.png"
                        alt="Pocket Ledger"
                        className="h-full w-full scale-125 object-cover"
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
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="p-0 border overflow-hidden rounded-lg">
                  <img src="/app-icon.png" alt="Pocket Ledger" className="block w-[512px] h-[512px] object-cover rounded-lg" />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isOpen && <h1 className="font-headline text-xl font-semibold">Pocket Ledger</h1>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {loadingFeatures ? (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin"/>
            </div>
        ) : (
        <SidebarMenu>
          {visibleMenuItems.map((item) => {
            const pendingCount = ENTITY_IDS.includes(item.id as any) ? (pendingCountByEntity[item.id] ?? 0) : 0;
            const showPendingBadge = pendingCount > 0;
            const tooltipText = pendingCount > 0 ? `${item.label} (${pendingCount} pending approval)` : item.label;
            return (
            <SidebarMenuItem key={item.href}>
              <Link href={appNavHref(item.href)} passHref onClick={(e) => onNavLinkClick(e, item.href)}>
                  <SidebarMenuButton
                    isActive={isMenuItemActive(item)}
                    tooltip={tooltipText}
                    data-theme-nav={item.id}
                  >
                      <span className="relative shrink-0 flex items-center justify-center [&_svg]:size-5">
                        <item.icon />
                        {showPendingBadge && (
                          <span className="absolute top-0 right-0 h-4 min-w-[1rem] px-1 flex items-center justify-center rounded-full bg-pink-500 text-white text-[10px] font-medium translate-x-1/2 -translate-y-1/2">
                            {pendingCount}
                          </span>
                        )}
                      </span>
                      {isOpen && <span className="flex-1 truncate">{item.label}</span>}
                  </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          );
          })}
          {isAdmin && (
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

          {/* Moved from footer for mobile */}
           {isMobile && (
            <>
                <div className="my-4 border-t border-border -mx-2"></div>
                {visibleBottomMenuItems.map((item) => {
                    const badgeCount = item.id === 'settings' ? pendingHandovers : (item.id === 'messages' ? messagesBadgeCount : 0);
                    const showBadge = badgeCount > 0;
                    return (
                        <SidebarMenuItem key={item.href}>
                            <Link href={appNavHref(item.href)} passHref onClick={(e) => onNavLinkClick(e, item.href)}>
                                <SidebarMenuButton
                                    isActive={isMenuItemActive(item)}
                                    tooltip={item.label}
                                    data-theme-nav={item.id}
                                >
                                    <span className="relative shrink-0 flex items-center justify-center [&_svg]:size-5">
                                      <item.icon />
                                      {showBadge && (
                                        <span className="absolute top-0 right-0 h-4 min-w-[1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] translate-x-1/2 -translate-y-1/2 px-0.5">{badgeCount}</span>
                                      )}
                                    </span>
                                    {isOpen && <span className="flex-1 truncate">{item.label}</span>}
                                </SidebarMenuButton>
                            </Link>
                        </SidebarMenuItem>
                    )
                })}
             </>
           )}

        </SidebarMenu>
        )}
      </SidebarContent>

      {/* Footer is now conditional */}
      {!isMobile && (
        <SidebarFooter>
            <SidebarMenu>
                {visibleBottomMenuItems.map((item) => {
                    const badgeCount = item.id === 'settings' ? pendingHandovers : (item.id === 'messages' ? messagesBadgeCount : 0);
                    const showBadge = badgeCount > 0;

                    return (
                        <SidebarMenuItem key={item.href}>
                            <Link href={appNavHref(item.href)} onClick={(e) => onNavLinkClick(e, item.href)}>
                                <SidebarMenuButton
                                    isActive={isMenuItemActive(item)}
                                    tooltip={item.label}
                                    data-theme-nav={item.id}
                                >
                                    <span className="relative shrink-0 flex items-center justify-center [&_svg]:size-5">
                                      <item.icon />
                                      {showBadge && (
                                        <span className="absolute top-0 right-0 h-4 min-w-[1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] translate-x-1/2 -translate-y-1/2 px-0.5">{badgeCount}</span>
                                      )}
                                    </span>
                                    {isOpen && <span className="flex-1 truncate">{item.label}</span>}
                                </SidebarMenuButton>
                            </Link>
                        </SidebarMenuItem>
                    )
                })}
            </SidebarMenu>
            {userProfileSection}
        </SidebarFooter>
      )}

      {/* User Profile for mobile is inside content */}
      {isMobile && userProfileSection}

    </Sidebar>
  );
}

    