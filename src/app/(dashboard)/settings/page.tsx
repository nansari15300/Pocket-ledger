
"use client";

import { Suspense, useState, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Share2, Loader2, Hash, Eye, Palette, FileDigit, Zap, Building, ShieldAlert, Bell, Smartphone, ChevronLeft, PanelRight, CalendarRange } from "lucide-react";
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
import { FiscalSplitSettings } from "@/components/settings/FiscalSplitSettings";
import { ManageDevices } from "@/components/settings/ManageDevices";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSettingsList } from "@/contexts/SettingsListContext";
import { useEdgeSwipeTrigger } from "@/hooks/useMobileEdgeSwipe";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";

/** Poora settings list panel — parties master list jaisa rounded + visible stroke (`PartyList` / `AccountList`). */
const SETTINGS_LIST_SHELL =
  "rounded-lg border-[1.5px] border-gray-300 bg-background overflow-hidden dark:border-gray-600";
/** Header ↔ items split — row dividers ke saath same weight. */
const SETTINGS_LIST_HEADER_RULE =
  "border-b-[1.5px] border-gray-300 dark:border-gray-600";

/**
 * Ek nav row — `PartyList.tsx` `cardClassName` ke saath align (selected = primary border + secondary fill).
 * Native `button` taake ghost/outline variant se border fight na ho.
 */
function settingsNavRowClass(isActive: boolean, isDanger?: boolean) {
  return cn(
    "min-w-0 max-w-full w-full overflow-hidden py-2 px-3 cursor-pointer border rounded-md transition-all duration-200",
    "flex items-center gap-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive
      ? "border-primary bg-secondary shadow-sm font-medium"
      : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30",
    isDanger && !isActive && "text-destructive hover:text-destructive",
    isDanger && isActive && "text-destructive border-destructive/60"
  );
}

const settingsNavItems = [
    { id: "company", title: "Company Profile", icon: Building, permission: "configure_company_settings" as const, href: null },
    { id: "sharing", title: "Manage Sharing", icon: Share2, permission: "manage_users_roles" as const, href: null },
    // Device sync settings (synced devices management).
    { id: "devices", title: "Device sync", icon: Smartphone, permission: "configure_company_settings" as const, href: null },
    { id: "voucher", title: "Voucher Settings", icon: FileDigit, permission: "configure_company_settings" as const, href: null },
    { id: "theme", title: "Theme Settings", icon: Palette, permission: "configure_company_settings" as const, href: null },
    { id: "animation", title: "Animation Settings", icon: Zap, permission: "configure_company_settings" as const, href: null },
    { id: "id_settings", title: "ID Settings", icon: Fingerprint, permission: "configure_company_settings" as const, href: null },
    { id: "decimals", title: "Decimal Settings", icon: Hash, permission: "configure_company_settings" as const, href: null },
    { id: "display", title: "Display Settings", icon: Eye, permission: "configure_company_settings" as const, href: null },
    { id: "fiscal_split", title: "Fiscal year & split", icon: CalendarRange, permission: "configure_company_settings" as const, href: null },
    { id: "notification", title: "Notification", icon: Bell, permission: "configure_company_settings" as const, href: null },
    { id: "danger-zone", title: "Danger Zone", icon: ShieldAlert, permission: "configure_company_settings" as const, href: null, isDanger: true },
];

const SETTINGS_TAB_SESSION_KEY = "pl_settings_active_tab";

/** Purana LS key — usePageMemory hata kar hataya; NAVIGATION_MEMORY_KEYS me abhi naam reh sakta hai */
const LEGACY_SETTINGS_LS_KEY = "settingsPageState";

/** Tab memory company-scoped taake switch par galat voucher/sharing restore na ho; key company ke bina sirf transient */
function settingsTabSessionStorageKey(companyIdForTab: string | null): string {
    return companyIdForTab ? `${SETTINGS_TAB_SESSION_KEY}::${companyIdForTab}` : `${SETTINGS_TAB_SESSION_KEY}::pending`;
}

/** Session se tab: pehle nayi key, phir purani global (migrate) — stale sharing overwrite kam */
function readPersistedSettingsTab(companyIdForTab: string | null): string | null {
    try {
        if (typeof sessionStorage === "undefined") return null;
        const k = settingsTabSessionStorageKey(companyIdForTab);
        let v = sessionStorage.getItem(k);
        // Purani single-key entries (pre company-scope) ek daf’a fallback — phir migrate write se nayi key par shift
        if (!v) v = sessionStorage.getItem(SETTINGS_TAB_SESSION_KEY);
        return v;
    } catch {
        return null;
    }
}

/**
 * APK/static: Next router.replace kabhi turant browser address bar sync nahi karta; refresh par ?view gum ho sakta hai.
 * replaceState se current pathname + query lock karo (trailing slash wala path preserve).
 */
