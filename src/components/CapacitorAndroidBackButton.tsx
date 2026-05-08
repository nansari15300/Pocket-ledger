"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { tryConsumeMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { tryConsumeDialogHardwareBack } from "@/contexts/DialogBackHandlerContext";
import { tryConsumeAttachmentPreviewHardwareBack } from "@/lib/inAppAttachmentPreviewOpen";

/**
 * APK: Android hardware back — dialogs/master-detail pehle, phir normal stack.
 * Dashboard route par back se app exit (path /dashboard).
 * Static/Capacitor builds only; uses @capacitor/app when available.
 */
export function CapacitorAndroidBackButton() {
  const router = useRouter();

  useEffect(() => {
    if (!isStaticAppBuild()) return;
    let cleanupRemove: (() => void) | undefined;
    let cancelled = false;

    import("@capacitor/app")
      .then(({ App }) => {
        if (cancelled) return;
        void App.addListener("backButton", ({ canGoBack }) => {
          // In-app attachment preview/gallery sabse pehle close ho — peeche ka route/history consume na ho.
          if (tryConsumeAttachmentPreviewHardwareBack()) return;
          // Voucher / Dialog khula cha bhane pehle tyo band — natra party detail → list galat hunchha
          if (tryConsumeDialogHardwareBack()) return;
          // Master–detail: detail → list (replace)
          if (tryConsumeMasterDetailHardwareBack()) return;
          // Dashboard = app home: back se app band (history par purana page na dikhao)
          if (typeof window !== "undefined") {
            const path = (window.location.pathname.replace(/\/$/, "") || "/").toLowerCase();
            if (path === "/dashboard") {
              void App.exitApp();
              return;
            }
          }
          // Next.js SPA: WebView canGoBack is often false even with client stack — prefer history length
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
          }
          if (canGoBack) {
            window.history.back();
            return;
          }
          // Single entry: exit app (default Android behaviour when nothing to pop)
          void App.exitApp();
        }).then((handle) => {
          if (!cancelled) cleanupRemove = () => void handle.remove();
        });
      })
      .catch(() => {
        /* @capacitor/app not installed or web-only dev */
      });

    return () => {
      cancelled = true;
      cleanupRemove?.();
    };
  }, [router]);

  return null;
}
