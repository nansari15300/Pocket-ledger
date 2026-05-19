"use client";

import { useEffect, useState } from "react";

/** Radix dialog / alert / drawer open — summary FAB inke upar na dikhe (print, edit, …). */
function hasBlockingOverlay(): boolean {
  if (typeof document === "undefined") return false;
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
  ) {
    return true;
  }
  if (document.querySelector('[data-vaul-drawer][data-state="open"]')) {
    return true;
  }
  return false;
}

export function useAppModalOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(hasBlockingOverlay());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => observer.disconnect();
  }, []);

  return open;
}
