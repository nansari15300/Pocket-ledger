"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { activeMasterCollectionPathsForRoute } from "@/lib/ledgerActiveMasterCollections";

/** Pull distance = screen height × ratio (user: ~50% swipe). */
export const MOBILE_PULL_REFRESH_DISTANCE_RATIO = 0.5;

/** Master list / detail scroll columns — pull-refresh gesture targets (see `MobilePagePullRefresh`). */
export const PL_MOBILE_PULL_SCROLL_ATTR = "data-pl-mobile-pull-scroll";

export const plMobilePullScrollProps: Record<string, string> = {
  [PL_MOBILE_PULL_SCROLL_ATTR]: "",
};

export const MOBILE_ROUTE_PULL_REFRESH_EVENT = "pl-mobile-route-pull-refresh";

export type MobileRoutePullRefreshDetail = {
  pathname: string;
  resolve?: () => void;
  reject?: (reason?: unknown) => void;
};

const BACKUP_COLLECTION_SET = new Set<string>(COLLECTIONS_TO_BACKUP);

function normalizeRoutePath(pathname: string): string {
  const raw = String(pathname || "").split("?")[0].trim() || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

function asBackupCollections(paths: Iterable<string>): CompanyBackupCollection[] {
  const out: CompanyBackupCollection[] = [];
  for (const p of paths) {
    if (BACKUP_COLLECTION_SET.has(p)) out.push(p as CompanyBackupCollection);
  }
  return out;
}

/**
 * Mobile pull-refresh: sirf current screen ke liye collections — global date / saari masters nahi.
 */
export function collectionsForMobileRoutePullRefresh(pathname: string): CompanyBackupCollection[] {
  const route = normalizeRoutePath(pathname).toLowerCase();

  if (/^\/party\/[^/]+$/.test(route) && !route.includes("/group/")) {
    return ["parties", "vouchers"];
  }
  if (route.startsWith("/party/group/")) return ["groups", "parties", "vouchers"];
  if (route === "/party") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/staff\/[^/]+$/.test(route) && !route.includes("/group/")) return ["staff", "vouchers"];
  if (route.startsWith("/staff/group/")) return ["staff_groups", "staff", "vouchers"];
  if (route === "/staff") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/bank-cash\/[^/]+$/.test(route) && !route.includes("/group/")) {
    return ["bank_accounts", "vouchers"];
  }
  if (route.startsWith("/bank-cash/group/")) {
    return ["account_groups", "bank_accounts", "vouchers"];
  }
  if (route === "/bank-cash") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/incomes\/[^/]+$/.test(route) && !route.includes("/group/")) {
    return ["expense_accounts", "vouchers"];
  }
  if (route.startsWith("/incomes/group/")) {
    return ["expense_groups", "expense_accounts", "vouchers"];
  }
  if (route === "/incomes") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/tax\/[^/]+$/.test(route) && !route.includes("/group/")) return ["taxes", "vouchers"];
  if (route.startsWith("/tax/group/")) return ["tax_groups", "taxes", "vouchers"];
  if (route === "/tax") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/items\/[^/]+$/.test(route) && !route.includes("/group/")) return ["items", "vouchers"];
  if (route.startsWith("/items/group/")) return ["item_groups", "items", "vouchers"];
  if (route === "/items") return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (/^\/loans\/[^/]+$/.test(route)) {
    return ["loans", "loan_transactions", "vouchers"];
  }
  if (route.startsWith("/loans")) return asBackupCollections(activeMasterCollectionPathsForRoute(route));

  if (route.startsWith("/dashboard")) return ["vouchers"];
  if (route.startsWith("/gallery")) return ["vouchers"];
  if (route.startsWith("/quotations")) return ["vouchers"];
  if (route.startsWith("/reports")) return ["vouchers"];

  return asBackupCollections(activeMasterCollectionPathsForRoute(route));
}

export function dispatchMobileRoutePullRefresh(pathname: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const path = normalizeRoutePath(pathname);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => finish(resolve), 20_000);
    window.dispatchEvent(
      new CustomEvent<MobileRoutePullRefreshDetail>(MOBILE_ROUTE_PULL_REFRESH_EVENT, {
        detail: {
          pathname: path,
          resolve: () => finish(resolve),
          reject: (reason) => finish(() => reject(reason)),
        },
      })
    );
  });
}
