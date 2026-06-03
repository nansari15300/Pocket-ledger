"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCloudProviderAccountStatus,
  type CloudProviderAccountStatus,
} from "@/lib/cloudProviderAccountStatus";

export type UseCloudProviderAccountStatusResult = CloudProviderAccountStatus & {
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useCloudProviderAccountStatus(): UseCloudProviderAccountStatusResult {
  const [googleDrive, setGoogleDrive] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchCloudProviderAccountStatus();
      setGoogleDrive(status.googleDrive);
    } catch {
      setGoogleDrive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAfterOAuth = useCallback(async () => {
    await refresh();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOAuthReturn = () => void refreshAfterOAuth();
    const onFocus = () => {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("success") || sp.get("error")) void refresh();
    };
    window.addEventListener("cloud-provider-oauth-return", onOAuthReturn);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onOAuthReturn);
    const sp = new URLSearchParams(window.location.search);
    const success = sp.get("success");
    const oauthError = sp.get("error");
    if (
      success === "drive_connected" ||
      oauthError === "oauth_exchange_failed" ||
      oauthError === "oauth_failed" ||
      oauthError === "oauth_failed_no_code"
    ) {
      void refresh();
    }
    return () => {
      window.removeEventListener("cloud-provider-oauth-return", onOAuthReturn);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onOAuthReturn);
    };
  }, [refresh, refreshAfterOAuth]);

  return { googleDrive, loading, refresh };
}
