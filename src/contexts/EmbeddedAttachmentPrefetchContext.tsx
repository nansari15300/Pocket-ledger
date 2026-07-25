"use client";

/**
 * Background attachment prefetch progress — sirf header strip subscribe kare.
 * Pehle `useState` yahan tha: har % update par poora app re-render → cards / details page hillte the.
 */
import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type HeaderAttachmentPrefetchSnapshot = {
  companyId: string;
  percent: number;
} | null;

let headerAttachmentPrefetch: HeaderAttachmentPrefetchSnapshot = null;
const listeners = new Set<() => void>();

function subscribeHeaderAttachmentPrefetch(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getHeaderAttachmentPrefetchSnapshot(): HeaderAttachmentPrefetchSnapshot {
  return headerAttachmentPrefetch;
}

function publishHeaderAttachmentPrefetch(next: HeaderAttachmentPrefetchSnapshot): void {
  const prev = headerAttachmentPrefetch;
  if (prev === null && next === null) return;
  if (
    prev !== null &&
    next !== null &&
    prev.companyId === next.companyId &&
    prev.percent === next.percent
  ) {
    return;
  }
  headerAttachmentPrefetch = next;
  for (const l of listeners) l();
}

/** Background warm/backfill — React hook ke bina header % update (module store). */
export function reportHeaderAttachmentPrefetchProgress(
  companyId: string | null | undefined,
  percent: number | null | undefined
): void {
  const cid = companyId?.trim();
  if (!cid || percent == null || !Number.isFinite(percent) || percent >= 100) {
    clearHeaderAttachmentPrefetchForCompany(companyId);
    return;
  }
  publishHeaderAttachmentPrefetch({
    companyId: cid,
    percent: Math.min(99, Math.max(0, Math.round(percent))),
  });
}

/** Abort / company switch — sirf matching company ki strip hatao. */
export function clearHeaderAttachmentPrefetchForCompany(companyId?: string | null): void {
  const cid = companyId?.trim();
  if (!cid) {
    publishHeaderAttachmentPrefetch(null);
    return;
  }
  const snap = getHeaderAttachmentPrefetchSnapshot();
  if (snap?.companyId === cid) publishHeaderAttachmentPrefetch(null);
}

type SetterCtx = {
  setHeaderAttachmentPrefetch: (v: HeaderAttachmentPrefetchSnapshot) => void;
};

const EmbeddedAttachmentPrefetchContext = createContext<SetterCtx | null>(null);

const noopSetter = () => {};

export function EmbeddedAttachmentPrefetchProvider({ children }: { children: React.ReactNode }) {
  const setHeaderAttachmentPrefetch = useCallback((v: HeaderAttachmentPrefetchSnapshot) => {
    publishHeaderAttachmentPrefetch(v);
  }, []);
  const value = useMemo(() => ({ setHeaderAttachmentPrefetch }), [setHeaderAttachmentPrefetch]);
  return (
    <EmbeddedAttachmentPrefetchContext.Provider value={value}>{children}</EmbeddedAttachmentPrefetchContext.Provider>
  );
}

/** Background warm / backfill — setter only; percent change par re-render nahi. */
export function useSetHeaderAttachmentPrefetch(): (v: HeaderAttachmentPrefetchSnapshot) => void {
  const c = useContext(EmbeddedAttachmentPrefetchContext);
  return c?.setHeaderAttachmentPrefetch ?? noopSetter;
}

/** @deprecated Prefer `useSetHeaderAttachmentPrefetch` with `{ companyId, percent }`. */
export function useSetHeaderAttachmentPrefetchPercent(): (
  v: number | null,
  companyId?: string | null
) => void {
  const setHeaderAttachmentPrefetch = useSetHeaderAttachmentPrefetch();
  return useCallback(
    (v, companyId) => {
      if (v == null) {
        setHeaderAttachmentPrefetch(null);
        return;
      }
      const cid = companyId?.trim();
      if (!cid) return;
      setHeaderAttachmentPrefetch({ companyId: cid, percent: v });
    },
    [setHeaderAttachmentPrefetch]
  );
}

/** Header progress strip — sirf jab `viewingCompanyId` active prefetch company se match ho. */
export function useHeaderAttachmentPrefetchPercentForCompany(
  viewingCompanyId: string | null | undefined
): number | null {
  const snapshot = useSyncExternalStore(
    subscribeHeaderAttachmentPrefetch,
    getHeaderAttachmentPrefetchSnapshot,
    getHeaderAttachmentPrefetchSnapshot
  );
  const cid = viewingCompanyId?.trim();
  if (!snapshot || !cid || snapshot.companyId !== cid) return null;
  return snapshot.percent;
}

/** @deprecated Prefer `useHeaderAttachmentPrefetchPercentForCompany`. */
export function useHeaderAttachmentPrefetchPercent(): number | null {
  return useSyncExternalStore(
    subscribeHeaderAttachmentPrefetch,
    () => headerAttachmentPrefetch?.percent ?? null,
    () => headerAttachmentPrefetch?.percent ?? null
  );
}

/** @deprecated Prefer `useSetHeaderAttachmentPrefetch` ya `useHeaderAttachmentPrefetchPercentForCompany`. */
export function useEmbeddedAttachmentPrefetch(): SetterCtx & { headerAttachmentPercent: number | null } {
  const c = useContext(EmbeddedAttachmentPrefetchContext);
  const percent = useHeaderAttachmentPrefetchPercent();
  if (!c) {
    return { headerAttachmentPercent: null, setHeaderAttachmentPrefetch: noopSetter };
  }
  return {
    headerAttachmentPercent: percent,
    setHeaderAttachmentPrefetch: c.setHeaderAttachmentPrefetch,
  };
}
