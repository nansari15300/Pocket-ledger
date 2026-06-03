"use client";

import { useEffect } from "react";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { stashCloudOAuthReturn } from "@/lib/cloudOAuthReturn";
import { settingsViewHref } from "@/lib/appNavHref";

/**
 * OAuth callback ke baad hosted/loopback bridge — success/error stash karke `target` par redirect.
 * Static EXE / APK Custom Tab is page par aate hain; tokens server par save ho chuke hote hain.
 */
export default function OAuthReturnPage() {
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const success = sp.get("success");
    const error = sp.get("error");
    const target = sp.get("target")?.trim() || settingsViewHref("local_cloud_sync");

    if (
      success === "drive_connected" ||
      error === "oauth_exchange_failed" ||
      error === "oauth_failed" ||
      error === "oauth_failed_no_code" ||
      error === "missing_uid_in_state" ||
      error
    ) {
      stashCloudOAuthReturn({
        success: success === "drive_connected" ? success : undefined,
        error: error || undefined,
      });
      window.dispatchEvent(new Event("cloud-provider-oauth-return"));
    }

    try {
      window.location.replace(target);
    } catch {
      window.location.href = target;
    }
  }, []);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <LoadingSpinner />
    </div>
  );
}
