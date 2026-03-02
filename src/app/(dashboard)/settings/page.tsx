
"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Share2, Wrench, Loader2, PlusCircle, X, Hash, Eye, Palette, FileDigit, GitCommit, Hand, Zap, Building, ShieldAlert, Bell, Smartphone } from "lucide-react";
import { ManageShare } from "@/components/company/ManageShare";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
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

function getInitialSettingsTab(): string {
    if (typeof window === "undefined") return "company";
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return "company";
        const parsed = JSON.parse(raw);
        const tab = parsed?.activeView ?? parsed?.selections?.main ?? "company";
        return settingsNavItems.some((item) => item.id === tab) ? tab : "company";
    } catch {
        return "company";
    }
}

export default function SettingsPage() {
    const { can } = usePermissions();
    const { company, companyId } = useCompany();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const viewFromUrl = searchParams.get("view");
    // Only use URL to decide tab; when no ?view= (e.g. opened from nav or another page), use first tab so we don't open Danger Zone from old localStorage
    const initialView = viewFromUrl && settingsNavItems.some((item) => item.id === viewFromUrl)
        ? viewFromUrl
        : "company";
    const [activeView, setActiveView] = useState(initialView);

    const availableNavItems = useMemo(() => settingsNavItems.filter(item => can(item.permission)), [can]);

    // URL is source of truth: whenever ?view= is set and differs from activeView, sync (fixes overwrite by usePageMemory when searchParams wasn't ready on first paint)
    useEffect(() => {
        if (viewFromUrl && viewFromUrl !== activeView && settingsNavItems.some((item) => item.id === viewFromUrl)) {
            setActiveView(viewFromUrl);
        }
    }, [viewFromUrl, activeView]);

    // Keep URL in sync with active tab so refresh and share link work
    const setActiveViewWithUrl = (id: string) => {
        setActiveView(id);
        const next = `${pathname}?view=${encodeURIComponent(id)}`;
        if (searchParams.get("view") !== id) {
            router.replace(next, { scroll: false });
        }
    };

    // Sync URL only when there is no ?view= (e.g. restored from localStorage). Tab click already updates URL via setActiveViewWithUrl.
    useEffect(() => {
        const viewParam = searchParams.get("view");
        if (!viewParam && activeView && availableNavItems.some((item) => item.id === activeView)) {
            router.replace(`${pathname}?view=${encodeURIComponent(activeView)}`, { scroll: false });
        }
    }, [activeView, pathname, searchParams, router, availableNavItems]);
    
    // Derived selected object for memory hook (current tab = "selected" for usePageMemory)
    const selectedSetting = useMemo(() => {
        return availableNavItems.find(item => item.id === activeView) || null;
    }, [activeView, availableNavItems]);

    // ========== MEMORY LOGIC: restore active tab on refresh ==========
    // When URL has ?view=..., don't overwrite with localStorage so refresh opens same tab
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
        undefined,
        viewFromUrl
    );
    // ==================================

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
    }

    if (availableNavItems.length === 0) {
      const loadingCompany = companyId && !company;
      return (
        <div className="p-8 text-center">
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
              <CardTitle>
                {loadingCompany ? "Loading…" : company ? "Permission Denied" : "Select a Company"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingCompany ? (
                <p>Loading company…</p>
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

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 p-4 sm:p-6 md:p-8 flex-1 min-h-0">
          
          <aside className="flex flex-col min-h-0">
              <div className="pb-4 flex-shrink-0">
                  <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                  <p className="text-sm text-muted-foreground">Manage your app preferences.</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-1">
                    {availableNavItems.map((item) => (
                         <Button
                            key={item.id}
                            variant={activeView === item.id ? "secondary" : "ghost"}
                            className={cn(
                                "justify-start gap-3 w-full",
                                activeView === item.id && "bg-secondary font-medium",
                                item.isDanger && "text-destructive hover:bg-destructive/10 hover:text-destructive"
                            )}
                            onClick={() => setActiveViewWithUrl(item.id)}
                        >
                            <item.icon className="h-5 w-5" />
                            <span>{item.title}</span>
                        </Button>
                      )
                    )}
                </div>
              </div>
          </aside>
  
          <main className="min-h-0 w-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                  {renderActiveView()}
              </div>
          </main>
  
        </div>
      </div>
  );
}
