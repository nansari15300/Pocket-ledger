"use client";

import * as React from "react";
import { attachmentPersistableRefsMatch } from "@/lib/companyAttachmentRegistry";
import {
  getVoucherAttachmentUrlsForUi,
  type VoucherAttachmentNormalizeOptions,
} from "@/lib/voucherAttachmentNormalize";

export type VoucherListReuseHint = {
  count: number;
  originPlaceKey: string | null;
};

type PlaceHit = { placeKey: string; atMs: number };

type ListReuseState = {
  version: number;
  /** Canonical URL groups — places sharing the same attachment. */
  groups: Array<{ sampleUrl: string; places: PlaceHit[] }>;
};

let listReuseState: ListReuseState = { version: 0, groups: [] };
const listReuseListeners = new Set<() => void>();

function notifyListReuseListeners(): void {
  for (const fn of listReuseListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function coerceRowTimeMs(row: Record<string, unknown>): number {
  // Origin = create/edit time, not voucher business date.
  for (const c of [row.createdAt, row.lastEditedAt, row.updatedAt]) {
    if (c == null) continue;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      return c < 1e12 ? c * 1000 : c;
    }
    if (typeof c === "string") {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return t;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Daybook / cashbook File column — same attached URL on 2+ loaded voucher rows
 * → immediate green/blue border (full company scan still refines in background).
 */
export function publishVoucherAttachmentListReuseIndex(
  rows: ReadonlyArray<{
    id?: unknown;
    fileUrls?: unknown;
    unassignedFile?: unknown;
    createdAt?: unknown;
    date?: unknown;
    lastEditedAt?: unknown;
    updatedAt?: unknown;
  }>,
  opts?: VoucherAttachmentNormalizeOptions
): void {
  const groups: ListReuseState["groups"] = [];
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    // Spend-wise / derived rows — skip non-voucher synthetic ids when empty urls
    const urls = getVoucherAttachmentUrlsForUi(row, opts);
    if (urls.length === 0) continue;
    const placeKey = `vouchers/${id}`;
    const atMs = coerceRowTimeMs(row as Record<string, unknown>);
    for (const raw of urls) {
      const url = String(raw || "").trim();
      if (!url || url.startsWith("blob:") || url.startsWith("data:")) continue;
      let group = groups.find((g) => attachmentPersistableRefsMatch(g.sampleUrl, url));
      if (!group) {
        group = { sampleUrl: url, places: [] };
        groups.push(group);
      }
      if (!group.places.some((p) => p.placeKey === placeKey)) {
        group.places.push({ placeKey, atMs });
      }
    }
  }
  for (const g of groups) {
    g.places.sort((a, b) => a.atMs - b.atMs || a.placeKey.localeCompare(b.placeKey));
  }
  listReuseState = { version: listReuseState.version + 1, groups };
  notifyListReuseListeners();
}

export function lookupVoucherListReuseHint(
  url: string,
  placeKey?: string | null
): VoucherListReuseHint {
  const u = String(url || "").trim();
  if (!u) return { count: 0, originPlaceKey: null };
  const group = listReuseState.groups.find((g) => attachmentPersistableRefsMatch(g.sampleUrl, u));
  if (!group || group.places.length === 0) return { count: 0, originPlaceKey: null };
  const originPlaceKey = group.places[0]?.placeKey ?? null;
  // placeKey optional — count still useful for blue/green decision in list
  void placeKey;
  return { count: group.places.length, originPlaceKey };
}

export function useVoucherListReuseHint(
  url: string | null | undefined,
  placeKey?: string | null
): VoucherListReuseHint {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listReuseListeners.add(onChange);
    return () => {
      listReuseListeners.delete(onChange);
    };
  }, []);
  return lookupVoucherListReuseHint(String(url || ""), placeKey);
}
