"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Client-only URL query (replaces useSearchParams for pages that must static-export).
 * Subscribes to popstate + history.pushState/replaceState so ?query=… updates still sync.
 */
function subscribeSearchChange(onChange: () => void) {
  if (typeof window === "undefined") return () => {};

  // Never call onChange synchronously from pushState/replaceState — Next/Router and React 19 can
  // run navigation during commit/useInsertionEffect; that triggers
  // "useInsertionEffect must not schedule updates" if useSyncExternalStore re-renders in the same stack.
  const notify = () => {
    queueMicrotask(() => onChange());
  };

  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);

  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    push.apply(this, args);
    notify();
  };
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    replace.apply(this, args);
    notify();
  };
  window.addEventListener("popstate", notify);

  return () => {
    history.pushState = push;
    history.replaceState = replace;
    window.removeEventListener("popstate", notify);
  };
}

function getSearchSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerSearchSnapshot() {
  return "";
}

export function useLocationSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribeSearchChange,
    getSearchSnapshot,
    getServerSearchSnapshot
  );
  return useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    [search]
  );
}
