"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { useToast } from "@/hooks/use-toast";

/** APK: Drive OAuth Custom Tab band + `success=drive_connected` query toast. */
export function CapacitorDriveOAuthReturnHandler() {
  const { toast } = useToast();

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let cancelled = false;
    const handles: { remove: () => Promise<void> }[] = [];

    void (async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        const { App } = await import("@capacitor/app");

        const closeIfAppOrigin = (rawUrl: string) => {
          const u = String(rawUrl || "");
          if (u.includes("localhost") || u.includes("drive_connected") || u.includes("dropbox_connected")) {
            void Browser.close();
          }
        };

        if (!cancelled) {
          handles.push(
            await App.addListener("appUrlOpen", ({ url }) => {
              closeIfAppOrigin(url);
            })
          );
        }
      } catch (e) {
        console.warn("[CapacitorDriveOAuthReturn]", e);
      }
    })();

    return () => {
      cancelled = true;
      void Promise.all(handles.map((h) => h.remove()));
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const success = sp.get("success");
    if (success !== "drive_connected" && success !== "dropbox_connected") return;

    toast({
      title: success === "dropbox_connected" ? "Dropbox connected" : "Google Drive connected",
      description:
        success === "dropbox_connected"
          ? "Dropbox account linked. Company sync will use your App folder."
          : "You can now sync local companies to Drive.",
    });

    sp.delete("success");
    const next = `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}${window.location.hash || ""}`;
    try {
      window.history.replaceState(null, "", next);
    } catch {
      /* ignore */
    }
  }, [toast]);

  return null;
}
