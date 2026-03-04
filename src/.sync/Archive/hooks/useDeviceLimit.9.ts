"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { firestore, auth } from "@/lib/firebase";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { useLivePlans, getPlanFromPlans } from "./useLivePlans";
import { registerDeviceAndCheckLimit, getOrCreateDeviceId } from "@/lib/deviceLimitClient";

export function useDeviceLimit() {
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const livePlans = useLivePlans();

  const [result, setResult] = useState<{
    allowed: boolean;
    count: number;
    limit: number;
    singleDeviceOnly?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!companyId || !user?.uid || !company) {
      setResult(null);
      return;
    }

    const plan = getPlanFromPlans(livePlans, company.planId as any);
    const hasMultiDeviceSync = plan.entitlements.hasMultiDeviceSync === true;
    const planMaxDevices = Math.max(1, Number(plan.entitlements.maxDevices) || 1);
    const maxDevices = hasMultiDeviceSync ? planMaxDevices : 1;
    const isOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));
    const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;

    let cancelled = false;
    const runCheck = () => {
      if (cancelled) return;
      registerDeviceAndCheckLimit(companyId, user!.uid, maxDevices, true, { userCanUseMultiDevice, isOwner })
        .then((r) => {
          if (!cancelled) setResult({ allowed: r.allowed, count: r.count, limit: r.limit, singleDeviceOnly: r.singleDeviceOnly });
        })
        .catch(() => {
          if (!cancelled) setResult({ allowed: true, count: 0, limit: maxDevices });
        });
    };

    runCheckRef.current = runCheck;
    runCheck();
    const interval = setInterval(runCheck, 45 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companyId, user?.uid, company?.planId, company?.ownerId, company?.ownerEmail, company?.userCanUseMultiDevice, livePlans, company]);

  const refreshDeviceCheck = useCallback(() => {
    runCheckRef.current?.();
  }, []);

  // Listen for kick-out logout command so this device signs out in real time
  useEffect(() => {
    if (!companyId || !user?.uid) return;
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    const cmdRef = doc(firestore, "companies", companyId, "device_commands", deviceId);
    const unsub = onSnapshot(cmdRef, (snap) => {
      if (snap.data()?.logout === true) {
        signOut(auth).finally(() => {
          deleteDoc(cmdRef).catch(() => {});
        });
      }
    });
    return () => unsub();
  }, [companyId, user?.uid]);

  return useMemo(
    () => ({
      deviceLimitReached: result !== null && !result.allowed,
      singleDeviceOnly: result?.singleDeviceOnly === true,
      deviceCount: result?.count ?? 0,
      maxDevices: result?.limit ?? 1,
      loading: companyId && user && company && result === null,
    }),
    [result, companyId, user, company]
  );
}
