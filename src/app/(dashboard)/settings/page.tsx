
"use client";

import { Suspense, useState, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Share2, Loader2, Hash, Eye, Palette, FileDigit, Zap, Building, ShieldAlert, Bell, Smartphone, ChevronLeft, PanelRight } from "lucide-react";
import { ManageShare } from "@/components/company/ManageShare";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { VoucherSettings } from "@/components/settings/VoucherSettings";
import { ThemeSettings } from "@/components/settings/ThemeSettings";
import { AnimationSettings } from "@/components/settings/AnimationSettings";
import { HandoverManager } from "@/components/settings/HandoverManager";
import { CompanySettings } from "@/components/settings/CompanySettings";
import { DangerZone } from "@/components/settings/DangerZone";
import { CurrencySettings } from "@/components/settings/CurrencySettings";
import { DisplaySettings } from "@/components/settings/DisplaySettings";
import { IdSettings } from "@/components/settings/IdSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { ManageDevices } from "@/components/settings/ManageDevices";
import { usePageMemory } from "@/hooks/usePageMemory";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSettingsList } from "@/contexts/SettingsListContext";
import { useEdgeSwipeTrigger } from "@/hooks/useMobileEdgeSwipe";

const settingsNavItems = [
    { id: "company", title: "Company Profile", icon: Building, permission: "configure_company_settings" as const, href: null },
    { id: "sharing", title: "Manage Sharing", icon: Share2, permission: "manage_users_roles" as const, href: null },
    { id: "devices", title: "Synced devices", icon: Smartphone, permission: "configure_company_settings" as const, href: null },
    { id: "voucher", title: "Voucher Settings", icon: FileDigit, permission: "configure_company_settings" as const, href: null },
    { id: "theme", title: "Theme Settings", icon: Palette, permission: "configure_company_settings" as const, href: null },
    { id: "animation", title: "Animation Settings", icon: Zap, permission: "configure_company_settings" as const, href: null },
    { id: "id_settings", title: "ID Settings", icon: Fingerprint, permission: "configure_company_settings" as const, href: null },
    { id: "decimals", title: "Decimal Settings", icon: Hash, permission: "configure_company_settings" as const, href: null },
    { id: "display", title: "Display Settings", icon: Eye, permission: "configure_company_settings" as const, href: null },
    { id: "notification", title: "Notification", icon: Bell, permission: "configure_company_settings" as const, href: null },
    { id: "danger-zone", title: "Danger Zone", icon: ShieldAlert, permission: "configure_company_settings" as const, href: null, isDanger: true },
];

const SETTINGS_STORAGE_KEY = "settingsPageState";

/** Narrow viewport: isMobile hook se pehle bhi URL push na ho + list-first UX */
function useLayoutNarrow767(): boolean {
    const [narrow, setNarrow] = useState(() =>
        typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)");
        const fn = () => setNarrow(mq.matches);
        mq.addEventListener("change", fn);
        return () => mq.removeEventListener("change", fn);
    }, []);
    return narrow;
}

