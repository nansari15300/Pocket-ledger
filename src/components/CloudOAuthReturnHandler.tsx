"use client";

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  applyCloudOAuthReturnUrl,
  consumeStashedCloudOAuthReturn,
  isCloudOAuthReturnUrl,
  stashCloudOAuthReturn,
} from "@/lib/cloudOAuthReturn";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

function toastForOAuthReturn(
  toast: ReturnType<typeof useToast>["toast"],
  payload: { success?: string; error?: string }
): void {
  if (payload.error) {
    toast({
      variant: "destructive",
      title: "Cloud connect failed",
      description:
        payload.error === "oauth_exchange_failed"
          ? "Permission mil gayi lekin token save nahi hua. Dubara Connect try karo."
          : "Sign-in cancel ya incomplete. Dubara Connect try karo.",
    });
    return;
  }
  if (payload.success === "drive_connected") {
    toast({
      title: "Google Drive connected",
      description: "You can now sync local companies to Drive.",
    });
  }
}

/** APK / static EXE — OAuth return URL apply + account status refresh. */
export function CloudOAuthReturnHandler() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const runFromLocation = () => {
      const sp = new URLSearchParams(window.location.search);
      const success = sp.get("success");
      const error = sp.get("error");
      if (
        success === "drive_connected" ||
        error === "oauth_exchange_failed" ||
        error === "oauth_failed" ||
        error === "oauth_failed_no_code"
      ) {
        stashCloudOAuthReturn({
          success: success === "drive_connected" ? success : undefined,
          error: error || undefined,
        });
        sp.delete("success");
        sp.delete("error");
        sp.delete("state");
        const next = `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}${window.location.hash || ""}`;
        try {
          window.history.replaceState(null, "", next);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event("cloud-provider-oauth-return"));
        toastForOAuthReturn(toast, {
          success: success || undefined,
          error: error || undefined,
        });
        return true;
      }
      return false;
    };

    const stashed = consumeStashedCloudOAuthReturn();
    if (stashed) {
      toastForOAuthReturn(toast, stashed);
      window.dispatchEvent(new Event("cloud-provider-oauth-return"));
    } else {
      runFromLocation();
    }
  }, [toast]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let cancelled = false;
    const handles: { remove: () => Promise<void> }[] = [];

    void (async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        const { App } = await import("@capacitor/app");

        const onReturnUrl = (rawUrl: string) => {
          if (!isCloudOAuthReturnUrl(rawUrl)) return;
          applyCloudOAuthReturnUrl(rawUrl);
          void Browser.close();
        };

        const onBrowserFinished = () => {
          const stashed = consumeStashedCloudOAuthReturn();
          if (stashed) toastForOAuthReturn(toast, stashed);
          window.dispatchEvent(new Event("cloud-provider-oauth-return"));
        };

        if (!cancelled) {
          handles.push(
            await App.addListener("appUrlOpen", ({ url }) => {
              onReturnUrl(url);
            }),
            await Browser.addListener("browserFinished", onBrowserFinished)
          );
        }
      } catch (e) {
        console.warn("[CloudOAuthReturn]", e);
      }
    })();

    return () => {
      cancelled = true;
      void Promise.all(handles.map((h) => h.remove()));
    };
  }, []);

  useEffect(() => {
    if (!isStaticAppBuild() || isCapacitorNativeApp()) return;
    const onPageShow = () => {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("success") || sp.get("error")) {
        window.dispatchEvent(new Event("cloud-provider-oauth-return"));
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
