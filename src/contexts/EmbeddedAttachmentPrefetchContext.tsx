"use client";

/**
 * Background attachment prefetch progress — sirf header strip subscribe kare.
 * Pehle `useState` yahan tha: har % update par poora app re-render → cards / details page hillte the.
 */
import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type PercentSnapshot = number | null;

let headerAttachmentPercent: PercentSnapshot = null;
const listeners = new Set<() => void>();

function subscribeHeaderAttachmentPercent(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getHeaderAttachmentPercentSnapshot(): PercentSnapshot {
  return headerAttachmentPercent;
}

function publishHeaderAttachmentPercent(next: PercentSnapshot): void {
  if (headerAttachmentPercent === next) return;
  headerAttachmentPercent = next;
  for (const l of listeners) l();
}

type SetterCtx = {
  setHeaderAttachmentPercent: (v: number | null) => void;
};

const EmbeddedAttachmentPrefetchContext = createContext<SetterCtx | null>(null);

const noopSetter = () => {};

export function EmbeddedAttachmentPrefetchProvider({ children }: { children: React.ReactNode }) {
  const setHeaderAttachmentPercent = useCallback((v: number | null) => {
    publishHeaderAttachmentPercent(v);
  }, []);
  const value = useMemo(() => ({ setHeaderAttachmentPercent }), [setHeaderAttachmentPercent]);
  return (
    <EmbeddedAttachmentPrefetchContext.Provider value={value}>{children}</EmbeddedAttachmentPrefetchContext.Provider>
  );
}

/** Background warm / backfill — setter only; percent change par re-render nahi. */
export function useSetHeaderAttachmentPrefetchPercent(): (v: number | null) => void {
  const c = useContext(EmbeddedAttachmentPrefetchContext);
  return c?.setHeaderAttachmentPercent ?? noopSetter;
}

/** Header progress strip — is hook par hi % subscribe karo. */
export function useHeaderAttachmentPrefetchPercent(): PercentSnapshot {
  return useSyncExternalStore(
    subscribeHeaderAttachmentPercent,
    getHeaderAttachmentPercentSnapshot,
    getHeaderAttachmentPercentSnapshot
  );
}

/** @deprecated Prefer `useSetHeaderAttachmentPrefetchPercent` (managers) ya `useHeaderAttachmentPrefetchPercent` (header). */
export function useEmbeddedAttachmentPrefetch(): SetterCtx & { headerAttachmentPercent: PercentSnapshot } {
  const c = useContext(EmbeddedAttachmentPrefetchContext);
  const percent = useHeaderAttachmentPrefetchPercent();
  if (!c) {
    return { headerAttachmentPercent: null, setHeaderAttachmentPercent: noopSetter };
  }
  return { headerAttachmentPercent: percent, setHeaderAttachmentPercent: c.setHeaderAttachmentPercent };
}