function syncSettingsViewQueryToBrowser(viewId: string) {
    if (process.env.NEXT_PUBLIC_STATIC_BUILD !== "1" || typeof window === "undefined") return;
    try {
        const u = new URL(window.location.href);
        u.searchParams.set("view", viewId);
        window.history.replaceState(window.history.state ?? null, "", u.pathname + u.search + u.hash);
    } catch {
        /* ignore */
    }
}

/** Narrow viewport — must match SSR (false) on first client paint or hydration breaks (grid+aside vs mobile chrome). */
function useLayoutNarrow767(): boolean {
    const [narrow, setNarrow] = useState(false);
    useLayoutEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)");
        const fn = () => setNarrow(mq.matches);
        fn();
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
    /** Mobile-style settings: `use-mobile` + narrow (APK ab bhi width se isMobile — Chrome jaisa) */
    const mobileSettingsUx = isMobile || layoutNarrow;
    const { settingsListOpen, setSettingsListOpen } = useSettingsList();

    const [activeView, setActiveView] = useState<string>("");

    const canConfigureCompany = can("configure_company_settings");
    /** Owner ne company settings band kiya ho — shared user ko theme/animation phir bhi (local-only). */
    const sharedLocalAppearanceOnly = Boolean(
        companyId && company && company.isOwned === false && !canConfigureCompany
    );
    const availableNavItems = useMemo(() => {
        const allowed = settingsNavItems.filter((item) => can(item.permission));
        if (!sharedLocalAppearanceOnly) return allowed;
        const extra = settingsNavItems.filter(
            (item) =>
                (item.id === "theme" || item.id === "animation") && !allowed.some((a) => a.id === item.id)
        );
        return [...allowed, ...extra];
    }, [can, sharedLocalAppearanceOnly]);
    const canOpenThemeOrAnimation = canConfigureCompany || sharedLocalAppearanceOnly;

    /** Ek daf'a purani `settingsPageState` LS hata — usePageMemory ab settings me nahi — stale "sharing" override band */
    useEffect(() => {
        try {
            localStorage.removeItem(LEGACY_SETTINGS_LS_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    /** Valid tab ko company-scoped sessionStorage me rakho — company load se pehle galat nav list se overwrite na ho */
    useEffect(() => {
        if (!activeView || !availableNavItems.some((i) => i.id === activeView)) return;
        try {
            const k = settingsTabSessionStorageKey(companyId);
            sessionStorage.setItem(k, activeView);
            // Purani global key hata do taake fallback sharing purane session se na aaye (company-scoped source of truth)
            if (k !== SETTINGS_TAB_SESSION_KEY) sessionStorage.removeItem(SETTINGS_TAB_SESSION_KEY);
        } catch {
            /* ignore */
        }
    }, [activeView, availableNavItems, companyId]);

    // Paint se pehle: ?view= (React + window) → valid tab; phir session fallback; invalidate URL mat rakho Manage Sharing tak
    useLayoutEffect(() => {
        if (availableNavItems.length === 0) return;
        /** company hydrate se pehle `usePermissions` me role galat ho sakta hai → nav sirf sharing; voucher session wipe + refresh par Sharing sticky — isliye stall */
        if (companyId && !company) return;

        const fromReact = searchParams.get("view");
        const fromWindow =
            typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
        const rawView = fromReact ?? fromWindow;
        const viewOk =
            rawView != null && rawView !== "" && availableNavItems.some((item) => item.id === rawView)
                ? rawView
                : null;

        if (viewOk) {
            setActiveView(viewOk);
            syncSettingsViewQueryToBrowser(viewOk);
            if (!fromReact && fromWindow && !mobileSettingsUx) {
                router.replace(`${pathname}?view=${encodeURIComponent(fromWindow)}`, { scroll: false });
            }
            return;
        }

        /* Mobile narrow: khali rawView ⇒ list-first; ghair-valid ?view ⇒ bhi list */
        if (mobileSettingsUx && !rawView) {
            setActiveView("");
            return;
        }
        if (mobileSettingsUx && rawView && !viewOk) {
            setActiveView("");
            router.replace(pathname, { scroll: false });
            return;
        }

        if (!mobileSettingsUx) {
            const persisted = readPersistedSettingsTab(companyId);
            if (persisted && availableNavItems.some((i) => i.id === persisted)) {
                setActiveView(persisted);
                router.replace(`${pathname}?view=${encodeURIComponent(persisted)}`, { scroll: false });
                syncSettingsViewQueryToBrowser(persisted);
                return;
            }

            /* Ghair-valid ?view= hata kar pehla allowed tab — sharing pe sticky na rah jaye */
            if (rawView && !viewOk) {
                const firstId = availableNavItems[0]?.id ?? "company";
                setActiveView(firstId);
                router.replace(`${pathname}?view=${encodeURIComponent(firstId)}`, { scroll: false });
                syncSettingsViewQueryToBrowser(firstId);
                return;
            }

            const first = availableNavItems[0]?.id ?? "company";
            setActiveView((prev) => (prev === "" ? first : prev));
        }
    }, [searchParams, availableNavItems, mobileSettingsUx, pathname, router, companyId, company]);

    // Shared user: URL / memory me `company` ho sakta hai jab wo ab nav me nahi — pehli allowed tab par le aao.
    useEffect(() => {
        if (companyId && !company) return;
        if (availableNavItems.length === 0) return;
        /** Mobile list-first: khali activeView valid — yahan first tab mat thopo */
        if (mobileSettingsUx && activeView === "") return;
        /** Layout init abhi nahi hua / wait */
        if (!activeView) return;
        if (availableNavItems.some((i) => i.id === activeView)) return;
        const next = availableNavItems[0].id;
        setActiveView(next);
        if (!mobileSettingsUx) {
            router.replace(`${pathname}?view=${encodeURIComponent(next)}`, { scroll: false });
            syncSettingsViewQueryToBrowser(next);
        }
    }, [company, companyId, availableNavItems, activeView, mobileSettingsUx, pathname, router]);

    const setActiveViewWithUrl = useCallback(
        (id: string) => {
            setActiveView(id);
            const next = `${pathname}?view=${encodeURIComponent(id)}`;
            if (searchParams.get("view") !== id) {
                router.replace(next, { scroll: false });
            }
            // Static/APK me address bar turant pakka karo — warna voucher par bhi F5 baad Sharing restore ho sakti thi
            syncSettingsViewQueryToBrowser(id);
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
        if (companyId && !company) return;
        if (mobileSettingsUx) return;
        const viewParam = searchParams.get("view");
        if (!viewParam && activeView && availableNavItems.some((item) => item.id === activeView)) {
            router.replace(`${pathname}?view=${encodeURIComponent(activeView)}`, { scroll: false });
            syncSettingsViewQueryToBrowser(activeView);
        }
    }, [company, companyId, mobileSettingsUx, activeView, pathname, searchParams, router, availableNavItems]);

    const selectedSetting = useMemo(() => {
        return availableNavItems.find(item => item.id === activeView) || null;
    }, [activeView, availableNavItems]);

    const openSettingsListSheet = useCallback(() => setSettingsListOpen(true), [setSettingsListOpen]);
    // Daen kinara se swipe LEFT → sirf settings list (baen kinara + swipe RIGHT sirf app sidebar — dono alag)
    const settingsListSwipe = useEdgeSwipeTrigger(
        mobileSettingsUx && Boolean(activeView),
        "right",
        openSettingsListSheet
    );

    const renderNavButtons = (onPick?: () => void) => (
        <ul className="list-none p-2 space-y-1" data-theme-list="account-list">
            {availableNavItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                    <li key={item.id}>
                        <button
                            type="button"
                            className={settingsNavRowClass(isActive, item.isDanger)}
                            onClick={() => {
                                setActiveViewWithUrl(item.id);
                                onPick?.();
                            }}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span className="truncate">{item.title}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
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
                return canOpenThemeOrAnimation ? (
                    <ThemeSettings localOnlyHint={sharedLocalAppearanceOnly} />
                ) : null;
            case "animation":
                return canOpenThemeOrAnimation ? (
                    <AnimationSettings localPersistenceOnly={sharedLocalAppearanceOnly} />
                ) : null;
            case "id_settings":
                return can('configure_company_settings') ? <IdSettings /> : null;
            case "decimals":
                 return can('configure_company_settings') ? <CurrencySettings /> : null;
            case "display":
                 return can('configure_company_settings') ? <DisplaySettings /> : null;
            case "fiscal_split":
                return can("configure_company_settings") ? <FiscalSplitSettings /> : null;
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
        // Multi-tab refresh: settings loading guard should respect this tab's company override.
        const s = typeof window !== "undefined" ? readSelectedCompanyId() : "";
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
                <div className="h-full flex flex-col overflow-hidden min-h-0 px-2 pt-2 pb-2">
                    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", SETTINGS_LIST_SHELL)}>
                        <div className={cn("flex-shrink-0 px-4 py-3", SETTINGS_LIST_HEADER_RULE)}>
                            <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                            <p className="text-sm text-muted-foreground">Manage your app preferences.</p>
                        </div>
                        <ScrollArea className="min-h-0 flex-1">
                            {renderNavButtons()}
                        </ScrollArea>
                    </div>
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
                    <div className={cn("flex-shrink-0 px-2 py-2 flex items-center gap-2 min-h-[48px]", SETTINGS_LIST_HEADER_RULE)}>
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
                        <SheetHeader className={cn("p-4 pb-2", SETTINGS_LIST_HEADER_RULE)}>
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
          
          <aside className="flex flex-col min-h-0 overflow-hidden md:w-[280px] md:shrink-0 -mt-4 sm:-mt-6 md:-mt-8">
              <div className="flex flex-col min-h-0 h-full pt-4 sm:pt-6 md:pt-8">
                  <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", SETTINGS_LIST_SHELL)}>
                      <div className={cn("pb-4 flex-shrink-0 px-4 pt-1", SETTINGS_LIST_HEADER_RULE)}>
                          <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                          <p className="text-sm text-muted-foreground">Manage your app preferences.</p>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0">
                        {renderNavButtons()}
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
