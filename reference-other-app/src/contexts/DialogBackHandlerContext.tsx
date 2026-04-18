"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

const DIALOG_STATE_KEY = "dialog-open";

type StackItem = { id: string; close: () => void };

type StackItemWithOpts = { id: string; close: () => void; /** if true, back already changed URL; we forward then close to keep page and close dialog */ urlModal?: boolean };

type DialogBackHandlerContextType = {
  register: (close: () => void) => () => void;
  /** For URL-driven modals (?modal=1). Page already did router.push, so don't push again. On back: forward() then close() so dialog closes but we stay on the same page. */
  registerUrlModal: (close: () => void) => () => void;
};

const DialogBackHandlerContext = createContext<DialogBackHandlerContextType | null>(null);

/**
 * APK: Capacitor `backButton` ma popstate chaindaina — pehle khula Dialog/Sheet (register stack) band garna.
 * Provider mount ma set hunchha; master–detail back bhanda AGADI call garnu.
 */
let globalTryConsumeDialogHardwareBack: (() => boolean) | null = null;

export function tryConsumeDialogHardwareBack(): boolean {
  return globalTryConsumeDialogHardwareBack?.() ?? false;
}

export function DialogBackHandlerProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<StackItemWithOpts[]>([]);
  const idCounterRef = useRef(0);

  const register = useCallback((close: () => void) => {
    if (typeof window === "undefined") return () => {};
    const id = `db-${++idCounterRef.current}`;
    stackRef.current.push({ id, close, urlModal: false });
    // APK/static: pushState nagarnu — dummy entry pachhi `tryConsumeMasterDetailHardwareBack` agadi run hunchha ra ekai back ma list ma janchha
    if (!isStaticAppBuild()) {
      try {
        window.history.pushState({ [DIALOG_STATE_KEY]: true }, "", window.location.href);
      } catch (_) {}
    }
    return () => {
      stackRef.current = stackRef.current.filter((item) => item.id !== id);
    };
  }, []);

  const registerUrlModal = useCallback((close: () => void) => {
    if (typeof window === "undefined") return () => {};
    const id = `db-url-${++idCounterRef.current}`;
    stackRef.current.push({ id, close, urlModal: true });
    return () => {
      stackRef.current = stackRef.current.filter((item) => item.id !== id);
    };
  }, []);

  // Capacitor back: popstate handler jastai — non–urlModal ma sirf close(); go(-1) le Next.js detail route pani pop garera list ma fijkinchha
  useEffect(() => {
    globalTryConsumeDialogHardwareBack = () => {
      const stack = stackRef.current;
      if (stack.length === 0) return false;
      const top = stack[stack.length - 1];
      stackRef.current = stack.filter((item) => item.id !== top.id);
      if (top.urlModal) {
        try {
          window.history.forward();
          setTimeout(() => top.close(), 0);
        } catch {
          top.close();
        }
      } else {
        // URL sync (e.g. router.replace modal off) close() bhitrai hunchha; yaha history step pop nagarnu
        top.close();
      }
      return true;
    };
    return () => {
      globalTryConsumeDialogHardwareBack = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const stack = stackRef.current;
      if (stack.length === 0) return;
      const top = stack[stack.length - 1];
      stackRef.current = stack.filter((item) => item.id !== top.id);
      if (top.urlModal) {
        try {
          window.history.forward();
          setTimeout(() => top.close(), 0);
        } catch (_) {
          top.close();
        }
      } else {
        top.close();
      }
    };
    window.addEventListener("popstate", handlePopState, true);
    return () => window.removeEventListener("popstate", handlePopState, true);
  }, []);

  return (
    <DialogBackHandlerContext.Provider value={{ register, registerUrlModal }}>
      {children}
    </DialogBackHandlerContext.Provider>
  );
}

export function useDialogBackHandler() {
  return useContext(DialogBackHandlerContext);
}

/**
 * Call from a page that uses URL modal (?modal=1). When modal is open, back should close the modal (and sync URL) instead of leaving the page.
 * closeCallback should e.g. clear dialog state and call router.replace(pathname) to remove ?modal=1.
 */
export function useUrlModalBack(modalOpen: boolean, closeCallback: () => void) {
  const ctx = useDialogBackHandler();
  const closeRef = useRef(closeCallback);
  closeRef.current = closeCallback;
  useEffect(() => {
    if (!ctx || !modalOpen) return;
    const unregister = ctx.registerUrlModal(() => closeRef.current());
    return unregister;
  }, [ctx, modalOpen]);
}

/**
 * Call from a controlled Dialog/AlertDialog so that back (browser/Android) closes the dialog first.
 * onOpenChange ref ma rakhein — inline handler har render par naya ho to pehle wala effect cleanup stack bata hata
 * deta tha aur APK back par tryConsumeDialog khali rehkar App.exitApp() chal jata tha.
 */
export function useDialogBack(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const ctx = useDialogBackHandler();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!ctx || !open) return;
    if (onOpenChangeRef.current == null) return;

    return ctx.register(() => {
      onOpenChangeRef.current?.(false);
    });
  }, [open, ctx]);
}
