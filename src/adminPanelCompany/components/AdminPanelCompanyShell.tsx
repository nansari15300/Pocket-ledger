"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  DollarSign,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_PANEL_COMPANY_NAME } from "@/lib/adminPanelCompany/constants";
import {
  ADMIN_PANEL_COMPANY_ROUTES,
  adminPanelCompanyRouteLabel,
} from "@/lib/adminPanelCompany/routeTitles";
import { publicAssetUrl } from "@/lib/webAppBasePath";
import { AdminPanelHeaderQuickActions } from "@/adminPanelCompany/components/AdminPanelHeaderQuickActions";
import {
  AdminPanelAddVoucherDialog,
  type AdminPanelVoucherTab,
} from "@/adminPanelCompany/components/forms/AdminPanelAddVoucherDialog";
import { AdminPanelCreatePartyDialog } from "@/adminPanelCompany/components/forms/AdminPanelCreatePartyDialog";
import { AdminPanelCreateBankDialog } from "@/adminPanelCompany/components/forms/AdminPanelCreateBankDialog";
import { AdminPanelCreateStaffDialog } from "@/adminPanelCompany/components/forms/AdminPanelCreateStaffDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ADMIN_PANEL_COMPANY_QUICK_ACTION_EVENT,
  type AdminPanelQuickAction,
  dispatchAdminPanelEntityChanged,
} from "@/lib/adminPanelCompany/events";

const NAV_ICONS = {
  Dashboard: LayoutDashboard,
  Subscribers: Users,
  Vouchers: ReceiptText,
  "Bank/Cash": Landmark,
  Staff: Briefcase,
  Tax: DollarSign,
  "Income & Expense": DollarSign,
  Reports: BarChart3,
} as const;

/**
 * Isolated shell styled like the normal AppSidebar + AppHeader chrome.
 * No useCompany / useVouchers / normal ledger imports.
 */
export function AdminPanelCompanyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, isMobile, setIsOpen } = useSidebar();
  const isViewportMobile = useIsMobile();
  const pageTitle = adminPanelCompanyRouteLabel(pathname);

  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherTab, setVoucherTab] = useState<AdminPanelVoucherTab>("sale");
  const [partyOpen, setPartyOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const refreshSection = (href: string, kind: string) => {
    dispatchAdminPanelEntityChanged(kind);
    if (pathname === href) router.refresh();
    else router.push(href);
  };

  const onQuickAction = (action: AdminPanelQuickAction) => {
    if (action.kind === "voucher") {
      setVoucherTab(action.tab);
      setVoucherOpen(true);
      return;
    }
    if (action.kind === "party") {
      setPartyOpen(true);
      return;
    }
    if (action.kind === "bank") {
      setBankOpen(true);
      return;
    }
    setStaffOpen(true);
  };

  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<AdminPanelQuickAction>).detail;
      if (!detail) return;
      if (detail.kind === "voucher") {
        setVoucherTab(detail.tab);
        setVoucherOpen(true);
        return;
      }
      if (detail.kind === "party") {
        setPartyOpen(true);
        return;
      }
      if (detail.kind === "bank") {
        setBankOpen(true);
        return;
      }
      setStaffOpen(true);
    };
    window.addEventListener(ADMIN_PANEL_COMPANY_QUICK_ACTION_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(ADMIN_PANEL_COMPANY_QUICK_ACTION_EVENT, onEvent as EventListener);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <Sidebar className="border-r">
          <SidebarHeader className="shrink-0">
            <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald w-full flex items-center justify-start gap-2 py-2 pl-0 pr-2">
              <Image
                src={publicAssetUrl("/app-icon.png")}
                alt="Pocket Ledger"
                width={36}
                height={36}
                className="h-9 w-9 rounded-md"
              />
              {isOpen ? (
                <div className="min-w-0 flex-1">
                  <span className="font-headline block w-full truncate text-left text-base font-semibold sm:text-lg">
                    Pocket Ledger
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">Admin Panel Company</span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <div className="p-2">
              <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald w-full shrink-0 p-2">
                <SidebarMenu>
                  {ADMIN_PANEL_COMPANY_ROUTES.map((route) => {
                    const Icon = NAV_ICONS[route.label as keyof typeof NAV_ICONS] ?? LayoutDashboard;
                    const active = pathname === route.href;
                    return (
                      <SidebarMenuItem key={route.href}>
                        <Link
                          href={route.href}
                          onClick={() => {
                            if (isMobile) setIsOpen(false);
                          }}
                        >
                          <SidebarMenuButton isActive={active} tooltip={route.label}>
                            <Icon className="h-5 w-5" />
                            {isOpen ? <span>{route.label}</span> : null}
                          </SidebarMenuButton>
                        </Link>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            </div>
          </SidebarContent>

          <SidebarFooter className="gap-2">
            <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-sky w-full shrink-0 p-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled
                title="Company settings coming next"
              >
                <Settings2 className={cn(isOpen && "mr-2", "h-4 w-4")} />
                {isOpen ? <span>Company settings</span> : null}
              </Button>
            </div>
            <div className="pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-amber w-full shrink-0 p-2">
              <Link href="/admin" onClick={() => { if (isMobile) setIsOpen(false); }}>
                <Button variant="outline" className="w-full">
                  <ArrowLeft className={cn(isOpen && "mr-2", "h-4 w-4")} />
                  {isOpen ? <span>Back to Admin Panel</span> : null}
                </Button>
              </Link>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="relative sticky top-0 z-30 border-b border-sidebar-border bg-appChrome px-2 py-2">
            <div
              className={cn(
                "pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald w-full min-w-0 py-1 px-2",
                isViewportMobile && "overflow-x-auto"
              )}
            >
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <SidebarTrigger className="touch-manipulation" />
                  <div className="min-w-0 max-w-[14rem] sm:max-w-[18rem]">
                    <p className="truncate text-sm font-semibold leading-none">{ADMIN_PANEL_COMPANY_NAME}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{pageTitle}</p>
                  </div>
                </div>

                {!isViewportMobile ? <AdminPanelHeaderQuickActions onAction={onQuickAction} /> : null}
              </div>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      <AdminPanelAddVoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        defaultTab={voucherTab}
        onCreated={() => refreshSection("/admin/company/vouchers", "vouchers")}
      />
      <AdminPanelCreatePartyDialog
        open={partyOpen}
        onOpenChange={setPartyOpen}
        onCreated={() => refreshSection("/admin/company/parties", "parties")}
      />
      <AdminPanelCreateBankDialog
        open={bankOpen}
        onOpenChange={setBankOpen}
        onCreated={() => refreshSection("/admin/company/bank_accounts", "bank_accounts")}
      />
      <AdminPanelCreateStaffDialog
        open={staffOpen}
        onOpenChange={setStaffOpen}
        onCreated={() => refreshSection("/admin/company/staff", "staff")}
      />
    </div>
  );
}