function SettingsPageContent() {
    const { can } = usePermissions();
    const { user, loading: authLoading } = useAuth();
    const { company, companyId, loading: companiesLoading } = useCompany();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const layoutNarrow = useLayoutNarrow767();
    /** Mobile-style settings: sidebar Sheet + list pehle — forced mobile ya chhoti width */
    const mobileSettingsUx = isMobile || layoutNarrow;
    const { settingsListOpen, setSettingsListOpen } = useSettingsList();

    const viewFromUrl = searchParams.get("view");

    const [activeView, setActiveView] = useState<string>("company");

    const availableNavItems = useMemo(() => settingsNavItems.filter(item => can(item.permission)), [can]);

    // URL ↔ state: paint se pehle sync — mobile par bina ?view= list-only (company detail flash na ho)
    useLayoutEffect(() => {
        if (viewFromUrl && availableNavItems.some((item) => item.id === viewFromUrl)) {
            setActiveView(viewFromUrl);
            return;
        }
        if (mobileSettingsUx && !viewFromUrl) {
            setActiveView("");
            return;
        }
        if (!mobileSettingsUx && !viewFromUrl) {
            setActiveView((prev) => (prev === "" ? "company" : prev));
        }
    }, [viewFromUrl, availableNavItems, mobileSettingsUx]);

    const setActiveViewWithUrl = useCallback(
        (id: string) => {
            setActiveView(id);
            const next = `${pathname}?view=${encodeURIComponent(id)}`;
            if (searchParams.get("view") !== id) {
                router.replace(next, { scroll: false });
            }
        },
        [pathname, router, searchParams]
    );

    const backToSettingsListOnly = useCallback(() => {
        setActiveView("");
        setSettingsListOpen(false);
        router.replace(pathname, { scroll: false });
    }, [pathname, router, setSettingsListOpen]);

    // Desktop: URL me default ?view= taaki share/refresh — mobile par mat inject karo (sirf list)
    useEffect(() => {
        if (mobileSettingsUx) return;
        const viewParam = searchParams.get("view");
        if (!viewParam && activeView && availableNavItems.some((item) => item.id === activeView)) {
            router.replace(`${pathname}?view=${encodeURIComponent(activeView)}`, { scroll: false });
        }
    }, [mobileSettingsUx, activeView, pathname, searchParams, router, availableNavItems]);

    const selectedSetting = useMemo(() => {
        return availableNavItems.find(item => item.id === activeView) || null;
    }, [activeView, availableNavItems]);

    usePageMemory(
        SETTINGS_STORAGE_KEY,
        activeView,
        setActiveView,
        selectedSetting,
        (item) => {
            if (item) setActiveViewWithUrl(item.id);
        },
        availableNavItems,
        false,
        mobileSettingsUx,
        viewFromUrl
    );

    const openSettingsListSheet = useCallback(() => setSettingsListOpen(true), [setSettingsListOpen]);
    // Daen kinara se swipe LEFT → sirf settings list (baen kinara + swipe RIGHT sirf app sidebar — dono alag)
    const settingsListSwipe = useEdgeSwipeTrigger(
        mobileSettingsUx && Boolean(activeView),
        "right",
        openSettingsListSheet
    );

    const renderNavButtons = (onPick?: () => void) => (
        <div className="flex flex-col gap-1 p-2">
            {availableNavItems.map((item) => (
                <Button
                    key={item.id}
                    variant={activeView === item.id ? "secondary" : "ghost"}
                    className={cn(
                        "justify-start gap-3 w-full px-4",
                        activeView === item.id && "bg-secondary font-medium",
                        item.isDanger && "text-destructive hover:bg-destructive/10 hover:text-destructive"
                    )}
                    onClick={() => {
                        setActiveViewWithUrl(item.id);
                        onPick?.();
                    }}
                >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.title}</span>
                </Button>
            ))}
        </div>
    );

    if (companyId && !company) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center p-4">
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                    Loading company…
                </p>
            </div>
        );
    }

    const renderActiveView = () => {
        switch (activeView) {
            case "company":
                return can('configure_company_settings') ? <CompanySettings /> : null;
            case "sharing":
                return can('manage_users_roles') ? (
                    <PermissionRouteGuard permission="manage_users_roles">
                        <ManageShare />
                    </PermissionRouteGuard>
                ) : null;
            case "devices":
                return can('configure_company_settings') ? <ManageDevices /> : null;
            case "voucher":
                return can('configure_company_settings') ? <VoucherSettings /> : null;
            case "theme":
                return can('configure_company_settings') ? <ThemeSettings /> : null;
            case "animation":
                return can('configure_company_settings') ? <AnimationSettings /> : null;
            case "id_settings":
                return can('configure_company_settings') ? <IdSettings /> : null;
            case "decimals":
                 return can('configure_company_settings') ? <CurrencySettings /> : null;
            case "display":
                 return can('configure_company_settings') ? <DisplaySettings /> : null;
            case "notification":
                return can('configure_company_settings') ? <NotificationSettings /> : null;
            case "danger-zone":
                return can('configure_company_settings') ? <DangerZone /> : null;
            default:
                return null;
        }
    };

    if (availableNavItems.length === 0) {
      let storedCompanyIdPending = false;
      try {
        const s = typeof window !== "undefined" ? localStorage.getItem("companyId")?.trim() : "";
        storedCompanyIdPending = Boolean(s && !companyId && user);
      } catch {
        /* ignore */
      }
      const resolvingCompany =
        authLoading ||
        companiesLoading ||
        (Boolean(companyId) && !company) ||
        storedCompanyIdPending;
      return (
        <div className="p-8 text-center">
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
              <CardTitle>
                {resolvingCompany ? "Loading…" : company ? "Permission Denied" : "Select a Company"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {resolvingCompany ? (
                <p className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Loading company and permissions…
                </p>
              ) : company ? (
                <p>You do not have permission to access any settings. Please contact your company owner or an administrator.</p>
              ) : (
                <>
                  <p>Please select a company from the header dropdown to manage settings.</p>
                  <Button variant="outline" onClick={() => router.push("/company")}>
                    Go to Company
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )
    }

    // Mobile / narrow: pehle sirf list; item → detail full + Sheet se list
    if (mobileSettingsUx) {
        if (!activeView) {
            return (
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                    <div className="flex-shrink-0 border-b px-4 py-3">
                        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                        <p className="text-sm text-muted-foreground">Manage your app preferences.</p>
                    </div>
                    <ScrollArea className="flex-1 min-h-0">
                        {renderNavButtons()}
                    </ScrollArea>
                </div>
            );
        }

        return (
            <>
                <div
                    className={cn("h-full flex flex-col overflow-hidden min-h-0 touch-pan-y")}
                    onTouchStart={settingsListSwipe.onTouchStart}
                    onTouchEnd={settingsListSwipe.onTouchEnd}
                >
                    <div className="flex-shrink-0 border-b px-2 py-2 flex items-center gap-2 min-h-[48px]">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={backToSettingsListOnly}
                            title="Back to settings list"
                            aria-label="Back to settings list"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <span className="font-medium truncate flex-1 min-w-0">
                            {selectedSetting?.title ?? "Settings"}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 h-9 w-9"
                            onClick={() => setSettingsListOpen(true)}
                            title="Open settings list"
                            aria-label="Open settings list"
                        >
                            <PanelRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {renderActiveView()}
                    </div>
                </div>
                <Sheet open={settingsListOpen} onOpenChange={setSettingsListOpen}>
                    <SheetContent side="right" className="w-[min(100vw-3rem,280px)] p-0 sm:max-w-[280px]">
                        <SheetHeader className="p-4 pb-2 border-b">
                            <SheetTitle>Settings</SheetTitle>
                        </SheetHeader>
                        <ScrollArea className="h-[calc(100dvh-5rem)]">
                            {renderNavButtons(() => setSettingsListOpen(false))}
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </>
        );
    }

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 p-4 sm:p-6 md:p-8 flex-1 min-h-0 overflow-hidden">
          
          <aside className="flex flex-col min-h-0 overflow-hidden md:w-[280px] md:shrink-0 md:border-r md:border-border -mt-4 sm:-mt-6 md:-mt-8">
              <div className="flex flex-col min-h-0 h-full pt-4 sm:pt-6 md:pt-8">
                  <div className="pb-4 flex-shrink-0 px-4">
                      <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                      <p className="text-sm text-muted-foreground">Manage your app preferences.</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-0">
                    <div className="flex flex-col gap-1">
                        {availableNavItems.map((item) => (
                         <Button
                            key={item.id}
                            variant={activeView === item.id ? "secondary" : "ghost"}
                            className={cn(
                                "justify-start gap-3 w-full px-4",
                                activeView === item.id && "bg-secondary font-medium",
                                item.isDanger && "text-destructive hover:bg-destructive/10 hover:text-destructive"
                            )}
                            onClick={() => setActiveViewWithUrl(item.id)}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span>{item.title}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
              </div>
          </aside>
  
          <main className="min-h-0 w-full flex flex-col overflow-hidden min-w-0 -mt-4 sm:-mt-6 md:-mt-8 pt-4 sm:pt-6 md:pt-8">
              <div className="flex-1 min-h-0 overflow-y-auto">
                  {renderActiveView()}
              </div>
          </main>
  
        </div>
      </div>
  );
}

function SettingsPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading settings...</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageLoading />}>
      <SettingsPageContent />
    </Suspense>
  );
}
