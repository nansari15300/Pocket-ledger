
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
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
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
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { firestore, auth } from "@/lib/firebase";
import type { Permission } from "@/lib/permissions";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { CompanyActions } from "@/components/company/CompanySelector";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { Badge } from "../ui/badge";


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

export function AppSidebar() {
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const { can } = usePermissions();
  const { company } = useCompany();
  const { vouchers, processedStaff, processedTaxes, processedExpenseAccounts } = useVouchers();
  const { isOpen, isMobile, setIsOpen } = useSidebar();
  const [featureConfig, setFeatureConfig] = useState<Record<string, boolean> | null>(null);
  const [loadingFeatures, setLoadingFeatures] = useState(true);
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
    company?.notificationSettings?.approve?.on !== false &&
    company?.notificationSettings?.approve?.onEntity !== false;

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
      const hasParty = !!v.partyId;
      const hasBankCash = !!(v.fromAccountId || v.toAccountId || v.accountId);
      const isAddSalaryVoucher =
        (v.type === "journal" && v.subType === "add_salary") || v.type === "add_salary";
      const hasStaff =
        !!v.staffId ||
        (isAddSalaryVoucher &&
          Array.isArray(v.entries) &&
          v.entries.some((e: any) => {
            const accountId = e?.accountId;
            if (!accountId || !staffIdSet.has(accountId)) return false;
            if (Number(e?.credit || 0) <= 0) return false;
            return !String(e?.narration || "").includes("(Staff ID:");
          }));
      const hasTax =
        !!v.taxAccountId ||
        (Array.isArray(v.lineItems) && v.lineItems.some((l: any) => l.taxAccountId)) ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => e.accountId && taxIdSet.has(e.accountId)));
      const hasItems =
        Array.isArray(v.lineItems) && v.lineItems.some((l: any) => l.itemId);
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
  }, [vouchers, processedStaff, processedTaxes, processedExpenseAccounts, showApproveInSidebar]);

  useEffect(() => {
    setLoadingFeatures(true);
    const unsub = onSnapshot(doc(firestore, "app_settings", "features"), (docSnap) => {
      if (docSnap.exists()) {
        setFeatureConfig(docSnap.data());
      } else {
        // If no config, enable all by default
        const defaultConfig: Record<string, boolean> = {};
        ALL_FEATURES.forEach(f => defaultConfig[f.id] = true);
        setFeatureConfig(defaultConfig);
      }
      setLoadingFeatures(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email || !user?.uid) return;

    // Handover notifications
    const handoverQuery = query(
      collection(firestore, "companies"),
      where("handoverTo", "==", user.email),
      where("handoverStatus", "==", "pending")
    );
    const unsubHandovers = onSnapshot(handoverQuery, (snapshot) => setPendingHandovers(snapshot.size));

    // Admin/Alarm notifications
    const unreadAlertsByRecipient: Record<string, Set<string>> = {};
    const alertsUnsubscribers: (() => void)[] = [];
    const recomputeUnreadAlerts = () => {
      const merged = new Set<string>();
      Object.values(unreadAlertsByRecipient).forEach((set) => set.forEach((id) => merged.add(id)));
      setUnreadAlerts(merged.size);
    };
    myUserIds.forEach((id) => {
      const alertsQuery = query(
        collection(firestore, "admin_notifications"),
        where("recipientUserId", "==", id),
        where("isRead", "==", false)
      );
      const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
        unreadAlertsByRecipient[id] = new Set(snapshot.docs.map((d) => d.id));
        recomputeUnreadAlerts();
      });
      alertsUnsubscribers.push(unsubAlerts);
    });

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
  }, [user?.email, user?.uid, myUserIds]);
  
  const displayName = user?.displayName || user?.email?.split('@')[0] || "User";

  const handleLogout = async () => {
    const { clearNavigationMemory } = await import("@/lib/navigation-memory");
    clearNavigationMemory();
    await signOut(auth);
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
  const transactionAlerts = company?.notificationSettings?.transactionAlerts;
  const includeAlertsInSidebar = transactionAlerts?.on !== false && transactionAlerts?.onEntity !== false && company?.isOwned === true;
  const totalNotifications = unreadMessages + (includeAlertsInSidebar ? unreadAlerts : 0);
  const messageSettings = company?.notificationSettings?.message;
  const showMessageBadgeInSidebar =
    (messageSettings?.on !== false && messageSettings?.onEntity !== false) || includeAlertsInSidebar;
  const messagesBadgeCount = showMessageBadgeInSidebar ? totalNotifications : 0;

  const visibleMenuItems = React.useMemo(() => {
    if (!featureConfig) return allMenuItems;
    const byFeature = allMenuItems.filter((item) => featureConfig[item.id] !== false);
    return filterByPermission(byFeature, can);
  }, [featureConfig, can]);

  const visibleBottomMenuItems = React.useMemo(() => {
    if (!featureConfig) return bottomMenuItems;
    const byFeature = bottomMenuItems.filter((item) => {
      if (item.id === "distributor-signup" && customUser?.role === "Distributor") {
        return false;
      }
      return featureConfig[item.id] !== false;
    });
    return filterByPermission(byFeature, can);
  }, [featureConfig, customUser, can]);
  
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <Flame className="h-6 w-6 text-primary" />
            </div>
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
              <Link href={item.href} passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    tooltip={tooltipText}
                    onClick={(e) => {
                      if (isMobile) {
                        e.preventDefault(); 
                        setTimeout(() => {
                            setIsOpen(false);
                            window.location.href = item.href;
                        }, 50);
                      }
                    }}
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
                 <Link href="/admin">
                    <SidebarMenuButton
                        isActive={pathname.startsWith("/admin")}
                        tooltip="Admin Panel"
                        onClick={() => { if (isMobile) setIsOpen(false); }}
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
                            <Link href={item.href} passHref>
                                <SidebarMenuButton
                                    isActive={pathname.startsWith(item.href)}
                                    tooltip={item.label}
                                    onClick={(e) => {
                                        if (isMobile) {
                                          e.preventDefault();
                                          setTimeout(() => {
                                            setIsOpen(false);
                                            window.location.href = item.href;
                                          }, 50);
                                        }
                                    }}
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
                            <Link href={item.href}>
                                <SidebarMenuButton
                                    isActive={pathname.startsWith(item.href)}
                                    tooltip={item.label}
                                    onClick={() => { if (isMobile) setIsOpen(false); }}
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

    