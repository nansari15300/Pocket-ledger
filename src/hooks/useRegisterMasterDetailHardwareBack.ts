"use client";

import { useEffect } from "react";

/**
 * Capacitor Android hardware back: detail khula huda pehle yahi handler chalcha — list ma farkincha.
 * Module-level ref: Capacitor listener (providers ma) hook bina import garna sakyo.
 */
let activeMasterDetailBackHandler: (() => void) | null = null;

/** true = handler le consume garyo, router.back() nagaarnu */
export function tryConsumeMasterDetailHardwareBack(): boolean {
  if (activeMasterDetailBackHandler) {
    activeMasterDetailBackHandler();
    return true;
  }
  return false;
}

/**
 * Mobile + item selected: register. Unmount / list view: unregister.
 * handler: setSelected(null) + router.replace(masterDetailListHref(...))
 */
export function useRegisterMasterDetailHardwareBack(
  handler: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    activeMasterDetailBackHandler = handler;
    return () => {
      activeMasterDetailBackHandler = null;
    };
  }, [enabled, handler]);
}
