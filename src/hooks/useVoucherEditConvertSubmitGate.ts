"use client";

import { useCallback, useRef, useState } from "react";

/** When edit-converting, first submit opens confirm; second runs pending save. */
export function useVoucherEditConvertSubmitGate(isConverting: boolean) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingRunRef = useRef<(() => void) | null>(null);

  const gateSubmit = useCallback(
    (run: () => void) => {
      if (!isConverting) {
        run();
        return;
      }
      pendingRunRef.current = run;
      setConfirmOpen(true);
    },
    [isConverting]
  );

  const confirmAndRun = useCallback(() => {
    setConfirmOpen(false);
    const run = pendingRunRef.current;
    pendingRunRef.current = null;
    run?.();
  }, []);

  const cancelConfirm = useCallback(() => {
    setConfirmOpen(false);
    pendingRunRef.current = null;
  }, []);

  return {
    convertConfirmOpen: confirmOpen,
    setConvertConfirmOpen: setConfirmOpen,
    gateConvertSubmit: gateSubmit,
    confirmConvertSubmit: confirmAndRun,
    cancelConvertSubmit: cancelConfirm,
  };
}
