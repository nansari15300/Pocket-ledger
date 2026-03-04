"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
} from "react";

const DIALOG_STATE_KEY = "dialog-open";

type StackItem = { id: string; close: () => void };

type StackItemWithOpts = { id: string; close: () => void; /** if true, back already changed URL; we forward then close to keep page and close dialog */ urlModal?: boolean };

type DialogBackHandlerContextType = {
  register: (close: () => void) => () => void;
  /** For URL-driven modals (?modal=1). Page already did router.push, so don't push again. On back: forward() then close() so dialog closes but we stay on the same page. */
  registerUrlModal: (close: () => void) => () => void;
};

const DialogBackHandlerContext = createContext<DialogBackHandlerContextType | null>(null);

export function DialogBackHandlerProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<StackItemWithOpts[]>([]);
  const idCounterRef = useRef(0);

  const register = useCallback((close: () => void) => {
    if (typeof window === "undefined") return () => {};
    const id = `db-${++idCounterRef.current}`;
    stackRef.current.push({ id, close, urlModal: false });
    try {
      window.history.pushState({ [DIALOG_STATE_KEY]: true }, "", window.location.href);
    } catch (_) {}
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
 * When open is true: pushes history and registers close. When open turns false: unregisters.
 */
export function useDialogBack(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const ctx = useDialogBackHandler();
  const unregisterRef = useRef<(() => void) | null>(null);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (!ctx || onOpenChange === undefined) return;
    const isOpen = !!open;
    if (isOpen && !prevOpenRef.current) {
      prevOpenRef.current = true;
      unregisterRef.current = ctx.register(() => onOpenChange(false));
    } else if (!isOpen) {
      prevOpenRef.current = false;
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
    }
    return () => {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
      prevOpenRef.current = isOpen;
    };
  }, [open, onOpenChange, ctx]);
}
