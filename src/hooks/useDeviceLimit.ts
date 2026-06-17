"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { useLivePlans, getPlanFromPlans } from "./useLivePlans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import { registerDeviceAndCheckLimit, replaceMyOtherDevicesAndRegister, getOrCreateDeviceId, setKickedForCompany, clearKickedForCompany, getWasKicked, enforceDeviceLimitByPlan } from "@/lib/deviceLimitClient";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
const runCheckRef = { current: (() => Promise.resolve()) as () => void | Promise<void> };

export function useDeviceLimit() {
  const { companyId, company, allCompanies } = useCompany();
  const { user } = useAuth();
  const livePlans = useLivePlans();
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    // Static bundle me offline mode par device-limit blocking overlay disable rakho.
    const update = () => setIsOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const [result, setResult] = useState<{
    allowed: boolean;
    count: number;
    limit: number;
    singleDeviceOnly?: boolean;
    replaceOffer?: boolean;
    noPermissionNewDevice?: boolean;
    kickedAndBlocked?: boolean;
  } | null>(null);
  const myDeviceWasInListRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isStaticAppBuild() && isOffline) {
      // Offline UX: company ke local data access ko device-limit gate se block mat karo.
      setResult({ allowed: true, count: 0, limit: 1 });
      myDeviceWasInListRef.current = null;
      return;
    }
    if (!companyId || !user?.uid || !company) {
      setResult(null);
      myDeviceWasInListRef.current = null;
      return;
    }

    // Pure local company (SQLite on this device) — no Firestore device-sync list.
    if (isOfflineCompanyStorage(company) && !isCloudBackedCompanyShape(company)) {
      setResult({ allowed: true, count: 0, limit: 1 });
      myDeviceWasInListRef.current = null;
      return;
    }

    myDeviceWasInListRef.current = null;

    const isOwner =
      !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));

    // Owner: account-level best owned plan (header / billing jaisa). Shared user: isi company ka planId (owner subscription pool).
    const companyPlanIdNormalized: PlanId = normalizePlanIdForClient(company?.planId);
    const accountPlanId = resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId);
    const planIdForDeviceSlots = isOwner ? accountPlanId : companyPlanIdNormalized;
    const plan = getPlanFromPlans(livePlans, planIdForDeviceSlots);
    const hasMultiDeviceSync = plan.entitlements.hasMultiDeviceSync === true;
    const localCompany = isOfflineCompanyStorage(company);
    const planMaxDevices = localCompany
      ? Math.max(1, Number(plan.entitlements.maxDevicesLocal ?? plan.entitlements.maxDevices) || 1)
      : Math.max(1, Number(plan.entitlements.maxDevices) || 1);
    const maxDevices = hasMultiDeviceSync ? planMaxDevices : 1;
    const userCanUseMultiDevice = company?.userCanUseMultiDevice !== false;

    let cancelled = false;
    myDeviceWasInListRef.current = null;
    const runCheck = (): Promise<void> => {
      if (cancelled) return Promise.resolve();
      const wasKicked = getWasKicked(companyId);
      return registerDeviceAndCheckLimit(companyId, user!.uid, maxDevices, hasMultiDeviceSync, {
        userCanUseMultiDevice,
        isOwner,
        wasKicked,
      })
        .then(async (r) => {
          if (cancelled) return;
          if (r.count > r.limit && r.limit >= 1) {
            try {
              await enforceDeviceLimitByPlan(companyId, r.limit);
              if (!cancelled) runCheck();
            } catch {
              // non-blocking
            }
          }
          if (!cancelled) setResult({ allowed: r.allowed, count: r.count, limit: r.limit, singleDeviceOnly: r.singleDeviceOnly, replaceOffer: r.replaceOffer, noPermissionNewDevice: r.noPermissionNewDevice, kickedAndBlocked: r.kickedAndBlocked });
        })
        .catch(() => {
          if (!cancelled) setResult({ allowed: true, count: 0, limit: maxDevices });
        });
    };

    runCheckRef.current = runCheck;
    runCheck();

    const deviceId = getOrCreateDeviceId();
    const devicesRef = collection(firestore, "companies", companyId, "devices");
    const unsubDevices = onSnapshot(devicesRef, (snap) => {
      if (cancelled) return;
      const myDoc = snap.docs.find((d) => d.id === deviceId);
      const inList = !!myDoc;
      if (myDeviceWasInListRef.current === true && !inList) {
        setKickedForCompany(companyId);
      }
      myDeviceWasInListRef.current = inList;
      if (!inList) runCheck();
    });

    const interval = setInterval(runCheck, 10 * 1000);
    return () => {
      cancelled = true;
      unsubDevices();
      clearInterval(interval);
    };
  }, [
    companyId,
    user?.uid,
    company?.planId,
    company?.ownerId,
    company?.ownerEmail,
    company?.userCanUseMultiDevice,
    livePlans,
    company,
    isOffline,
    allCompanies,
  ]);

  const refreshDeviceCheck = useCallback(() => {
    runCheckRef.current?.();
  }, []);

  const performReplaceAndRefresh = useCallback(async () => {
    if (!companyId || !user?.uid || !company) return;
    const isOwner =
      !!company && (company.ownerId === user.uid || (user.email && company.ownerEmail === user.email));
    const companyPlanIdNormalized: PlanId = normalizePlanIdForClient(company?.planId);
    const accountPlanId = resolveEffectiveAccountPlanId(allCompanies, user.uid, company?.planId);
    const planIdForDeviceSlots = isOwner ? accountPlanId : companyPlanIdNormalized;
    const plan = getPlanFromPlans(livePlans, planIdForDeviceSlots);
    const hasMultiDeviceSync = plan.entitlements.hasMultiDeviceSync === true;
    const localCompany = isOfflineCompanyStorage(company);
    const planMaxDevices = localCompany
      ? Math.max(1, Number(plan.entitlements.maxDevicesLocal ?? plan.entitlements.maxDevices) || 1)
      : Math.max(1, Number(plan.entitlements.maxDevices) || 1);
    const maxDevices = hasMultiDeviceSync ? planMaxDevices : 1;
    await replaceMyOtherDevicesAndRegister(companyId, user.uid, maxDevices);
    runCheckRef.current?.();
  }, [companyId, user?.uid, company, livePlans, allCompanies]);

  const clearKickedAndRefresh = useCallback((): Promise<void> => {
    if (!companyId) return Promise.resolve();
    clearKickedForCompany(companyId);
    const p = runCheckRef.current?.();
    return p instanceof Promise ? p : Promise.resolve();
  }, [companyId]);

  return useMemo(
    () => ({
      deviceLimitReached: result !== null && !result.allowed,
      singleDeviceOnly: result?.singleDeviceOnly === true,
      replaceOffer: result?.replaceOffer === true,
      noPermissionNewDevice: result?.noPermissionNewDevice === true,
      kickedAndBlocked: result?.kickedAndBlocked === true,
      deviceCount: result?.count ?? 0,
      maxDevices: result?.limit ?? 1,
      loading: companyId && user && company && result === null,
      refreshDeviceCheck,
      performReplaceAndRefresh,
      clearKickedAndRefresh,
    }),
    [result, companyId, user, company, refreshDeviceCheck, performReplaceAndRefresh, clearKickedAndRefresh]
  );
}
