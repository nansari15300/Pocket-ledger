"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";
import { canAccess, type Role } from "@/utils/rbac";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { isAdminPanelDevPreview } from "@/lib/adminDevPreview";

export function useAdminAccess(allowed: Array<Role>) {
  const { customUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAccessGranted, setIsAccessGranted] = useState<boolean | null>(null);
  const devPreview = isAdminPanelDevPreview();

  useEffect(() => {
    if (authLoading) return;

    if (devPreview) {
      setIsAccessGranted(true);
      return;
    }

    if (!customUser || !customUser.isActive) {
      router.replace("/not-authorized");
      return;
    }

    const ok = canAccess(customUser.role, allowed);
    if (!ok) {
      router.replace("/not-authorized");
    } else {
      setIsAccessGranted(true);
    }
  }, [authLoading, customUser, router, allowed, devPreview]);

  if (authLoading || isAccessGranted === null) {
    return { user: null, loading: true };
  }

  return { user: customUser, loading: false };
}
