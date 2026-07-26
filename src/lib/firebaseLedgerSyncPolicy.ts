"use client";

/**
 * Effective Firebase ledger sync policy (single gate for web / EXE / APK / iOS).
 *
 * Device preference today: sidebar deltaa/live switch → `firebaseLedgerSyncMode`.
 * Future: admin plan settings can force mode / disable cloud sync without rewriting call sites —
 * set `FIREBASE_LEDGER_SYNC_PLAN_OVERRIDE` (or later fetch plan flags into that hook).
 *
 * Rules:
 * - deltaa (`local`): SQLite + outbox transport; NO collection `onSnapshot`; only `_pl_change_log` live feed.
 * - live (`full_online`): route-scoped collection listeners (legacy billing-heavy path).
 */

import {
  getFirebaseLedgerSyncMode,
  type FirebaseLedgerSyncMode,
} from "@/lib/firebaseLedgerSyncMode";
import { isFirebaseLedgerDataSyncEnabled } from "@/lib/firebaseLedgerDataSyncDisabled";

/** Where the effective mode came from — UI move to admin plans only needs this resolver. */
export type FirebaseLedgerSyncPolicySource = "device_preference" | "plan_override" | "build_default";

export type FirebaseLedgerSyncPlanOverride = {
  /** Force sync mode; omit to leave device preference. */
  syncMode?: FirebaseLedgerSyncMode;
  /** false = cloud ledger sync forbidden (e.g. Basic plan). */
  cloudDataSyncAllowed?: boolean;
  /** false = hide/disable user deltaa/live switch (plan locks mode). */
  allowUserModeSwitch?: boolean;
};

/**
 * Future admin/plan hook. Keep null until plan settings wire this.
 * Example later: return { syncMode: "local", allowUserModeSwitch: false } for a plan.
 */
export function getFirebaseLedgerSyncPlanOverride(): FirebaseLedgerSyncPlanOverride | null {
  return null;
}

export type FirebaseLedgerSyncPolicy = {
  /** Effective mode after plan override. */
  syncMode: FirebaseLedgerSyncMode;
  source: FirebaseLedgerSyncPolicySource;
  /** Cloud ledger upload/download allowed (global toggle ∩ plan). */
  cloudDataSyncAllowed: boolean;
  /** User may flip deltaa/live in UI. */
  allowUserModeSwitch: boolean;
  /** SQLite-first reads/writes + outbox; Firestore is transport only. */
  usesSqliteTransport: boolean;
  /** Full-collection / master `onSnapshot` allowed (live mode only). */
  collectionLiveListenersAllowed: boolean;
  /** `_pl_change_log` listener + per-doc pull (deltaa only, when cloud sync on). */
  changeFeedDeltaSyncAllowed: boolean;
};

export function resolveFirebaseLedgerSyncPolicy(): FirebaseLedgerSyncPolicy {
  const plan = getFirebaseLedgerSyncPlanOverride();
  const deviceMode = getFirebaseLedgerSyncMode();
  let syncMode: FirebaseLedgerSyncMode = deviceMode;
  let source: FirebaseLedgerSyncPolicySource = "device_preference";

  if (plan?.syncMode === "local" || plan?.syncMode === "full_online") {
    syncMode = plan.syncMode;
    source = "plan_override";
  }

  const cloudDataSyncAllowed =
    (plan?.cloudDataSyncAllowed !== false) && isFirebaseLedgerDataSyncEnabled();
  const allowUserModeSwitch = plan?.allowUserModeSwitch !== false;
  const usesSqliteTransport = syncMode === "local";
  const collectionLiveListenersAllowed = syncMode === "full_online" && cloudDataSyncAllowed;
  const changeFeedDeltaSyncAllowed = usesSqliteTransport && cloudDataSyncAllowed;

  return {
    syncMode,
    source,
    cloudDataSyncAllowed,
    allowUserModeSwitch,
    usesSqliteTransport,
    collectionLiveListenersAllowed,
    changeFeedDeltaSyncAllowed,
  };
}

/** deltaa effective (plan or device). */
export function isFirebaseLedgerDeltaSqliteTransportMode(): boolean {
  return resolveFirebaseLedgerSyncPolicy().usesSqliteTransport;
}

/** Bind Firestore collection live listeners? False in deltaa on every platform. */
export function shouldBindFirebaseLedgerCollectionLiveListeners(): boolean {
  return resolveFirebaseLedgerSyncPolicy().collectionLiveListenersAllowed;
}

/** Bind `_pl_change_log` + doc pulls. */
export function shouldBindFirebaseLedgerChangeFeed(): boolean {
  return resolveFirebaseLedgerSyncPolicy().changeFeedDeltaSyncAllowed;
}
